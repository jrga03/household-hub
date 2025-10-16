# Checkpoint: Transfers UI

---

## 1. Transfer Form Renders ✓

Visit `/transfers` page

**Expected**:

- Form shows "From Account" and "To Account" dropdowns
- Amount input accepts currency
- Submit button present

---

## 2. Create Transfer Works ✓

**Steps**:

1. Select "From Account": Checking
2. Select "To Account": Savings
3. Enter amount: ₱1,000.00
4. Click "Create Transfer"

**Expected**:

- Toast shows "Transfer created successfully"
- 2 transactions created in database
- Both have same transfer_group_id
- One expense (from Checking), one income (to Savings)
- Same amount (₱1,000.00 = 100000 cents)

---

## 3. Validation Works ✓

**Test**: Try to transfer to same account

**Expected**: Error "Cannot transfer to same account"

---

## 4. Transfer List Shows Paired Transactions ✓

**Expected**:

- List shows transfers with arrow (From → To)
- Amount displayed correctly
- Date shown

---

## 5. Account Balances Update ✓

After creating transfer of ₱1,000 from Checking to Savings:

**Checking balance**: Decreased by ₱1,000
**Savings balance**: Increased by ₱1,000

---

## 6. Transfers Excluded from Analytics ✓

Check that transfers don't appear in expense reports or budget calculations

---

## Success Criteria

- [ ] Transfer form creates paired transactions
- [ ] Both transactions have same transfer_group_id
- [ ] Opposite types (expense + income)
- [ ] Same amounts
- [ ] Account balances update correctly
- [ ] Transfers excluded from analytics

---

**Next**: Move to Chunk 019 (Dexie Setup - Offline Foundation)
