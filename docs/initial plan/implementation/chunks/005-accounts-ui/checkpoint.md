# Checkpoint: Accounts UI

Run these checks to verify chunk 005 is complete.

## Automated Checks

### 1. TypeScript Compiles

```bash
npx tsc --noEmit
```

**Expected**: No errors

**Status**: [ ] Pass / [ ] Fail

---

### 2. Dev Server Starts

```bash
npm run dev
```

**Expected**: No errors, server starts

**Status**: [ ] Pass / [ ] Fail

---

### 3. Currency Utilities Tests

Create temporary test file `src/test-currency.ts`:

```typescript
import { formatPHP, parsePHP, validateAmount } from "@/lib/currency";

// Test formatPHP
console.assert(formatPHP(150050) === "₱1,500.50", "formatPHP failed");
console.assert(formatPHP(0) === "₱0.00", "formatPHP zero failed");
console.assert(formatPHP(100) === "₱1.00", "formatPHP whole number failed");

// Test parsePHP
console.assert(parsePHP("1,500.50") === 150050, "parsePHP comma failed");
console.assert(parsePHP("₱1,500.50") === 150050, "parsePHP symbol failed");
console.assert(parsePHP(1500.5) === 150050, "parsePHP number failed");

// Test validateAmount
console.assert(validateAmount(150050) === true, "validateAmount valid failed");
console.assert(validateAmount(-100) === false, "validateAmount negative failed");

console.log("✅ All currency tests passed");
```

Run:

```bash
npx tsx src/test-currency.ts
```

Delete test file after verification.

**Status**: [ ] Pass / [ ] Fail

---

## Navigation Checks

### 1. Dashboard Has Accounts Link

**Steps**:

1. Login and go to http://localhost:5173/dashboard
2. Look for Accounts card

**Expected**:

- [ ] Accounts card visible
- [ ] "View Accounts →" link present
- [ ] Link is clickable

**Status**: [ ] Pass / [ ] Fail

---

### 2. Accounts Route Accessible

**Steps**:

1. Click "View Accounts →" OR visit http://localhost:5173/accounts

**Expected**:

- [ ] Page loads without errors
- [ ] URL is /accounts
- [ ] Header shows "Accounts"

**Status**: [ ] Pass / [ ] Fail

---

## Account List Checks

### 1. Seed Accounts Visible

**Expected**:

- [ ] At least 3 accounts displayed
- [ ] BPI Savings (blue border)
- [ ] Cash Wallet (green border)
- [ ] BDO Credit Card (red border)
- [ ] Each shows name, type, visibility, balance

**Status**: [ ] Pass / [ ] Fail

---

### 2. Account Cards Display Correctly

For each account card, check:

- [ ] Name displayed prominently
- [ ] Type shown (e.g., "Bank Account")
- [ ] Visibility shown (Household/Personal)
- [ ] Balance formatted as PHP (₱1,000.00)
- [ ] Color indicator on left border
- [ ] Edit button present
- [ ] Archive button present

**Status**: [ ] Pass / [ ] Fail

---

## Create Account Flow

### 1. Open Create Form

**Steps**:

1. Click "Add Account" button

**Expected**:

- [ ] Dialog opens
- [ ] Title says "Create Account"
- [ ] Form has all fields visible:
  - Name input
  - Type dropdown
  - Initial balance input
  - Visibility dropdown
  - Color picker (8 colors)
- [ ] Cancel and Create buttons present

**Status**: [ ] Pass / [ ] Fail

---

### 2. Form Validation Works

**Steps**:

1. Try to submit empty form

**Expected**:

- [ ] Shows "Name is required" error
- [ ] Form doesn't submit
- [ ] Dialog stays open

**Status**: [ ] Pass / [ ] Fail

---

### 3. Create Household Account

**Steps**:

1. Fill form:
   - Name: "Test Checking"
   - Type: Bank Account
   - Balance: 5000.50
   - Visibility: Household
   - Color: Blue (default)
2. Click "Create"

**Expected**:

- [ ] Dialog closes
- [ ] New account appears in list
- [ ] Balance shows ₱5,000.50
- [ ] Blue border visible
- [ ] "Bank Account • Household" shown

**Status**: [ ] Pass / [ ] Fail

---

### 4. Create Personal Account

**Steps**:

1. Click "Add Account"
2. Fill form:
   - Name: "Personal GCash"
   - Type: E-Wallet
   - Balance: 1250.75
   - Visibility: Personal
   - Color: Amber
3. Submit

**Expected**:

- [ ] Account created successfully
- [ ] Shows "Personal" visibility
- [ ] Amber border
- [ ] Balance: ₱1,250.75

**Status**: [ ] Pass / [ ] Fail

---

## Edit Account Flow

### 1. Open Edit Form

**Steps**:

1. Click Edit button on "Test Checking" account

**Expected**:

- [ ] Dialog opens
- [ ] Title says "Edit Account"
- [ ] Form pre-filled with existing values:
  - Name: "Test Checking"
  - Type: Bank Account
  - Balance: 5000.50
  - Visibility: Household
  - Color: Blue

**Status**: [ ] Pass / [ ] Fail

---

### 2. Update Account Name

**Steps**:

1. Change name to "Test Checking (Updated)"
2. Click "Update"

**Expected**:

- [ ] Dialog closes
- [ ] Name updates in list immediately
- [ ] Other fields unchanged

**Status**: [ ] Pass / [ ] Fail

---

### 3. Update Balance

**Steps**:

1. Edit same account
2. Change balance to 7500.25
3. Submit

**Expected**:

- [ ] Balance updates to ₱7,500.25
- [ ] No errors
- [ ] Formats correctly with comma separator

**Status**: [ ] Pass / [ ] Fail

---

## Archive Account Flow

### 1. Archive Confirmation

**Steps**:

1. Click Archive button on "Test Checking (Updated)"

**Expected**:

- [ ] Browser confirm dialog appears
- [ ] Message includes account name

**Status**: [ ] Pass / [ ] Fail

---

### 2. Archive Executes

**Steps**:

1. Click OK in confirm dialog

**Expected**:

- [ ] Account disappears from list
- [ ] No errors in console
- [ ] Other accounts still visible

**Status**: [ ] Pass / [ ] Fail

---

### 3. Archived Account in Database

Check Supabase Dashboard → Table Editor → `accounts`:

**Expected**:

- [ ] Archived account row still exists
- [ ] `is_active` = false
- [ ] Other data intact (name, balance, etc.)

**Status**: [ ] Pass / [ ] Fail

---

## Currency Formatting Checks

### 1. Whole Numbers Format Correctly

Create account with balance: 1000

**Expected**: Displays as ₱1,000.00

**Status**: [ ] Pass / [ ] Fail

---

### 2. Decimals Format Correctly

Create account with balance: 1234.56

**Expected**: Displays as ₱1,234.56

**Status**: [ ] Pass / [ ] Fail

---

### 3. Large Numbers Format Correctly

Create account with balance: 999999.99

**Expected**: Displays as ₱999,999.99

**Status**: [ ] Pass / [ ] Fail

---

### 4. Zero Balance Formats Correctly

Create account with balance: 0

**Expected**: Displays as ₱0.00

**Status**: [ ] Pass / [ ] Fail

---

## TanStack Query Integration Checks

### 1. Loading State Shows

**Steps**:

1. Refresh /accounts page
2. Observe briefly during data fetch

**Expected**:

- [ ] Shows loading spinner
- [ ] Shows "Loading accounts..." text
- [ ] Then transitions to account list

**Status**: [ ] Pass / [ ] Fail

---

### 2. Cache Invalidation Works

**Steps**:

1. Note account count
2. Open Supabase Dashboard → Table Editor → `accounts`
3. Manually add account via SQL:
   ```sql
   INSERT INTO accounts (name, type, initial_balance_cents, visibility)
   VALUES ('Manual Test', 'cash', 10000, 'household');
   ```
4. Refresh /accounts page

**Expected**:

- [ ] New account appears in list
- [ ] Query refetched from server

**Status**: [ ] Pass / [ ] Fail

---

### 3. Mutations Update Cache

**Steps**:

1. Create new account via UI
2. Don't refresh page
3. Check if account immediately appears

**Expected**:

- [ ] Account appears without page refresh
- [ ] Cache invalidated automatically
- [ ] List updates instantly

**Status**: [ ] Pass / [ ] Fail

---

## RLS Policy Checks

### 1. Household Accounts Visible

**Expected**:

- [ ] All household accounts visible to logged-in user
- [ ] No permission errors

**Status**: [ ] Pass / [ ] Fail

---

### 2. Personal Accounts Protected

**Steps**:

1. Create personal account
2. Check Supabase Dashboard (another user context)

**Expected**:

- [ ] Personal account has owner_user_id = your user ID
- [ ] RLS would hide it from other users (can't test in single-user mode)

**Status**: [ ] Pass / [ ] Fail

---

## Visual/UX Checks

### 1. Responsive Layout

**Steps**:

1. Resize browser window
2. Try narrow (mobile), medium (tablet), wide (desktop)

**Expected**:

- [ ] Account cards reflow (1 col → 2 col → 3 col)
- [ ] No horizontal scroll
- [ ] Form dialog responsive

**Status**: [ ] Pass / [ ] Fail

---

### 2. Color Indicators Visible

**Expected**:

- [ ] Each account has colored left border
- [ ] Colors match what was selected
- [ ] Easy to distinguish accounts

**Status**: [ ] Pass / [ ] Fail

---

### 3. Empty State Shows

**Steps**:

1. Archive all accounts
2. Check accounts page

**Expected**:

- [ ] Shows "No accounts yet" message
- [ ] Shows "Create your first account" button
- [ ] Button opens form

**Status**: [ ] Pass / [ ] Fail

---

## Error Handling Checks

### 1. Duplicate Name Error

**Steps**:

1. Try to create account with existing name (e.g., "BPI Savings")

**Expected**:

- [ ] Error caught and displayed
- [ ] User-friendly message
- [ ] Form stays open for correction

**Status**: [ ] Pass / [ ] Fail

---

### 2. Invalid Balance Error

**Steps**:

1. Try to enter invalid balance: "abc" or "-500"

**Expected**:

- [ ] Form validation catches it
- [ ] Shows error message
- [ ] Can't submit

**Status**: [ ] Pass / [ ] Fail

---

### 3. Network Error Handling

**Steps**:

1. Turn off internet or Supabase
2. Try to create account

**Expected**:

- [ ] Error caught gracefully
- [ ] Shows error message
- [ ] Doesn't crash app

**Status**: [ ] Pass / [ ] Fail

---

## Pass Criteria

All checks above must pass:

- ✅ Currency utilities work correctly
- ✅ Can navigate to /accounts
- ✅ Seed accounts display
- ✅ Can create household and personal accounts
- ✅ Can edit account details
- ✅ Can archive accounts
- ✅ Currency formats correctly (₱ symbol, commas)
- ✅ TanStack Query caching works
- ✅ RLS policies protect data
- ✅ Responsive layout
- ✅ Error handling works

---

## If Any Check Fails

1. Check `troubleshooting.md` for that specific issue
2. Review `instructions.md` step-by-step
3. Check browser console for errors
4. Verify Supabase RLS policies active
5. Check TanStack Query devtools

---

## When All Checks Pass

1. Update `progress-tracker.md`:
   - Mark chunk 005 as complete `[x]`
   - Update time invested

2. Commit your work:

```bash
git add .
git commit -m "feat: complete chunk 005-accounts-ui

- Add currency utilities (formatPHP, parsePHP)
- Create TanStack Query hooks for accounts
- Build account list view with cards
- Add create/edit account form
- Implement archive (soft delete)
- Add PHP currency formatting throughout"
```

3. Celebrate! 🎉
   - You have a working feature!
   - Users can manage accounts end-to-end
   - This is your first complete CRUD flow

4. Move to next chunk:
   - `chunks/006-currency-system/` (if needed)
   - OR skip to `chunks/007-transactions/`

---

**Checkpoint Status**: **\_\_** (Pass / Fail / In Progress)
**Time Taken**: **\_\_** minutes
**Issues Encountered**: **\_\_**
**Notes**: **\_\_**
