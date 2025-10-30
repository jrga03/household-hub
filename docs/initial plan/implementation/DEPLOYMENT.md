# Deployment Playbook

> **Purpose**: Step-by-step deployment procedures for Household Hub. This living document covers Phase A (core app) and will be expanded with Phase B features (R2, PWA, Workers) as chunks 038-046 are completed.

**Last Updated**: 2025-10-29 (Restructured from docs/initial plan/DEPLOYMENT.md)
**Status**: ✅ Phase A Procedures Ready | ⏳ Phase B Procedures Pending

---

## Quick Reference

| Phase   | Component               | Time   | Critical?   | Status        |
| ------- | ----------------------- | ------ | ----------- | ------------- |
| Setup   | Supabase Project        | 15 min | ✅ Yes      | Ready         |
| Setup   | Cloudflare Pages        | 10 min | ✅ Yes      | Ready         |
| Setup   | GitHub Secrets          | 5 min  | ✅ Yes      | Ready         |
| Deploy  | Database Migrations     | 5 min  | ✅ Yes      | Ready         |
| Deploy  | Build & Deploy Frontend | 10 min | ✅ Yes      | Ready         |
| Verify  | Smoke Tests             | 15 min | ✅ Yes      | Ready         |
| Phase B | R2 Setup                | 20 min | ⏳ Optional | Chunk 038     |
| Phase B | PWA Deployment          | 15 min | ⏳ Optional | Chunk 041-042 |
| Phase B | Push Setup              | 20 min | ⏳ Optional | Chunk 043     |

**Total Time (Phase A)**: ~60 minutes
**Total Time (Phase B)**: +55 minutes

---

## Table of Contents

**Before You Start**: [Pre-Deployment Checklist](./PRE-DEPLOYMENT.md)

### Phase A Deployment (Chunks 001-037)

1. [Phase 1: Supabase Setup](#phase-1-supabase-setup-15-min)
2. [Phase 2: Cloudflare Setup](#phase-2-cloudflare-setup-10-min)
3. [Phase 3: GitHub Configuration](#phase-3-github-configuration-5-min)
4. [Phase 4: Database Migrations](#phase-4-database-migrations-5-min)
5. [Phase 5: Build & Deploy](#phase-5-build--deploy-10-min)
6. [Phase 6: Smoke Tests](#phase-6-smoke-tests-15-min)
7. [Rollback Procedures](#rollback-procedures)

### Phase B Deployment (Chunks 038-046)

8. [Phase 7: R2 Backup Setup ⏳](#phase-7-r2-backup-setup--chunks-038-040)
9. [Phase 8: PWA Deployment ⏳](#phase-8-pwa-deployment--chunks-041-042)
10. [Phase 9: Push Notifications ⏳](#phase-9-push-notifications--chunk-043)
11. [Phase 10: Monitoring & Analytics ⏳](#phase-10-monitoring--analytics--chunk-046)

### Reference

12. [Troubleshooting](#troubleshooting)
13. [Environment Variables Reference](#environment-variables-reference)
14. [Health Checks](#health-checks)

---

## Prerequisites

⚠️ **STOP**: Before proceeding, complete [PRE-DEPLOYMENT.md](./PRE-DEPLOYMENT.md) checklist.

**Required**:

- [ ] All PRE-DEPLOYMENT.md checklists completed
- [ ] Team notified of deployment window
- [ ] Rollback plan reviewed
- [ ] Backup of current production state (if redeploying)

---

# Phase A Deployment (Core App)

## Phase 1: Supabase Setup (15 min)

### 1.1 Create Production Project

1. Navigate to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Configure project:
   - **Name**: `household-hub-prod`
   - **Database Password**: Generate strong password (save securely)
   - **Region**: Select closest to target users
   - **Pricing Plan**: Free (sufficient for MVP)

4. **Wait for provisioning** (~2 minutes)

**Success Criteria**: Project status shows "Healthy" in dashboard

---

### 1.2 Collect Connection Details

From project settings:

```bash
# Settings → API
SUPABASE_URL=https://[your-project-ref].supabase.co
SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_KEY=[your-service-role-key]

# Settings → General
SUPABASE_PROJECT_ID=[project-ref]
```

⚠️ **Security Note**:

- `SUPABASE_ANON_KEY`: Safe for client (use in frontend)
- `SUPABASE_SERVICE_KEY`: NEVER expose to client (CI/Workers only)

**Action**: Save these values to password manager and GitHub Secrets (Phase 3)

---

### 1.3 Configure Authentication

1. Go to **Authentication → Providers**
2. Enable **Email** provider:
   - Toggle: ✅ Enable Email provider
   - **Confirm email**: ✅ Enabled (recommended for production)
   - **Double confirm email**: Optional (extra security)

3. Configure **Email Templates**:
   - Go to **Authentication → Email Templates**
   - Customize templates (optional but recommended):
     - Confirmation email
     - Magic link email
     - Password reset email

4. Set **Redirect URLs**:
   - Go to **Authentication → URL Configuration**
   - Add site URL: `https://household-hub.pages.dev`
   - Add redirect URLs:
     ```
     https://household-hub.pages.dev/**
     https://*.household-hub.pages.dev/**
     ```
   - (Add custom domain if applicable)

**Verification**:

```bash
# Test auth endpoint
curl https://[your-project-ref].supabase.co/auth/v1/health
# Expected: {"status": "ok"}
```

---

### 1.4 Configure Realtime (Optional but Recommended)

1. Go to **Database → Replication**
2. Enable replication for tables:
   - [x] `transactions`
   - [x] `accounts`
   - [x] `categories`
   - [x] `budgets`
   - [ ] `sync_queue` (not needed for realtime)
   - [ ] `transaction_events` (append-only, not needed)

**Why**: Enables real-time updates across devices without polling

**Verification**: Tables show "Realtime enabled" badge in dashboard

---

## Phase 2: Cloudflare Setup (10 min)

### 2.1 Create Pages Project

**Option A: Via Wrangler CLI** (recommended)

```bash
# Login to Cloudflare
npx wrangler login
# Opens browser for authentication

# Create Pages project
npx wrangler pages project create household-hub

# Expected output:
# ✅ Successfully created the 'household-hub' project.
# 🌎 View your project at: https://household-hub.pages.dev
```

**Option B: Via Dashboard**

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages**
3. Click **Create application** → **Pages** → **Connect to Git**
4. Skip Git connection (we'll deploy via CLI)
5. Name: `household-hub`

**Success Criteria**: Project visible in Cloudflare Pages dashboard

---

### 2.2 Configure Build Settings

Create `wrangler.toml` in project root (if not exists):

```toml
# wrangler.toml
name = "household-hub"
compatibility_date = "2025-01-01"
pages_build_output_dir = "dist"

# Production environment variables (non-sensitive only)
[env.production]
vars = {}  # Sensitive vars set via GitHub Secrets

# Redirects for SPA routing
[[redirects]]
from = "/*"
to = "/index.html"
status = 200

# Headers for security (Phase A minimal, enhanced in Phase B)
[[headers]]
for = "/*"
[headers.values]
X-Frame-Options = "DENY"
X-Content-Type-Options = "nosniff"
Referrer-Policy = "strict-origin-when-cross-origin"
```

**Commit this file**:

```bash
git add wrangler.toml
git commit -m "feat: add Cloudflare Pages configuration"
git push origin main
```

---

### 2.3 Get Cloudflare Credentials

**Account ID**:

```bash
npx wrangler whoami
# Output shows Account ID
```

**API Token**:

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use template: **Edit Cloudflare Workers**
4. Permissions:
   - Account → Workers Scripts → Edit
   - Account → Account Settings → Read
   - Zone → Workers Routes → Edit (if using custom domain)
5. Create token and **save securely** (shown only once)

**Verification**:

```bash
# Test API token
export CLOUDFLARE_API_TOKEN="your-token"
npx wrangler whoami
# Should show your account details
```

---

## Phase 3: GitHub Configuration (5 min)

### 3.1 Add Repository Secrets

Navigate to: `https://github.com/[YOUR_USERNAME]/household-hub/settings/secrets/actions`

Add these secrets:

| Secret Name             | Value                       | Where to Find                            |
| ----------------------- | --------------------------- | ---------------------------------------- |
| `SUPABASE_URL`          | `https://[ref].supabase.co` | Supabase → Settings → API                |
| `SUPABASE_ANON_KEY`     | `eyJ...`                    | Supabase → Settings → API                |
| `SUPABASE_SERVICE_KEY`  | `eyJ...`                    | Supabase → Settings → API (service_role) |
| `SUPABASE_PROJECT_ID`   | `[project-ref]`             | Supabase → Settings → General            |
| `CLOUDFLARE_API_TOKEN`  | `[token]`                   | From Phase 2.3                           |
| `CLOUDFLARE_ACCOUNT_ID` | `[account-id]`              | From Phase 2.3                           |
| `SENTRY_DSN` (optional) | `https://...`               | Sentry dashboard                         |

**Verification**:

```bash
# List secrets (won't show values)
gh secret list

# Expected output (7-8 secrets):
# SUPABASE_URL
# SUPABASE_ANON_KEY
# SUPABASE_SERVICE_KEY
# SUPABASE_PROJECT_ID
# CLOUDFLARE_API_TOKEN
# CLOUDFLARE_ACCOUNT_ID
# SENTRY_DSN
```

---

### 3.2 Verify GitHub Actions Workflow

Check `.github/workflows/deploy.yml` exists with correct configuration:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint
      - run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci

      - name: Build
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: npm run build

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: household-hub
          directory: dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}
```

**If file is missing or incorrect**: Copy from above and commit

---

## Phase 4: Database Migrations (5 min)

⚠️ **CRITICAL**: This step applies schema changes to production database. **Have rollback plan ready**.

### 4.1 Link to Production Project

```bash
# Link Supabase CLI to production
npx supabase link --project-ref [YOUR_PROJECT_ID]

# Verify link
npx supabase projects list
# Your production project should show as linked
```

---

### 4.2 Review Pending Migrations

```bash
# Check what migrations will be applied
npx supabase db diff --linked

# List all migration files
ls -1 supabase/migrations/*.sql

# Expected: ~37 migration files from chunks 001-037
```

**Critical Migrations** (verify these exist):

- `20251027075023_add_transfer_triggers.sql` (Transfer integrity)
- `20251027130207_create_sync_queue.sql` (Offline sync)
- `20251028032817_add_transaction_events.sql` (Event sourcing)
- `20251028033000_fix_events_rls_and_cleanup.sql` (RLS fixes)

---

### 4.3 Apply Migrations

⚠️ **BACKUP CHECKPOINT**: If this is a re-deployment, backup production database first:

```bash
# Create backup (via Supabase dashboard)
# Settings → Database → Backups → Create backup now
```

**Apply migrations**:

```bash
# Push all migrations to production
npx supabase db push --linked

# Expected output:
# Applying migration 20251024000000_...
# Applying migration 20251027075023_...
# ...
# ✅ All migrations applied successfully
```

**If errors occur**:

1. **STOP** - do not continue
2. Check error message
3. Verify local migrations work: `npx supabase db reset`
4. If schema conflict, see [Troubleshooting](#troubleshooting)

---

### 4.4 Verify Migration Success

```bash
# Check database status
npx supabase db remote status --linked

# Run verification queries
npx supabase db execute --linked "
  SELECT schemaname, tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
"

# All tables should have rowsecurity = true
```

**Manual Verification in Supabase Dashboard**:

1. Go to **Table Editor**
2. Verify tables exist:
   - [x] profiles
   - [x] devices
   - [x] accounts
   - [x] categories
   - [x] transactions
   - [x] budgets
   - [x] sync_queue
   - [x] transaction_events

3. Click any table → **View Policies**
4. Verify RLS policies are active

**Success Criteria**: All 8 tables exist with RLS enabled

---

## Phase 5: Build & Deploy (10 min)

### 5.1 Trigger Deployment via Git Push

**Option A: Trigger via Push** (recommended)

```bash
# Ensure all changes committed
git status

# Tag release (optional but recommended)
git tag -a v1.0.0 -m "Phase A deployment: Chunks 001-037 complete"

# Push to trigger GitHub Actions
git push origin main
git push origin v1.0.0
```

**Option B: Manual Deployment via CLI**

```bash
# Build locally
npm run build

# Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name household-hub
```

---

### 5.2 Monitor Deployment

**GitHub Actions**:

1. Go to: `https://github.com/[USERNAME]/household-hub/actions`
2. Watch latest workflow run
3. Expected stages:
   - ✅ test (type-check, lint, unit tests)
   - ✅ deploy (build + Cloudflare Pages deployment)

**Estimated time**: 3-5 minutes

**Cloudflare Dashboard**:

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **household-hub**
3. See deployment progress

---

### 5.3 Verify Build Output

Once deployment completes:

```bash
# Get deployment URL from GitHub Actions logs or Cloudflare dashboard
DEPLOY_URL="https://household-hub.pages.dev"

# Test deployment is live
curl -I $DEPLOY_URL
# Expected: HTTP/2 200
```

**Success Criteria**:

- GitHub Actions: ✅ All checks passed
- Cloudflare Pages: Shows "Active" deployment
- URL returns 200 status code

---

## Phase 6: Smoke Tests (15 min)

⚠️ **CRITICAL**: Do not announce deployment until these tests pass.

### 6.1 Basic Connectivity

```bash
# Set deployment URL
DEPLOY_URL="https://household-hub.pages.dev"

# Test home page
curl -I $DEPLOY_URL
# Expected: HTTP/2 200

# Test API health (via Supabase)
curl https://[your-project-ref].supabase.co/rest/v1/
# Expected: 200 with OpenAPI spec
```

---

### 6.2 Authentication Flow

**Manual Test Checklist**:

1. **Sign Up**:
   - [ ] Navigate to `$DEPLOY_URL/signup`
   - [ ] Enter email + password (min 8 chars)
   - [ ] Submit form
   - [ ] Expected: "Check your email for confirmation" message
   - [ ] Check email inbox
   - [ ] Click confirmation link
   - [ ] Expected: Redirect to app, logged in

2. **Sign In**:
   - [ ] Navigate to `$DEPLOY_URL/login`
   - [ ] Enter credentials
   - [ ] Expected: Redirect to dashboard

3. **Sign Out**:
   - [ ] Click "Sign Out" button
   - [ ] Expected: Redirect to landing page
   - [ ] Try accessing `/dashboard` while logged out
   - [ ] Expected: Redirect to login

**Success Criteria**: All auth flows work without errors

---

### 6.3 Core Functionality

**Test critical user paths**:

1. **Create Account**:
   - [ ] Navigate to `/accounts`
   - [ ] Click "Add Account"
   - [ ] Fill form (name, type, initial balance)
   - [ ] Submit
   - [ ] Expected: Account appears in list with correct balance

2. **Create Transaction**:
   - [ ] Navigate to `/transactions`
   - [ ] Click "Add Transaction"
   - [ ] Fill form (amount, account, category, date)
   - [ ] Submit
   - [ ] Expected: Transaction appears in list
   - [ ] Expected: Account balance updates

3. **Offline Mode**:
   - [ ] Open DevTools → Network tab
   - [ ] Toggle "Offline" mode
   - [ ] Create new transaction
   - [ ] Expected: Transaction saved locally
   - [ ] Expected: Sync indicator shows "Offline"
   - [ ] Toggle online
   - [ ] Expected: Transaction syncs to Supabase
   - [ ] Expected: Sync indicator shows "Synced"

4. **CSV Export**:
   - [ ] Navigate to `/settings`
   - [ ] Click "Export Transactions"
   - [ ] Expected: CSV file downloads
   - [ ] Open CSV in Excel/Numbers
   - [ ] Expected: Data formatted correctly (₱ amounts as plain decimals)

---

### 6.4 Performance Verification

**Lighthouse Audit**:

```bash
# Run Lighthouse on production URL
npx lighthouse https://household-hub.pages.dev --view

# Target metrics (from PRE-DEPLOYMENT.md):
# - Performance: ≥90
# - Accessibility: ≥95
# - Best Practices: ≥90
# - SEO: ≥90
# - FCP: <1.5s
# - LCP: <2.5s
# - TBT: <200ms
```

**Acceptance Criteria**:

- Performance ≥85 (acceptable for MVP with data)
- Accessibility ≥95 (critical)
- No console errors
- No 404 errors in Network tab

---

### 6.5 Security Verification

**Browser DevTools Checks**:

1. **Open DevTools → Console**:
   - [ ] No errors or warnings
   - [ ] No exposed secrets in logs

2. **Network Tab**:
   - [ ] All API requests go to correct Supabase URL
   - [ ] Authorization headers present on protected requests
   - [ ] No service_role key in request headers (only anon key)

3. **Application Tab → Local Storage**:
   - [ ] Supabase auth token present
   - [ ] No plaintext sensitive data stored

4. **Headers Check**:
   ```bash
   curl -I https://household-hub.pages.dev
   # Verify presence of:
   # - X-Frame-Options: DENY
   # - X-Content-Type-Options: nosniff
   # - Referrer-Policy: strict-origin-when-cross-origin
   ```

---

### 6.6 Data Integrity

**Verify RLS is working**:

1. Create test user A (email: testa@example.com)
2. Create test user B (email: testb@example.com)
3. Log in as User A, create transaction
4. Log in as User B
5. **Expected**: Cannot see User A's transaction (different households)

**Database Query Verification**:

```sql
-- Run in Supabase SQL Editor (authenticated as test user)
-- Should only see own household data
SELECT household_id, COUNT(*) as count
FROM transactions
GROUP BY household_id;

-- Expected: Only 1 row (user's household)
```

---

## Phase 7: R2 Backup Setup ⏸️ (Chunks 038-040)

**Status**: ⏸️ **DEFERRED - Implement After Core Deployment**
**Time**: 20 minutes
**Prerequisites**: Phase A deployed successfully, Cloudflare account created

### Why Deferred?

R2 backups (chunks 038-040) are **Phase B enhancements** that:

✅ **Current backup solution**: Manual CSV export (chunks 036-037) provides sufficient backup capability for initial deployment
✅ **Not blocking**: R2 is optional infrastructure for automated cloud backups
✅ **Better with production**: Requires production Supabase JWT secrets and deployed infrastructure
✅ **Can be added later**: Implement after Phase A is stable and users are testing

**Decision Context**: Per Decision #83, encrypted automated backups are Phase B features. Manual export satisfies MVP backup requirements.

### When to Implement

Implement R2 backups AFTER successful Phase A deployment when:

1. ✅ Core app deployed and stable (Phase 1-6 complete)
2. ✅ Users actively testing the application
3. ✅ Ready to add automated cloud backups
4. ✅ Cloudflare account provisioned

**Recommended Timeline**: 1-2 weeks after initial deployment

---

### Implementation Guide

**For complete step-by-step instructions, see**: [`docs/implementation/deployment/r2-worker-deployment.md`](./deployment/r2-worker-deployment.md)

#### Quick Overview (20 minutes)

**Step 1: Cloudflare Setup (5 min)**

```bash
# Login to Cloudflare
npx wrangler login

# Create R2 bucket (via dashboard or CLI)
npx wrangler r2 bucket create household-hub-backups-prod

# Create KV namespace for JWT caching
npx wrangler kv:namespace create "JWT_CACHE"
npx wrangler kv:namespace create "JWT_CACHE" --preview
```

**Step 2: Get Production JWT Secret (2 min)**

1. Go to Supabase Dashboard → Settings → API
2. Copy **JWT Secret** (NOT anon key)
3. Save temporarily for Worker configuration

**Step 3: Initialize Worker Project (5 min)**

```bash
cd workers/r2-proxy
npm install jose @cloudflare/workers-types

# Set JWT secret
npx wrangler secret put SUPABASE_JWT_SECRET
# Paste JWT secret when prompted
```

**Step 4: Configure wrangler.toml (2 min)**

Update `workers/r2-proxy/wrangler.toml` with production values:

```toml
name = "household-hub-r2-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-15"

[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "household-hub-backups-prod"

[[kv_namespaces]]
binding = "JWT_CACHE"
id = "YOUR_KV_NAMESPACE_ID"         # From step 1
preview_id = "YOUR_PREVIEW_KV_ID"   # From step 1

[vars]
SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"  # Production URL
```

**Step 5: Test Locally (3 min)**

```bash
# Run Worker locally (can reach localhost for pre-production testing)
npx wrangler dev

# Test in another terminal
curl http://localhost:8787/api/backup/list \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected: {"backups": []}
```

**Step 6: Deploy to Production (3 min)**

```bash
# Deploy Worker
npx wrangler deploy

# Test production endpoint
curl https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev/api/backup/list \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Expected: {"backups": []}
```

#### Verification Checklist

After deployment, verify:

- [ ] Worker responds to all 5 endpoints (upload, upload-direct, download, list, delete)
- [ ] JWT validation rejects invalid tokens (401)
- [ ] User-scoped access prevents cross-user access (403)
- [ ] CORS headers allow production domain
- [ ] R2 bindings functional (can list/upload/download)
- [ ] KV caching operational (JWT verification logs cached)

#### Rollback Procedure

If issues occur:

```bash
# 1. Check Worker logs
npx wrangler tail

# 2. Rollback to previous Worker version (if needed)
npx wrangler rollback

# 3. Disable Worker (emergency)
npx wrangler delete household-hub-r2-proxy

# App continues using CSV export (chunks 036-037)
```

---

### Implementation Files

When ready to implement, all code is documented in:

- **Chunk 038 Instructions**: `docs/implementation/chunks/038-r2-setup/instructions.md`
- **Complete Deployment Guide**: `docs/implementation/deployment/r2-worker-deployment.md`
- **Troubleshooting**: `docs/implementation/chunks/038-r2-setup/troubleshooting.md`
- **Checkpoint Tests**: `docs/implementation/chunks/038-r2-setup/checkpoint.md`

**Worker Code** (5 files to create):

1. `workers/r2-proxy/src/types.ts` - TypeScript interfaces
2. `workers/r2-proxy/src/auth.ts` - JWT validation with Supabase
3. `workers/r2-proxy/src/handlers.ts` - 5 endpoint handlers
4. `workers/r2-proxy/src/index.ts` - Main Worker entry
5. `workers/r2-proxy/wrangler.toml` - Configuration

---

### Cost Considerations

**Cloudflare R2 Free Tier** (sufficient for most households):

- **Storage**: 10GB free
- **Class A operations**: 1M/month (writes, lists)
- **Class B operations**: 10M/month (reads)
- **Egress**: Free (no bandwidth charges)

**Typical household usage**:

- Daily backup: ~5MB compressed
- Monthly storage: ~150MB
- Annual storage: ~1.8GB
- **Cost**: $0 (within free tier) ✅

---

### Security Notes

When implementing:

- ✅ **JWT Secret**: Rotate if exposed, never commit to Git
- ✅ **CORS**: Restrict to production domain (not wildcard)
- ✅ **User Scoping**: All paths prefixed with `backups/{userId}/`
- ✅ **Encryption**: Chunks 039-040 add AES-GCM encryption before upload
- ✅ **Rate Limiting**: Consider adding Durable Objects-based throttling

---

### Next Steps After R2 Setup

Once R2 infrastructure is deployed:

1. **Chunk 039**: Implement client-side backup encryption (AES-GCM with WebCrypto)
2. **Chunk 040**: Build BackupManager and RestoreManager UI
3. **Test**: Verify full backup/restore cycle with encryption

---

## Phase 8: PWA Deployment ⏳ (Chunks 041-042)

⏳ **TODO**: Complete after chunk 041-042 implementation

### 8.1 PWA Manifest (Chunk 041)

**Files to create**:

- `public/manifest.json` - PWA configuration
- `public/icon-192.png` - App icon (192x192)
- `public/icon-512.png` - App icon (512x512)
- `public/screenshots/*.png` - App store screenshots

**Deployment**:

```bash
# Build includes manifest automatically
npm run build

# Verify manifest
curl https://household-hub.pages.dev/manifest.json
```

---

### 8.2 Service Worker (Chunk 042)

**Files to create**:

- `public/sw.js` - Service worker with Workbox
- Cache strategies for offline-first

**Deployment verification**:

```bash
# Check service worker registered
# Browser DevTools → Application → Service Workers
# Should show "activated and running"
```

---

## Phase 9: Push Notifications ⏳ (Chunk 043)

⏳ **TODO**: Complete after chunk 043 implementation

### 9.1 VAPID Keys Setup

```bash
# Generate VAPID keys
npx web-push generate-vapid-keys

# Store in Cloudflare Workers secrets
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

---

### 9.2 Deploy Notification Worker

```bash
npx wrangler deploy workers/push-worker.ts
```

**Test notification**:

```bash
# Trigger test notification via worker
curl -X POST https://push-worker.[subdomain].workers.dev/test \
  -H "Authorization: Bearer [test-token]"
```

---

## Phase 10: Monitoring & Analytics ⏳ (Chunk 046)

⏳ **TODO**: Enhanced monitoring setup pending

### 10.1 Sentry Setup (Optional)

**Already configured** (from chunk 001):

- `src/lib/sentry.ts` - Error tracking
- GitHub Secret: `SENTRY_DSN`

**Verification**:

```bash
# Trigger test error
# In browser console:
throw new Error("Test Sentry integration");

# Check Sentry dashboard for error
```

---

### 10.2 Cloudflare Analytics

**Enabled by default** for Pages projects

**View analytics**:

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **household-hub**
3. Click **Analytics** tab

**Metrics available**:

- Requests per day
- Bandwidth usage
- Cache hit ratio
- Geographic distribution

---

## Rollback Procedures

### Emergency Rollback (< 5 minutes)

**If deployment fails or critical bugs found**:

#### 1. Rollback Frontend (Instant)

```bash
# Option A: Via Cloudflare Dashboard (fastest)
# 1. Go to Workers & Pages → household-hub → Deployments
# 2. Find last working deployment
# 3. Click "•••" → "Rollback to this deployment"

# Option B: Via Wrangler CLI
npx wrangler pages deployment list --project-name household-hub
# Copy previous deployment ID
npx wrangler pages deployment rollback household-hub [deployment-id]
```

**Verification**:

```bash
curl -I https://household-hub.pages.dev
# Check X-Deployment-Id header matches rolled-back version
```

**Time**: ~1 minute

---

#### 2. Rollback Database (5-30 minutes depending on data size)

⚠️ **ONLY if database migrations caused issues**

**Option A: Restore from Backup** (if backup exists)

```bash
# Via Supabase Dashboard:
# Settings → Database → Backups → Restore

# CLI alternative (if backup downloaded):
npx supabase db reset --linked
npx supabase db push --linked --file backup.sql
```

**Option B: Rollback Specific Migration**

```bash
# Connect to database
npx supabase db remote psql --linked

# Run rollback SQL (from migration file comments)
# Example for transaction_events table:
DROP TABLE IF EXISTS transaction_events CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_events();

# Verify rollback
\dt
-- transaction_events should not exist
```

**Time**: 5-30 minutes

---

### Partial Rollback (Feature Flags)

⏳ **TODO**: Implement feature flags in Phase B for granular rollbacks

**Concept**:

- Disable problematic features without full rollback
- Example: Disable realtime sync but keep core app running

**Implementation** (future):

```typescript
// src/lib/features.ts
export const FEATURE_FLAGS = {
  REALTIME_SYNC: import.meta.env.VITE_FEATURE_REALTIME === "true",
  PUSH_NOTIFICATIONS: import.meta.env.VITE_FEATURE_PUSH === "true",
  R2_BACKUPS: import.meta.env.VITE_FEATURE_R2 === "true",
};
```

---

## Troubleshooting

### Issue: GitHub Actions Build Fails

**Symptoms**: CI fails at build step

**Diagnosis**:

```bash
# Check GitHub Actions logs
gh run list --limit 1
gh run view [run-id] --log-failed

# Common causes:
# 1. Missing environment variables
# 2. TypeScript errors
# 3. Out of memory
```

**Solutions**:

1. **Missing env vars**:

   ```bash
   # Verify secrets set
   gh secret list

   # Re-add missing secrets
   gh secret set SUPABASE_URL --body "[value]"
   ```

2. **TypeScript errors**:

   ```bash
   # Reproduce locally
   npm run type-check

   # Fix errors and push
   ```

3. **Out of memory**:
   ```yaml
   # Increase Node memory in .github/workflows/deploy.yml
   - run: npm run build
     env:
       NODE_OPTIONS: "--max-old-space-size=4096"
   ```

---

### Issue: Migration Fails

**Symptoms**: `supabase db push` returns error

**Diagnosis**:

```bash
# Check migration status
npx supabase migration list --linked

# View specific migration
cat supabase/migrations/[failed-migration].sql
```

**Common errors**:

1. **Duplicate table/column**:

   ```
   ERROR: relation "transactions" already exists
   ```

   **Solution**: Migration already applied, skip or fix with `IF NOT EXISTS`

2. **Foreign key violation**:

   ```
   ERROR: insert or update violates foreign key constraint
   ```

   **Solution**: Check data exists in referenced table first

3. **RLS policy conflict**:
   ```
   ERROR: policy "policy_name" already exists
   ```
   **Solution**: Use `CREATE POLICY IF NOT EXISTS` or drop existing policy

**Recovery**:

```bash
# Reset to clean state (DANGEROUS - dev only)
npx supabase db reset --linked

# Reapply migrations one by one
npx supabase migration repair --linked
```

---

### Issue: App Loads but Auth Broken

**Symptoms**: Login/signup returns 401 or infinite loading

**Diagnosis**:

```bash
# Check Supabase connection
curl https://[project-ref].supabase.co/auth/v1/health
# Expected: {"status": "ok"}

# Check browser console for errors
# Look for: "Invalid API key" or "CORS error"
```

**Solutions**:

1. **Wrong anon key**:

   ```bash
   # Verify key in build
   # Check .env.production or GitHub Secrets
   # Redeploy with correct key
   ```

2. **CORS not configured**:

   ```bash
   # In Supabase dashboard:
   # Authentication → URL Configuration
   # Add: https://household-hub.pages.dev
   ```

3. **Redirect URL not whitelisted**:
   ```bash
   # Supabase dashboard:
   # Authentication → URL Configuration
   # Add: https://household-hub.pages.dev/**
   ```

---

### Issue: Cloudflare Deployment Succeeds but 404

**Symptoms**: `https://household-hub.pages.dev` returns 404

**Diagnosis**:

```bash
# Check deployment status
npx wrangler pages deployment list --project-name household-hub

# Check build output
ls -la dist/
# Should contain index.html
```

**Solutions**:

1. **Wrong output directory**:

   ```toml
   # wrangler.toml
   pages_build_output_dir = "dist"  # Match Vite output
   ```

2. **SPA routing not configured**:

   ```toml
   # wrangler.toml - Add redirect
   [[redirects]]
   from = "/*"
   to = "/index.html"
   status = 200
   ```

3. **Assets not uploaded**:
   ```bash
   # Manual deployment to verify
   npx wrangler pages deploy dist --project-name household-hub
   ```

---

### Issue: RLS Policies Blocking Valid Requests

**Symptoms**: API returns 0 rows despite data existing

**Diagnosis**:

```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Check user's household_id
SELECT get_user_household_id();

-- Check data exists
SET ROLE service_role;
SELECT COUNT(*) FROM transactions;
RESET ROLE;
```

**Solutions**:

1. **User not in profiles table**:

   ```sql
   -- Check profiles
   SELECT * FROM profiles WHERE id = auth.uid();

   -- If missing, create profile (should auto-create on signup)
   INSERT INTO profiles (id, email, household_id)
   VALUES (auth.uid(), '[email]', '[household-id]');
   ```

2. **RLS policy incorrect**:

   ```sql
   -- Test policy directly
   SELECT * FROM transactions WHERE household_id = get_user_household_id();

   -- If fails, review policy:
   SELECT * FROM pg_policies WHERE tablename = 'transactions';
   ```

---

## Environment Variables Reference

### Frontend (Client-Side)

```env
# Supabase Connection (public)
VITE_SUPABASE_URL=https://[project-ref].supabase.co
VITE_SUPABASE_ANON_KEY=[anon-key]  # Safe for client

# App Configuration
VITE_APP_URL=https://household-hub.pages.dev
VITE_SENTRY_DSN=[sentry-dsn]  # Optional, public DSN
VITE_SENTRY_ENVIRONMENT=production
```

### Backend (CI/Workers Only)

```env
# Supabase Admin (NEVER expose to client)
SUPABASE_SERVICE_KEY=[service-role-key]
SUPABASE_PROJECT_ID=[project-ref]

# Cloudflare
CLOUDFLARE_API_TOKEN=[api-token]
CLOUDFLARE_ACCOUNT_ID=[account-id]

# Sentry (optional)
SENTRY_AUTH_TOKEN=[auth-token]  # For sourcemap uploads
```

### Phase B Variables (⏳ TODO)

```env
# R2 Backups (Chunk 038-040)
R2_ACCESS_KEY_ID=[r2-access-key]
R2_SECRET_ACCESS_KEY=[r2-secret-key]
R2_BUCKET_NAME=household-backups

# Push Notifications (Chunk 043)
VAPID_PUBLIC_KEY=[public-key]
VAPID_PRIVATE_KEY=[private-key]

# Feature Flags (Optional)
VITE_FEATURE_REALTIME=true
VITE_FEATURE_PUSH=false
VITE_FEATURE_R2=false
```

---

## Health Checks

### Automated Health Check Endpoint

⏳ **TODO (Chunk 046)**: Implement `/api/health` endpoint

**Planned Implementation**:

```typescript
// pages/api/health.ts
export async function onRequest({ env }) {
  const checks = {
    database: await checkDatabase(env),
    storage: await checkStorage(env), // Phase B
    cache: await checkCache(env), // Phase B
  };

  const healthy = Object.values(checks).every((v) => v);

  return new Response(
    JSON.stringify({
      status: healthy ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    }),
    {
      status: healthy ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    }
  );
}
```

---

### Manual Health Checks

**Database**:

```bash
curl https://[project-ref].supabase.co/rest/v1/ \
  -H "apikey: [anon-key]"
# Expected: 200 with OpenAPI spec
```

**Frontend**:

```bash
curl -I https://household-hub.pages.dev
# Expected: HTTP/2 200
```

**Auth**:

```bash
curl https://[project-ref].supabase.co/auth/v1/health
# Expected: {"status": "ok"}
```

---

## Post-Deployment Steps

✅ **Deployment Complete!**

### Next Steps:

1. ➡️ Proceed to [POST-DEPLOYMENT.md](./POST-DEPLOYMENT.md) for verification checklist
2. Monitor error rates in Sentry (if configured)
3. Watch Cloudflare Analytics for traffic patterns
4. Communicate success to team
5. Update progress tracker:
   ```bash
   # Mark Phase A deployment complete
   # Update docs/implementation/progress-tracker.md
   ```

---

## Document Maintenance

This living document will be updated as Phase B features are implemented:

**Upcoming Updates**:

- ⏳ Chunk 038-040: R2 backup procedures
- ⏳ Chunk 041-042: PWA deployment steps
- ⏳ Chunk 043: Push notification setup
- ⏳ Chunk 045: E2E test integration
- ⏳ Chunk 046: Enhanced monitoring

**Last Updated**: 2025-10-29 (Restructured from original DEPLOYMENT.md)
**Next Update**: After chunk 038 (R2 setup)
