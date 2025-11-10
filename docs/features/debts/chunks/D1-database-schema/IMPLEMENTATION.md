# D1 Implementation: Database Schema & Migrations

## Overview

You'll create a single Supabase migration file that adds complete debt tracking infrastructure to the database. This migration is **idempotent** (safe to run multiple times) and follows PostgreSQL best practices.

**Estimated time**: 1.5 hours

## Step 1: Create Migration File

### 1.1 Generate Migration Timestamp

```bash
# Generate timestamp for migration filename
date +"%Y%m%d%H%M%S"
```

Example output: `20251110143000`

### 1.2 Create Migration File

Create file: `supabase/migrations/[TIMESTAMP]_add_debt_tracking.sql`

Replace `[TIMESTAMP]` with the output from step 1.1.

**Example**: `supabase/migrations/20251110143000_add_debt_tracking.sql`

## Step 2: Create Debts Table

Add this SQL to your migration file:

```sql
-- =====================================================
-- DEBT TRACKING FEATURE - DATABASE SCHEMA
-- =====================================================
-- Purpose: Track external debts (loans from outside) and internal household borrowing
-- Architecture: Derived balances (calculated from payment history, never stored)
-- Related: debt-implementation.md lines 1945-2299

-- =====================================================
-- TABLE: debts (External Debts)
-- =====================================================
-- Tracks money owed to external entities (car loans, mortgages, credit cards)
-- Balance is DERIVED from payment history (no current_balance_cents field)

CREATE TABLE IF NOT EXISTS debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Debt details
  name TEXT NOT NULL,
  original_amount_cents BIGINT NOT NULL CHECK (original_amount_cents > 0),

  -- Status management
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'archived')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ  -- Set when status becomes paid_off or archived (temporal boundary)
);

-- Unique constraint: prevent duplicate active debt names per household
-- Allows reusing names for archived/paid_off debts
CREATE UNIQUE INDEX IF NOT EXISTS idx_debts_household_name_unique
  ON debts(household_id, LOWER(name))
  WHERE status = 'active';

COMMENT ON TABLE debts IS 'External debts (loans from outside entities). Balance derived from debt_payments.';
COMMENT ON COLUMN debts.original_amount_cents IS 'Initial debt amount in cents. Current balance = original - SUM(valid payments).';
COMMENT ON COLUMN debts.closed_at IS 'Timestamp when debt became paid_off or archived. Used to validate queued offline payments.';
```

**Key points**:

- **No `current_balance_cents` field** - this is intentional (Decision #1)
- **Unique name constraint** only applies to active debts
- **`closed_at` timestamp** creates temporal boundary for archived debts

## Step 3: Create Internal Debts Table

Add to migration file:

```sql
-- =====================================================
-- TABLE: internal_debts (Household Borrowing)
-- =====================================================
-- Tracks borrowing within household between categories, accounts, or members
-- Uses typed entity references with cached display names

CREATE TABLE IF NOT EXISTS internal_debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Debt details
  name TEXT NOT NULL,
  original_amount_cents BIGINT NOT NULL CHECK (original_amount_cents > 0),

  -- Source entity (who/what is lending)
  from_type TEXT NOT NULL CHECK (from_type IN ('category', 'account', 'member')),
  from_id UUID NOT NULL,  -- Soft reference (no FK constraint)
  from_display_name TEXT NOT NULL,  -- Cached at creation time for performance

  -- Destination entity (who/what is borrowing)
  to_type TEXT NOT NULL CHECK (to_type IN ('category', 'account', 'member')),
  to_id UUID NOT NULL,  -- Soft reference (no FK constraint)
  to_display_name TEXT NOT NULL,  -- Cached at creation time for performance

  -- Status management
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paid_off', 'archived')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

-- Unique constraint: prevent duplicate active internal debt names per household
CREATE UNIQUE INDEX IF NOT EXISTS idx_internal_debts_household_name_unique
  ON internal_debts(household_id, LOWER(name))
  WHERE status = 'active';

COMMENT ON TABLE internal_debts IS 'Internal household debts (borrowing between categories/accounts/members). No FK constraints - soft references.';
COMMENT ON COLUMN internal_debts.from_display_name IS 'Entity name cached at debt creation. May become stale if entity renamed/deleted.';
COMMENT ON COLUMN internal_debts.to_display_name IS 'Entity name cached at debt creation. May become stale if entity renamed/deleted.';
```

**Key points**:

- **Soft references** - no FK constraints on `from_id`/`to_id` (Decision #3)
- **Display names cached** - acceptable staleness for MVP
- **Extensible enum** - can add more entity types later

## Step 4: Create Debt Payments Table

Add to migration file:

```sql
-- =====================================================
-- TABLE: debt_payments (Immutable Payment History)
-- =====================================================
-- Append-only audit trail of all payments and reversals
-- Uses compensating events pattern (reversals, not updates)

CREATE TABLE IF NOT EXISTS debt_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Debt linkage (one or the other, not both)
  debt_id UUID REFERENCES debts(id),
  internal_debt_id UUID REFERENCES internal_debts(id),

  -- Transaction linkage (NO CASCADE - soft delete pattern)
  transaction_id UUID NOT NULL REFERENCES transactions(id),

  -- Payment details
  amount_cents BIGINT NOT NULL CHECK (amount_cents != 0),  -- Positive for payment, negative for reversal
  payment_date DATE NOT NULL,  -- User's local date (canonical)
  device_id TEXT NOT NULL,  -- Device that created this payment (audit trail)

  -- Reversal tracking (immutable - set once at creation, never updated)
  is_reversal BOOLEAN DEFAULT FALSE,  -- True if this IS a reversal payment
  reverses_payment_id UUID REFERENCES debt_payments(id),  -- Links to original payment if this is reversal
  adjustment_reason TEXT,  -- Why reversal occurred

  -- Overpayment tracking (defense-in-depth)
  is_overpayment BOOLEAN DEFAULT FALSE,
  overpayment_amount BIGINT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT one_debt_type CHECK (
    (debt_id IS NOT NULL AND internal_debt_id IS NULL) OR
    (debt_id IS NULL AND internal_debt_id IS NOT NULL)
  ),

  CONSTRAINT reversal_amount_negative CHECK (
    (reverses_payment_id IS NULL) OR
    (reverses_payment_id IS NOT NULL AND amount_cents < 0)
  ),

  CONSTRAINT overpayment_fields_linked CHECK (
    (is_overpayment = FALSE AND overpayment_amount IS NULL) OR
    (is_overpayment = TRUE AND overpayment_amount IS NOT NULL AND overpayment_amount > 0)
  )
);

COMMENT ON TABLE debt_payments IS 'Immutable payment history. Uses compensating events (reversals) for edits/deletes.';
COMMENT ON COLUMN debt_payments.amount_cents IS 'Positive for normal payments, negative for reversal payments.';
COMMENT ON COLUMN debt_payments.is_reversal IS 'True if this record IS a reversal (negative amount). Immutable - set once at creation.';
COMMENT ON COLUMN debt_payments.reverses_payment_id IS 'ID of payment being reversed (if this is a reversal). Links reversal to original.';
COMMENT ON COLUMN debt_payments.device_id IS 'Device that created payment. For debugging concurrent payment scenarios.';
```

**Key points**:

- **Append-only** - no UPDATE or DELETE operations
- **Compensating events** - reversals tracked via `is_reversal` + `reverses_payment_id`
- **No CASCADE on transaction_id** - reversal created BEFORE soft delete

## Step 5: Create Database Triggers

Add these 5 triggers to migration file:

### Trigger 1: Self-Borrowing Prevention

```sql
-- =====================================================
-- TRIGGER: Prevent Self-Borrowing
-- =====================================================
-- Blocks internal debts where from and to are the same entity

CREATE OR REPLACE FUNCTION check_internal_debt_self_borrow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.from_type = NEW.to_type AND NEW.from_id = NEW.to_id THEN
    RAISE EXCEPTION 'Cannot create internal debt where source and destination are the same entity';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS prevent_self_borrow
BEFORE INSERT OR UPDATE ON internal_debts
FOR EACH ROW EXECUTE FUNCTION check_internal_debt_self_borrow();
```

### Trigger 2: Overpayment Validation (Defense-in-Depth Layer 3)

```sql
-- =====================================================
-- TRIGGER: Overpayment Validation
-- =====================================================
-- Defense-in-depth Layer 3: Server-side validation
-- Calculates balance and sets flags BEFORE INSERT
-- Prevents malicious clients from bypassing application validation

CREATE OR REPLACE FUNCTION validate_debt_payment_overpayment()
RETURNS TRIGGER AS $$
DECLARE
  current_balance BIGINT;
BEGIN
  -- Calculate current balance before this payment
  IF NEW.debt_id IS NOT NULL THEN
    SELECT
      d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)
    INTO current_balance
    FROM debts d
    LEFT JOIN debt_payments dp ON dp.debt_id = d.id
      AND dp.is_reversal = false
      AND NOT EXISTS (
        SELECT 1 FROM debt_payments rev
        WHERE rev.reverses_payment_id = dp.id
      )
    WHERE d.id = NEW.debt_id
    GROUP BY d.original_amount_cents;
  ELSIF NEW.internal_debt_id IS NOT NULL THEN
    SELECT
      d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0)
    INTO current_balance
    FROM internal_debts d
    LEFT JOIN debt_payments dp ON dp.internal_debt_id = d.id
      AND dp.is_reversal = false
      AND NOT EXISTS (
        SELECT 1 FROM debt_payments rev
        WHERE rev.reverses_payment_id = dp.id
      )
    WHERE d.id = NEW.internal_debt_id
    GROUP BY d.original_amount_cents;
  END IF;

  -- Set overpayment flags: balance <= 0 OR payment > balance
  NEW.is_overpayment := (current_balance <= 0 OR NEW.amount_cents > current_balance);

  IF NEW.is_overpayment THEN
    NEW.overpayment_amount := CASE
      WHEN current_balance > 0 THEN NEW.amount_cents - current_balance
      ELSE NEW.amount_cents
    END;
  ELSE
    NEW.overpayment_amount := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS validate_payment_overpayment
BEFORE INSERT ON debt_payments
FOR EACH ROW EXECUTE FUNCTION validate_debt_payment_overpayment();
```

**Important**: This trigger enforces overpayment detection even if client validation is bypassed.

### Trigger 3: Debt Count Limit

```sql
-- =====================================================
-- TRIGGER: Rate Limiting - Max Debts Per Household
-- =====================================================
-- Enforces maximum of 100 debts per household

CREATE OR REPLACE FUNCTION check_debt_count_limit()
RETURNS TRIGGER AS $$
DECLARE
  debt_count INT;
BEGIN
  SELECT COUNT(*) INTO debt_count
  FROM debts
  WHERE household_id = NEW.household_id;

  IF debt_count >= 100 THEN
    RAISE EXCEPTION 'Maximum debt limit (100) reached for household';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS enforce_debt_limit
BEFORE INSERT ON debts
FOR EACH ROW EXECUTE FUNCTION check_debt_count_limit();
```

### Trigger 4: Payment Count Limit

```sql
-- =====================================================
-- TRIGGER: Rate Limiting - Max Payments Per Debt
-- =====================================================
-- Enforces maximum of 100 payments per debt

CREATE OR REPLACE FUNCTION check_payment_count_limit()
RETURNS TRIGGER AS $$
DECLARE
  payment_count INT;
BEGIN
  IF NEW.debt_id IS NOT NULL THEN
    SELECT COUNT(*) INTO payment_count
    FROM debt_payments
    WHERE debt_id = NEW.debt_id;

    IF payment_count >= 100 THEN
      RAISE EXCEPTION 'Maximum payment limit (100) reached for this debt';
    END IF;
  ELSIF NEW.internal_debt_id IS NOT NULL THEN
    SELECT COUNT(*) INTO payment_count
    FROM debt_payments
    WHERE internal_debt_id = NEW.internal_debt_id;

    IF payment_count >= 100 THEN
      RAISE EXCEPTION 'Maximum payment limit (100) reached for this debt';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS enforce_payment_limit
BEFORE INSERT ON debt_payments
FOR EACH ROW EXECUTE FUNCTION check_payment_count_limit();
```

### Trigger 5: Timestamp Sync

```sql
-- =====================================================
-- TRIGGER: Update Debt Timestamp on Payment
-- =====================================================
-- Keeps debt updated_at in sync when payments are created

CREATE OR REPLACE FUNCTION update_debt_timestamp_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.debt_id IS NOT NULL THEN
    UPDATE debts
    SET updated_at = NOW()
    WHERE id = NEW.debt_id;
  ELSIF NEW.internal_debt_id IS NOT NULL THEN
    UPDATE internal_debts
    SET updated_at = NOW()
    WHERE id = NEW.internal_debt_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS update_debt_on_payment
AFTER INSERT ON debt_payments
FOR EACH ROW EXECUTE FUNCTION update_debt_timestamp_on_payment();
```

## Step 6: Create Indexes

Add performance indexes:

```sql
-- =====================================================
-- INDEXES: Query Optimization
-- =====================================================

-- Payment history queries (with secondary sort for same-day payments)
CREATE INDEX IF NOT EXISTS idx_debt_payments_debt_id_date
  ON debt_payments(debt_id, payment_date DESC, created_at DESC)
  WHERE debt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_debt_payments_internal_debt_id_date
  ON debt_payments(internal_debt_id, payment_date DESC, created_at DESC)
  WHERE internal_debt_id IS NOT NULL;

-- Transaction reverse lookup
CREATE INDEX IF NOT EXISTS idx_debt_payments_transaction_id
  ON debt_payments(transaction_id);

-- Reversal payment filtering
CREATE INDEX IF NOT EXISTS idx_debt_payments_reverses
  ON debt_payments(reverses_payment_id)
  WHERE reverses_payment_id IS NOT NULL;

-- Debt listings
CREATE INDEX IF NOT EXISTS idx_debts_household_status
  ON debts(household_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_debts_household_status
  ON internal_debts(household_id, status, updated_at DESC);

-- Internal debt entity lookups
CREATE INDEX IF NOT EXISTS idx_internal_debts_from
  ON internal_debts(from_type, from_id);

CREATE INDEX IF NOT EXISTS idx_internal_debts_to
  ON internal_debts(to_type, to_id);

-- Device audit queries
CREATE INDEX IF NOT EXISTS idx_debt_payments_device
  ON debt_payments(device_id, created_at DESC);
```

**Rationale**: Secondary sort by `created_at` provides deterministic ordering for same-day payments.

## Step 7: Add Debt Fields to Transactions

Integrate with existing transactions table:

```sql
-- =====================================================
-- TRANSACTION INTEGRATION
-- =====================================================
-- Add debt linkage to existing transactions table

DO $$
BEGIN
  -- Add debt_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'debt_id'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN debt_id UUID REFERENCES debts(id);
  END IF;

  -- Add internal_debt_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'internal_debt_id'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN internal_debt_id UUID REFERENCES internal_debts(id);
  END IF;
END $$;

-- Index for debt-linked transactions
CREATE INDEX IF NOT EXISTS idx_transactions_debt_id
  ON transactions(debt_id)
  WHERE debt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_internal_debt_id
  ON transactions(internal_debt_id)
  WHERE internal_debt_id IS NOT NULL;

COMMENT ON COLUMN transactions.debt_id IS 'Links transaction to external debt payment. Only for expense transactions.';
COMMENT ON COLUMN transactions.internal_debt_id IS 'Links transaction to internal debt payment. For expense or transfer transactions.';
```

**Note**: Uses idempotent `DO` block to safely add columns if they don't exist.

## Step 8: Update Events Table

Add debt entity types to existing events table:

```sql
-- =====================================================
-- EVENTS INTEGRATION
-- =====================================================
-- Update events table CHECK constraint to include debt types

DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE events DROP CONSTRAINT IF EXISTS events_entity_type_check;

  -- Add updated constraint with debt types
  ALTER TABLE events
    ADD CONSTRAINT events_entity_type_check CHECK (entity_type IN (
      'transaction', 'account', 'category', 'budget',
      'debt', 'internal_debt', 'debt_payment'
    ));
END $$;

COMMENT ON CONSTRAINT events_entity_type_check ON events IS 'Includes debt entity types: debt, internal_debt, debt_payment';
```

## Step 9: Create RLS Helper Function

Reusable function for better RLS performance:

```sql
-- =====================================================
-- RLS HELPER FUNCTION
-- =====================================================
-- Reusable function to get user's household_id
-- More performant than subquery in policies

CREATE OR REPLACE FUNCTION get_user_household_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY INVOKER
AS $$
  SELECT household_id FROM profiles WHERE id = auth.uid()
$$;

-- Optimize with index
CREATE INDEX IF NOT EXISTS idx_profiles_id_household
  ON profiles(id, household_id);

COMMENT ON FUNCTION get_user_household_id() IS 'Returns household_id for current authenticated user. Used in RLS policies.';
```

## Step 10: Create RLS Policies

Add household-scoped access control:

```sql
-- =====================================================
-- ROW-LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on debt tables
ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;

-- Debts: Household access
CREATE POLICY IF NOT EXISTS debts_household_access
  ON debts FOR ALL
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());

-- Internal Debts: Household access
CREATE POLICY IF NOT EXISTS internal_debts_household_access
  ON internal_debts FOR ALL
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());

-- Debt Payments: Household access
CREATE POLICY IF NOT EXISTS debt_payments_household_access
  ON debt_payments FOR ALL
  TO authenticated
  USING (household_id = get_user_household_id())
  WITH CHECK (household_id = get_user_household_id());

COMMENT ON POLICY debts_household_access ON debts IS 'All household members can view/manage debts';
COMMENT ON POLICY internal_debts_household_access ON internal_debts IS 'All household members can view/manage internal debts';
COMMENT ON POLICY debt_payments_household_access ON debt_payments IS 'All household members can view debt payments';
```

## Step 11: Create Lamport Clock RPC Function

Enable device clock synchronization:

```sql
-- =====================================================
-- LAMPORT CLOCK SYNCHRONIZATION
-- =====================================================
-- RPC function for devices to sync their lamport clocks
-- Prevents idempotency key collisions after IndexedDB clear

CREATE OR REPLACE FUNCTION get_max_lamport_clock(p_device_id TEXT)
RETURNS BIGINT AS $$
  SELECT COALESCE(MAX(lamport_clock), 0)
  FROM events
  WHERE device_id = p_device_id
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_max_lamport_clock(TEXT) TO authenticated;

COMMENT ON FUNCTION get_max_lamport_clock(TEXT) IS 'Returns max lamport_clock for device. Used during device initialization to prevent idempotency key collisions.';
```

## Step 12: Run Migration

### 12.1 Via Supabase CLI

```bash
# Test migration locally (if using local Supabase)
supabase db reset

# Or apply to remote database
supabase db push
```

### 12.2 Via Supabase Dashboard

1. Open Supabase Dashboard → SQL Editor
2. Paste entire migration file contents
3. Click "Run"
4. Verify no errors in output

### 12.3 Verify Migration Success

Run verification query:

```sql
-- Check all tables created
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('debts', 'internal_debts', 'debt_payments')
ORDER BY tablename;
-- Should return 3 rows

-- Check triggers created
SELECT tgname, tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN (
  'prevent_self_borrow',
  'validate_payment_overpayment',
  'enforce_debt_limit',
  'enforce_payment_limit',
  'update_debt_on_payment'
)
ORDER BY tgname;
-- Should return 5 rows

-- Check RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('debts', 'internal_debts', 'debt_payments');
-- All should show rowsecurity = true

-- Check indexes created
SELECT indexname, tablename
FROM pg_indexes
WHERE tablename IN ('debts', 'internal_debts', 'debt_payments')
ORDER BY tablename, indexname;
-- Should return 13+ indexes
```

## Verification Checklist

After completing implementation:

- [ ] Migration file created with correct timestamp
- [ ] All 3 tables created (debts, internal_debts, debt_payments)
- [ ] All 5 triggers created and working
- [ ] All 13 indexes created
- [ ] RLS enabled on all debt tables
- [ ] RLS policies created and tested
- [ ] Debt fields added to transactions table
- [ ] Events table CHECK constraint updated
- [ ] Helper function `get_user_household_id()` created
- [ ] RPC function `get_max_lamport_clock()` created
- [ ] Migration runs without errors
- [ ] Verification queries all pass
- [ ] No current_balance_cents field exists (critical!)

## Troubleshooting

See `VERIFICATION.md` for common issues and solutions.

---

**Next**: Proceed to `VERIFICATION.md` for comprehensive testing
