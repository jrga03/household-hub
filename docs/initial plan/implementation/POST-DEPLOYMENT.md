# Post-Deployment Verification

> **Purpose**: Comprehensive production validation after deployment. Ensures the application is production-ready and establishes operational excellence. This living document will be expanded as chunks 038-046 add Phase B features.

**Last Updated**: 2025-10-29 (Created)
**Status**: ✅ Phase A Validation Ready | ⏳ Phase B Validation Pending

---

## Quick Status Dashboard

| Validation Category    | Phase A Status | Phase B Status | Time Required |
| ---------------------- | -------------- | -------------- | ------------- |
| Immediate Verification | ✅ Ready       | N/A            | 15 min        |
| Functionality Tests    | ✅ Ready       | N/A            | 30 min        |
| Performance Validation | ✅ Ready       | ⏳ Enhanced    | 15 min        |
| Security Verification  | ✅ Ready       | N/A            | 20 min        |
| Data Integrity         | ✅ Ready       | N/A            | 10 min        |
| Monitoring Setup       | ✅ Basic       | ⏳ Enhanced    | 10 min        |
| R2 Backup Verification | ⏳ TODO        | ⏳ Pending     | Chunk 038-040 |
| PWA Installation Test  | ⏳ TODO        | ⏳ Pending     | Chunk 041-042 |
| Push Notification Test | ⏳ TODO        | ⏳ Pending     | Chunk 043     |
| E2E Test Results       | ⏳ TODO        | ⏳ Pending     | Chunk 045     |

**Total Time (Phase A)**: ~100 minutes
**Total Time (Phase B)**: +30 minutes

---

## Table of Contents

1. [Immediate Verification (First 15 minutes)](#1-immediate-verification-first-15-minutes)
2. [Functionality Checklist (30 minutes)](#2-functionality-checklist-30-minutes)
3. [Performance Validation](#3-performance-validation-15-minutes)
4. [Security Verification](#4-security-verification-20-minutes)
5. [Data Integrity Checks](#5-data-integrity-checks-10-minutes)
6. [Monitoring Activation](#6-monitoring-activation-10-minutes)
7. [User Acceptance Criteria](#7-user-acceptance-criteria)
8. [Incident Response Setup](#8-incident-response-setup)
9. [Maintenance Procedures](#9-maintenance-procedures)
10. [Phase B Validation (Chunks 038-046)](#10-phase-b-validation-chunks-038-046)
11. [Post-Mortem Template](#11-post-mortem-template)

---

## 1. Immediate Verification (First 15 minutes)

⏱️ **Timeline**: Within 15 minutes of deployment going live

### 1.1 Uptime Check

```bash
# Set production URL
PROD_URL="https://household-hub.pages.dev"

# Test homepage
curl -I $PROD_URL
# Expected: HTTP/2 200

# Check response time
time curl -o /dev/null -s -w "%{http_code}\n" $PROD_URL
# Expected: <2 seconds, status 200
```

**Success Criteria**:

- [ ] HTTP status: 200
- [ ] Response time: <2s
- [ ] No 5xx errors
- [ ] SSL certificate valid

**If fails**: Initiate rollback immediately (see DEPLOYMENT.md § Rollback Procedures)

---

### 1.2 Error Rate Monitoring

**Sentry Dashboard** (if configured):

1. Go to [sentry.io](https://sentry.io) → household-hub project
2. Check **Issues** page
3. Filter: Last 15 minutes

**Acceptance Criteria**:

- [ ] Error rate: <1% of requests
- [ ] No P0 (critical) errors
- [ ] No database connection failures
- [ ] No auth service outages

**Cloudflare Analytics**:

1. Navigate to Cloudflare Dashboard → Workers & Pages → household-hub
2. Click **Analytics** tab
3. Check **Requests** graph (last hour)

**Acceptance Criteria**:

- [ ] 5xx errors: <0.5%
- [ ] 4xx errors: <5% (some 401/403 expected from auth)

**If error rate >5%**: Investigate immediately, consider rollback

---

### 1.3 Core API Endpoints

Test critical backend services:

```bash
# Supabase health
curl https://[project-ref].supabase.co/rest/v1/ \
  -H "apikey: $SUPABASE_ANON_KEY"
# Expected: 200 with OpenAPI spec

# Auth service
curl https://[project-ref].supabase.co/auth/v1/health
# Expected: {"status": "ok"}

# Database connectivity (via simple query)
curl "https://[project-ref].supabase.co/rest/v1/profiles?select=count" \
  -H "apikey: $SUPABASE_ANON_KEY"
# Expected: [{"count": N}]
```

**Success Criteria**:

- [ ] All endpoints return 200
- [ ] Response times <500ms
- [ ] No authentication errors

---

### 1.4 Frontend Asset Loading

**Browser Test**:

1. Open `$PROD_URL` in browser
2. Open DevTools → Network tab
3. Hard refresh (Cmd+Shift+R / Ctrl+Shift+F5)

**Check**:

- [ ] All assets load successfully (no 404s)
- [ ] JavaScript bundle loads (<3s)
- [ ] CSS loads correctly (no FOUC)
- [ ] Fonts load correctly (no fallback fonts)
- [ ] Favicon displays

**Console Check**:

- [ ] No errors in console
- [ ] No warnings about missing assets
- [ ] TanStack Router initializes

**If asset loading fails**: Check Cloudflare Pages build output

---

### 1.5 Database Connectivity

**Verify RLS is active** (critical for security):

```sql
-- Run in Supabase SQL Editor
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Expected: ALL tables have rowsecurity = true
```

**Test read access** (logged in as test user):

```bash
# In browser console (after logging in):
const { data, error } = await supabase
  .from('transactions')
  .select('*')
  .limit(1);

console.log(error ? 'ERROR' : 'SUCCESS');
// Expected: SUCCESS (or empty array if no data yet)
```

**Success Criteria**:

- [ ] RLS enabled on all tables
- [ ] Authenticated queries work
- [ ] Unauthenticated queries blocked (401)

---

## 2. Functionality Checklist (30 minutes)

### 2.1 Authentication Flow

#### Sign Up Flow

- [ ] Navigate to `/signup`
- [ ] Fill form with valid email + password (min 8 chars)
- [ ] Submit form
- [ ] **Expected**: Success message "Check your email for confirmation"
- [ ] Check email inbox
- [ ] **Expected**: Confirmation email received within 2 minutes
- [ ] Click confirmation link in email
- [ ] **Expected**: Redirect to app, user logged in
- [ ] Check Supabase Dashboard → Authentication → Users
- [ ] **Expected**: New user appears in list

**If fails**: Check Supabase auth logs, verify email template configured

---

#### Sign In Flow

- [ ] Sign out (if logged in from signup)
- [ ] Navigate to `/login`
- [ ] Enter valid credentials
- [ ] Submit form
- [ ] **Expected**: Redirect to `/dashboard`
- [ ] Verify auth token in Local Storage
- [ ] **Expected**: `sb-[project-ref]-auth-token` key exists

**If fails**: Check browser console for auth errors

---

#### Protected Routes

- [ ] Sign out
- [ ] Attempt to navigate to `/dashboard` directly
- [ ] **Expected**: Redirect to `/login`
- [ ] Attempt to access `/transactions`
- [ ] **Expected**: Redirect to `/login`
- [ ] Sign in
- [ ] **Expected**: Can now access protected routes

**Success Criteria**: All protected routes require authentication

---

#### Password Reset Flow

- [ ] Navigate to `/login`
- [ ] Click "Forgot password?" link
- [ ] Enter email
- [ ] Submit
- [ ] **Expected**: "Check your email" message
- [ ] Check email
- [ ] **Expected**: Password reset email received
- [ ] Click reset link
- [ ] Enter new password
- [ ] **Expected**: "Password updated" message
- [ ] Try logging in with new password
- [ ] **Expected**: Login successful

---

### 2.2 Core CRUD Operations

#### Accounts

1. **Create Account**:
   - [ ] Navigate to `/accounts`
   - [ ] Click "Add Account" button
   - [ ] Fill form:
     - Name: "Test Checking"
     - Type: Bank
     - Initial Balance: ₱10,000.00
     - Scope: Household
   - [ ] Submit
   - [ ] **Expected**: Account appears in list
   - [ ] **Expected**: Balance shows ₱10,000.00

2. **Edit Account**:
   - [ ] Click account card
   - [ ] Click "Edit" button
   - [ ] Change name to "Primary Checking"
   - [ ] Submit
   - [ ] **Expected**: Name updates in list

3. **Archive Account**:
   - [ ] Click "Archive" button
   - [ ] Confirm in dialog
   - [ ] **Expected**: Account no longer visible in list
   - [ ] Check database: `is_active = false`

---

#### Categories

- [ ] Navigate to `/categories`
- [ ] Verify default categories loaded (8 parents, 67 children expected)
- [ ] Click "Add Category" button
- [ ] Create child category:
  - Name: "Test Groceries"
  - Parent: Food & Dining
  - Icon: ShoppingCart
  - Color: Green
- [ ] Submit
- [ ] **Expected**: Category appears under parent in hierarchy

---

#### Transactions

1. **Create Income Transaction**:
   - [ ] Navigate to `/transactions`
   - [ ] Click "Add Transaction"
   - [ ] Fill form:
     - Type: Income
     - Amount: ₱5,000.00
     - Account: Test Checking
     - Category: Salary
     - Date: Today
     - Status: Cleared
   - [ ] Submit
   - [ ] **Expected**: Transaction appears in list
   - [ ] **Expected**: Account balance increases to ₱15,000.00

2. **Create Expense Transaction**:
   - [ ] Click "Add Transaction"
   - [ ] Fill form:
     - Type: Expense
     - Amount: ₱250.00
     - Account: Test Checking
     - Category: Groceries
     - Date: Today
     - Status: Pending
   - [ ] Submit
   - [ ] **Expected**: Transaction appears in list
   - [ ] Check account detail page
   - [ ] **Expected**:
     - Cleared balance: ₱15,000.00 (unchanged)
     - Pending balance: ₱14,750.00 (includes pending expense)

3. **Edit Transaction**:
   - [ ] Click transaction
   - [ ] Change amount to ₱300.00
   - [ ] Submit
   - [ ] **Expected**: Transaction updates
   - [ ] **Expected**: Account pending balance adjusts to ₱14,700.00

4. **Toggle Transaction Status**:
   - [ ] Click status toggle (Pending → Cleared)
   - [ ] **Expected**: Status updates immediately
   - [ ] **Expected**: Cleared balance now reflects this transaction

5. **Delete Transaction**:
   - [ ] Click "Delete" button
   - [ ] Confirm in dialog
   - [ ] **Expected**: Transaction removed from list
   - [ ] **Expected**: Account balance adjusts back

---

#### Budgets (Optional Feature)

- [ ] Navigate to `/budgets`
- [ ] Click "Add Budget"
- [ ] Select month: Current month
- [ ] Select category: Groceries
- [ ] Set target: ₱8,000.00
- [ ] Submit
- [ ] **Expected**: Budget appears with 0% progress (no spending yet)
- [ ] Create expense transaction in Groceries category: ₱1,000.00
- [ ] Refresh budgets page
- [ ] **Expected**: Progress updates to 12.5% (₱1,000 / ₱8,000)
- [ ] **Expected**: Progress bar color: Green (<80%)

---

#### Transfers (Optional Feature)

- [ ] Navigate to `/transfers`
- [ ] Verify need 2+ accounts (create second account if needed)
- [ ] Click "Create Transfer"
- [ ] Fill form:
  - From: Test Checking
  - To: Savings
  - Amount: ₱2,000.00
  - Date: Today
- [ ] Submit
- [ ] **Expected**: Transfer appears in list showing From → To
- [ ] Navigate to `/transactions`
- [ ] **Expected**: Two transactions created with same transfer_group_id
- [ ] Check account balances:
  - Test Checking: Decreased by ₱2,000
  - Savings: Increased by ₱2,000

**Critical Test**: Transfer Exclusion

- [ ] Navigate to `/budgets` or `/analytics/categories`
- [ ] **Expected**: Transfer transactions NOT counted in spending totals
- [ ] Navigate to `/accounts/[account-id]`
- [ ] **Expected**: Transfer transactions ARE included in balance calculation

---

### 2.3 Filtering & Search

#### Transaction Filters

- [ ] Navigate to `/transactions`
- [ ] Test **Date Range** filter:
  - Set: Last 7 days
  - **Expected**: Only transactions from past week shown
- [ ] Test **Account** filter:
  - Select specific account
  - **Expected**: Only transactions from that account shown
- [ ] Test **Category** filter:
  - Select Groceries
  - **Expected**: Only Groceries transactions shown
- [ ] Test **Type** filter:
  - Select Expense
  - **Expected**: Only expense transactions shown
- [ ] Test **Status** filter:
  - Select Pending
  - **Expected**: Only pending transactions shown
- [ ] Test **Search** (if implemented):
  - Type "test"
  - **Expected**: Debounced search (300ms delay)
  - **Expected**: Transactions matching description shown
- [ ] Test **Clear Filters**:
  - Click "Clear Filters"
  - **Expected**: All filters reset, all transactions shown

#### URL State Persistence

- [ ] Set filters (date + account + category)
- [ ] Copy URL from address bar
- [ ] Open URL in new tab
- [ ] **Expected**: Filters are preserved (bookmarkable!)

---

### 2.4 Offline Functionality

#### Offline Mode

1. **Create Transaction Offline**:
   - [ ] Open DevTools → Network tab
   - [ ] Enable "Offline" mode
   - [ ] Navigate to `/transactions`
   - [ ] Click "Add Transaction"
   - [ ] Fill form with valid data
   - [ ] Submit
   - [ ] **Expected**: Success toast "Transaction saved"
   - [ ] **Expected**: Sync indicator shows "Offline" status
   - [ ] **Expected**: Transaction appears in list (from IndexedDB)

2. **Verify Sync Queue**:
   - [ ] Open browser DevTools → Application → IndexedDB
   - [ ] Expand `householdDB` → `syncQueue`
   - [ ] **Expected**: Entry with `status: "queued"`

3. **Sync When Online**:
   - [ ] Disable "Offline" mode in DevTools
   - [ ] Wait ~5 seconds (auto-sync trigger)
   - [ ] **Expected**: Sync indicator shows "Syncing..." then "Synced"
   - [ ] Check IndexedDB syncQueue
   - [ ] **Expected**: Status changed to "completed"
   - [ ] Verify transaction in Supabase Dashboard
   - [ ] **Expected**: Transaction exists with server-generated UUID

4. **Temp ID Replacement**:
   - [ ] Note transaction ID in list (was temp-xxx, now UUID)
   - [ ] **Expected**: Temp ID replaced with server UUID seamlessly

---

#### Offline Indicator

- [ ] Enable offline mode
- [ ] **Expected**: Yellow banner appears: "You're offline. Changes will sync when online."
- [ ] Click "Retry" button (should do nothing while offline)
- [ ] Disable offline mode
- [ ] **Expected**: Banner disappears
- [ ] **Expected**: Auto-sync triggers

---

### 2.5 CSV Export/Import

#### CSV Export

- [ ] Navigate to `/settings`
- [ ] Click "Export Transactions" button
- [ ] **Expected**: CSV file downloads within 2 seconds
- [ ] Open CSV in Excel/Numbers
- [ ] **Expected**: Verify structure:
  - 10 columns (id, date, amount, type, account_id, account_name, category_id, category_name, description, status)
  - Amounts as plain decimals (e.g., 1500.50 NOT ₱1,500.50)
  - UTF-8 BOM present (Excel compatibility)
  - Date format: YYYY-MM-DD
  - No HTML/formulas (CSV injection prevention)

#### CSV Import

- [ ] Navigate to `/settings`
- [ ] Click "Import Transactions"
- [ ] Upload previously exported CSV
- [ ] **Expected**: Preview shows transactions
- [ ] **Expected**: Deduplication detection (if re-importing same data)
- [ ] Select action: Skip duplicates
- [ ] Click "Import"
- [ ] **Expected**: Success toast with count "X transactions imported"
- [ ] Navigate to `/transactions`
- [ ] **Expected**: Imported transactions visible (no duplicates)

---

## 3. Performance Validation (15 minutes)

### 3.1 Lighthouse Production Audit

```bash
# Run Lighthouse on production URL
npx lighthouse https://household-hub.pages.dev \
  --output html \
  --output-path ./lighthouse-prod-report.html \
  --view

# Or use Chrome DevTools:
# 1. Open DevTools
# 2. Lighthouse tab
# 3. Generate report
```

**Target Metrics** (from PRE-DEPLOYMENT.md):

- [ ] **Performance**: ≥85 (≥90 ideal)
- [ ] **Accessibility**: ≥95
- [ ] **Best Practices**: ≥90
- [ ] **SEO**: ≥90

**Core Web Vitals**:

- [ ] **LCP** (Largest Contentful Paint): <2.5s
- [ ] **FID** (First Input Delay): <100ms
- [ ] **CLS** (Cumulative Layout Shift): <0.1

**Additional Metrics**:

- [ ] **FCP** (First Contentful Paint): <1.5s
- [ ] **TTI** (Time to Interactive): <3.5s
- [ ] **TBT** (Total Blocking Time): <200ms

**Acceptance Criteria**:

- Performance ≥85 (acceptable for MVP with real data)
- Accessibility ≥95 (critical - no exceptions)
- No blocking issues

**If Performance <80%**: Investigate with Chrome DevTools Performance tab, check bundle size

---

### 3.2 Page Load Performance

**Test with real data** (10+ transactions, 3+ accounts):

```bash
# Measure page load times (via browser DevTools)
# Network tab → Disable cache → Hard refresh

# Metrics to capture:
# - Document load: <2s
# - DOMContentLoaded: <1s
# - Total page weight: <500KB initial load
```

**Critical Pages to Test**:

1. **Landing Page** (`/`)
   - [ ] Load time: <1.5s
   - [ ] No layout shift
   - [ ] Hero section visible immediately

2. **Dashboard** (`/dashboard`)
   - [ ] Load time: <2s
   - [ ] Summary cards render quickly
   - [ ] Charts load within 3s

3. **Transaction List** (`/transactions`)
   - [ ] Initial 20 transactions: <1s
   - [ ] Virtual scrolling smooth (10k+ transactions)
   - [ ] Filter changes: <300ms

4. **Account Detail** (`/accounts/:id`)
   - [ ] Balance calculation: Instant
   - [ ] Transaction list: <1s

---

### 3.3 Database Query Performance

**Monitor slow queries** in Supabase Dashboard:

1. Go to **Database → Query Performance**
2. Sort by **Duration** (descending)
3. Check for queries >1000ms

**Common slow queries to optimize**:

- Transaction list without date filter (add date filter UI)
- Category totals without indexes (indexes should be present from migrations)
- Account balances without index (idx_transactions_account_date)

**Verification SQL**:

```sql
-- Check query plan for critical query
EXPLAIN ANALYZE
SELECT *
FROM transactions
WHERE account_id = 'uuid-here'
  AND date >= '2025-01-01'
  AND date <= '2025-01-31'
ORDER BY date DESC;

-- Expected: Uses idx_transactions_account_date (Index Scan)
-- Should NOT show Seq Scan
```

**Acceptance Criteria**:

- [ ] No queries >500ms in normal operation
- [ ] All critical queries use indexes (EXPLAIN ANALYZE shows "Index Scan")

---

### 3.4 Client-Side Performance

**JavaScript Bundle Size**:

```bash
# Check bundle sizes from build
ls -lh dist/assets/*.js

# Expected (gzipped equivalent):
# - vendor-react.*.js: ~60KB
# - vendor-router.*.js: ~40KB
# - vendor-query.*.js: ~35KB
# - index.*.js: ~50KB
# Total: ~185KB (within 200KB budget)
```

**Runtime Performance**:

- [ ] Open DevTools → Performance tab
- [ ] Record interaction (e.g., navigate pages, filter transactions)
- [ ] Check for:
  - Long tasks >50ms (should be minimal)
  - Memory leaks (heap size should stabilize)
  - Excessive re-renders (React DevTools Profiler)

---

## 4. Security Verification (20 minutes)

### 4.1 Authentication Security

#### JWT Token Handling

- [ ] Sign in
- [ ] Open DevTools → Application → Local Storage
- [ ] Verify `sb-[project-ref]-auth-token` key exists
- [ ] Copy token value
- [ ] Decode JWT at [jwt.io](https://jwt.io)
- [ ] Verify claims:
  - `sub`: User UUID
  - `email`: User email
  - `role`: "authenticated"
  - `exp`: Expiration timestamp (default 1 hour)
- [ ] **Expected**: No sensitive data in payload (household_id OK, passwords NOT OK)

#### Session Expiration

- [ ] Sign in
- [ ] Wait for token expiration (or manually delete token)
- [ ] Try accessing protected route
- [ ] **Expected**: Redirect to login
- [ ] Sign in again
- [ ] **Expected**: Redirected back to original route

---

### 4.2 Row-Level Security Validation

#### Test with Multiple Users

1. **Create Test Users**:
   - User A: `testa@example.com` (household_id = 1)
   - User B: `testb@example.com` (household_id = 2)

2. **Test Data Isolation**:
   - [ ] Log in as User A
   - [ ] Create transaction (note ID)
   - [ ] Log out
   - [ ] Log in as User B
   - [ ] Navigate to `/transactions`
   - [ ] **Expected**: User A's transaction NOT visible
   - [ ] Try direct API call to fetch User A's transaction:
     ```bash
     curl "https://[project-ref].supabase.co/rest/v1/transactions?id=eq.[user-a-transaction-id]" \
       -H "apikey: $SUPABASE_ANON_KEY" \
       -H "Authorization: Bearer [user-b-token]"
     # Expected: [] (empty array, RLS blocked access)
     ```

3. **Test Personal Account Scoping**:
   - [ ] As User A, create personal account (scope: personal, owner: User A)
   - [ ] As User B, navigate to `/accounts`
   - [ ] **Expected**: User A's personal account NOT visible
   - [ ] As User A, navigate to `/accounts`
   - [ ] **Expected**: User A's personal account IS visible

**Success Criteria**: RLS prevents cross-household data access

---

### 4.3 Secrets & Credentials

#### Client-Side Security

- [ ] Open DevTools → Sources
- [ ] Search for `service_role` in all files
- [ ] **Expected**: 0 results (service role key should NEVER be in frontend)
- [ ] Search for `SERVICE_KEY`
- [ ] **Expected**: 0 results

**Console Security**:

- [ ] Open DevTools → Console
- [ ] Check for warnings about exposed secrets
- [ ] **Expected**: No security warnings

**Network Security**:

- [ ] Open DevTools → Network tab
- [ ] Filter: "supabase"
- [ ] Inspect request headers
- [ ] **Expected**: Only `apikey: [anon-key]` and `Authorization: Bearer [user-jwt]`
- [ ] **Expected**: NO service_role key in any request

---

### 4.4 HTTPS & Headers

**SSL Certificate**:

```bash
# Check SSL certificate
curl -vI https://household-hub.pages.dev 2>&1 | grep -A 10 "SSL certificate"

# Expected: Valid certificate issued by Cloudflare
```

**Security Headers**:

```bash
curl -I https://household-hub.pages.dev

# Verify presence of:
# - X-Frame-Options: DENY
# - X-Content-Type-Options: nosniff
# - Referrer-Policy: strict-origin-when-cross-origin
# - Strict-Transport-Security: max-age=... (HSTS)
```

**Acceptance Criteria**:

- [ ] HTTPS enforced (HTTP redirects to HTTPS)
- [ ] Security headers present
- [ ] No mixed content warnings

---

### 4.5 Input Validation & XSS Prevention

#### Test SQL Injection Protection

- [ ] Create transaction with description: `'; DROP TABLE transactions; --`
- [ ] Submit
- [ ] **Expected**: Saves as regular string (Supabase parameterized queries)
- [ ] Check database
- [ ] **Expected**: Tables intact

#### Test XSS Prevention

- [ ] Create transaction with description: `<script>alert('XSS')</script>`
- [ ] Submit
- [ ] Navigate to transaction list
- [ ] **Expected**: Script tag rendered as plain text (React escapes by default)
- [ ] **Expected**: No alert popup

#### Test CSV Injection Prevention

- [ ] Create transaction with description: `=1+1`
- [ ] Export to CSV
- [ ] Open in Excel
- [ ] **Expected**: String is escaped (prefixed with `'` to prevent formula execution)

**Success Criteria**: All injection attacks safely handled

---

## 5. Data Integrity Checks (10 minutes)

### 5.1 Account Balance Accuracy

**Test Scenario**: Verify balances calculate correctly

1. **Setup**:
   - [ ] Create account: "Test Account" with ₱0 initial balance
   - [ ] Create income: +₱10,000 (cleared)
   - [ ] Create expense: -₱2,500 (cleared)
   - [ ] Create expense: -₱1,000 (pending)

2. **Verify Balances**:
   - [ ] Navigate to `/accounts/[test-account-id]`
   - [ ] **Expected**:
     - Current Balance: ₱7,500 (includes cleared only)
     - Cleared: ₱7,500 (10,000 - 2,500)
     - Pending: ₱6,500 (7,500 - 1,000)

3. **Toggle Pending Status**:
   - [ ] Mark pending transaction as cleared
   - [ ] **Expected**: Current balance updates to ₱6,500

---

### 5.2 Transfer Integrity

**Test Scenario**: Verify transfer creates paired transactions

1. **Create Transfer**:
   - [ ] Navigate to `/transfers`
   - [ ] Create transfer: Checking → Savings, ₱5,000
   - [ ] **Expected**: Success toast

2. **Verify Database**:

   ```sql
   -- Run in Supabase SQL Editor
   SELECT id, type, amount_cents, account_id, transfer_group_id
   FROM transactions
   WHERE transfer_group_id IS NOT NULL
   ORDER BY transfer_group_id, type;

   -- Expected: 2 rows with same transfer_group_id
   -- Row 1: type=expense, amount=500000 (from Checking)
   -- Row 2: type=income, amount=500000 (to Savings)
   ```

3. **Verify Exclusion from Analytics**:
   - [ ] Navigate to `/budgets` or `/analytics/categories`
   - [ ] **Expected**: Transfer NOT counted in spending totals
   - [ ] Query test:
     ```sql
     SELECT SUM(amount_cents) as total_expenses
     FROM transactions
     WHERE type = 'expense'
       AND transfer_group_id IS NULL;  -- Excludes transfers
     ```

4. **Delete Transfer**:
   - [ ] Delete one half of transfer pair
   - [ ] **Expected**: Other half's `transfer_group_id` set to NULL (trigger handles unpair)

---

### 5.3 Budget Calculations

**Test Scenario**: Verify budget vs actual calculations

1. **Setup**:
   - [ ] Create budget: Groceries, ₱8,000 for current month
   - [ ] Create expense: Groceries, ₱2,000

2. **Verify Calculation**:
   - [ ] Navigate to `/budgets`
   - [ ] **Expected**:
     - Target: ₱8,000
     - Spent: ₱2,000
     - Remaining: ₱6,000
     - Progress: 25%
     - Color: Green (<80%)

3. **Add More Spending**:
   - [ ] Create expense: Groceries, ₱5,000 (total now ₱7,000)
   - [ ] Refresh budgets page
   - [ ] **Expected**:
     - Progress: 87.5%
     - Color: Yellow (80-100%)

4. **Exceed Budget**:
   - [ ] Create expense: Groceries, ₱2,000 (total now ₱9,000)
   - [ ] **Expected**:
     - Progress: 112.5%
     - Color: Red (>100%)

---

### 5.4 Sync Queue Integrity

**Test Scenario**: Verify offline changes sync correctly

1. **Create Offline Changes**:
   - [ ] Enable offline mode
   - [ ] Create 3 transactions
   - [ ] Edit 1 transaction
   - [ ] Delete 1 transaction
   - [ ] **Expected**: 5 events in sync queue (3 creates + 1 update + 1 delete)

2. **Verify Queue**:
   - [ ] Check IndexedDB `syncQueue` table
   - [ ] **Expected**: 5 entries with `status: "queued"`

3. **Sync**:
   - [ ] Disable offline mode
   - [ ] Wait for auto-sync
   - [ ] **Expected**: All 5 items process successfully
   - [ ] Check sync queue
   - [ ] **Expected**: All items have `status: "completed"`

4. **Verify Server**:
   - [ ] Check Supabase transactions table
   - [ ] **Expected**: Server state matches local state

---

## 6. Monitoring Activation (10 minutes)

### 6.1 Sentry Configuration (Optional)

**Verify Sentry is Active**:

- [ ] Check `src/main.tsx` or `src/lib/sentry.ts`
- [ ] Verify `Sentry.init()` called with correct DSN
- [ ] Trigger test error:
  ```javascript
  // In browser console
  throw new Error("Test Sentry integration - ignore this error");
  ```
- [ ] Go to [sentry.io](https://sentry.io) → Issues
- [ ] **Expected**: Error appears within 1 minute

**Configure Alerts**:

1. Go to Sentry → Alerts → Create Alert
2. Configure:
   - **Condition**: Error count > 10 in 5 minutes
   - **Action**: Email to [team@example.com]
3. Test alert by triggering multiple errors

---

### 6.2 Cloudflare Analytics

**Verify Analytics Active**:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **household-hub**
3. Click **Analytics** tab

**Metrics to Monitor**:

- [ ] **Requests**: Should show traffic from recent tests
- [ ] **Data Transfer**: Bandwidth usage visible
- [ ] **Status Codes**: Breakdown of 2xx/4xx/5xx
- [ ] **Geographic Distribution**: User locations

**Set Up Notifications** (optional):

1. Go to **Notifications** in Cloudflare Dashboard
2. Create notification for:
   - Error rate >5%
   - Traffic spike (200% above baseline)
   - Service degradation

---

### 6.3 Supabase Monitoring

**Verify Supabase Metrics**:

1. Go to Supabase Dashboard → **Reports**
2. Check:
   - **API Requests**: Should show activity
   - **Database Size**: Current usage (should be <10MB for fresh deployment)
   - **Bandwidth**: Data transfer

**Enable Real-Time Subscriptions**:

- [ ] Go to **Database** → **Replication**
- [ ] Verify tables have replication enabled:
  - transactions ✅
  - accounts ✅
  - categories ✅
  - budgets ✅

---

### 6.4 Health Check Endpoint (⏳ Future)

⏳ **TODO (Chunk 046)**: Implement `/api/health` endpoint

**Planned Implementation**:

```bash
# Will test:
curl https://household-hub.pages.dev/api/health

# Expected response:
{
  "status": "healthy",
  "checks": {
    "database": true,
    "storage": true,
    "cache": true
  },
  "timestamp": "2025-01-15T12:00:00Z"
}
```

---

## 7. User Acceptance Criteria

### 7.1 Core User Flows

**User Story 1: Track Daily Expenses**

- [ ] As a user, I can sign up and create an account
- [ ] I can add my bank account with current balance
- [ ] I can add expense transactions throughout the day
- [ ] I can see my updated balance immediately
- [ ] I can filter transactions by date/category
- [ ] All data is saved and persists across sessions

**User Story 2: Budget Tracking**

- [ ] As a user, I can set monthly budget targets per category
- [ ] I can see my current spending vs budget
- [ ] I get visual feedback (color-coded progress bars)
- [ ] I can see which categories I'm overspending in
- [ ] Budget progress updates in real-time as I add expenses

**User Story 3: Multi-Account Management**

- [ ] As a user, I can manage multiple accounts (checking, savings, credit cards)
- [ ] I can transfer money between accounts
- [ ] Each account shows accurate balance
- [ ] Transfers are excluded from expense totals
- [ ] I can archive old accounts

**User Story 4: Offline Usage**

- [ ] As a user, I can use the app without internet
- [ ] I can create transactions offline
- [ ] I see a clear indicator when offline
- [ ] My changes automatically sync when I'm back online
- [ ] No data is lost during offline usage

**User Story 5: Data Portability**

- [ ] As a user, I can export my data to CSV
- [ ] The exported data is readable in Excel
- [ ] I can re-import my data without duplicates
- [ ] Export includes all my transactions and accounts

---

### 7.2 Mobile Experience (⏳ PWA in Phase B)

⏳ **TODO (Chunk 041-042)**: PWA installation

**Planned Tests**:

- [ ] App is installable on iOS
- [ ] App is installable on Android
- [ ] Installed app works offline
- [ ] App shortcuts work (Add Transaction, View Budget)
- [ ] Share target works (receive images/PDFs for receipts)

---

## 8. Incident Response Setup

### 8.1 Runbook Location

**Document Location**:

- **Pre-Deployment Checklist**: [PRE-DEPLOYMENT.md](./PRE-DEPLOYMENT.md)
- **Deployment Playbook**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **This Document**: [POST-DEPLOYMENT.md](./POST-DEPLOYMENT.md)
- **Rollback Procedures**: [DEPLOYMENT.md § Rollback Procedures](./DEPLOYMENT.md#rollback-procedures)

**Critical Contact Info** (update these):

```yaml
# Save in secure location (e.g., team wiki, password manager)
Supabase Support: support@supabase.com
Cloudflare Support: support@cloudflare.com
Team Lead: [Name/Email]
On-Call Engineer: [Name/Phone]
```

---

### 8.2 Escalation Path

**Severity Levels**:

**P0 - Critical** (App completely down, data loss):

- **Response Time**: <15 minutes
- **Action**:
  1. Initiate rollback immediately (DEPLOYMENT.md)
  2. Notify team lead
  3. Create incident channel (#incident-YYYY-MM-DD)
  4. Post-mortem required

**P1 - High** (Major feature broken, affects all users):

- **Response Time**: <1 hour
- **Action**:
  1. Assess impact
  2. Deploy hotfix or rollback
  3. Notify users if downtime expected
  4. Post-mortem recommended

**P2 - Medium** (Minor feature broken, affects some users):

- **Response Time**: <4 hours
- **Action**:
  1. Create bug ticket
  2. Schedule fix for next deployment
  3. Monitor error rates

**P3 - Low** (Cosmetic issue, no functional impact):

- **Response Time**: <1 week
- **Action**:
  1. Add to backlog
  2. Fix in next sprint

---

### 8.3 Common Incident Scenarios

#### Scenario 1: App Won't Load (5xx Errors)

**Symptoms**: Users report blank page, 503 errors

**Diagnosis**:

1. Check Cloudflare Pages status
2. Check Supabase status: https://status.supabase.com
3. Check error logs in Sentry

**Response**:

```bash
# If Cloudflare issue: Rollback deployment
npx wrangler pages deployment rollback household-hub [deployment-id]

# If Supabase issue: Wait for service restoration, check status.supabase.com

# If code issue: Rollback to last working deployment
```

---

#### Scenario 2: Auth Not Working (Users Can't Log In)

**Symptoms**: Login fails with 401/403 errors

**Diagnosis**:

1. Check Supabase Auth service status
2. Verify anon key in environment variables
3. Check redirect URLs configured correctly

**Response**:

```bash
# Check auth service
curl https://[project-ref].supabase.co/auth/v1/health

# Verify environment variable
# In Cloudflare Dashboard → household-hub → Settings → Environment Variables
# Check VITE_SUPABASE_ANON_KEY matches Supabase dashboard

# If mismatch: Update and redeploy
```

---

#### Scenario 3: Data Not Syncing (Sync Queue Stuck)

**Symptoms**: Users report offline changes not syncing

**Diagnosis**:

1. Check Supabase database connection
2. Check RLS policies active
3. Inspect browser console for errors

**Response**:

1. Have user check sync status in app
2. If stuck, suggest manual retry (refresh page)
3. Check Supabase logs for RLS denials
4. If widespread: Check for migration issues

---

## 9. Maintenance Procedures

### 9.1 Regular Maintenance Tasks

**Daily** (automated):

- [ ] Monitor error rates (Sentry dashboard)
- [ ] Check server uptime (Cloudflare Analytics)
- [ ] Review sync queue failures (Supabase logs)

**Weekly** (manual):

- [ ] Review Supabase database size (should grow predictably)
- [ ] Check for slow queries (Database → Query Performance)
- [ ] Review user feedback (support tickets, issues)
- [ ] Update dependencies with security patches

**Monthly**:

- [ ] Full security audit (npm audit, Supabase RLS review)
- [ ] Performance baseline (Lighthouse audit)
- [ ] Backup restoration test (verify backups work)
- [ ] Review and prune old data (sync queue >7 days, events >90 days)

**Quarterly**:

- [ ] Major dependency updates (React, TypeScript, Supabase)
- [ ] Security penetration test
- [ ] Disaster recovery drill (full restore from backup)

---

### 9.2 Database Maintenance

**Event Compaction** (automated via chunk 035):

- Runs automatically when event count exceeds threshold
- Keeps last 10 events per entity
- Deletes events older than 90 days

**Sync Queue Cleanup** (automated):

- Runs daily via Cloudflare Worker cron
- Deletes completed items older than 7 days

**Manual Cleanup** (if needed):

```sql
-- Run in Supabase SQL Editor (as service role)

-- Clean old sync queue entries
DELETE FROM sync_queue
WHERE status = 'completed'
  AND updated_at < NOW() - INTERVAL '7 days';

-- Clean old events (beyond 90 days + keep last 10 per entity)
SELECT cleanup_old_events();
```

---

### 9.3 Backup Verification

⏳ **TODO (Chunk 038-040)**: R2 backup verification

**Planned Procedure**:

```bash
# List recent backups
wrangler r2 object list household-backups

# Download latest backup
wrangler r2 object get household-backups/backup-[date].json.br

# Verify backup integrity
# - File size reasonable
# - JSON structure valid
# - Encryption working (if encrypted)

# Test restoration (on staging)
npm run backup:restore -- --backup-id=[backup-id] --env=staging
```

---

## 10. Phase B Validation (Chunks 038-046)

### 10.1 R2 Backup Verification ⏳ (Chunks 038-040)

⏳ **TODO**: Complete after chunk 038-040 implementation

**Tests to Add**:

1. **Automated Backup**:
   - [ ] Verify daily backup job runs (check Cloudflare Worker logs)
   - [ ] Verify backup file created in R2 bucket
   - [ ] Verify backup is encrypted (AES-GCM)
   - [ ] Verify backup size is reasonable

2. **Manual Backup**:
   - [ ] Trigger manual backup via UI
   - [ ] Verify backup completes within 30 seconds
   - [ ] Verify backup appears in R2 bucket

3. **Backup Restoration**:
   - [ ] Download backup from R2
   - [ ] Decrypt backup successfully
   - [ ] Restore on staging environment
   - [ ] Verify data integrity (no corruption)

**Success Criteria**:

- Daily backups running without errors
- Backup restoration tested and working
- Backup encryption verified

---

### 10.2 PWA Installation Test ⏳ (Chunks 041-042)

⏳ **TODO**: Complete after chunk 041-042 implementation

**iOS Testing**:

1. [ ] Open app in Safari on iPhone
2. [ ] Tap Share button → Add to Home Screen
3. [ ] **Expected**: App icon added to home screen
4. [ ] Launch app from home screen
5. [ ] **Expected**: Opens in standalone mode (no browser UI)
6. [ ] Test offline mode
7. [ ] **Expected**: Service worker serves cached content

**Android Testing**:

1. [ ] Open app in Chrome on Android
2. [ ] Tap "Install" banner (or menu → Add to Home screen)
3. [ ] **Expected**: Install prompt appears
4. [ ] Accept installation
5. [ ] **Expected**: App icon added to app drawer
6. [ ] Launch installed app
7. [ ] **Expected**: Standalone mode with splash screen

**Desktop Testing**:

1. [ ] Open app in Chrome/Edge
2. [ ] Click install icon in address bar
3. [ ] Accept installation
4. [ ] **Expected**: Desktop PWA window opens
5. [ ] Test app shortcuts (right-click icon)
6. [ ] **Expected**: "Add Transaction" and "View Budget" shortcuts work

**Success Criteria**:

- App installable on iOS, Android, and desktop
- Standalone mode works correctly
- Offline functionality works in installed app

---

### 10.3 Service Worker Validation ⏳ (Chunk 042)

⏳ **TODO**: Complete after chunk 042 implementation

**Cache Strategy Tests**:

1. **Static Assets**:
   - [ ] Load app online
   - [ ] Go offline
   - [ ] Refresh page
   - [ ] **Expected**: App loads from cache (instant load)

2. **API Responses**:
   - [ ] Load transactions online
   - [ ] Go offline
   - [ ] Navigate to transactions page
   - [ ] **Expected**: Cached data displays (no network call)

3. **Background Sync**:
   - [ ] Create transaction offline
   - [ ] **Expected**: Queued for sync
   - [ ] Go online
   - [ ] **Expected**: Background sync triggers automatically

**Service Worker Debug**:

```bash
# In browser DevTools → Application → Service Workers
# Verify:
# - Status: "activated and running"
# - Cache Storage: Contains cached assets
# - Background Sync: Registered (if supported)
```

---

### 10.4 Push Notification Test ⏳ (Chunk 043)

⏳ **TODO**: Complete after chunk 043 implementation

**Subscription Flow**:

1. [ ] Navigate to Settings
2. [ ] Click "Enable Notifications"
3. [ ] **Expected**: Browser permission prompt appears
4. [ ] Accept permission
5. [ ] **Expected**: Success toast "Notifications enabled"
6. [ ] Verify subscription stored in database

**Send Test Notification**:

```bash
# Trigger test notification via API/Worker
curl -X POST https://push-worker.[subdomain].workers.dev/test \
  -H "Authorization: Bearer [user-jwt]" \
  -d '{"message": "Test notification from Household Hub"}'

# Expected: Notification appears on device
```

**Budget Alert Test**:

1. [ ] Create budget: Groceries, ₱1,000
2. [ ] Add expense: Groceries, ₱850 (85% of budget)
3. [ ] **Expected**: Notification: "You've spent 85% of your Groceries budget"
4. [ ] Add expense: Groceries, ₱200 (total 105%)
5. [ ] **Expected**: Notification: "You've exceeded your Groceries budget"

---

### 10.5 E2E Test Results ⏳ (Chunk 045)

⏳ **TODO**: Complete after chunk 045 implementation

**Playwright Test Suites**:

```bash
# Run E2E tests against production
npm run test:e2e -- --base-url https://household-hub.pages.dev

# Expected suites:
# 1. Authentication flows (signup, login, logout, password reset)
# 2. CRUD operations (accounts, transactions, budgets, transfers)
# 3. Offline mode (create offline, sync online)
# 4. Multi-device sync (two browsers, edit same data, conflict resolution)
# 5. Accessibility (axe-core audit on all pages)
```

**Success Criteria**:

- [ ] All E2E tests passing (100%)
- [ ] Accessibility tests passing (0 violations)
- [ ] Screenshots captured for visual regression

---

## 11. Post-Mortem Template

Use this template after significant deployments or incidents.

### Post-Mortem: [Deployment/Incident Name]

**Date**: YYYY-MM-DD
**Duration**: [Deployment time / Incident duration]
**Severity**: P0 / P1 / P2 / P3
**Impact**: [Number of users affected, features impacted]

---

#### What Happened

[Brief description of the deployment or incident]

---

#### Timeline

| Time  | Event                             |
| ----- | --------------------------------- |
| 10:00 | Deployment initiated              |
| 10:05 | First error reports               |
| 10:10 | Root cause identified             |
| 10:15 | Fix deployed / Rollback initiated |
| 10:20 | Service restored                  |

---

#### Root Cause

[Technical explanation of what went wrong]

---

#### What Went Well

- [Thing 1]
- [Thing 2]

---

#### What Didn't Go Well

- [Thing 1]
- [Thing 2]

---

#### Action Items

- [ ] [Action 1] - Owner: [Name] - Due: [Date]
- [ ] [Action 2] - Owner: [Name] - Due: [Date]

---

#### Lessons Learned

[Key takeaways for future deployments]

---

## Deployment Sign-Off

Once all validations are complete, sign off on deployment:

**Phase A Deployment Checklist**:

- [ ] All immediate verification checks passed (Section 1)
- [ ] All functionality tests passed (Section 2)
- [ ] Performance meets targets (Section 3)
- [ ] Security verified (Section 4)
- [ ] Data integrity confirmed (Section 5)
- [ ] Monitoring active (Section 6)
- [ ] User acceptance criteria met (Section 7)
- [ ] Incident response procedures documented (Section 8)
- [ ] Maintenance procedures established (Section 9)

**Sign-Off**:

- **Deployed By**: [Name]
- **Date**: YYYY-MM-DD
- **Version**: [v1.0.0 or commit SHA]
- **Approvals**:
  - Tech Lead: [Name] - [Date]
  - Product Owner: [Name] - [Date]

**Status**: ✅ **PRODUCTION READY - Phase A Complete**

---

## Next Steps

After successful Phase A deployment:

1. ✅ **Monitor for 24 hours**: Watch error rates, performance, user feedback
2. ➡️ **Communicate success**: Notify team and stakeholders
3. ➡️ **Plan Phase B**: Review chunks 038-046 for R2, PWA, push features
4. ➡️ **Gather feedback**: Set up user feedback mechanisms
5. ➡️ **Iterate**: Continue implementing Phase B features

**Phase B Upcoming Features**:

- Chunk 038-040: Automated R2 backups with encryption
- Chunk 041-042: PWA manifest and service worker
- Chunk 043: Push notifications for budget alerts
- Chunk 045: E2E test suite with Playwright
- Chunk 046: Enhanced monitoring and analytics

---

**Document Status**: Living document, will be updated as chunks 038-046 are completed.

**Last Updated**: 2025-10-29 (Created)
**Next Update**: After chunk 038 (R2 backup verification procedures)
