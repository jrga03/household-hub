# Checkpoint: Transfers Schema

Run these verifications to ensure everything works correctly.

---

## 1. Triggers Created ✓

```sql
SELECT tgname, tgtype, tgenabled
FROM pg_trigger
WHERE tgname LIKE '%transfer%';
```

**Expected**:

- `ensure_transfer_integrity`
- `handle_transfer_deletion_trigger`
- Both enabled

---

## 2. Valid Transfer Works ✓

Create a complete transfer and verify:

```sql
SELECT COUNT(*) FROM transactions
WHERE transfer_group_id = 'some-uuid';
```

**Expected**: Exactly 2 transactions

```sql
SELECT type, amount_cents
FROM transactions
WHERE transfer_group_id = 'some-uuid';
```

**Expected**: One 'expense', one 'income', same amount

---

## 3. Constraints Enforced ✓

**Test same type rejected**:

- ✓ Cannot create two expenses with same transfer_group_id
- ✓ Cannot create two incomes with same transfer_group_id

**Test different amounts rejected**:

- ✓ Cannot create transfer with different amounts

**Test three transactions rejected**:

- ✓ Cannot add third transaction to transfer group

---

## 4. Deletion Handling Works ✓

- ✓ Deleting one transfer transaction nullifies paired transaction's transfer_group_id
- ✓ Paired transaction remains in database as regular transaction

---

## 5. Analytics Exclusion Pattern ✓

Test that transfers are excluded:

```sql
-- Total spending (should exclude transfers)
SELECT SUM(amount_cents) FROM transactions
WHERE type = 'expense'
  AND transfer_group_id IS NULL;
```

**Expected**: Does not include transfer amounts

---

## Success Criteria

- [ ] Triggers created and enabled
- [ ] Valid transfers can be created
- [ ] Same-type transfers rejected
- [ ] Different-amount transfers rejected
- [ ] Three-transaction transfers rejected
- [ ] Deletion unpairs transactions
- [ ] Analytics exclusion works

---

**Next**: Move to Chunk 018 (Transfers UI)
