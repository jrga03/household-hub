# Milestone 2: MVP (Minimum Viable Product)

**Goal**: Working financial tracker with core CRUD operations
**Time**: 14 hours (20 hours cumulative from start)
**Status**: Deployable product at completion

## What You'll Have After This Milestone

✅ Full accounts CRUD (create, edit, delete, list)
✅ Two-level category hierarchy (parent → child)
✅ Transaction entry with proper PHP currency formatting
✅ Transaction list with filters (date range, account, category)
✅ Account balance calculations (running totals)
✅ Category spending totals (monthly aggregation)
✅ Dashboard with summary cards and basic charts
✅ Optional: Budget tracking and transfer management

**🎉 DEPLOYABLE AND USABLE AT THIS POINT!**

## Chunks in This Milestone

### Core Setup (Required) - 10.5 hours

#### 004: Accounts Schema (30 minutes)

**What**: Database table for bank/financial accounts
**Outcome**: Can store accounts with initial balances

#### 005: Accounts UI (1.5 hours)

**What**: CRUD interface for accounts with shadcn/ui
**Outcome**: Can create, edit, delete, list accounts

#### 006: Currency System (1 hour)

**What**: PHP formatting utilities (formatPHP, parsePHP, validateAmount)
**Outcome**: All money displays as ₱1,500.50 correctly

#### 007: Categories Setup (45 minutes)

**What**: Two-level category hierarchy schema + seed data
**Outcome**: Predefined categories for income/expense

#### 008: Transactions Schema (1 hour)

**What**: Main transactions table with indexes
**Outcome**: Can store transactions with proper constraints

#### 009: Transactions Form (2 hours)

**What**: Transaction entry form with validation
**Outcome**: Can create/edit transactions with proper UX

#### 010: Transactions List (1.5 hours)

**What**: List view with TanStack Table + Virtual scrolling
**Outcome**: Can view 10k+ transactions smoothly

### Analytics (Required for Useful App) - 3.5 hours

#### 011: Account Balances (1 hour)

**What**: Running balance calculations with cleared/pending split
**Outcome**: Each account shows current balance

#### 012: Category Totals (1 hour)

**What**: Monthly spending by category with hierarchy rollup
**Outcome**: See spending breakdown by category

#### 013: Basic Dashboard (1.5 hours)

**What**: Summary cards + basic charts (monthly trends)
**Outcome**: Landing page with financial overview

#### 014: Budgets Basic (1 hour)

**What**: Simple budget display (optional feature)
**Outcome**: Can see budget vs actual (if implemented)

### Optional Features (Can Skip or Defer) - 4 hours

#### 015: Budgets Schema (30 minutes)

**What**: Monthly budget targets table
**Outcome**: Can set spending targets per category

#### 016: Budgets UI (1.5 hours)

**What**: Budget management interface
**Outcome**: Can create and track budgets

#### 017: Transfers Schema (45 minutes)

**What**: Transfer representation with paired transactions
**Outcome**: Can link two transactions as a transfer

#### 018: Transfers UI (1 hour)

**What**: Transfer creation form with validation
**Outcome**: Can create account-to-account transfers

## Why This Order?

1. **Accounts first** - Transactions need accounts to belong to
2. **Currency utilities** - Needed before transaction display
3. **Categories** - Needed before transaction categorization
4. **Transactions schema** - Foundation for all analytics
5. **Transaction form** - Need to enter data
6. **Transaction list** - Need to view data
7. **Analytics last** - Requires transaction data

**Parallel opportunity**: After chunk 010, can do 011-014 in any order.

## Success Criteria

### Technical Checklist

- [ ] Accounts: Can create, edit, delete accounts
- [ ] Accounts: Initial balance set correctly
- [ ] Categories: Two-level hierarchy working
- [ ] Categories: Default categories seeded
- [ ] Transactions: Form validates all fields
- [ ] Transactions: Amount displays as ₱1,500.50 format
- [ ] Transactions: List handles 10k+ rows smoothly
- [ ] Transactions: Filters work (date, account, category, type)
- [ ] Balances: Account balances calculate correctly
- [ ] Balances: Cleared/pending split works
- [ ] Analytics: Category totals sum correctly
- [ ] Analytics: Monthly aggregation accurate
- [ ] Dashboard: Summary cards show correct data
- [ ] Dashboard: Charts render without errors

### Database Checklist

- [ ] `accounts` table with RLS policies
- [ ] `categories` table with parent-child relationships
- [ ] `transactions` table with all indexes
- [ ] Foreign key constraints working
- [ ] Check constraints prevent invalid data
- [ ] Triggers (if any) execute correctly

### Currency Checklist (CRITICAL)

- [ ] All amounts stored as BIGINT cents (never decimals)
- [ ] `formatPHP(150050)` returns "₱1,500.50"
- [ ] `parsePHP("1,500.50")` returns 150050
- [ ] `validateAmount()` prevents > ₱9,999,999.99
- [ ] All amounts display with ₱ symbol
- [ ] Thousand separators show correctly
- [ ] Input accepts both "1500" and "1,500.50"

### Transfer Integrity (If Implemented)

- [ ] Transfer creates exactly 2 transactions
- [ ] One expense, one income
- [ ] Same amount, different accounts
- [ ] Same `transfer_group_id`
- [ ] Deleting one orphans the other correctly

### Code Quality

- [ ] TypeScript compiles without errors
- [ ] ESLint shows no warnings
- [ ] Tests pass (if written)
- [ ] Forms use React Hook Form + Zod
- [ ] Lists use TanStack Table + Virtual
- [ ] Queries use TanStack Query
- [ ] Currency utilities have unit tests

## Common Issues & Solutions

### Issue: Currency displays as "1500.5" instead of "₱1,500.50"

**Symptom**: Missing peso symbol, no thousand separators, wrong decimals
**Solution**:

1. Check you're using `formatPHP()` not native `toFixed()`
2. Verify amount is in cents (150050) not pesos (1500.50)
3. Check currency utility tests pass

### Issue: Account balance is NULL or wrong

**Symptom**: Balance shows "₱0.00" or nothing
**Solution**:

1. Verify `initial_balance_cents` set on account
2. Check SUM query handles NULL (use COALESCE)
3. Ensure transaction types (income/expense) used correctly
4. **CRITICAL**: Verify transfers excluded with `WHERE transfer_group_id IS NULL` in analytics

### Issue: Transaction list is slow with 1000+ rows

**Symptom**: Page freezes, janky scrolling
**Solution**:

1. Verify using TanStack Virtual for virtualization
2. Check indexes exist: `idx_transactions_account_date`, `idx_transactions_category_date`
3. Limit initial query to last 3 months, load more on scroll

### Issue: Category totals don't sum correctly

**Symptom**: Parent category total doesn't match sum of children
**Solution**:

1. Check recursive query includes all children
2. Verify transaction amounts are positive (use `type` field)
3. **CRITICAL**: Exclude transfers with `WHERE transfer_group_id IS NULL`

### Issue: Form doesn't validate

**Symptom**: Can submit invalid data
**Solution**:

1. Check Zod schema matches database constraints
2. Verify React Hook Form integration
3. Test edge cases: negative amounts, future dates, missing fields

### Issue: "Permission denied" on database queries

**Symptom**: RLS blocks legitimate queries
**Solution**:

1. Check user is authenticated
2. Verify RLS policies allow operation
3. For household data: ensure policy allows all authenticated users
4. For personal data: ensure `owner_user_id` matches current user

## Time Breakdown

| Chunk      | Activity                         | Time   | Cumulative |
| ---------- | -------------------------------- | ------ | ---------- |
| 004        | Accounts schema migration        | 30min  | 0.5hr      |
| 005        | Accounts CRUD UI                 | 1.5hr  | 2hr        |
| 006        | Currency utilities + tests       | 1hr    | 3hr        |
| 007        | Categories schema + seed         | 45min  | 3.75hr     |
| 008        | Transactions schema + indexes    | 1hr    | 4.75hr     |
| 009        | Transaction form with validation | 2hr    | 6.75hr     |
| 010        | Transaction list + filters       | 1.5hr  | 8.25hr     |
| 011        | Account balance calculations     | 1hr    | 9.25hr     |
| 012        | Category totals aggregation      | 1hr    | 10.25hr    |
| 013        | Dashboard summary + charts       | 1.5hr  | 11.75hr    |
| 014        | Basic budget display             | 1hr    | 12.75hr    |
| **Buffer** | Troubleshooting, breaks, testing | 1.25hr | **14hr**   |

### Optional Features

| Chunk | Activity         | Time  | Notes                          |
| ----- | ---------------- | ----- | ------------------------------ |
| 015   | Budgets schema   | 30min | Skip if not tracking budgets   |
| 016   | Budgets UI       | 1.5hr | Requires 015                   |
| 017   | Transfers schema | 45min | Skip if not tracking transfers |
| 018   | Transfers UI     | 1hr   | Requires 017                   |

**Total with all optional features**: 18 hours

## What Comes Next?

After completing this milestone, you have several options:

### Option 1: Deploy Immediately

**Next**: Chunk 046-deployment (1.5hr)
**Outcome**: Live app accessible via URL
**Best for**: Getting feedback quickly

### Option 2: Add Offline Support

**Next**: Milestone 3 (chunks 019-025, 8hr)
**Outcome**: Works without internet
**Best for**: Users with unreliable connections

### Option 3: Polish Features

**Next**: Add chunks 015-018 (optional features)
**Outcome**: Budgets + transfers working
**Best for**: Feature completeness

### Option 4: Production Ready

**Next**: Milestone 5 (chunks 041-046, 7hr)
**Outcome**: PWA + tests + deployment
**Best for**: Professional deployment

## Verification Command

After completing all required chunks (004-014), run:

```bash
# 1. TypeScript compiles
npm run build

# 2. Tests pass
npm test

# 3. Dev server runs
npm run dev
```

Then manually verify:

### Accounts

1. Create new account (e.g., "BPI Savings", initial balance ₱5,000.00)
2. Edit account details
3. Delete test account
4. Verify list shows all accounts

### Transactions

1. Create income transaction (₱1,500.50)
2. Create expense transaction (₱250.00)
3. Verify list shows both
4. Filter by date range
5. Filter by account
6. Filter by category
7. Check amounts display as ₱1,500.50 format

### Analytics

1. Check account balance = initial balance + income - expenses
2. Verify category totals sum correctly
3. Check dashboard summary matches data
4. Verify charts render

### Edge Cases

1. Try entering amount > ₱9,999,999.99 (should reject)
2. Try creating transaction with future date (should warn or reject)
3. Check balance with 0 transactions (should show initial balance)
4. Verify negative amounts not allowed

## Performance Verification

Test with realistic data:

```bash
# Generate 1000 test transactions
# (You'll implement this in chunk 045 for E2E tests)

# Then verify:
# - List renders < 500ms
# - Scrolling is smooth (60fps)
# - Filtering responds < 200ms
# - Balance calculation < 100ms
```

Use browser DevTools Performance tab to profile.

## Database Verification

Check database state:

```sql
-- Verify tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('accounts', 'categories', 'transactions');

-- Check indexes
SELECT indexname FROM pg_indexes
WHERE tablename = 'transactions';

-- Verify RLS enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename IN ('accounts', 'categories', 'transactions');

-- Check data integrity
SELECT
  COUNT(*) as total_transactions,
  SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) as total_income,
  SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) as total_expense
FROM transactions
WHERE transfer_group_id IS NULL; -- Exclude transfers!
```

## References

- **Original Plan**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Days 1-7
- **Database Schema**: `docs/initial plan/DATABASE.md`
  - Currency spec: lines 1005-1160
  - Transfer exclusion: lines 476-536
  - Account balance query: lines 355-391
  - Category totals query: lines 397-437
- **Decisions**: `docs/initial plan/DECISIONS.md`
  - #12: Budget as reference (not balance)
  - #62: Event sourcing from Phase A
  - #64: Indexes not materialized views
  - #79: Budget no rollover
- **Architecture**: `docs/initial plan/ARCHITECTURE.md`
  - Three-layer state pattern
  - Offline-first considerations

## Key Architectural Points

### Currency Handling (CRITICAL)

**Why BIGINT cents**:

- Avoids floating-point precision errors
- JavaScript Number is safe for cents up to ₱90 trillion
- Database BIGINT handles full range
- See DATABASE.md lines 1070-1224 for complete rationale

**Three required utilities**:

```typescript
formatPHP(150050); // "₱1,500.50" - for display
parsePHP("1,500.50"); // 150050 - from user input
validateAmount(150050); // true - 0 to 999,999,999
```

### Transfer Exclusion (CRITICAL)

**Rule**: Always exclude transfers from analytics:

```sql
-- CORRECT
SELECT SUM(amount_cents)
FROM transactions
WHERE type = 'expense'
  AND transfer_group_id IS NULL; -- Exclude transfers!

-- WRONG (will double-count)
SELECT SUM(amount_cents)
FROM transactions
WHERE type = 'expense';
```

**Three contexts**:

1. **Analytics & Budgets**: Exclude transfers (avoid double-counting)
2. **Account Balances**: Include transfers (they affect balances)
3. **Transfer Reports**: Filter to transfers only (`WHERE transfer_group_id IS NOT NULL`)

See DATABASE.md lines 476-536.

### Date Handling

**Transaction date**: Stored as `DATE` type (not TIMESTAMPTZ)
**Rationale**: Financial transactions are date-based in user's context, avoids timezone complexity
**Audit timestamps**: Use `created_at`/`updated_at` as TIMESTAMPTZ for audit trail
See DATABASE.md lines 997-1068.

---

**Ready to start?** → `chunks/004-accounts-schema/README.md`

**Completed Milestone 1?** Verify first:

```
Check that 001-003 checkpoints all pass before starting Milestone 2
```
