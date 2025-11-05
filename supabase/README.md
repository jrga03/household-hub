# Supabase Backend (`/supabase/`)

## Purpose

The Supabase directory contains **backend infrastructure configuration** for Household Hub, including database migrations, edge functions, and local development setup. Supabase provides PostgreSQL database, authentication, realtime subscriptions, and edge compute.

## Contents

### Configuration

- **`config.toml`** (13KB) - Supabase CLI configuration
  - Local development ports
  - Database settings (PostgreSQL 17)
  - API configuration
  - Auth providers
  - Storage buckets (Phase B)
  - Edge functions settings

- **`seed.sql`** (2.3KB) - Seed data for development
  - Sample household
  - Default categories
  - Test accounts

- **`.gitignore`** - Ignore Supabase CLI artifacts

### Directories

- **[`migrations/`](./migrations/)** - Database schema migrations (13 files)
  - Timestamped SQL files
  - Sequential schema evolution
  - RLS policies included

- **[`functions/`](./functions/)** - Supabase Edge Functions (2 functions)
  - `budget-alerts/` - Daily budget threshold notifications
  - `transaction-reminders/` - Transaction reminder notifications

- **`.branches/`** - Supabase branching metadata (CLI artifact)

- **`.temp/`** - Temporary files (CLI artifact)

## Architecture Role

```
┌──────────────────────────────────────────────────┐
│  Frontend (React + TanStack Router)             │
│  - Components, hooks, stores                     │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────┐
│  Offline Layer (IndexedDB via Dexie)            │
│  - Local-first storage                           │
│  - Sync queue                                    │
└────────────────────┬─────────────────────────────┘
                     │
                     ▼ (Background Sync)
┌──────────────────────────────────────────────────┐
│  ╔══════════════════════════════════════════╗   │
│  ║  SUPABASE BACKEND                       ║   │
│  ║  • PostgreSQL Database (migrations/)    ║   │
│  ║  • Auth (built-in)                      ║   │
│  ║  • Realtime (subscriptions)             ║   │
│  ║  • Edge Functions (functions/)          ║   │
│  ║  • Storage (Phase B)                    ║   │
│  ╚══════════════════════════════════════════╝   │
└──────────────────────────────────────────────────┘
```

## Local Development Setup

### Prerequisites

**Install Supabase CLI:**

```bash
# macOS
brew install supabase/tap/supabase

# Windows
scoop install supabase

# Linux
brew install supabase/tap/supabase
```

**Install Docker Desktop:**

- Required for local Supabase instance
- https://www.docker.com/products/docker-desktop

### Start Local Supabase

**1. Start services:**

```bash
supabase start
```

This starts:

- PostgreSQL database (port 54332)
- API server (port 54331)
- Studio UI (port 54323)
- Realtime server
- Auth server
- Storage server (Phase B)

**2. Access Studio:**
Open http://localhost:54323 in browser

**3. Get connection details:**

```bash
supabase status
```

Shows:

- API URL
- Database URL
- Anon key (public)
- Service role key (admin)

### Environment Variables

**Development (`.env.local`):**

```env
VITE_SUPABASE_URL=http://localhost:54331
VITE_SUPABASE_ANON_KEY=[anon-key-from-supabase-status]
```

**Production (`.env.production`):**

```env
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=[production-anon-key]
```

**Never commit:**

- Service role keys
- Production keys
- Personal access tokens

### Stopping Local Supabase

```bash
supabase stop        # Stop services, keep data
supabase stop -b     # Stop and backup data
supabase db reset    # Reset database (clears data)
```

## Database Migrations

### Migration Workflow

**1. Create new migration:**

```bash
supabase migration new [migration_name]
```

Creates: `supabase/migrations/[timestamp]_[migration_name].sql`

**2. Write SQL:**

```sql
-- Create table
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view household tags"
  ON tags FOR SELECT
  USING (household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));
```

**3. Apply locally:**

```bash
supabase db reset  # Resets and applies all migrations
# OR
supabase migration up  # Applies pending migrations
```

**4. Verify in Studio:**
http://localhost:54323 → Table Editor

**5. Deploy to production:**

```bash
supabase db push
```

### Migration Best Practices

**DO:**

- ✅ Add migrations sequentially (don't skip timestamps)
- ✅ Include RLS policies in same migration as table
- ✅ Test locally before pushing to production
- ✅ Use transactions (implicit in migration files)
- ✅ Add comments explaining complex logic

**DON'T:**

- ❌ Modify existing migration files (create new ones)
- ❌ Delete migrations (breaks schema history)
- ❌ Skip migrations when deploying
- ❌ Forget RLS policies (security risk!)
- ❌ Use DROP TABLE without backup

### Migration Naming

**Convention:** `[timestamp]_[action]_[entity].sql`

**Examples:**

- `20251105120000_create_tags.sql`
- `20251105130000_add_tags_color_column.sql`
- `20251105140000_fix_tags_rls_policies.sql`

**See:** [migrations/README.md](./migrations/) for complete migration guide

## Edge Functions

### Function Structure

**Location:** `supabase/functions/[function-name]/`

**Files:**

- `index.ts` - Function entry point (Deno runtime)
- `README.md` - Function documentation
- `.env.example` - Environment variable template

**Runtime:** Deno (TypeScript native, no build step)

### Deploying Functions

**1. Test locally:**

```bash
supabase functions serve [function-name]
```

**2. Set secrets:**

```bash
supabase secrets set MY_SECRET=value
```

**3. Deploy:**

```bash
supabase functions deploy [function-name]
```

**4. View logs:**

```bash
supabase functions logs [function-name]
```

### Available Functions

**budget-alerts:**

- **Purpose:** Send daily push notifications for budget thresholds
- **Trigger:** Cron (daily at 8 AM user's timezone)
- **See:** [functions/budget-alerts/README.md](./functions/budget-alerts/)

**transaction-reminders:**

- **Purpose:** Send reminders for recurring transactions
- **Trigger:** Cron (daily)
- **See:** [functions/transaction-reminders/README.md](./functions/transaction-reminders/)

**See:** [functions/README.md](./functions/) for complete edge functions guide

## Common Development Tasks

### Creating a New Table

**1. Generate migration:**

```bash
supabase migration new create_tags
```

**2. Write migration SQL:**

```sql
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  household_id UUID REFERENCES households(id),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage household tags"
  ON tags FOR ALL
  USING (household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  ));
```

**3. Apply locally:**

```bash
supabase db reset
```

**4. Update TypeScript types:**

```bash
supabase gen types typescript --local > src/types/database.types.ts
```

**5. Add to Dexie schema** in `src/lib/dexie/db.ts`

**6. Deploy when ready:**

```bash
supabase db push
```

### Modifying Existing Table

**Add column:**

```bash
supabase migration new add_tags_color_column
```

```sql
ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT '#3b82f6';
```

**Modify column:**

```sql
-- Can't ALTER TYPE directly, must create new column + migrate
ALTER TABLE tags ADD COLUMN color_new TEXT;
UPDATE tags SET color_new = color::TEXT;
ALTER TABLE tags DROP COLUMN color;
ALTER TABLE tags RENAME COLUMN color_new TO color;
```

### Fixing RLS Policies

**1. Identify issue:**

- Check Studio SQL Editor
- Test queries with different users

**2. Create migration:**

```bash
supabase migration new fix_tags_rls_policies
```

**3. Drop and recreate policy:**

```sql
DROP POLICY IF EXISTS "Old policy name" ON tags;

CREATE POLICY "New policy name"
  ON tags FOR SELECT
  USING (household_id IN (
    SELECT household_id FROM profiles WHERE id = auth.uid()
  ));
```

**4. Test locally** with different auth contexts

### Generating TypeScript Types

**After schema changes:**

```bash
# Local
supabase gen types typescript --local > src/types/database.types.ts

# Production
supabase gen types typescript --project-id [project-id] > src/types/database.types.ts
```

**Automatically regenerates:**

- Table types
- View types
- Function parameter types
- Enum types

### Seeding Data

**Edit seed.sql:**

```sql
-- Add test data
INSERT INTO accounts (household_id, name, type, balance_cents)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Test Checking', 'checking', 100000),
  ('00000000-0000-0000-0000-000000000001', 'Test Savings', 'savings', 500000);
```

**Apply seed:**

```bash
supabase db reset  # Includes seed data
```

### Debugging Database Issues

**Check logs:**

```bash
supabase logs db
```

**SQL Editor:**

1. Open Studio: http://localhost:54323
2. SQL Editor tab
3. Run queries directly

**Check RLS:**

```sql
-- Test as specific user
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "user-uuid"}';
SELECT * FROM transactions;  -- Test RLS policies
```

**Check indexes:**

```sql
SELECT * FROM pg_indexes WHERE tablename = 'transactions';
```

## Supabase Studio

**Access:** http://localhost:54323

**Features:**

- **Table Editor:** Browse and edit data
- **SQL Editor:** Run queries
- **API Docs:** Auto-generated REST API docs
- **Auth:** Manage users
- **Storage:** File management (Phase B)
- **Logs:** View realtime logs

## Remote Database Management

### Linking Project

**1. Get project ID:**

- Supabase Dashboard → Settings → General

**2. Link CLI:**

```bash
supabase link --project-ref [project-id]
```

**3. Verify:**

```bash
supabase db remote status
```

### Deploying Changes

**1. Test locally:**

```bash
supabase db reset
npm test
```

**2. Push migrations:**

```bash
supabase db push
```

**3. Verify in production:**

- Check Supabase Dashboard
- Test app in production

### Rolling Back

**⚠️ Dangerous - Avoid if possible**

**Safer approach:**

1. Create new migration that reverts changes
2. Deploy forward-only (don't actually rollback)

**Emergency rollback:**

```bash
supabase db reset --db-url [production-db-url]  # CAUTION!
```

## Security Considerations

### RLS Policies

**Always enable RLS:**

```sql
ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;
```

**Test policies:**

- Create policies for SELECT, INSERT, UPDATE, DELETE separately
- Test with different user contexts
- Verify no data leaks

### Service Role Key

**Never expose:**

- Don't commit to git
- Don't use in frontend
- Only use in backend/admin scripts

**Environment variables only:**

```env
# .env (never committed)
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Database Secrets

**Use Vault (Phase B):**

```sql
-- Store sensitive data
INSERT INTO vault.secrets (name, secret)
VALUES ('api_key', 'secret-value');
```

## Performance Optimization

### Indexes

**Check slow queries:**

```sql
SELECT * FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;
```

**Add indexes:**

```sql
-- Single column
CREATE INDEX idx_transactions_date ON transactions(date);

-- Compound index
CREATE INDEX idx_transactions_account_date
  ON transactions(account_id, date);

-- GIN index for arrays
CREATE INDEX idx_transactions_tagged_users
  ON transactions USING GIN(tagged_user_ids);
```

### Query Optimization

**Use EXPLAIN:**

```sql
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE account_id = 'xxx' AND date >= '2025-01-01';
```

**See:** `/docs/initial plan/DATABASE.md` lines 1161-1346 for query patterns

## Cost Management

**Free Tier Limits:**

- 500MB database storage
- 1GB file storage (Phase B)
- 2GB bandwidth per month
- 50K monthly active users

**Monitor usage:**

- Supabase Dashboard → Settings → Usage

**Optimization strategies:**

- Implement data retention (90 days)
- Event compaction (reduce audit log size)
- Image compression (Phase B)

## Related Documentation

### Comprehensive Guides

- [/docs/initial plan/DATABASE.md](../docs/initial%20plan/DATABASE.md) - Complete schema (47KB)
- [/docs/initial plan/RLS-POLICIES.md](../docs/initial%20plan/RLS-POLICIES.md) - Security policies
- [/docs/initial plan/DEPLOYMENT.md](../docs/initial%20plan/DEPLOYMENT.md) - Deployment guide

### Subdirectory READMEs

- [migrations/README.md](./migrations/) - Migration guide
- [functions/README.md](./functions/) - Edge functions guide

### Frontend Integration

- [/src/lib/README.md](../src/lib/README.md) - Frontend uses Supabase client
- [/src/lib/supabase.ts](../src/lib/supabase.ts) - Supabase client initialization
- [/src/lib/supabaseQueries.ts](../src/lib/supabaseQueries.ts) - All database queries

### Project Documentation

- [/CLAUDE.md](../CLAUDE.md) - Project quick reference
- [/README.md](../README.md) - Project overview

## Further Reading

- [Supabase Documentation](https://supabase.com/docs) - Official docs
- [Supabase CLI](https://supabase.com/docs/reference/cli) - CLI reference
- [PostgreSQL Documentation](https://www.postgresql.org/docs/) - Database docs
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security) - RLS guide
- [Edge Functions](https://supabase.com/docs/guides/functions) - Functions guide
