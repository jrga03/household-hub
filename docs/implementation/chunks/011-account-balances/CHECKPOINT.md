# Checkpoint: Account Balances

Verify the complete balance system works correctly.

---

## 1. Page Loads ✓

Visit `http://localhost:3000/accounts`

**Check**:

- [ ] Page loads without errors
- [ ] Account list displays with balance cards
- [ ] Each account shows current balance
- [ ] Balances display in PHP currency format (₱1,234.56)
- [ ] Account icons and colors render correctly
- [ ] No console errors

---

## 2. Balance Calculation Accuracy ✓

**Setup**: Create test data

1. Create account "Test Checking" with initial balance ₱10,000.00
2. Add cleared income transaction: +₱5,000.00
3. Add cleared expense transaction: -₱2,000.00
4. Add pending expense transaction: -₱1,000.00

**Expected Balance**:

- Current Balance: ₱12,000.00 (10,000 + 5,000 - 2,000 - 1,000)
- Cleared Balance: ₱13,000.00 (10,000 + 5,000 - 2,000)
- Pending Balance: -₱1,000.00

**Check**:

- [ ] Current balance matches calculation
- [ ] Cleared balance excludes pending transactions
- [ ] Pending balance shows separately
- [ ] Math is correct (no rounding errors)

---

## 3. Transfer Inclusion Works ✓

**CRITICAL TEST**: Transfers MUST affect account balances

**Setup**:

1. Create two accounts: "Checking" (₱10,000) and "Savings" (₱5,000)
2. Create transfer: ₱3,000 from Checking to Savings
3. This creates:
   - Expense transaction in Checking: -₱3,000 (with transfer_group_id)
   - Income transaction in Savings: +₱3,000 (with transfer_group_id)

**Expected**:

- Checking balance: ₱7,000.00 (10,000 - 3,000)
- Savings balance: ₱8,000.00 (5,000 + 3,000)

**Check**:

- [ ] Checking account shows ₱7,000.00
- [ ] Savings account shows ₱8,000.00
- [ ] Transfer transactions counted in balances
- [ ] Total money across accounts unchanged (₱15,000)

---

## 4. Cleared vs Pending Split ✓

**Test Case 1: All cleared**

1. Account with only cleared transactions
2. **Expected**:
   - Current balance = Cleared balance
   - Pending balance = ₱0.00
   - Pending section hidden or shows zero

**Test Case 2: Mixed status**

1. Account with both cleared and pending
2. **Expected**:
   - Current balance = Cleared + Pending
   - Cleared balance with green checkmark icon
   - Pending balance with yellow clock icon
   - Both amounts visible

**Test Case 3: All pending**

1. Account with only pending transactions
2. **Expected**:
   - Current balance = Initial + Pending
   - Cleared balance = Initial balance
   - Pending balance shows prominently

---

## 5. Balance Display Component ✓

**Test Case: Component variations**

1. Large size display (account detail page)
2. Small size display (account list cards)
3. With split display (showSplit=true)
4. Without split display (showSplit=false)

**Check**:

- [ ] Large size: 3xl font, prominent display
- [ ] Small size: xl font, compact display
- [ ] Split display: Shows cleared and pending
- [ ] No split: Only shows current balance
- [ ] Color coding: Green for positive, red for negative

---

## 6. Account List Page ✓

**Check Account Cards**:

- [ ] Each account displays as clickable card
- [ ] Account icon matches type (bank, credit card, cash, investment)
- [ ] Account color displayed correctly
- [ ] Account name visible
- [ ] Account type label shown (capitalized, spaces for underscores)
- [ ] Balance visible on right side
- [ ] Hover state works (background changes)
- [ ] Click navigates to account detail page

**Check Empty State**:

1. Delete all accounts or use fresh database
2. **Expected**:
   - "No accounts yet" message
   - Empty state centered
   - Add button visible in header

---

## 7. Account Detail Page ✓

Visit `/accounts/{accountId}`

**Check Header**:

- [ ] Back button navigates to /accounts
- [ ] Account name displayed
- [ ] Transaction count shown
- [ ] Large balance display with split
- [ ] Initial balance shown in details section
- [ ] Cleared transaction count shown
- [ ] Pending transaction count shown

**Check Balance Card**:

- [ ] Current balance prominent (large, colored)
- [ ] Cleared balance with checkmark icon
- [ ] Pending balance with clock icon (if non-zero)
- [ ] Initial balance in footer
- [ ] Counts match actual transaction list

---

## 8. Transaction Count Accuracy ✓

**Test Case**:

1. Create account with known number of transactions
2. Visit account detail page

**Check**:

- [ ] Total count matches actual transactions
- [ ] Cleared count accurate
- [ ] Pending count accurate
- [ ] Counts update when transaction status changes
- [ ] Header shows correct total

---

## 9. Balance Updates Real-Time ✓

**Test Case: Add transaction**

1. Note current balance
2. Add new transaction (e.g., +₱500 income)
3. **Expected**:
   - Balance updates immediately
   - New transaction appears in list
   - Count increments
   - No page refresh needed

**Test Case: Edit transaction**

1. Edit existing transaction amount
2. **Expected**:
   - Balance recalculates
   - Updated amount reflected
   - Status change updates cleared/pending split

**Test Case: Delete transaction**

1. Delete a transaction
2. **Expected**:
   - Balance adjusts
   - Transaction removed from list
   - Count decrements

---

## 10. Multiple Accounts Display ✓

**Setup**: Create 5+ accounts with different balances

**Check**:

- [ ] All accounts visible on list page
- [ ] Each shows unique balance
- [ ] Grid layout responsive (2 cols on tablet, 3 on desktop)
- [ ] Balances independently calculated
- [ ] No cross-contamination between accounts

---

## 11. Negative Balance Handling ✓

**Test Case: Overdraft scenario**

1. Create account with ₱1,000 initial balance
2. Add expense of ₱1,500
3. **Expected**:
   - Balance shows -₱500.00
   - Displayed in red color
   - Negative sign visible
   - Math correct

**Check**:

- [ ] Negative amounts formatted correctly
- [ ] Red color applied
- [ ] No display glitches
- [ ] Math accurate

---

## 12. Large Transaction Volume ✓

**Test Case**: Account with 100+ transactions

**Check**:

- [ ] Balance calculation completes quickly (<100ms)
- [ ] No UI lag or freezing
- [ ] Correct balance despite large dataset
- [ ] Transaction list renders smoothly
- [ ] Counts accurate

---

## 13. Initial Balance Display ✓

**Test Case**:

1. Create account with initial balance ₱50,000
2. Add no transactions
3. **Expected**:
   - Current balance = ₱50,000
   - Cleared balance = ₱50,000
   - Pending balance = ₱0
   - Initial balance shown in detail footer

**Check**:

- [ ] Initial balance preserved
- [ ] Displayed in account detail footer
- [ ] Matches database value
- [ ] Used as starting point for calculations

---

## 14. formatPHP Currency Utility ✓

**Check all displays**:

- [ ] Amounts formatted as ₱1,234.56
- [ ] Thousands separator (comma)
- [ ] Always two decimal places
- [ ] Peso sign (₱) prefix
- [ ] Negative amounts: -₱1,234.56
- [ ] Zero amounts: ₱0.00

---

## 15. Loading States ✓

**Test Case**:

1. Throttle network (DevTools → Slow 3G)
2. Navigate to /accounts

**Check**:

- [ ] Loading spinner displays
- [ ] Centered on page
- [ ] No flash of wrong content
- [ ] Smooth transition when data loads

**Test Case 2**:

1. Navigate to account detail
2. **Expected**:
   - Loading state while fetching balance
   - Spinner centered
   - Clean transition to content

---

## 16. Error Handling ✓

**Test Case 1: Account not found**

1. Navigate to `/accounts/invalid-id`
2. **Expected**:
   - "Account not found" message
   - No crash or console errors
   - Graceful error display

**Test Case 2: Query failure**

1. Disconnect from Supabase (block network)
2. Try to load accounts
3. **Expected**:
   - Error state displayed
   - Helpful error message
   - Option to retry (if applicable)

---

## 17. Mobile Responsiveness ✓

**Test at different widths**:

- Mobile (320px-640px)
- Tablet (641px-1024px)
- Desktop (1024px+)

**Check**:

- [ ] Account cards stack on mobile
- [ ] Balance readable on small screens
- [ ] Split display adjusts to small widths
- [ ] Grid layout responsive (1 col → 2 col → 3 col)
- [ ] Touch targets adequate (44px minimum)

---

## 18. useAccountBalances Hook ✓

**Test Case: All accounts query**

1. Create 3+ accounts with transactions
2. Visit /accounts page
3. Check network tab

**Expected**:

- [ ] Single query fetches all accounts
- [ ] Single query fetches all transactions
- [ ] Balances calculated client-side
- [ ] Query completes in <100ms
- [ ] Cached for 30 seconds (staleTime)

---

## 19. useAccountBalance Hook ✓

**Test Case: Single account query**

1. Visit account detail page
2. Check network tab

**Expected**:

- [ ] Query fetches single account data
- [ ] Query fetches only that account's transactions
- [ ] Balance calculated correctly
- [ ] Query cached (staleTime: 30s)
- [ ] Efficient SQL with account_id filter

---

## 20. Link Navigation ✓

**Test Case**:

1. Click account card on list page
2. **Expected**:
   - Navigates to `/accounts/{accountId}`
   - URL updates correctly
   - Account detail page loads
   - Back button returns to list

**Check**:

- [ ] TanStack Router Link works
- [ ] URL params correct
- [ ] Browser back/forward work
- [ ] No page refresh (SPA navigation)

---

## Success Criteria

- [ ] All balance calculations mathematically correct
- [ ] Transfers INCLUDED in balance calculations
- [ ] Cleared/pending split accurate
- [ ] Balance display components work in all variants
- [ ] Account list shows all balances correctly
- [ ] Account detail page displays full balance info
- [ ] Real-time updates when transactions change
- [ ] Loading and error states handled gracefully
- [ ] Responsive design works on all screen sizes
- [ ] Performance smooth with 100+ transactions
- [ ] Currency formatting consistent (formatPHP)
- [ ] No console errors
- [ ] **Account balance tracking is production-ready!**

---

## Next Steps

Once verified:

1. Commit account balance code
2. Test with real-world transaction volumes
3. Verify bank reconciliation workflows
4. Move to chunk 012 (category totals)

---

**Time**: 20-30 minutes to verify all checkpoints
