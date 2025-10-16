# Troubleshooting: Transfers UI

---

## Problem: Only one transaction created

**Cause**: Second insert failing silently

**Solution**: Check both inserts succeed:

```typescript
const { error: expenseError } = await supabase...insert(expense);
if (expenseError) throw expenseError; // Don't continue if first fails

const { error: incomeError } = await supabase...insert(income);
if (incomeError) throw incomeError;
```

---

## Problem: Transfer shows in analytics

**Cause**: Not filtering by transfer_group_id

**Solution**: Add WHERE clause:

```typescript
.is('transfer_group_id', null) // Exclude transfers
```

---

## Problem: Cannot select same account

**Cause**: Zod refinement not working

**Solution**: Verify refine logic:

```typescript
.refine(data => data.from_account_id !== data.to_account_id, {
  message: 'Cannot transfer to same account',
  path: ['to_account_id'],
})
```

---

## Quick Fix

If transfer fails, check database for orphaned transaction and delete or update to NULL transfer_group_id
