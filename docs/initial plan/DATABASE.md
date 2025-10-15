# Database Schema

## Overview

The database uses PostgreSQL via Supabase with a focus on data integrity, audit trails, and performance. The schema supports multi-household architecture (initially single household) with multiple users, tracking both household and personal finances with complete version history and event sourcing.

## Core Tables

### Users & Profiles

```sql
-- User profiles extending Supabase Auth
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL, -- Default household
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  timezone TEXT DEFAULT 'Asia/Manila', -- Used for budget month boundaries and display
  -- Note: MVP assumes single household in Asia/Manila timezone. All budget calculations
  -- use this timezone for month boundaries. Multi-household support in Phase B will add
  -- household-level timezone field. See Decision #78 in DECISIONS.md
  theme_preference TEXT DEFAULT 'system', -- 'light', 'dark', 'system'
  notification_preferences JSONB DEFAULT '{"budget_alerts": true, "mentions": true, "due_dates": true}',
  device_id TEXT, -- Current device (hybrid: IndexedDB → localStorage → Fingerprint)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_household ON profiles(household_id);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Devices

```sql
-- Device registry for multi-device support
-- Promoted to MVP (Decision #82) to support multi-device testing and avoid future migration
CREATE TABLE devices (
  id TEXT PRIMARY KEY, -- Device ID from hybrid strategy (Decision #75)
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,
  name TEXT, -- User-friendly device name (e.g., "Jason's iPhone", "Home Desktop")
  platform TEXT, -- 'web', 'pwa-ios', 'pwa-android', etc.
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  fingerprint TEXT, -- FingerprintJS visitorId for continuity across cache clears
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_devices_user ON devices(user_id);
CREATE INDEX idx_devices_household ON devices(household_id);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);
CREATE INDEX idx_devices_active ON devices(is_active) WHERE is_active = true;

-- Device registration happens automatically on first app load
-- See SYNC-ENGINE.md section "Device Identification" for hybrid ID strategy
```

### Accounts

```sql
-- Bank accounts and financial accounts
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL, -- Default household
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'bank', 'investment', 'credit_card', 'cash', etc.
  initial_balance_cents BIGINT DEFAULT 0,
  currency_code TEXT DEFAULT 'PHP' CHECK (currency_code = 'PHP'), -- PHP only for MVP
  visibility TEXT DEFAULT 'household' CHECK (visibility IN ('household', 'personal')),
  owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Only for personal accounts
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'building-2',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(household_id, name) -- Unique per household
);

CREATE INDEX idx_accounts_active ON accounts(is_active);
CREATE INDEX idx_accounts_visibility ON accounts(visibility);
CREATE INDEX idx_accounts_owner ON accounts(owner_user_id) WHERE owner_user_id IS NOT NULL;
```

### Categories

```sql
-- Hierarchical category structure (parent -> child)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL, -- Default household
  parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  icon TEXT DEFAULT 'folder',
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique category names at each level per household
  UNIQUE(household_id, parent_id, name)
);

-- Index for hierarchical queries
CREATE INDEX idx_categories_parent ON categories(parent_id);
CREATE INDEX idx_categories_active ON categories(is_active);
```

### Transactions

```sql
-- Main transaction table
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL, -- Default household

  -- Core fields
  date DATE NOT NULL,
  description TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0), -- Always positive
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  currency_code TEXT DEFAULT 'PHP' CHECK (currency_code = 'PHP'),

  -- Relationships
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL, -- Child categories only
  transfer_group_id UUID, -- Links paired transfer transactions (exactly 2 per group)

  -- Status and filtering
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'cleared')),
  visibility TEXT DEFAULT 'household' CHECK (visibility IN ('household', 'personal')),

  -- User tracking
  created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  tagged_user_ids UUID[] DEFAULT '{}', -- Users mentioned/involved in this transaction (@mentions)

  -- Additional data
  notes TEXT,

  -- Import tracking
  import_key TEXT, -- SHA-256 hash for duplicate detection during imports

  -- Sync and audit
  device_id TEXT, -- Device ID from hybrid strategy

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_transactions_household ON transactions(household_id);
CREATE INDEX idx_transactions_date ON transactions(date DESC);
CREATE INDEX idx_transactions_month ON transactions(DATE_TRUNC('month', date));
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_visibility ON transactions(visibility);
CREATE INDEX idx_transactions_created_by ON transactions(created_by_user_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_transfer ON transactions(transfer_group_id) WHERE transfer_group_id IS NOT NULL;
CREATE INDEX idx_transactions_import_key ON transactions(import_key) WHERE import_key IS NOT NULL;
CREATE INDEX idx_transactions_tagged_users ON transactions USING GIN (tagged_user_ids); -- For @mention queries

-- Compound indexes for common filter combinations
CREATE INDEX idx_transactions_account_date ON transactions(account_id, date DESC);
CREATE INDEX idx_transactions_category_date ON transactions(category_id, date DESC);
CREATE INDEX idx_transactions_status_date ON transactions(status, date DESC);
CREATE INDEX idx_transactions_household_visibility ON transactions(household_id, visibility);
```

### Transaction Events (Audit & Sync)

```sql
-- Event sourcing for sync and audit trail
CREATE TABLE transaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL, -- Default household

  -- Entity tracking
  entity_type TEXT NOT NULL DEFAULT 'transaction',
  entity_id UUID NOT NULL,

  -- Event details
  op TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete')),
  payload JSONB NOT NULL,

  -- Idempotency and versioning
  idempotency_key TEXT UNIQUE NOT NULL, -- Prevents duplicate events
  event_version INT DEFAULT 1, -- For schema evolution

  -- User and device tracking
  actor_user_id UUID REFERENCES profiles(id),
  device_id TEXT NOT NULL,

  -- Vector clock for conflict resolution (per-entity)
  lamport_clock BIGINT NOT NULL,
  vector_clock JSONB NOT NULL, -- {device_id: clock_value}

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_events_entity ON transaction_events(entity_type, entity_id, lamport_clock);
CREATE INDEX idx_events_household ON transaction_events(household_id);
CREATE INDEX idx_events_timestamp ON transaction_events(created_at DESC);
CREATE INDEX idx_events_user ON transaction_events(actor_user_id);
CREATE INDEX idx_events_device ON transaction_events(device_id);

-- CRITICAL: Unique index enforces idempotency at database level
-- Prevents duplicate event processing in distributed sync (see SECURITY.md)
CREATE UNIQUE INDEX idx_events_idempotency_unique ON transaction_events(idempotency_key);
```

### Budgets

```sql
-- Monthly budget targets (reference values only, not balances)
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL, -- Default household
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- First day of month (stored in UTC, displayed in user's timezone)
  month_key INT GENERATED ALWAYS AS (EXTRACT(YEAR FROM month) * 100 + EXTRACT(MONTH FROM month)) STORED, -- YYYYMM for performance
  amount_cents BIGINT DEFAULT 0 CHECK (amount_cents >= 0), -- Target spending amount
  currency_code TEXT DEFAULT 'PHP' CHECK (currency_code = 'PHP'),

  -- Note: Budgets are spending targets only (Decision #80)
  -- No balance rollover - actual spending always calculated from transactions
  -- Month boundaries use profiles.timezone for display
  -- Can copy previous month's targets as starting point

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(household_id, category_id, month)
);

CREATE INDEX idx_budgets_household ON budgets(household_id);
CREATE INDEX idx_budgets_month ON budgets(month);
CREATE INDEX idx_budgets_month_key ON budgets(month_key);
CREATE INDEX idx_budgets_category ON budgets(category_id);
CREATE INDEX idx_budgets_household_month ON budgets(household_id, month_key);
```

### Sync Queue

```sql
-- Queue for offline changes waiting to sync
CREATE TABLE sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL, -- Default household
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  operation JSONB NOT NULL,
  device_id TEXT NOT NULL,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'syncing', 'completed', 'failed')),
  retry_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_queue_status ON sync_queue(status);
CREATE INDEX idx_sync_queue_device ON sync_queue(device_id);
CREATE INDEX idx_sync_queue_created ON sync_queue(created_at);
```

### Snapshots

```sql
-- Backup snapshots stored in R2
CREATE TABLE snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL, -- Default household

  -- Snapshot metadata
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('manual', 'daily', 'weekly', 'monthly')),

  -- Storage information
  storage_url TEXT NOT NULL, -- Cloudflare R2 URL

  -- Data integrity
  checksum TEXT NOT NULL, -- SHA-256 hash
  size_bytes BIGINT NOT NULL,

  -- Content metadata
  metadata JSONB NOT NULL, -- {version, row_counts, app_version, etc.}

  -- Retention
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_snapshots_type ON snapshots(snapshot_type);
CREATE INDEX idx_snapshots_created ON snapshots(created_at DESC);
CREATE INDEX idx_snapshots_expires ON snapshots(expires_at) WHERE expires_at IS NOT NULL;
```

## Query Views (Direct Queries - No Materialized Views)

Note: Per architectural decision #64, we're using indexes and direct queries for performance instead of materialized views in MVP. These queries run directly against the base tables with proper indexing. The queries below can be used directly in the application or optionally converted to standard (non-materialized) database views for convenience.

### Account Balance Query

```sql
-- Real-time account balance calculation (use as query, not materialized view)
-- CREATE VIEW account_balances AS
SELECT
  a.id,
  a.name,
  a.type,
  a.visibility,
  a.owner_user_id,
  a.initial_balance_cents,

  -- Calculate current balance
  a.initial_balance_cents +
  COALESCE(SUM(
    CASE
      WHEN t.type = 'income' THEN t.amount_cents
      WHEN t.type = 'expense' THEN -t.amount_cents
      ELSE 0
    END
  ), 0) as current_balance_cents,

  -- Transaction stats
  COUNT(t.id) as transaction_count,
  COUNT(t.id) FILTER (WHERE t.status = 'cleared') as cleared_count,
  COUNT(t.id) FILTER (WHERE t.status = 'pending') as pending_count,

  -- Date range
  MIN(t.date) as first_transaction_date,
  MAX(t.date) as last_transaction_date,

  NOW() as last_refreshed
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
WHERE a.is_active = true
GROUP BY a.id, a.name, a.type, a.visibility, a.owner_user_id, a.initial_balance_cents;

-- If converting to view, add index on base tables instead
-- CREATE UNIQUE INDEX idx_account_balances_id ON account_balances(id);
```

### Category Totals Query

```sql
-- Category spending analysis with parent rollups (use as query, not materialized view)
-- CREATE VIEW category_totals AS
WITH RECURSIVE category_tree AS (
  -- Base categories
  SELECT id, parent_id, name, 0 as level
  FROM categories
  WHERE parent_id IS NULL

  UNION ALL

  -- Child categories
  SELECT c.id, c.parent_id, c.name, ct.level + 1
  FROM categories c
  JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT
  c.id as category_id,
  c.parent_id,
  c.name,
  c.level,
  DATE_TRUNC('month', t.date) as month,

  -- Direct amounts (only for child categories)
  SUM(CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END) as expense_cents,
  SUM(CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END) as income_cents,

  -- Transaction counts
  COUNT(t.id) as transaction_count,

  NOW() as last_refreshed
FROM category_tree c
LEFT JOIN transactions t ON t.category_id = c.id
WHERE c.level > 0 -- Only child categories have transactions
GROUP BY c.id, c.parent_id, c.name, c.level, DATE_TRUNC('month', t.date);

-- If converting to view, indexes on base tables handle performance
-- CREATE UNIQUE INDEX idx_category_totals ON category_totals(category_id, month);
-- CREATE INDEX idx_category_totals_parent ON category_totals(parent_id);
```

### Monthly Summary Query

```sql
-- Monthly financial summary (use as query, not materialized view)
-- CREATE VIEW monthly_summary AS
SELECT
  DATE_TRUNC('month', date) as month,
  visibility,

  -- Totals by type
  SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) as total_income_cents,
  SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) as total_expense_cents,
  SUM(CASE
    WHEN type = 'income' THEN amount_cents
    WHEN type = 'expense' THEN -amount_cents
    ELSE 0
  END) as net_amount_cents,

  -- Transaction counts
  COUNT(*) as transaction_count,
  COUNT(*) FILTER (WHERE status = 'cleared') as cleared_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,

  -- Unique counts
  COUNT(DISTINCT date) as active_days,
  COUNT(DISTINCT category_id) as unique_categories,
  COUNT(DISTINCT account_id) as unique_accounts,

  NOW() as last_refreshed
FROM transactions
GROUP BY DATE_TRUNC('month', date), visibility;

-- If converting to view, rely on transaction table indexes
-- CREATE UNIQUE INDEX idx_monthly_summary ON monthly_summary(month, visibility);
```

### Transfer Exclusion Pattern for Analytics

**CRITICAL**: Always exclude transfers from income/expense calculations and budget tracking. Transfers represent movement between accounts, not actual income or expenses.

```sql
-- Example: Monthly spending query (CORRECT - excludes transfers)
SELECT
  DATE_TRUNC('month', date) as month,
  SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) as expenses,
  SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) as income
FROM transactions
WHERE transfer_group_id IS NULL  -- CRITICAL: Exclude transfers
  AND status = 'cleared'
GROUP BY month;

-- Example: Budget vs actual query (CORRECT - excludes transfers)
SELECT
  c.name as category,
  b.amount_cents as budget_target,
  COALESCE(SUM(t.amount_cents), 0) as actual_spend
FROM budgets b
LEFT JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t ON t.category_id = c.id
  AND t.transfer_group_id IS NULL  -- CRITICAL: Exclude transfers
  AND DATE_TRUNC('month', t.date) = b.month
  AND t.type = 'expense'
WHERE b.month = '2024-01-01'
GROUP BY c.name, b.amount_cents;

-- Example: Account balance query (CORRECT - includes all transactions including transfers)
SELECT
  a.id,
  a.name,
  a.initial_balance_cents +
  SUM(
    CASE
      WHEN t.type = 'income' THEN t.amount_cents
      WHEN t.type = 'expense' THEN -t.amount_cents
    END
  ) as balance_cents
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
-- NOTE: Do NOT exclude transfers here - they affect account balances
WHERE a.id = 'some-account-id'
GROUP BY a.id, a.name, a.initial_balance_cents;

-- Example: Transfer report query (shows only transfers)
SELECT
  t1.date,
  t1.description,
  t1.amount_cents,
  a1.name as from_account,
  a2.name as to_account
FROM transactions t1
JOIN transactions t2 ON t1.transfer_group_id = t2.transfer_group_id AND t1.id != t2.id
LEFT JOIN accounts a1 ON t1.account_id = a1.id
LEFT JOIN accounts a2 ON t2.account_id = a2.id
WHERE t1.type = 'expense'  -- Show from expense side
  AND t1.transfer_group_id IS NOT NULL
ORDER BY t1.date DESC;
```

**Rule of Thumb**:

- **Analytics & Budgets**: Exclude transfers (`WHERE transfer_group_id IS NULL`)
- **Account Balances**: Include transfers (affects balances)
- **Transfer Reports**: Filter to transfers only (`WHERE transfer_group_id IS NOT NULL`)

## Functions & Triggers

### Transfer Integrity Constraints

```sql
-- Ensure transfer transactions maintain integrity on INSERT/UPDATE
CREATE OR REPLACE FUNCTION check_transfer_integrity()
RETURNS TRIGGER AS $$
DECLARE
  transfer_count INT;
  opposite_type TEXT;
  total_amount BIGINT;
BEGIN
  -- Only check if this is part of a transfer
  IF NEW.transfer_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Count existing transactions in this transfer group
  SELECT COUNT(*), SUM(amount_cents)
  INTO transfer_count, total_amount
  FROM transactions
  WHERE transfer_group_id = NEW.transfer_group_id
  AND id != NEW.id;

  -- Ensure maximum 2 transactions per transfer group
  IF transfer_count >= 2 THEN
    RAISE EXCEPTION 'Transfer group can only have 2 transactions';
  END IF;

  -- If this is the second transaction, verify opposite types
  IF transfer_count = 1 THEN
    -- Get the type of the other transaction
    SELECT type INTO opposite_type
    FROM transactions
    WHERE transfer_group_id = NEW.transfer_group_id
    AND id != NEW.id;

    -- Ensure opposite types (one income, one expense)
    IF NEW.type = opposite_type THEN
      RAISE EXCEPTION 'Transfer must have opposite types (income/expense)';
    END IF;

    -- Ensure same amount
    IF NEW.amount_cents != total_amount THEN
      RAISE EXCEPTION 'Transfer transactions must have same amount';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Handle transfer deletion: nullify transfer_group_id on paired transaction
CREATE OR REPLACE FUNCTION handle_transfer_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- If deleting a transfer transaction, nullify the pair's transfer_group_id
  IF OLD.transfer_group_id IS NOT NULL THEN
    UPDATE transactions
    SET transfer_group_id = NULL
    WHERE transfer_group_id = OLD.transfer_group_id
      AND id != OLD.id;

    -- Log the orphaned transaction for potential review
    RAISE NOTICE 'Transfer deleted: transfer_group_id % orphaned, paired transaction % unmarked',
      OLD.transfer_group_id,
      (SELECT id FROM transactions WHERE transfer_group_id = OLD.transfer_group_id AND id != OLD.id);
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to transactions table
CREATE TRIGGER ensure_transfer_integrity
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION check_transfer_integrity();

CREATE TRIGGER handle_transfer_deletion_trigger
BEFORE DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION handle_transfer_deletion();

-- Note: When a transfer transaction is deleted, the paired transaction is converted
-- to a regular transaction (transfer_group_id set to NULL). The user can then
-- re-categorize it or delete it separately. See Decision #60 for transfer design.
```

### Auto-update Timestamps

```sql
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_queue_updated_at BEFORE UPDATE ON sync_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Event Creation Trigger (Phase B)

```sql
-- Automatically create events for transaction changes (Phase B feature)
-- Commented out for Phase A
/*
CREATE OR REPLACE FUNCTION create_transaction_event()
RETURNS TRIGGER AS $$
DECLARE
  v_device_id TEXT;
  v_lamport_clock BIGINT;
  v_vector_clock JSONB;
BEGIN
  -- Get device_id from transaction or use default
  v_device_id := COALESCE(NEW.device_id, 'server');

  -- Calculate lamport clock (simplified for MVP)
  SELECT COALESCE(MAX(lamport_clock), 0) + 1
  INTO v_lamport_clock
  FROM transaction_events
  WHERE entity_id = NEW.id;

  -- Initialize vector clock
  v_vector_clock := jsonb_build_object(v_device_id, v_lamport_clock);

  -- Create event based on operation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO transaction_events (
      entity_type, entity_id, op, payload,
      actor_user_id, device_id, lamport_clock, vector_clock
    ) VALUES (
      'transaction', NEW.id, 'create', row_to_json(NEW)::jsonb,
      NEW.created_by_user_id, v_device_id, v_lamport_clock, v_vector_clock
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Store only changed fields in payload
    INSERT INTO transaction_events (
      entity_type, entity_id, op, payload,
      actor_user_id, device_id, lamport_clock, vector_clock
    ) VALUES (
      'transaction', NEW.id, 'update',
      jsonb_strip_nulls(to_jsonb(NEW) - to_jsonb(OLD)),
      NEW.created_by_user_id, v_device_id, v_lamport_clock, v_vector_clock
    );
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO transaction_events (
      entity_type, entity_id, op, payload,
      actor_user_id, device_id, lamport_clock, vector_clock
    ) VALUES (
      'transaction', OLD.id, 'delete', row_to_json(OLD)::jsonb,
      OLD.created_by_user_id, v_device_id, v_lamport_clock, v_vector_clock
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
*/
```

### Query Performance Note

```sql
-- Since we're using indexes instead of materialized views (Decision #64),
-- the queries above will run directly against the base tables.
-- Performance is maintained through proper indexing strategy.
-- If performance degrades with large datasets, these queries can be:
-- 1. Converted to regular (non-materialized) views for convenience
-- 2. Cached at the application layer using React Query
-- 3. Upgraded to materialized views if absolutely necessary
```

### Calculate Running Total Function

```sql
-- Helper function to calculate running totals for accounts
CREATE OR REPLACE FUNCTION calculate_account_balance(p_account_id UUID)
RETURNS TABLE (
  balance_cents BIGINT,
  pending_cents BIGINT,
  cleared_cents BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.initial_balance_cents + COALESCE(SUM(
      CASE
        WHEN t.type = 'income' THEN t.amount_cents
        WHEN t.type = 'expense' THEN -t.amount_cents
        ELSE 0
      END
    ), 0) as balance_cents,
    COALESCE(SUM(
      CASE
        WHEN t.status = 'pending' AND t.type = 'expense' THEN t.amount_cents
        WHEN t.status = 'pending' AND t.type = 'income' THEN t.amount_cents
        ELSE 0
      END
    ), 0) as pending_cents,
    COALESCE(SUM(
      CASE
        WHEN t.status = 'cleared' AND t.type = 'expense' THEN t.amount_cents
        WHEN t.status = 'cleared' AND t.type = 'income' THEN t.amount_cents
        ELSE 0
      END
    ), 0) as cleared_cents
  FROM accounts a
  LEFT JOIN transactions t ON t.account_id = a.id
  WHERE a.id = p_account_id
  GROUP BY a.initial_balance_cents;
END;
$$ LANGUAGE plpgsql;
```

## Row Level Security (RLS)

### Enable RLS on all tables

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;
```

### RLS Policies

```sql
-- Profiles: All authenticated users can see all profiles (same household)
CREATE POLICY "Profiles viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Accounts: Household accounts visible to all, personal to owner only
CREATE POLICY "View accounts"
  ON accounts FOR SELECT
  TO authenticated
  USING (
    visibility = 'household'
    OR owner_user_id = auth.uid()
  );

CREATE POLICY "Manage accounts"
  ON accounts FOR ALL
  TO authenticated
  USING (
    visibility = 'household'
    OR owner_user_id = auth.uid()
  );

-- Categories: All categories visible to all authenticated users
CREATE POLICY "View categories"
  ON categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Manage categories"
  ON categories FOR ALL
  TO authenticated
  USING (true); -- All household members can manage categories

-- Transactions: Household visible to all, personal to owner
CREATE POLICY "View transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    visibility = 'household'
    OR created_by_user_id = auth.uid()
  );

CREATE POLICY "Create transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (created_by_user_id = auth.uid());

CREATE POLICY "Update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR visibility = 'household'
  );

CREATE POLICY "Delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (created_by_user_id = auth.uid());

-- Transaction Events: Viewable by all authenticated users
CREATE POLICY "View transaction events"
  ON transaction_events FOR SELECT
  TO authenticated
  USING (true); -- Audit trail visible to all

CREATE POLICY "System creates events"
  ON transaction_events FOR INSERT
  TO authenticated
  WITH CHECK (true); -- Events created by triggers/system

-- Budgets: All authenticated users can manage budgets
CREATE POLICY "Manage budgets"
  ON budgets FOR ALL
  TO authenticated
  USING (true);

-- Sync Queue: Users can only see their device's queue
CREATE POLICY "Manage own sync queue"
  ON sync_queue FOR ALL
  TO authenticated
  USING (device_id IN (
    SELECT device_id FROM profiles WHERE id = auth.uid()
  ));

-- Snapshots: All authenticated users can view snapshots
CREATE POLICY "View snapshots"
  ON snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Create snapshots"
  ON snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);
```

## Type Definitions

```sql
-- Note: Using TEXT with CHECK constraints instead of ENUMs for easier migrations
-- This approach allows adding new values without ALTER TYPE commands
```

## Migration Safety

```sql
-- Migration template for safe schema changes
BEGIN;

-- Create snapshot before migration
INSERT INTO snapshots (
  snapshot_type,
  storage_url,
  checksum,
  size_bytes,
  metadata
) VALUES (
  'manual',
  'pending-upload',
  'pending',
  0,
  jsonb_build_object('reason', 'pre-migration-backup')
);

-- Run migration
-- ... migration SQL ...

-- Verify data integrity
SELECT COUNT(*) FROM transactions;
SELECT COUNT(*) FROM accounts;
SELECT COUNT(*) FROM categories;

-- If all good
COMMIT;
-- If issues
-- ROLLBACK;
```

## Performance Considerations

1. **Indexes**: Comprehensive indexing strategy with compound indexes for common query patterns
2. **Query Performance**: Direct queries with proper indexes instead of materialized views for MVP
3. **Amount Storage**: Using BIGINT cents for precision and performance
4. **Currency**: Single currency (PHP) for MVP to avoid conversion complexity
5. **Partitioning**: Can add date-based partitioning when data grows beyond 100k transactions
6. **Month Keys**: Generated columns (month_key) for efficient monthly aggregations

## Data Integrity

1. **Check Constraints**: Ensure valid data at database level
2. **Foreign Keys**: Maintain referential integrity
3. **Unique Constraints**: Prevent duplicate data
4. **Triggers**: Automatic timestamp updates
5. **Event Log**: Complete audit trail (Phase B)

## Free Tier Optimization

1. **No pg_cron**: Not needed since we're not using materialized views
2. **Efficient Indexes**: Strategic compound indexes for common queries
3. **Query Strategy**: Direct queries instead of materialized views to save storage
4. **Data Compression**: JSONB for flexible fields and event payloads
5. **Retention**: Automatic cleanup of old sync queue entries
6. **Household Architecture**: Built-in but single household initially

## Date Storage Strategy (Decision #71 + Option A)

### Canonical Date Field

**Design Decision**: Transaction `date` stored as `DATE` type (not TIMESTAMPTZ)

**Rationale:**

- Financial transactions are conceptually date-based in the user's context
- Users think in dates: "I spent ₱1,500 on July 15"
- Avoids complex timezone conversions in every query
- Eliminates day-boundary bugs (11:59 PM vs 12:01 AM in different timezones)
- Simpler mental model for users and simpler queries for developers

**Implementation:**

```sql
-- Transaction date is a DATE field (user's local date)
CREATE TABLE transactions (
  ...
  date DATE NOT NULL,  -- Canonical transaction date (user's perspective)
  ...
  created_at TIMESTAMPTZ DEFAULT NOW(),  -- Precise event timestamp (audit)
  updated_at TIMESTAMPTZ DEFAULT NOW()   -- Last modification timestamp
);
```

### Precise Timestamps

- `created_at` and `updated_at` use TIMESTAMPTZ for audit trail
- Server assigns canonical timestamp on creation
- Event sourcing uses TIMESTAMPTZ for event ordering
- These are for system use (sync, audit), not user-facing

### Month Boundaries

Budget calculations use user's `profiles.timezone` for display:

```sql
-- Example: Get transactions for January 2024 in user's timezone
SELECT *
FROM transactions
WHERE DATE_TRUNC('month', date) = '2024-01-01'
-- User's timezone already baked into the DATE value
-- No timezone conversion needed!

-- Example: Budget comparison (straightforward)
SELECT
  c.name,
  b.amount_cents as target,
  SUM(t.amount_cents) as actual
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t ON t.category_id = c.id
  AND DATE_TRUNC('month', t.date) = b.month  -- Simple date comparison
  AND t.transfer_group_id IS NULL
GROUP BY c.name, b.amount_cents;
```

### Why Not TIMESTAMPTZ for transaction date?

**Considered but rejected**: Using `occurred_at TIMESTAMPTZ` instead of `date DATE`

**Problems with TIMESTAMPTZ approach:**

1. Month boundaries become complex: "Is 2024-01-31 23:30:00 UTC in January or February for user in Manila (UTC+8)?"
2. Every query needs timezone conversion: `(occurred_at AT TIME ZONE user.timezone)::DATE`
3. Indexes less effective due to function calls
4. Budget calculations require joins to profiles table for timezone
5. Users don't think in timestamps - they remember "I paid rent on the 1st"

**Conclusion**: DATE is the correct choice for financial transactions

## Currency Utilities Specification

### Constants

- **Currency**: PHP (Philippine Peso) only for MVP
- **Storage**: BIGINT cents (1 PHP = 100 cents)
- **Max Supported Amount**: 999,999,999 cents (PHP 9,999,999.99)
- **Precision**: Exact to centavo (1/100 PHP)

### Required Utility Functions

#### formatPHP(cents: number): string

Converts integer cents to formatted PHP display string.

```typescript
// Implementation specification
formatPHP(cents: number): string {
  // Input: 150050 (integer cents)
  // Output: "₱1,500.50"

  if (cents === 0) return "₱0.00";

  const isNegative = cents < 0;
  const absoluteCents = Math.abs(cents);
  const pesos = Math.floor(absoluteCents / 100);
  const centavos = absoluteCents % 100;

  // Format with thousand separators
  const formattedPesos = pesos.toLocaleString('en-PH');
  const formattedCentavos = centavos.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}₱${formattedPesos}.${formattedCentavos}`;
}

// Test cases:
// formatPHP(150050) → "₱1,500.50"
// formatPHP(0) → "₱0.00"
// formatPHP(100) → "₱1.00"
// formatPHP(-50000) → "-₱500.00"
// formatPHP(999999999) → "₱9,999,999.99"
```

#### parsePHP(input: string | number): number

Converts user input to integer cents with validation.

```typescript
// Implementation specification
parsePHP(input: string | number): number {
  // Accepts: "1,500.50", "₱1,500.50", "1500.50", 1500.50
  // Output: 150050 (integer cents)

  if (typeof input === 'number') {
    return Math.round(input * 100);
  }

  if (!input || typeof input !== 'string') {
    return 0;
  }

  // Remove currency symbol and whitespace
  let cleaned = input.replace(/[₱,\s]/g, '');

  // Parse as float
  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    return 0;
  }

  // Convert to cents and round
  const cents = Math.round(parsed * 100);

  // Validate range
  if (cents < 0 || cents > MAX_AMOUNT_CENTS) {
    throw new Error(`Amount out of range: ${cents} cents`);
  }

  return cents;
}

// Test cases:
// parsePHP("1,500.50") → 150050
// parsePHP("₱1,500.50") → 150050
// parsePHP("1500.50") → 150050
// parsePHP(1500.50) → 150050
// parsePHP("invalid") → 0
// parsePHP("") → 0
// parsePHP(null) → 0
```

#### validateAmount(cents: number): boolean

Validates amount is within safe range.

```typescript
const MAX_AMOUNT_CENTS = 999999999; // PHP 9,999,999.99

function validateAmount(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0 && cents <= MAX_AMOUNT_CENTS;
}

// Test cases:
// validateAmount(150050) → true
// validateAmount(0) → true
// validateAmount(-100) → false
// validateAmount(1000000000) → false (exceeds max)
// validateAmount(1500.5) → false (not integer)
```

### JavaScript Number Safety

**Analysis:**

- JavaScript `Number.MAX_SAFE_INTEGER` = 9,007,199,254,740,991
- Our maximum amount: 999,999,999 cents (PHP 9,999,999.99)
- Ratio: Our max is ~0.000011% of MAX_SAFE_INTEGER
- **Conclusion**: No BigInt needed for MVP - standard Number is safe

**Why 999,999,999 cents as maximum:**

- PHP 9,999,999.99 is ~$200,000 USD (at 50:1 exchange rate)
- Sufficient for personal household finances
- Far below JS number precision limits
- Simple validation and display formatting

### Database Storage

```sql
-- Amount stored as BIGINT cents (exact precision)
CREATE TABLE transactions (
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0 AND amount_cents <= 999999999),
  currency_code TEXT DEFAULT 'PHP' CHECK (currency_code = 'PHP')
);

-- No decimal/numeric types needed - BIGINT is exact and fast
```

### Error Handling

```typescript
// Overflow protection
function safeParsePHP(input: string | number): number {
  const cents = parsePHP(input);

  if (!validateAmount(cents)) {
    throw new Error(
      `Amount ${formatPHP(cents)} exceeds maximum allowed ${formatPHP(MAX_AMOUNT_CENTS)}`
    );
  }

  return cents;
}
```

## Query Index Map

Per Decision #64, we use indexes instead of materialized views for MVP. This section documents the mapping between hot queries and their required indexes to ensure optimal performance.

### Hot Query #1: Transaction List (Date Range)

**Query Pattern**:

```sql
SELECT * FROM transactions
WHERE household_id = $1
  AND date BETWEEN $2 AND $3
  AND visibility IN ('household', 'personal')
ORDER BY date DESC
LIMIT 50 OFFSET $4;
```

**Required Indexes**:

- `idx_transactions_household` (household_id)
- `idx_transactions_date` (date DESC)
- `idx_transactions_visibility` (visibility)

**Performance Target**: <50ms for 10k transactions

---

### Hot Query #2: Category Totals (Monthly)

**Query Pattern**:

```sql
SELECT category_id, SUM(amount_cents) as total
FROM transactions
WHERE household_id = $1
  AND DATE_TRUNC('month', date) = $2
  AND type = 'expense'
  AND transfer_group_id IS NULL  -- Exclude transfers
GROUP BY category_id;
```

**Required Indexes**:

- `idx_transactions_month` (DATE_TRUNC('month', date))
- `idx_transactions_type` (type)
- `idx_transactions_category_date` (category_id, date DESC)

**Performance Target**: <100ms for 1000 transactions/month

---

### Hot Query #3: Account Balance

**Query Pattern**:

```sql
SELECT a.initial_balance_cents +
  COALESCE(SUM(CASE
    WHEN t.type = 'income' THEN t.amount_cents
    WHEN t.type = 'expense' THEN -t.amount_cents
  END), 0) as balance
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
WHERE a.id = $1
GROUP BY a.id, a.initial_balance_cents;
```

**Required Indexes**:

- `idx_transactions_account_date` (account_id, date DESC)
- `idx_accounts_active` (is_active)

**Performance Target**: <30ms per account

---

### Hot Query #4: Budget vs Actual

**Query Pattern**:

```sql
SELECT
  b.category_id,
  b.amount_cents as budget_target,
  COALESCE(SUM(t.amount_cents), 0) as actual_spend
FROM budgets b
LEFT JOIN transactions t
  ON t.category_id = b.category_id
  AND DATE_TRUNC('month', t.date) = b.month
  AND t.type = 'expense'
  AND t.transfer_group_id IS NULL
WHERE b.household_id = $1
  AND b.month = $2
GROUP BY b.category_id, b.amount_cents;
```

**Required Indexes**:

- `idx_budgets_household_month` (household_id, month_key)
- `idx_transactions_month` (DATE_TRUNC('month', date))
- `idx_transactions_category_date` (category_id, date DESC)

**Performance Target**: <150ms for 20 budget categories

---

### Hot Query #5: Tagged Transactions (@mentions)

**Query Pattern**:

```sql
SELECT * FROM transactions
WHERE household_id = $1
  AND $2 = ANY(tagged_user_ids)
ORDER BY date DESC
LIMIT 50;
```

**Required Indexes**:

- `idx_transactions_tagged_users` (USING GIN on tagged_user_ids)
- `idx_transactions_date` (date DESC)

**Performance Target**: <80ms for 100 tagged transactions

---

### Hot Query #6: Sync Queue Processing

**Query Pattern**:

```sql
SELECT * FROM sync_queue
WHERE device_id = $1
  AND status = 'queued'
ORDER BY created_at ASC
LIMIT 100;
```

**Required Indexes**:

- `idx_sync_queue_device` (device_id)
- `idx_sync_queue_status` (status)
- `idx_sync_queue_created` (created_at)

**Performance Target**: <20ms for 1000 queued items

---

### Performance Monitoring

```sql
-- Query to check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Identify missing indexes (queries doing sequential scans)
SELECT
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  seq_tup_read / NULLIF(seq_scan, 0) as avg_seq_read
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND seq_scan > 0
ORDER BY seq_tup_read DESC;
```

**Index Maintenance**:

- Run `ANALYZE` after large data imports
- Monitor index bloat with `pg_stat_all_indexes`
- Re-index if fragmentation > 30%

**Related**: [PERFORMANCE-BUDGET.md](./PERFORMANCE-BUDGET.md) for bundle size targets

---

## Event Retention Policy

To prevent unbounded growth of the `transaction_events` table, we implement a retention policy with compaction.

### Retention Rules

1. **Raw Events**: Retained for 90 days
2. **Compaction Trigger**: After 100 events per entity OR monthly, whichever comes first
3. **Snapshots**: Keep indefinitely (compressed state)
4. **Vector Clock Cleanup**: Remove device entries inactive > 30 days

### Compaction Process

```sql
-- Event compaction function (called by cron job)
CREATE OR REPLACE FUNCTION compact_old_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  retention_cutoff TIMESTAMPTZ;
  entity RECORD;
BEGIN
  -- Calculate 90-day cutoff
  retention_cutoff := NOW() - INTERVAL '90 days';

  -- Find entities with events older than cutoff
  FOR entity IN
    SELECT DISTINCT entity_type, entity_id
    FROM transaction_events
    WHERE created_at < retention_cutoff
  LOOP
    -- Create snapshot if not exists for this month
    PERFORM create_entity_snapshot(entity.entity_type, entity.entity_id, retention_cutoff);

    -- Delete old events (keep last 10 for safety)
    DELETE FROM transaction_events
    WHERE entity_type = entity.entity_type
      AND entity_id = entity.entity_id
      AND created_at < retention_cutoff
      AND id NOT IN (
        SELECT id FROM transaction_events
        WHERE entity_type = entity.entity_type
          AND entity_id = entity.entity_id
        ORDER BY lamport_clock DESC
        LIMIT 10
      );
  END LOOP;

  -- Log compaction
  RAISE NOTICE 'Event compaction completed at %', NOW();
END;
$$;

-- Schedule via Cloudflare Worker Cron (daily at 3 AM)
-- See DEPLOYMENT.md for cron configuration
```

### Storage Quota UI

In the Settings panel, display current usage:

```typescript
interface StorageQuotaStatus {
  eventCount: number;
  eventTableSizeMB: number;
  quotaUsedPercent: number;
  nextCompactionDate: Date;
}

// Display in Settings → Storage
<ProgressBar
  value={quotaUsedPercent}
  max={100}
  className={quotaUsedPercent > 80 ? 'text-warning' : 'text-success'}
/>
```

**Related**: [SYNC-ENGINE.md](./SYNC-ENGINE.md) - Event compaction strategy (lines 936-1097)
**Related**: [DECISIONS.md](./DECISIONS.md) - Decision #76 (event compaction policy)

---

## Notes

- **Devices Table**: Promoted to MVP (Decision #82) to enable multi-device testing and prevent migration pain
- Phase A implements event sourcing from the start with simple last-write-wins conflict resolution
- Phase B will add vector clocks for better conflict detection
- All amounts stored in cents (PHP) to avoid decimal precision issues
- Device fingerprinting used instead of hardware IDs (Decision #75: hybrid fallback strategy)
- Multi-household architecture built-in (with default household_id) for future expansion
- Transfer transactions linked via transfer_group_id for account-to-account movements
- **Indexes** used instead of materialized views for MVP performance optimization (Decision #64)
- **Idempotency** enforced at database level via unique index (see SECURITY.md)
- DATE type used for transaction dates (user's local date) - simpler than TIMESTAMPTZ for financial data
- Currency utilities handle all PHP formatting and parsing with exact centavo precision
- **Event Retention**: 90-day retention with monthly compaction to prevent unbounded growth
