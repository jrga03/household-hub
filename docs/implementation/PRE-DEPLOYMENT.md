# Pre-Deployment Checklist

> **Purpose**: Verify all prerequisites are met BEFORE initiating deployment. This living document will be updated as chunks 038-046 add R2 backups, PWA features, and production monitoring.

**Last Updated**: 2025-10-29 (Created - Phase A Complete)
**Status**: ✅ Phase A Ready | ⏳ Phase B Incomplete (chunks 038-046)

---

## Quick Status Overview

| Component          | Phase A Status | Phase B Status | Chunk Reference    |
| ------------------ | -------------- | -------------- | ------------------ |
| Core App           | ✅ Ready       | N/A            | 001-037 complete   |
| Database           | ✅ Ready       | N/A            | Migrations 001-037 |
| Auth               | ✅ Ready       | N/A            | Chunk 002          |
| Offline Storage    | ✅ Ready       | N/A            | Chunks 019-025     |
| Event Sourcing     | ✅ Ready       | N/A            | Chunks 028-035     |
| CSV Export         | ✅ Ready       | N/A            | Chunk 036-037      |
| R2 Backups         | ⏳ TODO        | ⏳ Pending     | Chunk 038-040      |
| PWA Manifest       | ⏳ TODO        | ⏳ Pending     | Chunk 041          |
| Service Worker     | ⏳ TODO        | ⏳ Pending     | Chunk 042          |
| Push Notifications | ⏳ TODO        | ⏳ Pending     | Chunk 043          |
| E2E Tests          | ⏳ TODO        | ⏳ Pending     | Chunk 045          |

---

## Table of Contents

1. [Prerequisites Checklist](#1-prerequisites-checklist)
2. [Environment Preparation](#2-environment-preparation)
3. [Configuration Verification](#3-configuration-verification)
4. [Database Readiness](#4-database-readiness)
5. [Build Verification](#5-build-verification)
6. [Security Pre-Flight](#6-security-pre-flight)
7. [Performance Validation](#7-performance-validation)
8. [Documentation Review](#8-documentation-review)
9. [Dependency Audit](#9-dependency-audit)
10. [Team Communication](#10-team-communication)
11. [Phase B Readiness (Chunks 038-046)](#11-phase-b-readiness-chunks-038-046)

---

## 1. Prerequisites Checklist

### 1.1 Accounts & Access

- [ ] **GitHub**: Repository access with write permissions
- [ ] **Supabase**: Account created, project provisioned
  - [ ] Production project created (e.g., `household-hub-prod`)
  - [ ] Staging project created (optional, recommended)
  - [ ] API keys saved securely (anon key + service role key)
- [ ] **Cloudflare**: Account created
  - [ ] Cloudflare Pages access
  - [ ] Workers & Pages subscription (free tier sufficient)
  - [ ] API token generated with Pages write permissions
- [ ] **Domain** (optional): DNS access if using custom domain
- [ ] **Sentry** (optional): Account for error monitoring
  - [ ] Project created
  - [ ] DSN saved

**Verification**:

```bash
# Test Supabase CLI access
npx supabase --version

# Test Cloudflare access
npx wrangler whoami

# Test GitHub access
gh auth status
```

---

### 1.2 Local Development Tools

- [ ] **Node.js**: v20.x LTS or higher
- [ ] **npm**: v10.x or higher (or pnpm)
- [ ] **Git**: Latest version
- [ ] **Supabase CLI**: Latest version
- [ ] **Wrangler CLI**: Latest version (Cloudflare)

**Verification**:

```bash
node --version   # Should be v20.x+
npm --version    # Should be v10.x+
git --version    # Any recent version
npx supabase --version  # Latest
npx wrangler --version  # Latest
```

---

### 1.3 Repository Status

- [ ] All code merged to `main` branch
- [ ] No uncommitted changes
- [ ] All CI/CD checks passing
- [ ] Latest pull from remote

**Verification**:

```bash
# Check for uncommitted changes
git status

# Ensure on main branch
git branch --show-current

# Pull latest
git pull origin main

# Verify CI status
gh run list --branch main --limit 1
```

---

## 2. Environment Preparation

### 2.1 Supabase Production Project

- [ ] **Project created** in Supabase dashboard
- [ ] **Region selected** (choose closest to users)
- [ ] **Database password saved** securely
- [ ] **Project settings verified**:
  - [ ] Custom domain configured (if applicable)
  - [ ] Email templates customized
  - [ ] Auth providers enabled (Email/Password minimum)

**Supabase Project Settings to Verify**:

```bash
# Test connection to production project
npx supabase link --project-ref <YOUR_PROJECT_REF>

# Verify database is accessible
npx supabase db remote status
```

**Environment Variables to Collect**:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-role-key>  # Store securely, use only in CI/Workers
```

---

### 2.2 Cloudflare Setup

- [ ] **Cloudflare account verified**
- [ ] **Pages project created** via dashboard or CLI
  ```bash
  npx wrangler pages project create household-hub
  ```
- [ ] **Custom domain configured** (optional)
- [ ] **API token created** with correct permissions:
  - Account → Pages → Edit
  - Account → Workers Scripts → Edit

**Cloudflare Environment Variables**:

```env
CLOUDFLARE_API_TOKEN=<your-api-token>
CLOUDFLARE_ACCOUNT_ID=<your-account-id>
```

**Test Cloudflare Access**:

```bash
npx wrangler whoami
# Should show your email and account ID
```

---

### 2.3 GitHub Secrets Configuration

Add the following secrets to GitHub repository settings (`Settings` → `Secrets and variables` → `Actions`):

- [ ] `SUPABASE_URL` - Production Supabase URL
- [ ] `SUPABASE_ANON_KEY` - Production anon key (safe for client)
- [ ] `SUPABASE_SERVICE_KEY` - Service role key (admin, CI only)
- [ ] `SUPABASE_PROJECT_ID` - Project reference ID
- [ ] `CLOUDFLARE_API_TOKEN` - Pages deployment token
- [ ] `CLOUDFLARE_ACCOUNT_ID` - Your account ID
- [ ] `SENTRY_DSN` (optional) - Error tracking DSN
- [ ] `SENTRY_AUTH_TOKEN` (optional) - For sourcemap uploads

**Verification**:

```bash
# List configured secrets (won't show values)
gh secret list
```

---

## 3. Configuration Verification

### 3.1 Environment Files

- [ ] `.env.example` updated with all required variables
- [ ] `.env.local` configured for local development
- [ ] `.env.production` ready (or using GitHub Secrets)
- [ ] No secrets committed to repository

**Required Environment Variables**:

```env
# .env.production (example)
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_APP_URL=https://household-hub.pages.dev
VITE_SENTRY_DSN=<sentry-dsn>  # Optional
VITE_SENTRY_ENVIRONMENT=production
```

**Verification**:

```bash
# Check no .env files are tracked
git ls-files | grep "\.env$"
# Should return nothing or only .env.example

# Verify .gitignore includes .env
grep "\.env" .gitignore
```

---

### 3.2 Application Configuration

- [ ] `vite.config.ts` production-ready
  - [ ] Base URL set correctly
  - [ ] Build target set to modern browsers
  - [ ] Chunking strategy optimized
- [ ] `tsconfig.json` strict mode enabled
- [ ] `package.json` version bumped
- [ ] `CLAUDE.md` instructions up-to-date

**Key Vite Config Checks**:

```typescript
// vite.config.ts - Verify these settings
export default defineConfig({
  base: "/", // Or your subdirectory if applicable
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-router": ["@tanstack/react-router"],
          "vendor-query": ["@tanstack/react-query"],
        },
      },
    },
  },
});
```

---

### 3.3 Database Configuration

- [ ] All migrations files present in `supabase/migrations/`
- [ ] Migration files numbered sequentially
- [ ] No pending local changes
- [ ] RLS policies defined for all tables

**Verification**:

```bash
# List all migrations
ls -la supabase/migrations/

# Check for uncommitted migration changes
git status supabase/migrations/

# Count migrations (should match progress tracker)
ls supabase/migrations/*.sql | wc -l
# Expected: ~37 migrations (chunks 001-037)
```

**Critical Migrations to Verify**:

- [ ] `20251027075023_add_transfer_triggers.sql` (Chunk 017)
- [ ] `20251027130207_create_sync_queue.sql` (Chunk 022)
- [ ] `20251028032817_add_transaction_events.sql` (Chunk 028)
- [ ] `20251028033000_fix_events_rls_and_cleanup.sql` (Chunk 028 fixes)

---

## 4. Database Readiness

### 4.1 Local Database Verification

- [ ] Local Supabase running without errors
- [ ] All migrations applied successfully
- [ ] RLS policies active
- [ ] Seed data loaded (if applicable)

**Run Verification Suite**:

```bash
# Start local Supabase
npx supabase start

# Check status
npx supabase status

# Apply all migrations
npx supabase db push

# Verify RLS is enabled
npx supabase db remote rls check
```

---

### 4.2 Production Database Preparation

⚠️ **IMPORTANT**: Do NOT push migrations to production yet. This step only prepares and verifies locally.

- [ ] **Backup plan ready**: Document rollback SQL for critical changes
- [ ] **Migration dry-run completed**: Test migrations on staging database first
- [ ] **Data integrity checks prepared**: Queries to verify post-migration state
- [ ] **Downtime estimate calculated**: Zero-downtime or maintenance window?

**Pre-Migration Checklist**:

```sql
-- Test these queries on staging BEFORE production deployment

-- 1. Verify table counts match expectations
SELECT
  'transactions' as table_name, COUNT(*) as count FROM transactions
UNION ALL
SELECT 'accounts', COUNT(*) FROM accounts
UNION ALL
SELECT 'categories', COUNT(*) FROM categories
UNION ALL
SELECT 'budgets', COUNT(*) FROM budgets;

-- 2. Verify RLS is enabled on all tables
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
-- All should have rowsecurity = true

-- 3. Verify indexes exist (38 total expected per DATABASE.md)
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- 4. Verify critical triggers exist
SELECT event_object_table, trigger_name
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table;
```

**Rollback Plan Template**:

```sql
-- Example rollback for migration 20251028032817 (events table)
-- Save this before pushing migrations

-- Rollback step 1: Drop table
DROP TABLE IF EXISTS transaction_events CASCADE;

-- Rollback step 2: Drop function
DROP FUNCTION IF EXISTS cleanup_old_events();

-- Verify rollback successful
SELECT 'transaction_events' as table_exists FROM pg_tables WHERE tablename = 'transaction_events';
-- Should return 0 rows
```

---

### 4.3 RLS Policy Verification

Critical RLS policies must be active to prevent data leaks:

- [ ] **profiles table**: User can only see their own profile
- [ ] **accounts table**: Household-scoped + personal ownership enforced
- [ ] **transactions table**: Household-scoped visibility
- [ ] **categories table**: Household-scoped
- [ ] **budgets table**: Household-scoped
- [ ] **sync_queue table**: User-scoped (can only see own device queue)
- [ ] **transaction_events table**: Household-scoped (SELECT + INSERT only)
- [ ] **devices table**: User-scoped registration

**Test RLS Policies Locally**:

```sql
-- Connect as test user (not service role)
SET ROLE authenticated;

-- Test household scoping (should only see own household)
SELECT household_id, COUNT(*) as count
FROM transactions
GROUP BY household_id;
-- Should return only 1 household_id

-- Test personal account scoping (should see household + own personal)
SELECT id, name, scope, owner_user_id
FROM accounts;
-- Personal accounts should only show where owner_user_id = current_user_id

-- Reset to service role
RESET ROLE;
```

**Security Verification Queries**:

```sql
-- List all RLS policies
SELECT schemaname, tablename, policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Verify household_id function exists (critical for RLS)
SELECT proname, prosrc
FROM pg_proc
WHERE proname = 'get_user_household_id';
-- Should return 1 row with function definition
```

---

## 5. Build Verification

### 5.1 TypeScript Compilation

- [ ] No TypeScript errors
- [ ] No `any` types (except in explicitly allowed locations)
- [ ] All imports resolve correctly
- [ ] Generated route types up-to-date

**Run Type Checks**:

```bash
# Full TypeScript check
npm run type-check

# Expected output: "Found 0 errors"
```

**Common TypeScript Issues to Check**:

```typescript
// 1. Currency type safety (should use AmountCents)
// GOOD:
const amount: AmountCents = 150050;

// BAD:
const amount: number = 150050; // Should be AmountCents

// 2. Transaction types (should use type unions)
// GOOD:
const type: "income" | "expense" = "income";

// BAD:
const type: string = "income"; // Should be union type

// 3. Sync queue status (should use defined enum)
// GOOD:
const status: SyncQueueStatus = "queued";

// BAD:
const status: string = "queued"; // Should be SyncQueueStatus
```

---

### 5.2 Linting & Formatting

- [ ] ESLint passes with no errors
- [ ] Prettier formatting applied
- [ ] No console.log statements in production code
- [ ] No commented-out code blocks
- [ ] All TODO comments tracked

**Run Linting**:

```bash
# Run ESLint
npm run lint

# Fix auto-fixable issues
npm run lint:fix

# Check formatting
npm run format -- --check
```

**Manual Code Review Checklist**:

```bash
# Find console.log statements (should be none in production code)
grep -r "console\.log" src/

# Find TODO comments (should be tracked in issues)
grep -r "TODO" src/ | wc -l

# Find commented code blocks (should be removed)
grep -r "^[[:space:]]*//" src/ | head -20
```

---

### 5.3 Unit Tests

- [ ] All unit tests passing
- [ ] Coverage meets minimum thresholds
- [ ] Currency utility tests passing (59 tests from chunk 005-006)
- [ ] Event generation tests passing (12 tests from chunk 030)
- [ ] Conflict resolution tests passing (13 tests from chunk 033)

**Run Test Suite**:

```bash
# Run all unit tests
npm test

# Run with coverage
npm run test:coverage

# Expected results:
# - 100+ tests passing
# - Coverage: >80% lines
```

**Critical Test Suites**:

```bash
# Currency utilities (chunk 005-006)
npm test src/lib/currency.test.ts
# Expected: 59 tests passing

# Event generation (chunk 030)
npm test src/lib/event-generator.test.ts
# Expected: 12/13 tests (1 flaky IndexedDB test acceptable)

# Vector clocks (chunk 031)
npm test src/lib/vector-clocks.test.ts
# Expected: 19 tests passing

# Conflict resolution (chunk 033)
npm test src/lib/conflict-resolution.test.ts
# Expected: 13 tests passing
```

---

### 5.4 Build Output Verification

- [ ] Build completes without warnings
- [ ] Bundle size within budget (<200KB initial)
- [ ] No duplicate dependencies
- [ ] Code splitting configured
- [ ] Assets fingerprinted correctly

**Run Production Build**:

```bash
# Build for production
npm run build

# Check output
ls -lh dist/

# Analyze bundle (if bundlesize configured)
npm run bundlesize
```

**Bundle Size Targets** (per CLAUDE.md):

```
Initial bundle: <200KB (gzipped)
Vendor chunks: ~150KB
App chunk: ~50KB
```

**Verify Bundle Contents**:

```bash
# Check main bundle size
ls -lh dist/assets/*.js | head -5

# Expected output (approximate):
# vendor-react.*.js    ~60KB
# vendor-router.*.js   ~40KB
# vendor-query.*.js    ~35KB
# index.*.js           ~50KB
```

---

## 6. Security Pre-Flight

### 6.1 Authentication Configuration

- [ ] Supabase Auth enabled (Email/Password minimum)
- [ ] Email templates configured
- [ ] Redirect URLs whitelisted
- [ ] Password policies set (min 8 chars, complexity requirements)
- [ ] JWT secret rotation policy documented

**Verify Auth Settings in Supabase Dashboard**:

```
Settings → Authentication:
- ✓ Email/Password enabled
- ✓ Email confirmations enabled
- ✓ Password requirements: min 8 characters
- ✓ Redirect URLs: https://household-hub.pages.dev/**
```

**Test Authentication Flow**:

```bash
# Manual test checklist:
# 1. Sign up new user → should receive confirmation email
# 2. Confirm email → should redirect to app
# 3. Sign in → should receive JWT token
# 4. Sign out → token should be cleared
# 5. Password reset → should receive reset email
```

---

### 6.2 RLS Policies Active

- [ ] All tables have RLS enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- [ ] All policies tested with test users
- [ ] No service role leakage in client code
- [ ] Anon key used exclusively in frontend

**Verify RLS Configuration**:

```sql
-- All tables should return rowsecurity = true
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verify policies exist for each table
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

-- Expected policy counts (minimum):
-- profiles: 3 (SELECT, INSERT, UPDATE)
-- accounts: 3
-- transactions: 3
-- categories: 3
-- budgets: 3
-- sync_queue: 4 (includes DELETE)
-- transaction_events: 2 (SELECT, INSERT only - immutable)
-- devices: 3
```

**Test RLS Enforcement**:

```bash
# Create test users in Supabase dashboard
# User A: household_id = 1
# User B: household_id = 2

# Test with Supabase client:
# 1. Login as User A
# 2. Try to SELECT from transactions
#    → Should only see household_id = 1
# 3. Try to INSERT transaction with household_id = 2
#    → Should fail (RLS violation)
```

---

### 6.3 Secrets Management

- [ ] No secrets in code or config files
- [ ] `.env` files gitignored
- [ ] Service role key used ONLY in CI/Workers
- [ ] Anon key used in frontend (safe for public)
- [ ] API keys rotated (if applicable)

**Security Audit Commands**:

```bash
# 1. Check for hardcoded secrets
grep -r "sk_" src/  # Should find nothing
grep -r "service_role" src/  # Should find nothing

# 2. Verify .gitignore
grep "\.env" .gitignore  # Should exist

# 3. Check for tracked env files
git ls-files | grep "\.env$"  # Should only show .env.example

# 4. Verify no secrets in git history
git log --all --full-history --source --pickaxe-regex -S 'eyJ.*[A-Za-z0-9_-]{20,}'
# Should return empty (no JWT tokens in history)
```

**Secret Storage Checklist**:

- [ ] GitHub Secrets configured (see Section 2.3)
- [ ] Local `.env.local` file exists (NOT committed)
- [ ] Cloudflare Workers secrets set via Wrangler CLI (Phase B)
- [ ] Supabase service role key documented in secure location (password manager)

---

### 6.4 Content Security Policy

⏳ **TODO (Chunk 041-042)**: PWA deployment will add CSP headers

- [ ] CSP headers configured in Cloudflare Pages
- [ ] Inline scripts whitelisted if needed
- [ ] External domains whitelisted (Supabase, Sentry)

**Planned CSP Configuration** (to be added in chunk 041):

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' https://*.supabase.co;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io;
  font-src 'self' data:;
  frame-ancestors 'none';
```

---

## 7. Performance Validation

### 7.1 Lighthouse Baseline

⏳ **TODO (Chunk 045)**: E2E tests will include Lighthouse CI

- [ ] Lighthouse audit run locally
- [ ] Performance score ≥90
- [ ] Accessibility score ≥95
- [ ] Best Practices score ≥90
- [ ] SEO score ≥90

**Run Lighthouse Locally**:

```bash
# Build and preview
npm run build
npm run preview

# Run Lighthouse (Chrome DevTools or CLI)
npx lighthouse http://localhost:4173 --view

# Key metrics to verify:
# - First Contentful Paint: <1.5s
# - Time to Interactive: <3.5s
# - Total Blocking Time: <200ms
# - Largest Contentful Paint: <2.5s
# - Cumulative Layout Shift: <0.1
```

**Performance Budget Verification**:

```json
// package.json - bundlesize config
{
  "bundlesize": [
    {
      "path": "./dist/assets/index-*.js",
      "maxSize": "50 KB"
    },
    {
      "path": "./dist/assets/vendor-*.js",
      "maxSize": "150 KB"
    }
  ]
}
```

---

### 7.2 Bundle Analysis

- [ ] No duplicate dependencies
- [ ] Tree-shaking effective
- [ ] Dynamic imports for routes
- [ ] Heavy libraries code-split

**Analyze Bundle**:

```bash
# Build with analysis
npm run build -- --analyze

# Or use vite-bundle-visualizer
npx vite-bundle-visualizer
```

**Red Flags to Check**:

- Multiple versions of same package (e.g., two React versions)
- Entire libraries imported when only partial usage (e.g., lodash)
- Non-code-split components (all routes in main bundle)

---

### 7.3 Database Query Performance

- [ ] No N+1 queries in codebase
- [ ] All critical queries use indexes
- [ ] Transfer exclusion filters present in analytics

**Critical Query Patterns to Verify** (per DATABASE.md lines 1161-1346):

```typescript
// 1. Transaction list with filters - uses idx_transactions_account_date
const { data } = await supabase
  .from("transactions")
  .select("*")
  .eq("account_id", accountId)
  .gte("date", startDate)
  .lte("date", endDate)
  .order("date", { ascending: false });

// 2. Category analytics - uses idx_transactions_category_date
const { data } = await supabase
  .from("transactions")
  .select("amount_cents, type")
  .eq("category_id", categoryId)
  .is("transfer_group_id", null) // CRITICAL: exclude transfers
  .gte("date", monthStart)
  .lte("date", monthEnd);

// 3. Budget vs actual - uses idx_budgets_household_month
const { data } = await supabase
  .from("budgets")
  .select("*, categories(*)")
  .eq("household_id", householdId)
  .eq("month_key", "2025-01")
  .single();
```

**Verify Indexes Exist**:

```sql
-- Critical indexes from DATABASE.md (38 total)
SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Key indexes to verify:
-- transactions:
--   - idx_transactions_household_date
--   - idx_transactions_account_date
--   - idx_transactions_category_date
--   - idx_transactions_transfer_group
-- budgets:
--   - idx_budgets_household_month
-- sync_queue:
--   - idx_sync_queue_device_status
--   - idx_sync_queue_status_pending (partial)
```

---

## 8. Documentation Review

### 8.1 User-Facing Documentation

- [ ] README.md updated with deployment info
- [ ] CLAUDE.md reflects current architecture
- [ ] API documentation current (if applicable)
- [ ] User guide available (optional for MVP)

**README.md Checklist**:

- [ ] Project description
- [ ] Tech stack listed
- [ ] Setup instructions
- [ ] Deployment instructions
- [ ] Contributing guidelines
- [ ] License information

---

### 8.2 Developer Documentation

- [ ] CLAUDE.md up-to-date with latest decisions
- [ ] DATABASE.md reflects all migrations
- [ ] DECISIONS.md includes all architectural choices
- [ ] progress-tracker.md shows current status

**Verify Documentation Consistency**:

```bash
# Check last updated dates
head -20 CLAUDE.md | grep "Last Updated"
head -20 DATABASE.md | grep "Last Updated"

# Verify decision count matches
grep "^## Decision" docs/initial\ plan/DECISIONS.md | wc -l
# Expected: ~85 decisions (last is Decision #84)
```

---

### 8.3 Runbook & Procedures

⏳ **TODO**: Will be finalized in POST-DEPLOYMENT.md

- [ ] Incident response procedures defined
- [ ] Rollback procedures documented
- [ ] Backup restoration tested
- [ ] Monitoring alert thresholds set

---

## 9. Dependency Audit

### 9.1 Security Vulnerabilities

- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] Outdated packages reviewed
- [ ] Breaking changes assessed

**Run Security Audit**:

```bash
# Check for vulnerabilities
npm audit

# Fix automatically if possible
npm audit fix

# For unfixable issues, document and assess risk
npm audit --json > audit-report.json
```

**Acceptable Vulnerabilities**:

- Low severity in dev dependencies (e.g., test utilities)
- False positives (verify with `npm audit --json`)

**Unacceptable Vulnerabilities**:

- High/Critical in production dependencies
- Auth/security-related packages
- Database connection libraries

---

### 9.2 Dependency Updates

- [ ] All dependencies on supported versions
- [ ] No deprecated packages
- [ ] Major version updates tested

**Check Outdated Packages**:

```bash
# List outdated
npm outdated

# Check for deprecated packages
npm deprecate --list  # (not a real command, manual check needed)
```

**High-Priority Updates**:

- React (currently on v19)
- TypeScript (currently on v5.9)
- Supabase JS client
- TanStack Router/Query

---

## 10. Team Communication

### 10.1 Deployment Window

- [ ] Deployment time scheduled
- [ ] Team members notified
- [ ] Maintenance window announced (if applicable)
- [ ] Rollback plan communicated

**Deployment Communication Template**:

```
📢 Deployment Notice

**When**: [Date/Time] [Timezone]
**Duration**: ~30 minutes (estimated)
**Impact**: Brief downtime during database migrations (<5 min)
**Rollback Plan**: Cloudflare Pages instant rollback + DB restore from backup

**Pre-Deployment Checklist**: ✅ Complete
**Estimated Downtime**: <5 minutes
**Monitoring**: Sentry + Cloudflare Analytics active
```

---

### 10.2 Stakeholder Notification

- [ ] Product owner informed
- [ ] QA team ready for smoke tests
- [ ] Support team briefed on new features
- [ ] Marketing notified (if public launch)

---

## 11. Phase B Readiness (Chunks 038-046)

These sections will be completed as Phase B features are implemented.

### 11.1 R2 Backup Readiness ⏳ TODO (Chunks 038-040)

**Chunk 038: R2 Setup**

- [ ] R2 bucket created (`household-backups`)
- [ ] CORS policy configured
- [ ] Access keys generated and stored
- [ ] Bucket lifecycle rules set (optional)

**Chunk 039: Backup Encryption**

- [ ] Encryption key derivation implemented
- [ ] AES-GCM encryption tested locally
- [ ] Decryption flow verified
- [ ] Key rotation policy documented

**Chunk 040: Backup Worker**

- [ ] Cloudflare Worker deployed
- [ ] Cron schedule configured (daily backups)
- [ ] Backup format validated
- [ ] Restoration tested on staging

**Verification Commands** (to be added):

```bash
# Test R2 access
wrangler r2 bucket list
# Should show "household-backups"

# Test backup worker
wrangler tail [worker-name]
# Trigger manual backup and verify logs
```

---

### 11.2 PWA Readiness ⏳ TODO (Chunk 041)

**Chunk 041: PWA Manifest**

- [ ] `manifest.json` created with correct icons
- [ ] Icons generated (192x192, 512x512)
- [ ] Screenshots prepared for app stores
- [ ] Theme colors defined
- [ ] Shortcuts configured

**Verification**:

```bash
# Check manifest validity
npx pwa-asset-generator --help
# Generate icons from source SVG

# Verify manifest in Chrome DevTools:
# Application → Manifest → No errors
```

---

### 11.3 Service Worker Readiness ⏳ TODO (Chunk 042)

**Chunk 042: Service Worker**

- [ ] Workbox integrated in Vite config
- [ ] Cache strategies defined
- [ ] Offline fallback page created
- [ ] Background sync registered (iOS fallback)
- [ ] Cache invalidation logic tested

**Critical Cache Policy** (sensitive data):

```javascript
// NO caching for:
// - /api/transactions
// - /api/accounts
// - /api/budgets
// - /auth/*

// Aggressive caching for:
// - Static assets (JS, CSS, images)
// - Public routes
```

---

### 11.4 Push Notifications ⏳ TODO (Chunk 043)

**Chunk 043: Push Notifications**

- [ ] VAPID keys generated
- [ ] Push subscription flow implemented
- [ ] Notification permissions requested
- [ ] Budget alert logic tested
- [ ] Notification worker deployed

**Verification**:

```bash
# Generate VAPID keys
npx web-push generate-vapid-keys

# Test notification
# (Browser → DevTools → Application → Service Workers → Push)
```

---

### 11.5 E2E Tests ⏳ TODO (Chunk 045)

**Chunk 045: E2E Tests**

- [ ] Playwright configured
- [ ] Critical user flows tested
  - [ ] Sign up → Create account → Add transaction
  - [ ] Offline mode → Create transaction → Sync
  - [ ] Two devices → Edit same transaction → Conflict resolution
- [ ] Accessibility tests passing (axe-core)
- [ ] Lighthouse CI integrated in GitHub Actions

**E2E Test Scenarios**:

```bash
# Run E2E tests
npm run test:e2e

# Run with UI
npm run test:e2e:ui

# Expected: All critical paths passing
```

---

## Final Pre-Deployment Checklist

Run through this checklist immediately before initiating deployment:

### Code Quality

- [ ] All tests passing (`npm test`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] No console errors in dev mode

### Security

- [ ] RLS policies active on all tables
- [ ] No secrets in code or git history
- [ ] Service role key used only in CI/Workers
- [ ] Anon key used in frontend

### Database

- [ ] All migrations numbered and committed
- [ ] Local migrations match production plan
- [ ] Rollback SQL prepared for critical changes
- [ ] RLS policies tested with multiple users

### Infrastructure

- [ ] Supabase production project ready
- [ ] Cloudflare Pages project created
- [ ] GitHub Secrets configured
- [ ] Environment variables verified

### Documentation

- [ ] CLAUDE.md current
- [ ] progress-tracker.md updated
- [ ] Deployment window communicated
- [ ] Rollback plan documented

### Monitoring

- [ ] Sentry configured (optional)
- [ ] Cloudflare Analytics enabled
- [ ] Health check endpoint ready (Phase B)

---

## Next Steps

Once all checklists are complete:

1. ✅ Review this document with team
2. ➡️ Proceed to **DEPLOYMENT.md** for step-by-step deployment
3. ➡️ After deployment, use **POST-DEPLOYMENT.md** for verification

---

**Document Status**: Living document, will be updated as chunks 038-046 are completed.

**Last Updated**: 2025-10-29 (Created)
**Next Update**: After chunk 038 (R2 setup)
