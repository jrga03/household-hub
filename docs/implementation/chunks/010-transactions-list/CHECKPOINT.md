# Checkpoint: Transactions List with Advanced Filtering

Verify the complete filtering system works correctly.

---

## 1. Page Loads ✓

Visit `http://localhost:3000/transactions`

**Check**:

- [ ] Page loads without errors
- [ ] Filter panel displays above transaction list
- [ ] Transaction list shows all transactions (no filters applied)
- [ ] "Hide transfers" toggle is ON by default
- [ ] Result count shows correct number
- [ ] No console errors

---

## 2. Search Filter Works ✓

**Test Case 1: Basic search**

1. Type "grocery" in search field
2. Wait 300ms for debounce
3. **Expected**:
   - Only transactions with "grocery" in description or notes show
   - URL updates: `?search=grocery`
   - Result count updates

**Test Case 2: Search clears**

1. Clear search field
2. **Expected**:
   - All transactions show again
   - URL parameter removed

---

## 3. Date Range Filter Works ✓

**Test Case 1: From date only**

1. Select January 1, 2024 as "From Date"
2. **Expected**:
   - Only transactions from Jan 1 onwards show
   - URL updates: `?dateFrom=2024-01-01`
   - Earlier transactions hidden

**Test Case 2: Date range**

1. Set From: Jan 1, To: Jan 31
2. **Expected**:
   - Only January transactions show
   - URL: `?dateFrom=2024-01-01&dateTo=2024-01-31`
   - Transactions outside range hidden

**Test Case 3: Clear dates**

1. Clear both date fields
2. **Expected**:
   - All transactions show again
   - Date params removed from URL

---

## 4. Account Filter Works ✓

**Test Case 1: Select specific account**

1. Select "Checking Account" from dropdown
2. **Expected**:
   - Only transactions from checking account show
   - URL updates: `?accountId=<account-id>`
   - Other accounts' transactions hidden

**Test Case 2: Return to "All accounts"**

1. Select "All accounts"
2. **Expected**:
   - All transactions show
   - accountId param removed

---

## 5. Category Filter Works ✓

**Test Case 1: Select child category**

1. Select "Groceries" (under Food parent)
2. **Expected**:
   - Only grocery transactions show
   - URL updates: `?categoryId=<category-id>`
   - Other categories hidden

**Test Case 2: Parent category groups working**

1. Open category dropdown
2. **Expected**:
   - Parent categories shown as labels (not selectable)
   - Child categories indented and selectable
   - Colors displayed next to names

---

## 6. Type Filter Works ✓

**Test Case 1: Income only**

1. Select "Income" from type dropdown
2. **Expected**:
   - Only income transactions show (green amounts with +)
   - URL updates: `?type=income`
   - Expense transactions hidden

**Test Case 2: Expense only**

1. Select "Expense"
2. **Expected**:
   - Only expense transactions show (red amounts with -)
   - URL: `?type=expense`

**Test Case 3: All types**

1. Select "All types"
2. **Expected**:
   - Both income and expenses show
   - type param removed

---

## 7. Status Filter Works ✓

**Test Case 1: Pending only**

1. Select "Pending"
2. **Expected**:
   - Only pending transactions show (empty circle icon)
   - URL: `?status=pending`
   - Cleared transactions hidden

**Test Case 2: Cleared only**

1. Select "Cleared"
2. **Expected**:
   - Only cleared transactions show (filled circle icon)
   - URL: `?status=cleared`

---

## 8. Transfer Exclusion Toggle Works ✓

**Setup**: Create a transfer transaction first (or use existing)

**Test Case 1: Transfers hidden (default)**

1. Verify toggle is ON
2. **Expected**:
   - Transfer transactions not visible in list
   - URL: `?excludeTransfers=true` (or default)
   - Only regular income/expense transactions show

**Test Case 2: Show transfers**

1. Turn toggle OFF
2. **Expected**:
   - Transfer transactions now visible
   - They appear as both expense and income with same amount
   - URL: `?excludeTransfers=false`

**Critical**: Default state should be transfers HIDDEN

---

## 9. Multiple Filters Combined ✓

**Test Case: Complex filter**

1. Set filters:
   - Date: Jan 1-31, 2024
   - Account: Checking
   - Category: Groceries
   - Status: Cleared
   - Type: Expense
2. **Expected**:
   - Only transactions matching ALL criteria show
   - URL has all params:
     ```
     ?dateFrom=2024-01-01&dateTo=2024-01-31&accountId=abc&categoryId=xyz&status=cleared&type=expense&excludeTransfers=true
     ```
   - Result count accurate

---

## 10. Clear Filters Button Works ✓

**Test Case**:

1. Apply several filters
2. Click "Clear" button (X icon)
3. **Expected**:
   - All filters reset to default
   - Only "Hide transfers" remains ON
   - URL clears: `?excludeTransfers=true`
   - All transactions show (except transfers)

---

## 11. URL State Persistence ✓

**Test Case 1: Bookmark**

1. Apply filters
2. Copy URL
3. Open in new tab or refresh page
4. **Expected**:
   - Filters restored from URL
   - Same filtered view shows
   - Filter controls reflect URL state

**Test Case 2: Browser back/forward**

1. Apply filter A
2. Apply filter B
3. Click browser back button
4. **Expected**:
   - Filter A restored
   - List updates correctly

---

## 12. Search Debounce Works ✓

**Test Case**:

1. Type quickly in search: "g-r-o-c-e-r-y"
2. Watch network tab
3. **Expected**:
   - Only ONE query fires (after 300ms pause)
   - Not 7 queries (one per keystroke)
   - Query waits until typing stops

---

## 13. Empty State Displays ✓

**Test Case 1: No results**

1. Set impossible filter (e.g., future date range with no data)
2. **Expected**:
   - Empty state shows
   - Message: "No transactions match your filters"
   - Suggestion to adjust/clear filters

**Test Case 2: No transactions at all**

1. Clear database or use fresh account
2. Visit page with no filters
3. **Expected**:
   - Empty state shows
   - Message: "No transactions yet"
   - Add button visible

---

## 14. Loading State Works ✓

**Test Case**:

1. Throttle network in DevTools (Slow 3G)
2. Change a filter
3. **Expected**:
   - Loading spinner shows
   - Previous data remains visible (optimistic UI)
   - No flash of empty state

---

## 15. Result Count Accurate ✓

**Test Cases**:

- No filters: Shows total transaction count
- With filters: Shows count of filtered results
- Search: Updates as search narrows results
- Always matches number of rows in table

---

## 16. Performance with Large Dataset ✓

**Test Case**: (If you have test data)

1. Filter a dataset with 1000+ transactions
2. Change filters rapidly
3. **Expected**:
   - No lag or freeze
   - Queries return in <100ms (check network tab)
   - Smooth scrolling
   - UI responsive

---

## 17. Category Selector Hierarchy ✓

**Test Case**:

1. Open category dropdown
2. **Expected**:
   - Parent categories as non-selectable labels
   - Child categories indented
   - Colors show next to each category
   - Clear "All categories" option at top

---

## Success Criteria

- [ ] All 8 filter types work independently
- [ ] Multiple filters combine correctly (AND logic)
- [ ] URL updates with each filter change
- [ ] Filters persist on page refresh
- [ ] Search is debounced (300ms)
- [ ] Transfer exclusion defaults to ON
- [ ] Clear filters resets to default state
- [ ] Empty and loading states display correctly
- [ ] Result count is always accurate
- [ ] No console errors
- [ ] Performance smooth with 1000+ transactions
- [ ] **Filtering is production-ready!**

---

## Next Steps

Once verified:

1. Commit transaction filtering code
2. Test with real usage patterns
3. Consider adding saved filter presets (future)
4. Move to chunk 011 (account balances)

---

**Time**: 20-30 minutes to verify all checkpoints
