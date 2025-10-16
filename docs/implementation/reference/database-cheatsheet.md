# Database Quick Reference Cheatsheet

> **Purpose**: Quick lookups for common SQL patterns, critical rules, and gotchas. Keep this open while coding!

## Table of Contents

- [🚨 CRITICAL PATTERNS](#-critical-patterns)
- [💰 Currency Handling](#-currency-handling)
- [📊 Common Query Patterns](#-common-query-patterns)
- [⚡ Performance & Indexes](#-performance--indexes)
- [🔒 RLS Quick Reference](#-rls-quick-reference)
- [⚠️ Gotchas & Anti-Patterns](#️-gotchas--anti-patterns)
- [🔄 Event Sourcing Checklist](#-event-sourcing-checklist)
- [🔧 Migration Checklist](#-migration-checklist)

---

## 🚨 CRITICAL PATTERNS

### ⚠️ RULE #1: Always Exclude Transfers from Analytics

**Why**: Transfers are represented as TWO transactions (one expense, one income). Including them in analytics doubles-counts money movement.

```sql
-- ❌ WRONG: Double-counts transfers
SELECT SUM(amount_cents)
FROM transactions
WHERE type = 'expense';

-- ✅ CORRECT: Excludes transfers
SELECT SUM(amount_cents)
FROM transactions
WHERE type = 'expense'
  AND transfer_group_id IS NULL;
```

**Three contexts where this matters**:

| Context                 | Include Transfers? | Query Pattern                         |
| ----------------------- | ------------------ | ------------------------------------- |
| **Analytics & Budgets** | ❌ NO              | `WHERE transfer_group_id IS NULL`     |
| **Account Balances**    | ✅ YES             | No filter (transfers affect balances) |
| **Transfer Reports**    | Only Transfers     | `WHERE transfer_group_id IS NOT NULL` |

**Reference**: DATABASE.md lines 476-536

---

### ⚠️ RULE #2: Never Use DECIMAL for Currency

**Always use BIGINT cents** (1 PHP = 100 cents)

```sql
-- ❌ WRONG: Precision loss, rounding errors
CREATE TABLE transactions (
  amount DECIMAL(10, 2)  -- NO!
);

-- ✅ CORRECT: Exact precision
CREATE TABLE transactions (
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0)
);
```

**Why**:

- Avoids floating-point errors
- JavaScript `Number` is safe for cents up to ₱90 trillion
- Database BIGINT handles full range
- Always positive amounts with explicit `type` field

**Reference**: DATABASE.md lines 1070-1224

---

### ⚠️ RULE #3: Transaction Date is DATE, Not TIMESTAMPTZ

```sql
-- ✅ CORRECT
CREATE TABLE transactions (
  date DATE NOT NULL,  -- User's local date is canonical
  created_at TIMESTAMPTZ DEFAULT now(),  -- Audit timestamp
  updated_at TIMESTAMPTZ DEFAULT now()   -- Audit timestamp
);
```

**Why**:

- Financial transactions are date-based in user's context
- Avoids timezone conversion complexity
- Simpler month boundary queries
- Timestamps for audit trail, not transaction business logic

**Reference**: DATABASE.md lines 997-1068

---

## 💰 Currency Handling

### Three Required Utilities

```typescript
// Display: cents → formatted string
formatPHP(150050); // "₱1,500.50"

// Input: string/number → cents
parsePHP("1,500.50"); // 150050
parsePHP(1500.5); // 150050

// Validation: check range
validateAmount(150050); // true (0 to 999,999,999)
validateAmount(1000000000); // false (too large)
```

### Validation Range

- **Minimum**: 0 cents (₱0.00)
- **Maximum**: 999,999,999 cents (₱9,999,999.99)
- **Why**: Keeps UI simple, covers household use cases

### Test Cases

```typescript
// Format tests
formatPHP(0) === "₱0.00";
formatPHP(100) === "₱1.00";
formatPHP(150050) === "₱1,500.50";
formatPHP(100000000) === "₱1,000,000.00";

// Parse tests
parsePHP("0") === 0;
parsePHP("1") === 100;
parsePHP("1.5") === 150;
parsePHP("1,500.50") === 150050;
parsePHP("1500.50") === 150050;

// Validation tests
validateAmount(0) === true;
validateAmount(999999999) === true;
validateAmount(-1) === false;
validateAmount(1000000000) === false;
```

**Reference**: DATABASE.md lines 1070-1224

---

## 📊 Common Query Patterns

### Account Balance (Running Total)

```sql
SELECT
  a.id,
  a.name,
  a.initial_balance_cents +
  COALESCE(SUM(
    CASE
      WHEN t.type = 'income' THEN t.amount_cents
      ELSE -t.amount_cents
    END
  ), 0) AS balance_cents
FROM accounts a
LEFT JOIN transactions t ON t.account_id = a.id
WHERE a.id = $1
GROUP BY a.id, a.name, a.initial_balance_cents;
```

**Key points**:

- Include `initial_balance_cents`
- Use `COALESCE` to handle NULL (no transactions)
- Transfers INCLUDED (they affect account balance)
- Use CASE for income (+) vs expense (-)

**Performance**: <30ms with `idx_transactions_account_date`

**Reference**: DATABASE.md lines 355-391

---

### Category Totals (Monthly, Hierarchical)

```sql
WITH RECURSIVE category_tree AS (
  -- Base case: leaf categories
  SELECT
    c.id,
    c.name,
    c.parent_id,
    SUM(
      CASE WHEN t.type = 'expense' THEN t.amount_cents ELSE 0 END
    ) AS expense_cents,
    SUM(
      CASE WHEN t.type = 'income' THEN t.amount_cents ELSE 0 END
    ) AS income_cents
  FROM categories c
  LEFT JOIN transactions t ON t.category_id = c.id
    AND t.transfer_group_id IS NULL  -- ⚠️ CRITICAL: Exclude transfers!
    AND DATE_TRUNC('month', t.date) = $1  -- Month filter
  WHERE c.parent_id IS NULL
  GROUP BY c.id, c.name, c.parent_id

  UNION ALL

  -- Recursive case: parent categories
  SELECT
    p.id,
    p.name,
    p.parent_id,
    SUM(ct.expense_cents) AS expense_cents,
    SUM(ct.income_cents) AS income_cents
  FROM categories p
  JOIN category_tree ct ON ct.parent_id = p.id
  GROUP BY p.id, p.name, p.parent_id
)
SELECT * FROM category_tree
ORDER BY expense_cents DESC;
```

**Key points**:

- Recursive CTE for parent→child rollup
- **MUST exclude transfers** with `transfer_group_id IS NULL`
- Month filter on `DATE_TRUNC('month', date)`
- Separate income and expense totals

**Performance**: <100ms with `idx_transactions_category_date`

**Reference**: DATABASE.md lines 397-437

---

### Budget vs Actual (Monthly)

```sql
SELECT
  b.category_id,
  c.name AS category_name,
  b.amount_cents AS budgeted_cents,
  COALESCE(SUM(t.amount_cents), 0) AS actual_cents,
  (b.amount_cents - COALESCE(SUM(t.amount_cents), 0)) AS remaining_cents,
  CASE
    WHEN SUM(t.amount_cents) > b.amount_cents THEN 'over'
    ELSE 'under'
  END AS status
FROM budgets b
JOIN categories c ON c.id = b.category_id
LEFT JOIN transactions t ON t.category_id = b.category_id
  AND t.type = 'expense'
  AND t.transfer_group_id IS NULL  -- ⚠️ CRITICAL: Exclude transfers!
  AND DATE_TRUNC('month', t.date) = DATE_TRUNC('month', b.month_key::date)
WHERE b.month_key = $1
GROUP BY b.category_id, c.name, b.amount_cents;
```

**Key points**:

- **MUST exclude transfers** from actual spending
- Match month using `DATE_TRUNC`
- COALESCE for categories with no spending
- Status calculation (over/under budget)

**Performance**: <150ms with `idx_transactions_category_date`

**Reference**: DATABASE.md lines 1269-1306

---

### Monthly Summary

```sql
SELECT
  DATE_TRUNC('month', date) AS month,
  SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) AS income_cents,
  SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS expense_cents,
  COUNT(DISTINCT DATE(date)) AS active_days,
  COUNT(*) AS transaction_count
FROM transactions
WHERE transfer_group_id IS NULL  -- ⚠️ CRITICAL: Exclude transfers!
  AND date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', date)
ORDER BY month DESC;
```

**Key points**:

- **Exclude transfers** from totals
- Separate income and expense
- Track active days (days with transactions)
- Last 6 months for dashboard

**Performance**: <50ms with `idx_transactions_month`

**Reference**: DATABASE.md lines 440-473

---

### Transfer Report

```sql
SELECT
  t1.id AS from_transaction_id,
  t2.id AS to_transaction_id,
  t1.account_id AS from_account_id,
  a1.name AS from_account_name,
  t2.account_id AS to_account_id,
  a2.name AS to_account_name,
  t1.amount_cents,
  t1.date,
  t1.description
FROM transactions t1
JOIN transactions t2 ON t1.transfer_group_id = t2.transfer_group_id
  AND t1.id < t2.id  -- Avoid duplicates
JOIN accounts a1 ON a1.id = t1.account_id
JOIN accounts a2 ON a2.id = t2.account_id
WHERE t1.transfer_group_id IS NOT NULL
  AND t1.date >= $1  -- Date range
  AND t1.date <= $2
ORDER BY t1.date DESC;
```

**Key points**:

- Filter to transfers only with `transfer_group_id IS NOT NULL`
- Join to get both sides of transfer
- `t1.id < t2.id` prevents showing same transfer twice
- Include account names for readability

**Reference**: DATABASE.md lines 476-536

---

## ⚡ Performance & Indexes

### Hot Queries & Required Indexes

| Query Pattern                   | Target | Required Indexes                                           |
| ------------------------------- | ------ | ---------------------------------------------------------- |
| Transaction list (date range)   | <50ms  | `idx_transactions_account_date`                            |
| Category totals (monthly)       | <100ms | `idx_transactions_category_date`                           |
| Account balance                 | <30ms  | `idx_transactions_account_date`                            |
| Budget vs actual                | <150ms | `idx_transactions_category_date`, `idx_transactions_month` |
| Tagged transactions (@mentions) | <80ms  | `idx_transactions_tagged_users` (GIN)                      |
| Sync queue processing           | <20ms  | `idx_sync_queue_device_status`                             |

### Index Definitions

```sql
-- Compound indexes for common filter combinations
CREATE INDEX idx_transactions_account_date
  ON transactions(account_id, date DESC);

CREATE INDEX idx_transactions_category_date
  ON transactions(category_id, date DESC);

-- Month-based queries (budget tracking)
CREATE INDEX idx_transactions_month
  ON transactions(DATE_TRUNC('month', date));

-- Array search for @mentions
CREATE INDEX idx_transactions_tagged_users
  ON transactions USING GIN (tagged_user_ids);

-- Partial index for transfers
CREATE INDEX idx_transactions_transfers
  ON transactions(transfer_group_id)
  WHERE transfer_group_id IS NOT NULL;

-- Sync queue processing
CREATE INDEX idx_sync_queue_device_status
  ON sync_queue(device_id, status, created_at);
```

### Index Monitoring

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Find unused indexes (candidates for removal)
SELECT
  schemaname,
  tablename,
  indexname
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public';

-- Index size and bloat
SELECT
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

**Reference**: DATABASE.md lines 1226-1402

---

## 🔒 RLS Quick Reference

### Three Visibility Models

| Model             | Access Rule                               | Example Tables                                                        |
| ----------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| **Household**     | All authenticated users                   | `categories`, `accounts` (if `visibility='household'`)                |
| **Personal**      | Owner only (`owner_user_id = auth.uid()`) | `accounts` (if `visibility='personal'`), `transactions` (if personal) |
| **Device-scoped** | Device owner only                         | `sync_queue`                                                          |

### Policy Patterns

```sql
-- Household data (everyone can see)
CREATE POLICY "household_select" ON accounts
FOR SELECT TO authenticated
USING (visibility = 'household');

-- Personal data (owner only)
CREATE POLICY "personal_select" ON accounts
FOR SELECT TO authenticated
USING (visibility = 'personal' AND owner_user_id = auth.uid());

-- Device-scoped (sync queue)
CREATE POLICY "device_queue_select" ON sync_queue
FOR SELECT TO authenticated
USING (
  device_id IN (
    SELECT device_id FROM devices WHERE user_id = auth.uid()
  )
);

-- Insert with automatic owner
CREATE POLICY "insert_personal" ON accounts
FOR INSERT TO authenticated
WITH CHECK (
  visibility = 'personal'
  AND owner_user_id = auth.uid()
);
```

### Common RLS Mistakes

| Mistake                   | Impact                  | Fix                                        |
| ------------------------- | ----------------------- | ------------------------------------------ |
| No RLS enabled            | Data leaks to all users | `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` |
| Policy uses wrong user ID | Permission denied       | Use `auth.uid()` not `current_user`        |
| Missing INSERT policy     | Can't create records    | Add WITH CHECK policy                      |
| Policy too permissive     | Security vulnerability  | Tighten USING clause                       |

**Reference**: RLS-POLICIES.md

---

## ⚠️ Gotchas & Anti-Patterns

### Critical Gotchas

| Gotcha                                     | Impact                          | Solution                            | Reference             |
| ------------------------------------------ | ------------------------------- | ----------------------------------- | --------------------- |
| **Forgetting `transfer_group_id IS NULL`** | Analytics show 2x spending      | Add filter to all analytics queries | DATABASE.md:476-536   |
| **Using DECIMAL for currency**             | Precision loss, rounding errors | Use BIGINT cents                    | DATABASE.md:1070-1224 |
| **Not excluding transfers from budgets**   | Budget tracking fails           | Filter transfers                    | DATABASE.md:491-503   |
| **Using TIMESTAMPTZ for transaction date** | Month boundary bugs             | Use DATE type                       | DATABASE.md:1056-1068 |
| **Missing idempotency key uniqueness**     | Duplicate events                | Add UNIQUE constraint               | DATABASE.md:260-262   |
| **Not using compound indexes**             | Slow queries on 10k+ rows       | Create multi-column indexes         | DATABASE.md:214-218   |
| **Missing `idx_transactions_month`**       | Monthly aggregations slow       | Create functional index             | DATABASE.md:203       |
| **Not handling NULL in SUM()**             | Balance shows NULL              | Use COALESCE                        | DATABASE.md:370-376   |
| **Wrong visibility join logic**            | Data leaks                      | Fix RLS policies                    | DATABASE.md:839-855   |

### Anti-Patterns to Avoid

```sql
-- ❌ ANTI-PATTERN: Entity-level conflict resolution
UPDATE transactions
SET amount_cents = $1, description = $2
WHERE id = $3;
-- Problem: Overwrites ALL fields, loses concurrent edits

-- ✅ CORRECT: Field-level merge
UPDATE transactions
SET
  amount_cents = CASE
    WHEN $remote_amount_timestamp > $local_amount_timestamp
    THEN $remote_amount
    ELSE amount_cents
  END,
  description = CASE
    WHEN $remote_desc_timestamp > $local_desc_timestamp
    THEN $remote_desc
    ELSE description
  END
WHERE id = $3;
```

```sql
-- ❌ ANTI-PATTERN: No transaction boundaries
DELETE FROM transaction_events WHERE entity_id = $1;
INSERT INTO transaction_events (...) VALUES (...);
-- Problem: If INSERT fails, DELETE already committed

-- ✅ CORRECT: Use transactions
BEGIN;
  DELETE FROM transaction_events WHERE entity_id = $1;
  INSERT INTO transaction_events (...) VALUES (...);
COMMIT;
```

---

## 🔄 Event Sourcing Checklist

### Event Structure (Phase B)

```typescript
interface TransactionEvent {
  id: uuid;
  idempotency_key: string; // UNIQUE

  // What changed
  entity_type: "transaction" | "account" | "category" | "budget";
  entity_id: uuid;
  operation: "create" | "update" | "delete";
  payload: any; // Changed fields only for updates

  // Conflict resolution
  lamport_clock: number; // Per-entity counter
  vector_clock: VectorClock; // Per-entity {deviceId: clock}

  // Audit
  actor_user_id: uuid;
  device_id: string;
  timestamp: timestamptz;
}
```

### Idempotency Key Format

```
${deviceId}-${entityType}-${entityId}-${lamportClock}

Example:
fp-abc123-transaction-550e8400-e29b-41d4-a716-446655440000-42
```

### Vector Clock Rules

```typescript
// Per-entity, NOT global
{
  "fp-device1": 5,  // Device 1 made 5 changes to THIS transaction
  "fp-device2": 3   // Device 2 made 3 changes to THIS transaction
}

// On local change: Increment own clock
vectorClock[myDeviceId]++;

// On sync: Merge clocks
vectorClock = merge(localClock, remoteClock);

// Detect conflict: Clocks diverged
isConflict = !isGreaterThan(localClock, remoteClock) &&
             !isGreaterThan(remoteClock, localClock);
```

### Event Retention Policy

- **Raw events**: 90 days
- **Compaction trigger**: 100 events per entity OR monthly
- **Snapshots**: Kept forever (for audit)
- **Never delete**: Events with `status = 'queued'` (un-synced)

**Reference**: DATABASE.md lines 1414-1494, SYNC-ENGINE.md lines 365-511

---

## 🔧 Migration Checklist

### When to Create a Migration

- ✅ Add/remove table
- ✅ Add/remove column
- ✅ Change column type
- ✅ Add/remove constraint
- ✅ Add/remove index
- ✅ Modify RLS policy

### Migration Template

```sql
-- Migration: 20250115_add_tagged_users.sql
-- Description: Add tagged_user_ids array for @mentions

BEGIN;

-- Add column
ALTER TABLE transactions
ADD COLUMN tagged_user_ids uuid[] DEFAULT '{}';

-- Add GIN index for array search
CREATE INDEX idx_transactions_tagged_users
ON transactions USING GIN (tagged_user_ids);

-- Update RLS policy if needed
-- ...

COMMIT;
```

### Migration Safety Rules

1. **Always use transactions**: Wrap in `BEGIN; ... COMMIT;`
2. **Never edit deployed migrations**: Create new migration instead
3. **Test locally first**: Use local Supabase before production
4. **Backup before production**: Snapshot database
5. **Can rollback**: Know how to undo (create down migration)

### Migration Testing

```bash
# Local testing
supabase db reset  # Reset to clean state
supabase db push   # Apply migrations
# Manual verification

# Production
supabase db push --db-url $PRODUCTION_URL
# Verify with smoke tests
```

**Reference**: DATABASE.md lines 906-969

---

## Quick Command Reference

```bash
# Connect to Supabase locally
supabase start

# Apply migrations
supabase db push

# Reset database
supabase db reset

# Generate TypeScript types
supabase gen types typescript --local > src/types/database.ts

# Seed data
psql -h localhost -p 54322 -U postgres < seed.sql
```

---

## Links to Deep Dives

- **Full database schema**: `docs/initial plan/DATABASE.md`
- **RLS policies**: `docs/initial plan/RLS-POLICIES.md`
- **Sync engine details**: `docs/initial plan/SYNC-ENGINE.md`
- **Migration guide**: `docs/initial plan/MIGRATION.md`

---

**Last Updated**: 2025-01-15
**Keep this cheatsheet open while implementing chunks!**
