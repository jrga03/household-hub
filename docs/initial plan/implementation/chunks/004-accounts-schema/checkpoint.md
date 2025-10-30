# Checkpoint: Accounts Schema

Run these checks to verify chunk 004 is complete.

## Pre-Flight Checks

### 1. Supabase CLI Installed

```bash
supabase --version
```

**Expected**: Shows version number (v1.x.x+)

**Status**: [ ] Pass / [ ] Fail

---

### 2. Project Linked

```bash
npx supabase projects list
```

**Expected**: Shows your project in the list

**Status**: [ ] Pass / [ ] Fail

---

## Migration Checks

### 1. Migration File Exists

```bash
ls supabase/migrations/*create_accounts.sql
```

**Expected**: File exists

**Status**: [ ] Pass / [ ] Fail

---

### 2. Migration Applied Remotely

```bash
npx supabase migration list
```

**Expected**: Shows `create_accounts` migration as applied (✓)

**Status**: [ ] Pass / [ ] Fail

---

### 3. No Migration Errors

Check Supabase Dashboard → **Database** → **Migrations**

**Expected**:

- [ ] All migrations show green checkmark
- [ ] No error messages
- [ ] Timestamp matches your migration file

**Status**: [ ] Pass / [ ] Fail

---

## Database Structure Checks

### 1. Table Exists

Supabase Dashboard → **Table Editor**

**Expected**:

- [ ] `accounts` table visible in sidebar
- [ ] Has 13+ columns (id, name, type, etc.)

**Status**: [ ] Pass / [ ] Fail

---

### 2. Columns Correct

Check these columns exist in `accounts` table:

- [ ] id (uuid, primary key)
- [ ] household_id (uuid)
- [ ] name (text)
- [ ] type (text)
- [ ] initial_balance_cents (bigint)
- [ ] currency_code (text)
- [ ] visibility (text)
- [ ] owner_user_id (uuid, nullable)
- [ ] color (text)
- [ ] icon (text)
- [ ] sort_order (int)
- [ ] is_active (boolean)
- [ ] created_at (timestamptz)
- [ ] updated_at (timestamptz)

**Status**: [ ] Pass / [ ] Fail

---

### 3. Constraints Applied

Supabase Dashboard → **Table Editor** → `accounts` → View table definition

**Expected constraints**:

- [ ] PRIMARY KEY on `id`
- [ ] CHECK constraint on `type` (bank, investment, credit_card, cash, e-wallet)
- [ ] CHECK constraint on `currency_code` (= 'PHP')
- [ ] CHECK constraint on `visibility` (household, personal)
- [ ] UNIQUE constraint on `(household_id, name)`
- [ ] FOREIGN KEY on `owner_user_id` → auth.users(id)

**Status**: [ ] Pass / [ ] Fail

---

### 4. Indexes Created

Supabase Dashboard → **Database** → **Indexes**

**Expected indexes** on `accounts`:

- [ ] idx_accounts_household (household_id)
- [ ] idx_accounts_active (is_active)
- [ ] idx_accounts_visibility (visibility)
- [ ] idx_accounts_owner (owner_user_id WHERE owner_user_id IS NOT NULL)

**Status**: [ ] Pass / [ ] Fail

---

## RLS Policy Checks

### 1. RLS Enabled

Supabase Dashboard → **Authentication** → **Policies**

**Expected**:

- [ ] `accounts` table shows in policies list
- [ ] RLS shows as "Enabled"

**Status**: [ ] Pass / [ ] Fail

---

### 2. Policies Exist

Check these policies exist for `accounts`:

- [ ] "accounts_select" (SELECT)
- [ ] "accounts_insert" (INSERT)
- [ ] "accounts_update" (UPDATE)
- [ ] "accounts_delete" (DELETE)

**Status**: [ ] Pass / [ ] Fail

---

### 3. RLS Policies Include Household Isolation

Supabase Dashboard → **Authentication** → **Policies** → View `accounts` policies

**Expected**:

- [ ] All policies check: `household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())`
- [ ] This prevents cross-household data access (critical security check)

**Status**: [ ] Pass / [ ] Fail

---

### 4. Foreign Key References Correct Table

Check the `owner_user_id` foreign key:

Supabase Dashboard → **Table Editor** → `accounts` → View table definition

**Expected**:

- [ ] `owner_user_id` references `profiles(id)` (NOT auth.users)

**Status**: [ ] Pass / [ ] Fail

---

### 5. RLS Works - Household Accounts Visible

Supabase Dashboard → **SQL Editor** → Run:

```sql
-- Should return household accounts (not blocked by RLS)
SELECT * FROM accounts WHERE visibility = 'household';
```

**Expected**:

- [ ] Query succeeds
- [ ] Shows 3 seed accounts (BPI Savings, Cash Wallet, BDO Credit Card)
- [ ] No RLS error

**Status**: [ ] Pass / [ ] Fail

---

### 6. RLS Works - Personal Accounts Protected

Supabase Dashboard → **SQL Editor** → Run as different user:

```sql
-- Try to view all accounts (should only see household + your own)
SELECT * FROM accounts;
```

**Expected**:

- [ ] Only returns household accounts + accounts where owner_user_id = current user
- [ ] Does NOT return other users' personal accounts

**Status**: [ ] Pass / [ ] Fail

---

## TypeScript Types Checks

### 1. Types File Generated

```bash
ls src/types/database.types.ts
```

**Expected**: File exists (may be 500+ lines)

**Status**: [ ] Pass / [ ] Fail

---

### 2. Types File Valid TypeScript

```bash
npx tsc src/types/database.types.ts --noEmit
```

**Expected**: No errors

**Status**: [ ] Pass / [ ] Fail

---

### 3. Account Types Usable

Create test file `src/test-account-type.ts`:

```typescript
import { Account, AccountInsert } from "@/types/accounts";

const account: Account = {
  id: "test-id",
  household_id: "test-household",
  name: "Test Bank",
  type: "bank",
  initial_balance_cents: 100000,
  currency_code: "PHP",
  visibility: "household",
  owner_user_id: null,
  color: "#3B82F6",
  icon: "building-2",
  sort_order: 1,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

console.log("Type check passed!");
```

Run:

```bash
npx tsc src/test-account-type.ts --noEmit
```

**Expected**: No errors

Delete `src/test-account-type.ts` after verification.

**Status**: [ ] Pass / [ ] Fail

---

## Data Integrity Checks

### 1. Seed Data Loaded

Supabase Dashboard → **Table Editor** → `accounts`

**Expected**:

- [ ] At least 3 rows visible
- [ ] Names: "BPI Savings", "Cash Wallet", "BDO Credit Card"
- [ ] All have `visibility = 'household'`
- [ ] All have `is_active = true`

**Status**: [ ] Pass / [ ] Fail

---

### 2. Can Insert New Account

Supabase Dashboard → **SQL Editor** → Run:

```sql
INSERT INTO accounts (name, type, initial_balance_cents, visibility, color, icon)
VALUES ('Test Account', 'bank', 50000, 'household', '#10B981', 'piggy-bank');
```

**Expected**:

- [ ] Insert succeeds
- [ ] New row appears in Table Editor
- [ ] `id` auto-generated (UUID)
- [ ] `created_at` set to now
- [ ] `household_id` defaults to 00000000-...

**Status**: [ ] Pass / [ ] Fail

---

### 3. Unique Constraint Works

Try inserting duplicate:

```sql
-- Should fail (duplicate name in same household)
INSERT INTO accounts (name, type, initial_balance_cents, visibility)
VALUES ('BPI Savings', 'bank', 0, 'household');
```

**Expected**:

- [ ] Insert FAILS
- [ ] Error mentions unique constraint or duplicate key

**Status**: [ ] Pass / [ ] Fail

---

### 4. Check Constraint Works

Try inserting invalid type:

```sql
-- Should fail (invalid type)
INSERT INTO accounts (name, type, initial_balance_cents, visibility)
VALUES ('Bad Account', 'invalid_type', 0, 'household');
```

**Expected**:

- [ ] Insert FAILS
- [ ] Error mentions check constraint

**Status**: [ ] Pass / [ ] Fail

---

### 5. Timestamp Trigger Works

Update an account:

```sql
UPDATE accounts
SET name = 'BPI Savings (Updated)'
WHERE name = 'BPI Savings';
```

Check `updated_at`:

```sql
SELECT name, created_at, updated_at FROM accounts WHERE name LIKE '%Updated%';
```

**Expected**:

- [ ] `updated_at` is more recent than `created_at`
- [ ] `updated_at` close to current time

**Status**: [ ] Pass / [ ] Fail

---

## Pass Criteria

All checks above must pass:

- ✅ Migration file exists and applied
- ✅ Table structure correct (13+ columns)
- ✅ All constraints active
- ✅ Indexes created
- ✅ RLS enabled with 4 policies
- ✅ TypeScript types generated and usable
- ✅ Seed data loaded correctly
- ✅ Data integrity enforced (unique, check constraints)
- ✅ Triggers working (updated_at auto-updates)

---

## If Any Check Fails

1. Check `troubleshooting.md` for that specific issue
2. Review `instructions.md` step-by-step
3. Check Supabase Dashboard logs
4. Verify migration SQL syntax
5. Try resetting local database: `npx supabase db reset`

---

## When All Checks Pass

1. Update `progress-tracker.md`:
   - Mark chunk 004 as complete `[x]`
   - Update time invested

2. Commit your work:

```bash
git add .
git commit -m "feat: complete chunk 004-accounts-schema"
```

3. Clean up test data (optional):

```sql
DELETE FROM accounts WHERE name LIKE '%Test%';
```

4. Move to next chunk:
   - `chunks/005-accounts-ui/`

---

**Checkpoint Status**: **\_\_** (Pass / Fail / In Progress)
**Time Taken**: **\_\_** minutes
**Issues Encountered**: **\_\_**
**Notes**: **\_\_**
