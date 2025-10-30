# Troubleshooting: Transactions Schema

Common issues when setting up transactions.

---

## Table Schema Issues

### Problem: Date column is TIMESTAMPTZ instead of DATE

**Cause**: Migration used wrong type

**Solution**:

```sql
ALTER TABLE transactions
ALTER COLUMN date TYPE DATE USING date::DATE;
```

---

### Problem: Amount can be negative

**Cause**: Missing CHECK constraint

**Solution**:

```sql
ALTER TABLE transactions
ADD CONSTRAINT amount_positive CHECK (amount_cents >= 0);
```

---

## RLS Policy Issues

### Problem: Can't fetch transactions (empty result)

**Cause**: RLS blocking access

**Solution**:

```sql
-- Check if RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'transactions';

-- If false, enable it:
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Verify policies
SELECT * FROM pg_policies WHERE tablename = 'transactions';

-- Recreate view policy if missing:
CREATE POLICY "View transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    visibility = 'household'
    OR created_by_user_id = auth.uid()
  );
```

---

## Seed Data Issues

### Problem: Seed script fails with foreign key errors

**Cause**: Referenced accounts/categories don't exist

**Solution**:

```sql
-- Check if accounts exist
SELECT id, name FROM accounts LIMIT 5;

-- Check if categories exist
SELECT id, name FROM categories LIMIT 5;

-- If missing, run chunks 004-005 and 007 first
```

---

### Problem: auth.uid() returns NULL in seed script

**Cause**: Not authenticated when running SQL

**Solution**:
Replace `auth.uid()` with actual user UUID:

```sql
-- Get your user ID first
SELECT id FROM auth.users LIMIT 1;

-- Then use it in seed:
INSERT INTO transactions (
  ...
  created_by_user_id
) VALUES (
  ...
  'your-actual-user-uuid' -- Replace auth.uid()
);
```

---

## TypeScript Issues

### Problem: Type errors on amount_cents

**Cause**: Using number instead of AmountCents branded type

**Solution**:

```typescript
// Don't need to use branded type for transactions
// Regular number is fine for amount_cents
const transaction: Transaction = {
  amount_cents: 150050, // Regular number OK
  // ...
};
```

---

## Query Hook Issues

### Problem: useTransactions returns empty array

**Cause**: RLS or no data

**Solution**:

```typescript
// Check query in browser console
const { data, error } = useTransactions();
console.log("Data:", data);
console.log("Error:", error);

// If error, check RLS policies
// If null, check seed data
```

---

## Filter Issues

### Problem: exclude_transfers filter doesn't work

**Cause**: Filter logic incorrect

**Solution**:

```typescript
// In supabaseQueries.ts
if (filters?.exclude_transfers) {
  query = query.is("transfer_group_id", null); // ← Use .is() not .eq()
}
```

---

## Transfer Issues

### Problem: Transfer pairs have different amounts

**Cause**: Manual data entry error

**Solution**:

```sql
-- Find mismatched transfers
SELECT
  t1.transfer_group_id,
  t1.amount_cents as amount1,
  t2.amount_cents as amount2
FROM transactions t1
JOIN transactions t2 ON t1.transfer_group_id = t2.transfer_group_id AND t1.id < t2.id
WHERE t1.transfer_group_id IS NOT NULL
  AND t1.amount_cents != t2.amount_cents;

-- Fix manually or delete and recreate
```

---

## Quick Fixes

```sql
-- Reset all transactions (WARNING: Deletes all)
DELETE FROM transactions;

-- Re-run seed script

-- Verify count
SELECT COUNT(*) FROM transactions;

-- Check RLS
SELECT * FROM pg_policies WHERE tablename = 'transactions';
```

---

**Remember**: Test queries in SQL Editor before using in app.
