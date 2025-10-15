# Instructions: Accounts Schema

Follow these steps in order. Estimated time: 45 minutes.

---

## Step 1: Install Supabase CLI (5 min)

If not already installed:

```bash
npm install -g supabase
```

Verify installation:

```bash
supabase --version
```

**Expected**: Version 1.x.x or higher

---

## Step 2: Initialize Supabase Locally (5 min)

```bash
# In project root
npx supabase init
```

This creates:

```
supabase/
├── config.toml
├── seed.sql
└── migrations/
```

**Verify**: `supabase/` folder exists

---

## Step 3: Link to Remote Project (5 min)

```bash
npx supabase link --project-ref your-project-ref
```

To find your project ref:

1. Go to Supabase Dashboard
2. Settings → General → Reference ID
3. Copy the reference ID (looks like `abcdefghijklmnop`)

When prompted for database password, use the one you created in chunk 002.

**Verify**: Shows "Linked to project" message

---

## Step 4: Create Accounts Migration (10 min)

```bash
npx supabase migration new create_accounts
```

This creates a file like `supabase/migrations/20250115123456_create_accounts.sql`.

Open the file and add this SQL:

```sql
-- Create accounts table
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID DEFAULT '00000000-0000-0000-0000-000000000001' NOT NULL,

  -- Account details
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bank', 'investment', 'credit_card', 'cash', 'e-wallet')),
  initial_balance_cents BIGINT DEFAULT 0,
  currency_code TEXT DEFAULT 'PHP' CHECK (currency_code = 'PHP'),

  -- Visibility
  visibility TEXT DEFAULT 'household' CHECK (visibility IN ('household', 'personal')),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- UI customization
  color TEXT DEFAULT '#3B82F6',
  icon TEXT DEFAULT 'building-2',
  sort_order INT DEFAULT 0,

  -- Soft delete
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(household_id, name)
);

-- Indexes for performance
CREATE INDEX idx_accounts_household ON accounts(household_id);
CREATE INDEX idx_accounts_active ON accounts(is_active);
CREATE INDEX idx_accounts_visibility ON accounts(visibility);
CREATE INDEX idx_accounts_owner ON accounts(owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- View accounts: household visible to all, personal to owner only
CREATE POLICY "View accounts"
  ON accounts FOR SELECT
  TO authenticated
  USING (
    visibility = 'household'
    OR owner_user_id = auth.uid()
  );

-- Create accounts: set owner_user_id if personal
CREATE POLICY "Create accounts"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    CASE
      WHEN visibility = 'personal' THEN owner_user_id = auth.uid()
      ELSE true
    END
  );

-- Update accounts: household editable by all, personal by owner only
CREATE POLICY "Update accounts"
  ON accounts FOR UPDATE
  TO authenticated
  USING (
    visibility = 'household'
    OR owner_user_id = auth.uid()
  );

-- Delete accounts: household by anyone, personal by owner only
CREATE POLICY "Delete accounts"
  ON accounts FOR DELETE
  TO authenticated
  USING (
    visibility = 'household'
    OR owner_user_id = auth.uid()
  );

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounts_updated_at
BEFORE UPDATE ON accounts
FOR EACH ROW EXECUTE FUNCTION update_accounts_updated_at();
```

---

## Step 5: Add Seed Data (5 min)

Edit `supabase/seed.sql` (or create if it doesn't exist):

```sql
-- Seed test accounts
-- NOTE: Replace the UUID with your actual user ID from Supabase Dashboard

-- Household accounts (visible to all)
INSERT INTO accounts (name, type, initial_balance_cents, visibility, color, icon, sort_order)
VALUES
  ('BPI Savings', 'bank', 1000000, 'household', '#3B82F6', 'building-2', 1),
  ('Cash Wallet', 'cash', 50000, 'household', '#10B981', 'wallet', 2),
  ('BDO Credit Card', 'credit_card', 0, 'household', '#EF4444', 'credit-card', 3);

-- Personal account example (replace UUID with your user ID)
-- Get your user ID from: Supabase Dashboard → Authentication → Users
-- INSERT INTO accounts (name, type, initial_balance_cents, visibility, owner_user_id, color, icon, sort_order)
-- VALUES
--   ('Personal GCash', 'e-wallet', 25000, 'personal', 'YOUR-USER-UUID-HERE', '#F59E0B', 'smartphone', 4);
```

---

## Step 6: Run Migration Locally (5 min)

Start local Supabase (optional, for testing):

```bash
npx supabase start
```

This starts a local Postgres database. Wait until it shows:

```
Started supabase local development setup.
API URL: http://localhost:54321
```

Apply migration:

```bash
npx supabase db reset
```

This applies all migrations and seed data.

**Verify**: Should see "Database reset successful"

---

## Step 7: Push to Remote Supabase (5 min)

```bash
npx supabase db push
```

When prompted, confirm you want to push to remote database.

**Verify**:

- Shows "Pushed migrations to remote database"
- Check Supabase Dashboard → Table Editor → `accounts` table exists

---

## Step 8: Generate TypeScript Types (5 min)

```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

This generates TypeScript types from your database schema.

**Verify**: `src/types/database.types.ts` exists

Update the command if you want types from remote:

```bash
npx supabase gen types typescript --linked > src/types/database.types.ts
```

---

## Step 9: Create Type Helper (5 min)

Create `src/types/accounts.ts`:

```typescript
import { Database } from "./database.types";

export type Account = Database["public"]["Tables"]["accounts"]["Row"];
export type AccountInsert = Database["public"]["Tables"]["accounts"]["Insert"];
export type AccountUpdate = Database["public"]["Tables"]["accounts"]["Update"];

export type AccountType = "bank" | "investment" | "credit_card" | "cash" | "e-wallet";
export type AccountVisibility = "household" | "personal";
```

These type aliases make it easier to use in your app.

---

## Step 10: Verify in Supabase Dashboard (5 min)

1. Go to Supabase Dashboard → **Table Editor**
2. Find `accounts` table
3. Check:
   - [ ] All columns present (id, name, type, etc.)
   - [ ] Constraints visible (CHECK, UNIQUE)
   - [ ] Seed data appears (3 household accounts)

4. Test RLS policies:
   - Dashboard → **Authentication** → Create test user
   - Dashboard → **SQL Editor** → Run:
     ```sql
     -- Should show only household accounts (not personal ones from other users)
     SELECT * FROM accounts;
     ```

---

## Done!

When the accounts table exists with proper RLS and types are generated, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Why UUID for household_id?**

- Supports multi-household in future
- For MVP, everyone uses default household

**Why cents (BIGINT)?**

- Avoids floating-point precision errors
- ₱1,500.50 stored as 150050 cents
- Always exact, never 1500.4999999

**Why TEXT with CHECK instead of ENUM?**

- Easier to add new types without ALTER TYPE
- Still validates at database level

**Soft Delete (is_active)?**

- Don't actually delete accounts (breaks transaction history)
- Set `is_active = false` instead
- UI filters `WHERE is_active = true`

**RLS Policies**:

- `authenticated` role = logged-in users
- `auth.uid()` = current user's ID
- Policies checked automatically by Supabase
