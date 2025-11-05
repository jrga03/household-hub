# Database Migrations (`/supabase/migrations/`)

## Purpose

The migrations directory contains **sequential SQL migration files** that define the database schema evolution for Household Hub. Each migration is a timestamped SQL file that creates tables, indexes, triggers, and RLS policies.

## Migration Strategy

**Sequential Schema Evolution:**

- Migrations run in timestamp order (oldest → newest)
- Each migration builds on previous ones
- Never modify existing migrations (create new ones)
- All migrations are idempotent where possible

**Version Control:**

- All migrations committed to git
- Schema history preserved
- Easy to audit changes over time

## Migration Files (13 Total)

### Phase A: Core Tables (Oct 23-24)

**1. `20251023224800_create_profiles.sql`**

- Creates `profiles` table extending Supabase Auth
- Links users to households
- Timezone and locale settings
- RLS: Users can read/update own profile

**2. `20251023224854_create_accounts.sql`**

- Creates `accounts` table (checking, savings, credit, etc.)
- Account types, balances, visibility
- RLS: Household users can access accounts

**3. `20251023225000_enhance_accounts_constraints.sql`**

- Adds CHECK constraints for account types
- Validates balance ranges
- Improves data integrity

**4. `20251023235900_create_categories.sql`**

- Creates `categories` table (two-level hierarchy)
- Parent-child relationships
- Color and icon fields
- RLS: Household visibility

**5. `20251024000000_fix_rls_infinite_recursion.sql`**

- Fixes infinite recursion in RLS policies
- Optimizes policy queries
- Performance improvement

**6. `20251024001500_create_transactions.sql`**

- Creates `transactions` table (main entity)
- Amount as BIGINT cents (always positive)
- Date as DATE type (user's local date)
- Transfer group ID for linked transactions
- Tagged user IDs (array for @mentions)
- Compound indexes for common queries
- RLS: Household + personal visibility

### Phase A: Additional Features (Oct 27-29)

**7. `20251027065757_create_budgets_table.sql`**

- Creates `budgets` table
- Monthly spending targets per category
- Month key format: `YYYY-MM`
- RLS: Household visibility

**8. `20251027075023_add_transfer_triggers.sql`**

- Adds triggers for transfer integrity
- Validates paired transactions
- Ensures amounts match
- Prevents orphaned transfers

**9. `20251027130207_create_sync_queue.sql`**

- Creates `sync_queue` table
- Tracks offline changes waiting to sync
- Idempotency keys, lamport clocks, vector clocks
- RLS: Users see only their device's queue

**10. `20251028025558_add_devices_table.sql`**

- Creates `devices` table
- Multi-device registration
- Platform/browser tracking
- Last seen timestamps
- RLS: Users see only their household's devices

**11. `20251028032817_add_transaction_events.sql`**

- Creates `transaction_events` table
- Event sourcing audit log
- Immutable event history
- Idempotency keys
- RLS: Household visibility

**12. `20251028033000_fix_events_rls_and_cleanup.sql`**

- Fixes RLS policies for events table
- Cleanup unused policies
- Performance optimization

**13. `20251029154229_add_push_subscriptions.sql`**

- Creates `push_subscriptions` table
- Stores Web Push subscription endpoints
- VAPID keys and auth tokens
- RLS: Users manage own subscriptions

## Migration File Structure

### Standard Pattern

All migrations follow this structure:

```sql
-- =====================================================
-- Migration: [Title]
-- =====================================================
-- Purpose: [What this migration does]
-- Dependencies: [Tables/migrations this depends on]
-- Referenced by: [Tables that reference this]
-- Documentation: [Link to docs]
-- =====================================================

BEGIN;  -- Transaction wrapper

-- =====================================================
-- 1. Create Table
-- =====================================================

CREATE TABLE my_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- columns...
);

-- =====================================================
-- 2. Add Indexes
-- =====================================================

CREATE INDEX idx_my_table_field ON my_table(field);

-- =====================================================
-- 3. Add Triggers (if needed)
-- =====================================================

CREATE TRIGGER my_trigger
  BEFORE INSERT ON my_table
  FOR EACH ROW
  EXECUTE FUNCTION my_function();

-- =====================================================
-- 4. Enable RLS
-- =====================================================

ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 5. Add RLS Policies
-- =====================================================

CREATE POLICY "policy_name"
  ON my_table FOR SELECT
  USING (/* condition */);

COMMIT;  -- End transaction
```

### Documentation Headers

**Required fields:**

- **Purpose:** Brief description
- **Dependencies:** What tables/migrations this needs
- **Referenced by:** What depends on this
- **Documentation:** Link to DATABASE.md section

**Example:**

```sql
-- =====================================================
-- Migration: Create Transactions Table
-- =====================================================
-- Purpose: Create transactions table with indexes and RLS
-- Dependencies: accounts, categories tables
-- Referenced by: budgets, transaction_events
-- Documentation: DATABASE.md lines 160-219
-- =====================================================
```

## Key Patterns and Conventions

### 1. UUID Primary Keys

**Pattern:**

```sql
id UUID PRIMARY KEY DEFAULT gen_random_uuid()
```

**Why:**

- Globally unique (no collisions across devices)
- Supports offline-first (client-generated UUIDs)
- Compatible with Supabase Auth

### 2. Household Isolation

**Pattern:**

```sql
household_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'
```

**Why:**

- Multi-household architecture ready
- MVP uses single default household
- Future-proof for Phase 2+

### 3. Amount Storage

**Pattern:**

```sql
amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0)
type TEXT NOT NULL CHECK (type IN ('income', 'expense'))
```

**Why:**

- Integer cents avoid floating-point errors
- Always positive with explicit type field
- BIGINT supports very large amounts

**See:** `/src/lib/currency.md` for complete currency spec

### 4. Date Fields

**Transactions:**

```sql
date DATE NOT NULL  -- User's local date (canonical)
```

**Audit fields:**

```sql
created_at TIMESTAMPTZ DEFAULT NOW()  -- UTC timestamp
updated_at TIMESTAMPTZ DEFAULT NOW()  -- UTC timestamp
```

**Why:**

- Transactions are date-based in user's context
- Audit timestamps need UTC for system tracking
- **See:** DATABASE.md lines 932-1004 for rationale

### 5. RLS Policy Pattern

**Household data:**

```sql
CREATE POLICY "Users can view household transactions"
  ON transactions FOR SELECT
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  );
```

**Personal data:**

```sql
CREATE POLICY "Users can view their personal transactions"
  ON transactions FOR SELECT
  USING (
    owner_user_id = auth.uid()
    OR visibility = 'household'
  );
```

### 6. Compound Indexes

**Pattern:**

```sql
CREATE INDEX idx_transactions_account_date
  ON transactions(account_id, date);
```

**Why:**

- Optimizes common queries (account + date range)
- Left-to-right index usage
- **See:** DATABASE.md lines 1161-1346 for query mappings

### 7. Array Fields with GIN Indexes

**Pattern:**

```sql
tagged_user_ids UUID[] DEFAULT ARRAY[]::UUID[]

CREATE INDEX idx_transactions_tagged_users
  ON transactions USING GIN(tagged_user_ids);
```

**Why:**

- GIN indexes optimize array containment queries
- Fast `WHERE user_id = ANY(tagged_user_ids)` queries

### 8. Soft Deletes (NOT USED)

**Decision:** Hard deletes with event sourcing audit trail

**Rationale:**

- Events table preserves full history
- Simplifies queries (no `deleted_at IS NULL` filters)
- Storage optimization
- **See:** DECISIONS.md #68

## Common Development Tasks

### Creating a New Migration

**1. Generate file:**

```bash
supabase migration new create_tags_table
```

Creates: `20251105120000_create_tags_table.sql`

**2. Write SQL:**

```sql
-- Use standard header structure
-- Include: table, indexes, triggers, RLS policies
-- Wrap in transaction: BEGIN...COMMIT
```

**3. Test locally:**

```bash
supabase db reset  # Applies all migrations fresh
```

**4. Verify in Studio:**

- http://localhost:54323
- Check table structure, indexes, RLS

**5. Commit to git:**

```bash
git add supabase/migrations/20251105120000_create_tags_table.sql
git commit -m "feat: add tags table"
```

**6. Deploy to production:**

```bash
supabase db push
```

### Modifying Existing Table

**Never modify existing migrations!** Create new migration instead:

**Add column:**

```bash
supabase migration new add_tags_description
```

```sql
ALTER TABLE tags ADD COLUMN description TEXT;
```

**Modify column:**

```sql
-- Can't change type directly, must migrate data
ALTER TABLE tags ADD COLUMN color_new TEXT NOT NULL DEFAULT '#000000';
UPDATE tags SET color_new = color;
ALTER TABLE tags DROP COLUMN color;
ALTER TABLE tags RENAME COLUMN color_new TO color;
```

**Add index:**

```sql
CREATE INDEX idx_tags_name ON tags(name);
```

### Adding RLS Policies

**New policy:**

```bash
supabase migration new add_tags_update_policy
```

```sql
CREATE POLICY "Users can update household tags"
  ON tags FOR UPDATE
  USING (
    household_id IN (
      SELECT household_id FROM profiles WHERE id = auth.uid()
    )
  );
```

**Fixing policy:**

```sql
-- Drop old policy first
DROP POLICY IF EXISTS "Old policy name" ON tags;

-- Create new policy
CREATE POLICY "New improved policy"
  ON tags FOR SELECT
  USING (/* improved condition */);
```

### Checking Migration Status

**Local:**

```bash
supabase migration list
```

Shows:

- Applied migrations (✓)
- Pending migrations (✗)
- Remote vs local differences

**Remote:**

```bash
supabase db remote status
```

### Rolling Back (Dangerous!)

**⚠️ Avoid rollbacks in production**

**Better approach:** Create forward migration that reverts changes

**Example - Reverting column:**

```bash
supabase migration new remove_tags_description
```

```sql
ALTER TABLE tags DROP COLUMN IF EXISTS description;
```

## Testing Migrations

### Local Testing

**1. Fresh database:**

```bash
supabase db reset
```

**2. Verify schema:**

- Check Studio (http://localhost:54323)
- Run test queries

**3. Check RLS:**

```sql
-- Test as authenticated user
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "test-user-id"}';
SELECT * FROM tags;  -- Should work if policy correct
```

**4. Run tests:**

```bash
npm test  # Unit tests should pass with new schema
```

### Production Testing

**Staging environment recommended** but not implemented in MVP

**Manual steps:**

1. Backup production database
2. Push migrations during low-traffic window
3. Run smoke tests
4. Monitor error logs

## Migration Checklist

Before deploying migration:

- [ ] Migration file has standard header structure
- [ ] All tables have RLS enabled
- [ ] All RLS policies defined (SELECT, INSERT, UPDATE, DELETE)
- [ ] Indexes added for common query patterns
- [ ] CHECK constraints validate data integrity
- [ ] Foreign keys use appropriate ON DELETE actions
- [ ] Default values provided where sensible
- [ ] Tested locally with `supabase db reset`
- [ ] TypeScript types regenerated
- [ ] Dexie schema updated (if adding table)
- [ ] Documented in DATABASE.md
- [ ] Committed to git

## Troubleshooting

### Migration Fails Locally

**Error: "relation already exists"**

- Solution: `supabase db reset` to start fresh

**Error: "foreign key constraint"**

- Solution: Ensure referenced table exists (check dependencies)

**Error: "syntax error"**

- Solution: Check SQL syntax, validate with pgAdmin or Studio

### Migration Fails in Production

**Error: "relation already exists"**

- Cause: Migration already partially applied
- Solution: Check `supabase_migrations.schema_migrations` table

**Error: "permission denied"**

- Cause: RLS policy too restrictive
- Solution: Use service role for migration application

### RLS Policies Not Working

**Debug steps:**

1. Check policy exists: `SELECT * FROM pg_policies WHERE tablename = 'tags'`
2. Test policy: Use SQL Editor with `SET LOCAL role TO authenticated`
3. Check auth context: Ensure `auth.uid()` returns correct user
4. Simplify policy: Start simple, add complexity incrementally

## Related Documentation

### Comprehensive Guides

- [/docs/initial plan/DATABASE.md](../../docs/initial%20plan/DATABASE.md) - Complete schema (47KB)
  - Lines 160-219: Transactions table
  - Lines 932-1004: Date handling rationale
  - Lines 1161-1346: Query-to-index mappings
- [/docs/initial plan/RLS-POLICIES.md](../../docs/initial%20plan/RLS-POLICIES.md) - Security policies

### Parent README

- [../README.md](../README.md) - Supabase backend overview

### Frontend Integration

- [/src/types/database.types.ts](../../src/types/database.types.ts) - Generated from migrations
- [/src/lib/dexie/db.ts](../../src/lib/dexie/db.ts) - IndexedDB schema mirrors migrations

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference

## Further Reading

- [Supabase Migrations](https://supabase.com/docs/guides/cli/local-development#database-migrations) - Official guide
- [PostgreSQL CREATE TABLE](https://www.postgresql.org/docs/current/sql-createtable.html) - SQL reference
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security) - RLS guide
- [PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html) - Index types and usage
