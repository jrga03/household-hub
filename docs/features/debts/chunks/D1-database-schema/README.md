# Chunk D1: Database Schema & Migrations

## At a Glance

- **Time**: 1.5 hours
- **Prerequisites**: None (first debts chunk)
- **Can Skip**: No - foundation for all debt tracking
- **Depends On**: Existing database with transactions, profiles, events tables

## What You're Building

Complete database foundation for debt tracking:

- **3 core tables**: `debts`, `internal_debts`, `debt_payments`
- **5 database triggers**: Self-borrowing prevention, overpayment validation, rate limiting, timestamp sync
- **8 indexes**: Optimized for payment history queries and debt listings
- **RLS policies**: Household-scoped access control
- **Transaction integration**: Add debt linkage fields to existing transactions table
- **Events integration**: Update CHECK constraint to include debt entity types

## Why This Matters

The database schema is the **foundation of data integrity**:

- **Derived balances**: No `current_balance_cents` field - prevents drift and conflicts
- **Immutable payments**: Append-only design with reversal tracking
- **Defense-in-depth**: Database triggers enforce validation even if client bypassed
- **Soft references**: Internal debt entities can be deleted without breaking history
- **Overpayment tracking**: Accept-and-track approach for offline-first compatibility

This chunk implements the core architectural decisions from DEBT-DECISIONS.md.

## Before You Start

Verify these prerequisites:

- [ ] **Supabase project configured** with existing schema
- [ ] **Database access** via Supabase dashboard or SQL editor
- [ ] **Existing tables**: `transactions`, `profiles`, `events`, `budget_categories`, `accounts`
- [ ] **RLS enabled** on existing tables
- [ ] **Understanding of PostgreSQL triggers** and CHECK constraints

**How to verify**: Run `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` - should see core tables.

## What Happens Next

After this chunk:

- 3 new tables ready to store debts and payments
- Database enforces data integrity rules
- Transaction table supports debt linkage
- Events table accepts debt entity types
- Ready for Chunk D2 (Dexie schema setup)

## Key Files Created

```
supabase/
└── migrations/
    └── YYYYMMDDHHMMSS_add_debt_tracking.sql   # Complete migration
```

**Note**: Migration filename uses Supabase timestamp format. Generate timestamp when creating file.

## Features Included

### Tables

**debts** (External debts like car loans, mortgages):

- `id`, `household_id`, `name` (unique among active)
- `original_amount_cents` (positive only)
- `status` (active | paid_off | archived)
- `created_at`, `updated_at`, `closed_at` (temporal boundary)

**internal_debts** (Household borrowing between categories/accounts/members):

- Typed entity references: `from_type/from_id`, `to_type/to_id`
- Display name caching: `from_display_name`, `to_display_name`
- No FK constraints (soft references for flexibility)
- Self-borrowing prevention trigger

**debt_payments** (Immutable audit trail):

- Links to either `debt_id` OR `internal_debt_id`
- References `transaction_id` (no CASCADE - soft delete pattern)
- `amount_cents` (positive for payment, negative for reversal)
- `is_reversal` + `reverses_payment_id` (compensating events)
- `is_overpayment` + `overpayment_amount` (defense-in-depth tracking)
- `device_id` (audit trail)

### Triggers

1. **Self-Borrowing Prevention**: Blocks internal debts where `from_id = to_id` and `from_type = to_type`
2. **Overpayment Validation**: Calculates balance and sets flags BEFORE INSERT (defense-in-depth layer 3)
3. **Debt Count Limit**: Max 100 debts per household
4. **Payment Count Limit**: Max 100 payments per debt
5. **Timestamp Sync**: Updates debt `updated_at` when payment created

### Indexes

- Payment history queries (debt_id, payment_date DESC, created_at DESC)
- Debt listings (household_id, status, updated_at DESC)
- Internal debt entity lookups (from_type/from_id, to_type/to_id)
- Transaction debt references
- Reversed payment filtering

### RLS Policies

- Helper function: `get_user_household_id()` (reusable, performant)
- Household-scoped access for all debt tables
- Follows existing RLS pattern from transactions/accounts

## Related Documentation

- **Database Schema**: `debt-implementation.md` lines 1945-2299 (complete migration SQL)
- **RLS Policies**: `debt-implementation.md` lines 464-500 (policy definitions)
- **Indexes**: `debt-implementation.md` lines 1825-1887 (index strategy)
- **Decisions**:
  - #1: Derived balances (DEBT-DECISIONS.md lines 9-37)
  - #2: Compensating events (DEBT-DECISIONS.md lines 40-101)
  - #3: Typed entity references (DEBT-DECISIONS.md lines 103-170)
  - #19: Device ID tracking (DEBT-DECISIONS.md lines 710-750)
- **Validation**: `DEBT-VALIDATION.md` lines 76-134 (database constraints)
- **Original**: `DATABASE.md` lines 932-1004 (date strategy), 1005-1160 (currency spec)

## Technical Stack

- **PostgreSQL 15+**: Database engine (via Supabase)
- **PL/pgSQL**: Trigger functions
- **Row-Level Security**: Access control
- **CHECK constraints**: Data validation
- **GIN indexes**: Array field indexing (future: tagged_user_ids)

## Design Patterns

### Derived Balance Pattern

```sql
-- NO current_balance_cents column in debts table
-- Balance calculated on read from payment history:
SELECT
  d.original_amount_cents - COALESCE(SUM(dp.amount_cents), 0) AS current_balance
FROM debts d
LEFT JOIN debt_payments dp ON dp.debt_id = d.id
  AND dp.is_reversal = false
  AND NOT EXISTS (
    SELECT 1 FROM debt_payments rev
    WHERE rev.reverses_payment_id = dp.id
  )
WHERE d.id = $1
GROUP BY d.id, d.original_amount_cents;
```

**Why**: Prevents balance drift from concurrent updates, single source of truth.

### Compensating Event Pattern

```sql
-- Original payment
INSERT INTO debt_payments (amount_cents) VALUES (5000);  -- ₱50

-- Edit: Create reversal + new payment (never UPDATE)
INSERT INTO debt_payments (amount_cents, is_reversal, reverses_payment_id)
VALUES (-5000, true, 'original-payment-id');  -- Undo

INSERT INTO debt_payments (amount_cents) VALUES (7500);  -- ₱75 new
```

**Why**: Complete audit trail, conflict-free, event sourcing compliant.

### Defense-in-Depth Validation

```sql
-- Layer 1: UI warning (dismissible)
-- Layer 2: Application logic (authoritative)
-- Layer 3: Database trigger (security)

CREATE TRIGGER validate_payment_overpayment
BEFORE INSERT ON debt_payments
FOR EACH ROW EXECUTE FUNCTION validate_debt_payment_overpayment();
```

**Why**: Prevents malicious clients from bypassing validation, ensures data integrity.

### Soft Reference Pattern

```sql
-- No FK constraints on internal debt entity references
CREATE TABLE internal_debts (
  from_id UUID NOT NULL,  -- Soft reference (no FK)
  from_display_name TEXT  -- Cached at creation
);
```

**Why**: Allows categories/accounts to be deleted without breaking debt history.

## Critical Concepts

**No Balance Storage**: The `current_balance_cents` field is intentionally **not included**. Balance is always calculated from `original_amount_cents - SUM(valid_payments)`. This is non-negotiable for data integrity.

**Negative Balances**: Balance calculation can return negative values. Negative balance means overpayment (e.g., -500 = overpaid by ₱5.00). This is expected and valid.

**Temporal Boundary**: The `closed_at` timestamp (set when status becomes `paid_off` or `archived`) creates a temporal boundary for archived debt payments. Payments dated after `closed_at` are rejected during sync.

**Soft Delete Integration**: Transactions table uses `deleted_at` timestamp (DATABASE.md:196). The `debt_payments.transaction_id` reference has **NO CASCADE** because reversal payments are created BEFORE soft delete.

**Idempotency Preparation**: The `get_max_lamport_clock()` RPC function enables devices to sync their lamport clock counters, preventing idempotency key collisions after IndexedDB clears.

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
