# Checkpoint: Transactions Form

Verify the complete transaction entry system works.

---

## 1. Form Loads ✓

Visit `http://localhost:3000/transactions`

**Check**:

- [ ] Page loads without errors
- [ ] "Add Transaction" button visible
- [ ] Transaction list displays (should show seed data)
- [ ] No console errors

---

## 2. Create Transaction - Basic ✓

1. Click "Add Transaction"
2. Dialog opens
3. Fill minimum fields:
   - Amount: 1500.50
   - Description: "Test Transaction"
   - Leave other fields as default
4. Click "Create"

**Expected**:

- [ ] Dialog closes
- [ ] Toast shows "Transaction created"
- [ ] Transaction appears in list
- [ ] Amount shows as "₱1,500.50"
- [ ] Type shows as expense (red)
- [ ] Status is pending (empty circle icon)

---

## 3. Form Validation Works ✓

**Test Case 1: Empty description**

1. Open form
2. Leave description empty
3. Try to submit
4. **Expected**: "Description must be at least 3 characters"

**Test Case 2: Zero amount**

1. Set amount to 0
2. Try to submit
3. **Expected**: "Amount must be positive"

**Test Case 3: Future date**

1. Try to pick tomorrow's date
2. **Expected**: Date disabled in calendar

---

## 4. Currency Input Works ✓

1. Open form
2. Type "2500.75" in amount field
3. Tab out
4. **Expected**: Displays "₱2,500.75"
5. Submit form
6. **Expected**: Stored as 250075 cents

---

## 5. Type Selector Works ✓

**Test Case 1: Income**

1. Select "Income" radio button
2. Enter amount 5000
3. Submit
4. **Expected**: Shows "+₱5,000.00" in green

**Test Case 2: Expense**

1. Select "Expense"
2. Enter amount 1500
3. Submit
4. **Expected**: Shows "-₱1,500.00" in red

---

## 6. Date Picker Works ✓

1. Click on date field
2. Calendar opens
3. Select a date from last week
4. **Expected**:
   - Date displays in button
   - Calendar closes
   - Form contains selected date

**Test future date**:

- Future dates should be disabled
- Can't select tomorrow

---

## 7. Category Selector Works ✓

1. Open form
2. Click category dropdown
3. **Expected**: Shows parent categories as group labels
4. Select "Groceries" under "Food"
5. **Expected**:
   - Selection shows "Groceries"
   - Form has category_id set

---

## 8. Account Selector Works ✓

1. Open form
2. Click account dropdown
3. **Expected**: Shows all active accounts
4. Select an account
5. **Expected**: Account selected

---

## 9. Edit Transaction ✓

1. Find a transaction in list
2. Click Edit button
3. Dialog opens with existing data
4. **Verify all fields filled**:
   - Amount formatted correctly
   - Description present
   - Date correct
   - Category selected
   - Account selected
5. Change description
6. Click "Update"
7. **Expected**:
   - Dialog closes
   - Toast shows "Transaction updated"
   - List shows new description

---

## 10. Delete Transaction ✓

1. Click delete button on a test transaction
2. Confirmation dialog appears
3. Confirm delete
4. **Expected**:
   - Transaction disappears from list
   - No errors

---

## 11. Status Toggle ✓

1. Find a pending transaction (empty circle)
2. Click the status icon
3. **Expected**:
   - Icon changes to filled green circle
   - Status is now "cleared"
4. Click again
5. **Expected**:
   - Icon changes back to empty circle
   - Status is now "pending"

---

## 12. Transaction List Display ✓

**Check all columns**:

- [ ] Date formatted (e.g., "Jan 15")
- [ ] Description visible
- [ ] Category shows badge
- [ ] Account name visible
- [ ] Amount formatted with PHP symbol
- [ ] Amount color-coded (green income, red expense)
- [ ] Status icon clickable
- [ ] Edit/Delete buttons present

---

## 13. Form Clears After Save ✓

1. Open form
2. Fill all fields
3. Submit
4. Open form again
5. **Expected**: All fields reset to defaults

---

## 14. Keyboard Navigation ✓

**Tab order**:

1. Type (radio buttons)
2. Amount
3. Date
4. Description
5. Account
6. Category
7. Status
8. Notes
9. Cancel button
10. Submit button

**Test**:

- [ ] Can tab through all fields
- [ ] Enter submits form
- [ ] Esc closes dialog

---

## 15. Loading States ✓

**While submitting**:

- [ ] Submit button shows "Saving..."
- [ ] Submit button disabled
- [ ] Form fields still accessible

**While loading data**:

- [ ] Transaction list shows loading state
- [ ] No crash if data not loaded

---

## 16. Error Handling ✓

**Test Case 1: Network error**

1. Disconnect internet
2. Try to create transaction
3. **Expected**: Error toast displayed

**Test Case 2: Validation error**

1. Submit invalid data
2. **Expected**: Specific error messages shown

---

## 17. Notes Field Works ✓

1. Open form
2. Enter notes in textarea
3. Submit
4. **Expected**:
   - Transaction created
   - Notes visible in list (truncated)
   - Edit shows full notes

---

## Success Criteria

- [ ] Can create transactions
- [ ] Can edit transactions
- [ ] Can delete transactions
- [ ] Can toggle status
- [ ] Currency formatting correct
- [ ] Type selector works
- [ ] Date picker functional
- [ ] Category selector shows hierarchy
- [ ] Account selector populated
- [ ] Form validation catches errors
- [ ] List displays all columns
- [ ] Loading states show
- [ ] Error handling works
- [ ] Keyboard navigation smooth
- [ ] **MVP core data entry complete!**

---

## Next Steps

Once verified:

1. Commit transactions form code
2. Test with real usage patterns
3. Consider adding filters to list (chunk 010)
4. Move to chunk 011 (transactions views/filters)

---

**Time**: 20-30 minutes to verify all checkpoints
