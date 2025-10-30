# Troubleshooting: Accounts Schema

Common issues and solutions for chunk 004.

---

## Issue: "Could not find Supabase project"

**Symptom**: `npx supabase db push` fails with project not found

**Cause**: Not linked to remote project

**Solution**:

1. Check if linked:

   ```bash
   npx supabase projects list
   ```

2. If not linked:

   ```bash
   npx supabase link --project-ref your-project-ref
   ```

3. Find project ref:
   - Supabase Dashboard → Settings → General → Reference ID

4. Verify `.supabase/` folder exists:
   ```bash
   ls -la .supabase/
   ```

**Reference**: `instructions.md` Step 3

---

## Issue: Migration fails with "relation already exists"

**Symptom**:

```
ERROR: relation "accounts" already exists
```

**Cause**: Table already created from previous attempt

**Solution**:

**Option A (Fresh Start)**:

```sql
-- In Supabase Dashboard → SQL Editor
DROP TABLE IF EXISTS accounts CASCADE;
```

Then re-run migration:

```bash
npx supabase db push
```

**Option B (Create New Migration)**:

```bash
npx supabase migration new fix_accounts_schema

# Edit the new migration to use IF NOT EXISTS
CREATE TABLE IF NOT EXISTS accounts ...
```

**Reference**: `instructions.md` Step 7

---

## Issue: RLS policy error "could not identify an equality operator"

**Symptom**: RLS policy fails to create

**Cause**: Usually happens with array operations or complex USING clauses

**Solution**:

1. Check policy syntax:

   ```sql
   -- Make sure USING clause is properly formatted
   USING (
     visibility = 'household'
     OR owner_user_id = auth.uid()
   )
   ```

2. Verify `auth.uid()` function exists:

   ```sql
   SELECT auth.uid();  -- Should return current user UUID or NULL
   ```

3. If still failing, simplify policy:
   ```sql
   -- Try without OR first
   USING (visibility = 'household')
   ```

**Reference**: `instructions.md` Step 4

---

## Issue: "Check constraint violated"

**Symptom**: Can't insert accounts, error about check constraint

**Cause**: Inserting invalid values (type, visibility, currency_code)

**Solution**:

1. Check valid values in migration:

   ```sql
   -- Valid types
   CHECK (type IN ('bank', 'investment', 'credit_card', 'cash', 'e-wallet'))

   -- Valid visibility
   CHECK (visibility IN ('household', 'personal'))

   -- Valid currency
   CHECK (currency_code = 'PHP')
   ```

2. Verify your INSERT statement:

   ```sql
   -- ❌ Wrong
   INSERT INTO accounts (name, type) VALUES ('Test', 'checking');

   -- ✅ Correct
   INSERT INTO accounts (name, type) VALUES ('Test', 'bank');
   ```

**Reference**: `instructions.md` Step 4

---

## Issue: Type generation fails

**Symptom**:

```
Error: Failed to generate types
```

**Cause**: Database not accessible or types command wrong

**Solution**:

1. Verify database accessible:

   ```bash
   npx supabase db remote --help
   ```

2. Try different generation method:

   ```bash
   # From linked remote project
   npx supabase gen types typescript --linked > src/types/database.types.ts

   # From local database (if running)
   npx supabase gen types typescript --local > src/types/database.types.ts
   ```

3. If still failing, check connection:
   ```bash
   npx supabase db remote status
   ```

**Reference**: `instructions.md` Step 8

---

## Issue: "Cannot read properties of undefined (reading 'Row')"

**Symptom**: TypeScript error when using generated types

**Cause**: Type path wrong or types not generated correctly

**Solution**:

1. Verify types file exists:

   ```bash
   cat src/types/database.types.ts | head -20
   ```

2. Check type structure:

   ```typescript
   // Should have this structure
   export type Database = {
     public: {
       Tables: {
         accounts: {
           Row: { ... }
           Insert: { ... }
           Update: { ... }
         }
       }
     }
   }
   ```

3. If structure wrong, regenerate:
   ```bash
   rm src/types/database.types.ts
   npx supabase gen types typescript --linked > src/types/database.types.ts
   ```

**Reference**: `instructions.md` Steps 8-9

---

## Issue: Seed data not appearing

**Symptom**: Table empty after running migration

**Cause**: Seed file not applied or wrong location

**Solution**:

1. Check seed file exists:

   ```bash
   cat supabase/seed.sql
   ```

2. Manually apply seed:

   ```bash
   # Local
   npx supabase db reset  # Resets and applies seed

   # Remote (manual)
   # Copy SQL from seed.sql and run in Dashboard → SQL Editor
   ```

3. Verify seed SQL syntax:
   ```sql
   -- Make sure VALUES match column count
   INSERT INTO accounts (name, type, initial_balance_cents, visibility)
   VALUES ('BPI Savings', 'bank', 1000000, 'household');
   ```

**Reference**: `instructions.md` Steps 5-6

---

## Issue: "Foreign key violation" on owner_user_id

**Symptom**: Can't insert personal account

**Cause**: owner_user_id doesn't exist in auth.users

**Solution**:

1. Get valid user ID:
   - Supabase Dashboard → Authentication → Users
   - Copy UUID of your test user

2. Use that UUID in INSERT:

   ```sql
   INSERT INTO accounts (name, type, visibility, owner_user_id)
   VALUES ('Personal', 'bank', 'personal', 'paste-uuid-here');
   ```

3. Or set owner_user_id to NULL for household accounts:
   ```sql
   INSERT INTO accounts (name, type, visibility, owner_user_id)
   VALUES ('Household', 'bank', 'household', NULL);
   ```

**Reference**: `instructions.md` Step 5

---

## Issue: RLS blocks all queries

**Symptom**: `SELECT * FROM accounts` returns empty or permission denied

**Cause**: Not authenticated or RLS policy too restrictive

**Solution**:

1. Check if authenticated:

   ```sql
   -- Run in SQL Editor
   SELECT auth.uid();
   -- Should return a UUID, not NULL
   ```

2. If NULL, you're not authenticated. SQL Editor uses service_role by default, which bypasses RLS. To test RLS:
   - Use client code (Supabase JS client)
   - Or add test user in Dashboard and run query as that user

3. Temporarily disable RLS for testing:

   ```sql
   ALTER TABLE accounts DISABLE ROW LEVEL SECURITY;
   ```

4. Check policies are correct:
   ```sql
   -- View policy definitions
   SELECT * FROM pg_policies WHERE tablename = 'accounts';
   ```

**Reference**: `instructions.md` Step 4

---

## Issue: Duplicate unique constraint error

**Symptom**: Can't insert account with same name

**Cause**: UNIQUE(household_id, name) constraint

**Solution**:

1. This is intentional! Same household can't have duplicate account names.

2. Either:
   - Change the name: `'BPI Savings 2'`
   - Delete old account first: `DELETE FROM accounts WHERE name = 'BPI Savings'`
   - Use different household_id (not recommended for MVP)

3. To bypass for testing:
   ```sql
   -- Drop unique constraint temporarily
   ALTER TABLE accounts DROP CONSTRAINT accounts_household_id_name_key;
   ```

**Reference**: DATABASE.md lines 105-131

---

## Issue: Migration history out of sync

**Symptom**:

```
Error: migration history mismatch
```

**Cause**: Remote database has different migrations than local

**Solution**:

**Option A (Safe - Recommended)**:

```bash
# Pull remote migrations
npx supabase db remote commit

# This creates new migration files matching remote state
```

**Option B (Nuclear - Dangerous)**:

```bash
# WARNING: Destroys all data!
npx supabase db reset --linked
```

**Option C (Manual Sync)**:

1. List remote migrations:

   ```bash
   npx supabase migration list
   ```

2. Compare with local:

   ```bash
   ls supabase/migrations/
   ```

3. Delete conflicting local migrations and re-create

**Reference**: Supabase docs on migration conflicts

---

## Issue: "Invalid initial_balance_cents value"

**Symptom**: Can't insert negative balance

**Cause**: No check constraint against negative values (intentional - can have negative balances like credit cards)

**Solution**:

This is actually allowed! Credit cards start at 0 and go negative.

If you want to prevent negatives:

```sql
-- Add constraint in migration
ALTER TABLE accounts
ADD CONSTRAINT positive_balance CHECK (initial_balance_cents >= 0);
```

**Note**: For credit cards, you may want to allow negatives.

---

## Issue: Can't update timestamp manually

**Symptom**: `updated_at` doesn't change when I update it directly

**Cause**: Trigger overrides manual updates

**Solution**:

1. This is intentional! The trigger ensures `updated_at` always reflects actual update time.

2. To bypass (not recommended):

   ```sql
   DROP TRIGGER accounts_updated_at ON accounts;
   ```

3. Let the trigger handle it:
   ```sql
   -- Just update other fields, trigger handles updated_at
   UPDATE accounts SET name = 'New Name' WHERE id = '...';
   ```

**Reference**: `instructions.md` Step 4

---

## Still Stuck?

1. **Check Supabase Logs**:
   - Dashboard → Logs → API/Database logs
   - Look for SQL errors

2. **Verify Migration SQL**:

   ```bash
   cat supabase/migrations/*accounts.sql
   # Check for syntax errors
   ```

3. **Test Locally First**:

   ```bash
   npx supabase start
   npx supabase db reset
   # Test locally before pushing remote
   ```

4. **Compare with Database.md**:
   - `docs/initial plan/DATABASE.md` lines 105-131
   - Ensure your schema matches exactly

5. **Ask for Help**:
   - Supabase Discord: https://discord.supabase.com
   - Include migration SQL and error message

---

## Prevention Tips

- ✅ Always test migrations locally first
- ✅ Use transactions (BEGIN/COMMIT) for complex migrations
- ✅ Keep seed data separate from migrations
- ✅ Version control all migration files
- ✅ Never edit applied migrations (create new ones)
- ✅ Use descriptive migration names
- ✅ Document constraints and why they exist

---

**Last Updated**: 2025-01-15
