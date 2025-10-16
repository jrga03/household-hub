# Checkpoint: Offline Writes

Run these verifications to ensure everything works correctly.

---

## 1. Unit Tests Pass ✓

```bash
npm test src/lib/offline/transactions.test.ts
```

**Expected**:

```
✓ Offline Transaction Operations (3 tests)
  ✓ should create transaction with temporary ID
  ✓ should update existing transaction
  ✓ should delete transaction

Test Files  1 passed (1)
     Tests  3 passed (3)
```

All tests should pass with no failures.

---

## 2. Type Checking Passes ✓

```bash
npm run type-check
```

**Expected**: No TypeScript errors in:

- `src/lib/offline/types.ts`
- `src/lib/offline/transactions.ts`
- `src/lib/offline/accounts.ts`
- `src/lib/offline/categories.ts`
- `src/hooks/useOfflineTransaction.ts`

---

## 3. Manual Testing: Create Transaction Offline ✓

**Test Case 1: Create transaction while online**

1. Open browser DevTools
2. Navigate to `/transactions/new`
3. Fill form:
   - Description: "Test offline create"
   - Amount: 1500.50
   - Type: Expense
   - Account: (select any)
   - Category: (select any)
4. Click "Save"
5. **Expected**:
   - Toast: "Transaction created (offline)"
   - Transaction appears in list
   - ID starts with `temp-`

**Verify in IndexedDB**:

```javascript
// In browser console
const db = await window.indexedDB.open("HouseholdHubDB");
// Navigate to "transactions" object store
// Should see entry with temp- ID
```

---

## 4. Manual Testing: Update Transaction Offline ✓

**Test Case 2: Update existing transaction**

1. Find the transaction created in step 3
2. Click "Edit"
3. Change description to "Updated offline"
4. Click "Save"
5. **Expected**:
   - Toast: "Transaction updated (offline)"
   - Description shows "Updated offline"
   - `updated_at` timestamp changed

**Verify**:

```javascript
// In console
const tx = await db.transactions.get("temp-[ID]");
console.log(tx.description); // "Updated offline"
console.log(tx.updated_at); // Recent timestamp
```

---

## 5. Manual Testing: Delete Transaction Offline ✓

**Test Case 3: Delete transaction**

1. Find any transaction in list
2. Click "Delete" button
3. Confirm deletion
4. **Expected**:
   - Toast: "Transaction deleted (offline)"
   - Transaction removed from list
   - No longer in IndexedDB

**Verify**:

```javascript
const tx = await db.transactions.get("temp-[ID]");
console.log(tx); // undefined
```

---

## 6. Manual Testing: Batch Create ✓

**Test Case 4: Create multiple transactions**

```typescript
// In browser console (assuming CSV import UI exists)
const inputs = [
  {
    date: "2024-01-15",
    description: "Batch 1",
    amount_cents: 100000,
    type: "expense",
    status: "pending",
    visibility: "household",
  },
  {
    date: "2024-01-16",
    description: "Batch 2",
    amount_cents: 200000,
    type: "income",
    status: "cleared",
    visibility: "household",
  },
];

// Test batch creation
const result = await createOfflineTransactionsBatch(inputs, userId);
console.log(result.success); // true
console.log(result.data.length); // 2
```

**Expected**: All transactions created with `temp-` IDs

---

## 7. Optimistic Update Behavior ✓

**Test Case 5: Verify instant UI updates**

1. Throttle network to "Slow 3G" in DevTools
2. Create a new transaction
3. **Expected**:
   - UI updates immediately (no loading state)
   - Transaction appears in list right away
   - No network request sent (offline mode)

---

## 8. Account Operations ✓

**Test Case 6: Create account offline**

1. Navigate to `/accounts/new`
2. Fill form:
   - Name: "Test Account"
   - Type: Checking
   - Initial Balance: ₱5,000.00
   - Visibility: Household
3. Click "Save"
4. **Expected**:
   - Toast: "Account created (offline)"
   - Account appears in list
   - ID starts with `temp-`

**Test Case 7: Deactivate account**

1. Find account created in step 6
2. Click "Deactivate"
3. **Expected**:
   - Toast: "Account updated (offline)"
   - `is_active` set to `false`

---

## 9. Category Operations ✓

**Test Case 8: Create category offline**

1. Navigate to `/categories/new`
2. Fill form:
   - Name: "Test Category"
   - Parent: (none)
   - Color: #FF5733
3. Click "Save"
4. **Expected**:
   - Toast: "Category created (offline)"
   - Category appears in list
   - ID starts with `temp-`

---

## 10. Error Handling ✓

**Test Case 9: Handle IndexedDB errors**

```typescript
// Simulate quota exceeded error
// In console:
try {
  // Create massive transaction batch
  const huge = Array(10000).fill({
    date: "2024-01-15",
    description: "x".repeat(10000),
    amount_cents: 100000,
    type: "expense",
    status: "pending",
    visibility: "household",
  });
  await createOfflineTransactionsBatch(huge, userId);
} catch (error) {
  console.log(error); // Should handle gracefully
}
```

**Expected**: Error toast, no app crash

---

## 11. Referential Integrity ✓

**Test Case 10: Create transaction with temporary account**

1. Create new account offline (gets `temp-` ID)
2. Immediately create transaction referencing that account
3. **Expected**:
   - Transaction `account_id` = temp account ID
   - Relationship maintained locally
   - Will be resolved on sync

---

## Success Criteria

- [ ] All unit tests pass
- [ ] Type checking passes
- [ ] Can create transactions offline
- [ ] Can update transactions offline
- [ ] Can delete transactions offline
- [ ] Temporary IDs generated correctly (`temp-` prefix)
- [ ] IndexedDB writes succeed
- [ ] Optimistic UI updates work
- [ ] Accounts and categories work offline
- [ ] Error handling graceful
- [ ] Toast notifications appear
- [ ] TanStack Query cache invalidates correctly

---

## Common Issues

### Issue: Tests fail with "Cannot find module"

**Solution**: Ensure imports use correct path aliases (@/lib, @/hooks)

### Issue: IndexedDB writes fail

**Solution**: Check Dexie database is properly initialized (chunk 019)

### Issue: Type errors on Transaction interface

**Solution**: Ensure `@/types/database.ts` matches schema in DATABASE.md

### Issue: Mutations don't invalidate query cache

**Solution**: Verify queryKey matches between useQuery and useMutation

---

## Next Steps

Once all checkpoints pass:

1. Commit offline write code
2. Move to **Chunk 022: Sync Queue Schema**
3. Database migration for sync_queue table

---

**Estimated Time**: 20-30 minutes to verify all checkpoints
