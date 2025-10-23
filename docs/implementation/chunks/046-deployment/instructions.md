# Instructions: Deployment

Follow these steps in order. Estimated time: 2.5-3 hours (with user documentation).

---

## Before You Begin

### Verify Prerequisites ✓

**DO NOT START** deployment until all prerequisites are met. Deploying broken code wastes time and risks production issues.

#### 1. Critical Chunks Complete ✓

Verify these chunks are fully implemented:

```bash
# Check auth system works
# Visit http://localhost:3000 and test sign up/in/out
```

- [ ] **Chunk 002** (auth-flow) - Sign up, sign in, sign out working
- [ ] **Chunk 020** (dexie-setup) - IndexedDB configured (`db.ts` exists)
- [ ] **Chunk 041** (pwa-manifest) - `public/manifest.webmanifest` exists
- [ ] **Chunk 042** (service-worker) - Service worker registered
- [ ] **Chunk 045** (e2e-tests) - All E2E tests passing

#### 2. Build Succeeds ✓

```bash
npm run build
```

**Expected**:

- ✅ No TypeScript errors
- ✅ `dist/` directory created
- ✅ Build completes successfully

**If build fails**: Fix errors before continuing. Common issues:

- TypeScript type errors
- Missing dependencies
- Import path issues

#### 3. All Tests Passing ✓

```bash
# Unit tests
npm test
# Expected: All pass

# E2E tests (if chunk 045 implemented)
npm run test:e2e
# Expected: All pass
```

**If tests fail**: Fix failing tests first. Don't deploy broken code.

#### 4. TypeScript Check Passes ✓

```bash
npx tsc --noEmit
```

**Expected**: No type errors

#### 5. Environment Variables Ready ✓

Have these ready from your production Supabase project:

- [ ] `VITE_SUPABASE_URL` (from Supabase Settings → API)
- [ ] `VITE_SUPABASE_ANON_KEY` (from Supabase Settings → API)
- [ ] `VITE_SENTRY_DSN` (optional, from Sentry.io project)

#### 6. Database Migrations Applied ✓

```bash
# Link to production Supabase project
npx supabase link --project-ref <your-project-id>

# Push all migrations
npx supabase db push
```

**Expected**: All migrations applied successfully

#### 7. Accounts Created ✓

- [ ] Cloudflare account created (free tier)
- [ ] Sentry account created (optional, 5K errors/month free)
- [ ] GitHub repository created and pushed

#### 8. PWA Assets Ready ✓

- [ ] Icons generated (192x192, 512x512)
- [ ] `public/manifest.webmanifest` exists
- [ ] Service worker configured in `src/main.tsx`

---

### Go/No-Go Decision ✓

**ALL items above must be checked** before proceeding.

If ANY prerequisite fails, **STOP** and fix it first.

**Ready?** Continue to Step 1.

---

## Step 1: Connect to Cloudflare Pages (10 min)

1. Visit https://pages.cloudflare.com/
2. Click "Create a project"
3. Connect your GitHub account
4. Select your `household-hub` repository
5. Configure build settings:
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: `/`
   - **Environment variables**: (add later)

6. Click "Save and Deploy"

**First deployment will take 2-3 minutes.**

**Result**: App deployed to `https://household-hub-xxx.pages.dev`

---

## Step 2: Configure Environment Variables (10 min)

In Cloudflare Pages dashboard → Settings → Environment variables:

```
# Production
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

VITE_SENTRY_DSN=https://xxx@sentry.io/xxx (optional)

# Staging (if using preview deployments)
[Same as above but with staging Supabase project]
```

**Redeploy** after adding variables:

- Go to Deployments
- Click "..." on latest deployment
- Click "Retry deployment"

---

## Step 3: Setup Sentry Error Tracking (20 min)

### Create Sentry Project

1. Visit https://sentry.io/ (free tier: 5k errors/month)
2. Create account
3. Create new project → React
4. Copy DSN: `https://xxx@sentry.io/xxx`

### Install Sentry SDK

```bash
npm install @sentry/react
```

### Configure Sentry with PII Scrubbing

Create `src/lib/sentry.ts`:

```typescript
import * as Sentry from "@sentry/react";

export function initSentry() {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1, // 10% of transactions

      // PII Scrubbing (Decision #87)
      beforeSend(event) {
        // Remove sensitive data from requests
        if (event.request?.data) {
          const data = event.request.data as any;
          // Scrub financial data
          delete data.amount_cents;
          delete data.description;
          delete data.notes;
          delete data.account_number;
        }

        // Remove sensitive breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.filter(
            (breadcrumb) => !breadcrumb.message?.includes("amount")
          );
        }

        // Remove PII from user context
        if (event.user) {
          delete event.user.email;
        }

        return event;
      },

      // Ignore common errors
      ignoreErrors: ["ResizeObserver loop limit exceeded", "Non-Error promise rejection captured"],

      // Disable session replay for finance app
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
    });
  }
}
```

Update `src/main.tsx`:

```typescript
import { initSentry } from './lib/sentry';

// Initialize Sentry FIRST
initSentry();

// Then render app
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

---

## Step 4: Setup Lighthouse CI (15 min)

Create `.lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "url": ["https://household-hub-xxx.pages.dev/"],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop"
      }
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["error", { "minScore": 0.9 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1500 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage"
    }
  }
}
```

Install:

```bash
npm install -D @lhci/cli
```

Add to `package.json`:

```json
{
  "scripts": {
    "lighthouse": "lhci autorun"
  }
}
```

---

## Step 5: Create GitHub Actions Workflow (20 min)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run unit tests
        run: npm test

      - name: Build
        run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}

      - name: Run E2E tests
        if: hashFiles('tests/e2e/**') != ''
        run: npx playwright install --with-deps && npm run test:e2e

  lighthouse:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install dependencies
        run: npm ci

      - name: Run Lighthouse CI
        run: npm run lighthouse
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

**Add secrets** in GitHub:

1. Go to your repository → Settings → Secrets and variables → Actions
2. Click "New repository secret" for each:

**Required secrets**:

- `VITE_SUPABASE_URL` - Your production Supabase URL
- `VITE_SUPABASE_ANON_KEY` - Your production Supabase anon key

**Optional secrets**:

- `VITE_SENTRY_DSN` - Your Sentry project DSN (for error tracking)
- `LHCI_GITHUB_APP_TOKEN` - GitHub token for Lighthouse CI comments

**How to get LHCI_GITHUB_APP_TOKEN** (optional):

```bash
# Use GitHub CLI to create token
gh auth login
gh auth token
# Copy token and add as secret
```

Or use a Personal Access Token with `repo` scope from GitHub Settings → Developer settings → Personal access tokens

---

## Step 6: Preview Deployments & Staging (10 min)

Cloudflare Pages automatically creates preview deployments for every push.

### Automatic Preview Deployments

**How it works**:

1. Push to any branch (not main)
2. Cloudflare auto-creates preview: `<commit-hash>.household-hub.pages.dev`
3. Test changes before merging
4. Delete branch → Preview deleted automatically

**Example workflow**:

```bash
# 1. Create feature branch
git checkout -b feature/new-dashboard

# 2. Make changes and commit
git add .
git commit -m "Add new dashboard"

# 3. Push to GitHub
git push origin feature/new-dashboard

# 4. Check Cloudflare Pages dashboard for preview URL
# Opens: https://abc123.household-hub.pages.dev
```

**Testing previews**:

- Each PR gets unique preview URL
- Linked in PR comments (if LHCI configured)
- Full production build with PR branch code
- Uses production environment variables (same Supabase)

---

### Staging Environment (Optional)

For separate staging vs production:

**Option 1: Separate Cloudflare Project**

```bash
# Create staging project
wrangler pages project create household-hub-staging

# In GitHub Actions, add staging job:
# Deploy to staging on push to 'develop' branch
```

**Option 2: Environment-Specific Variables**

In Cloudflare Pages:

1. Settings → Environment variables
2. Set different values for:
   - **Production** (main branch): Production Supabase
   - **Preview** (all other branches): Staging Supabase

**Staging Supabase setup**:

```bash
# Create separate Supabase project: household-hub-staging
# Use staging project credentials for preview deployments
```

---

### Preview Deployment Best Practices

**Use preview deployments to test**:

- [ ] New features before merging
- [ ] Database migration effects
- [ ] Breaking changes
- [ ] Performance impact

**Don't use for**:

- Production hotfixes (deploy directly from main)
- Sensitive data testing (previews use production DB)
- Load testing (shared infrastructure)

---

## Step 7: Custom Domain (Optional, 10 min)

### In Cloudflare Pages:

1. Go to Custom domains
2. Click "Set up a custom domain"
3. Enter your domain: `household-hub.app`
4. Follow DNS instructions

### DNS Setup:

Add CNAME record:

```
Type: CNAME
Name: @ (or www)
Value: household-hub-xxx.pages.dev
```

**Wait 5-10 minutes for DNS propagation.**

---

## Step 8: Final Production Checks (15 min)

### Build & Deploy

```bash
# Final build check
npm run build

# Check bundle sizes (manual verification)
ls -lh dist/assets/*.js
# Expected: Main bundle <200KB, vendor bundle <300KB

# Verify no console errors
npm run preview
# Open http://localhost:4173, check browser console for errors
```

**Bundle size tips**:

- If bundles too large, check `package.json` for unused dependencies
- Use dynamic imports for large libraries: `const lib = await import('large-lib')`
- Review `dist/assets/` for unexpectedly large files

### Test Production Site

Visit your deployed URL:

1. **PWA Install**: Verify install prompt appears
2. **Offline Mode**: Toggle offline, verify works
3. **Auth Flow**: Sign up/in/out
4. **CRUD Operations**: Create/edit/delete transaction
5. **Service Worker**: Check registered in DevTools
6. **Performance**: Run Lighthouse audit (>90 score)

### Monitor Sentry

1. Visit Sentry dashboard
2. Trigger a test error:
   ```typescript
   throw new Error("Test error");
   ```
3. Verify error appears in Sentry (with PII scrubbed)

---

## Step 9: Create User Documentation (20 min)

Per Day 15 plan requirement: "Create user documentation (getting started guide)"

Create `docs/USER-GUIDE.md` in repo root:

```markdown
# Household Hub - Getting Started Guide

Welcome to Household Hub! This guide will help you start tracking your household finances.

## What is Household Hub?

Household Hub is an offline-first financial management app for households. Track income, expenses, budgets, and more - all in one place, accessible even without internet.

## First Steps

### 1. Create Your Account

1. Visit [https://household-hub.pages.dev](https://household-hub.pages.dev)
2. Click "Sign Up"
3. Enter your email and create a secure password
4. Verify your email address

### 2. Set Up Your First Account

**Accounts** represent your bank accounts, cash, or credit cards.

1. Click "Accounts" in the sidebar
2. Click "+ New Account"
3. Enter:
   - **Name**: e.g., "BDO Checking"
   - **Type**: Joint (shared) or Personal
   - **Initial balance**: Current balance in PHP
4. Click "Create"

### 3. Create Categories

**Categories** help organize your spending.

**Pre-installed categories**:

- 🍔 Food & Dining → Groceries, Restaurants
- 🏠 Home → Utilities, Rent
- 🚗 Transportation → Gas, Public Transit
- 💊 Healthcare

**Add your own**:

1. Click "Categories" → "+ New Category"
2. Choose parent (e.g., Food & Dining)
3. Name it (e.g., "Coffee Shops")
4. Pick an emoji icon

### 4. Add Your First Transaction

1. Click "Transactions" → "+ New"
2. Fill in:
   - **Amount**: e.g., 1,500.50 (auto-formats to ₱1,500.50)
   - **Type**: Income or Expense
   - **Category**: Choose from dropdown
   - **Account**: Which account to use
   - **Date**: When it happened
   - **Description**: Optional notes
3. Click "Save"

**Status options**:

- **Pending**: Not yet cleared in bank
- **Cleared**: Confirmed by bank

### 5. Set Monthly Budgets

1. Click "Budgets"
2. Select month
3. For each category, enter target spending
   - Example: Groceries → ₱15,000/month
4. Track progress: Green = under budget, Red = over budget

### 6. Transfer Between Accounts

1. Click "Transactions" → "+ New Transfer"
2. Select:
   - **From account**: e.g., BDO Checking
   - **To account**: e.g., Cash
   - **Amount**: Transfer amount
3. Creates two linked transactions automatically

**Important**: Transfers don't count toward budgets (no double-counting)

## Key Features

### 📱 Works Offline

- Create transactions without internet
- Changes sync automatically when back online
- Install as app on phone/desktop (PWA)

### 🔄 Multi-Device Sync

- Use on phone, tablet, and computer
- Changes sync across all devices
- Conflicts resolved automatically

### 📊 Visual Reports

- Monthly spending by category
- Income vs expenses trends
- Budget vs actual comparisons
- Account balance history

### 🔐 Privacy-First

- Your data stays on your devices (offline-first)
- End-to-end encryption for backups
- No selling of data, ever

### 📤 Export Your Data

1. Click "Settings" → "Export Data"
2. Choose format: CSV or JSON
3. Download backup file
4. Store securely (includes all transactions)

## Tips & Tricks

### Keyboard Shortcuts

- `Ctrl/Cmd + N`: New transaction
- `Ctrl/Cmd + K`: Quick search
- `Esc`: Close dialogs
- `Tab`: Navigate form fields

### Tag People in Transactions

Use `@` to tag household members:

- "Groceries @John @Mary" tracks who benefited

### Recurring Transactions (Coming Soon)

For now, manually create monthly bills. Recurring transactions coming in Phase 2!

### Search Transactions

- Click search bar in Transactions
- Search by: amount, description, category, account
- Filter by: date range, status, type

## Troubleshooting

### "Cannot connect to server"

- Check internet connection
- Changes saved offline, will sync later
- Look for "Offline" indicator in top-right

### "Sync failed"

1. Refresh the page
2. Check Cloudflare status
3. If persists, export data and contact support

### Budget shows wrong total

- Ensure transfers are properly linked (check transfer_group_id)
- Verify no duplicate transactions
- Transfers excluded automatically from budgets

### Lost device

1. Sign in from new device
2. All data syncs from cloud
3. No data loss (backed up every 24 hours)

## Getting Help

- **Documentation**: [GitHub Wiki](https://github.com/your-org/household-hub/wiki)
- **Issues**: [Report bugs](https://github.com/your-org/household-hub/issues)
- **Email**: support@household-hub.app

## What's Next?

- Explore the **Analytics** dashboard for insights
- Set up **monthly budget reviews**
- Invite household members to join
- Enable **push notifications** for budget alerts

---

**Enjoy tracking your finances with Household Hub!** 🎉
```

---

## Step 10: Document Deployment (10 min)

Create `DEPLOYMENT.md` in repo root:

```markdown
# Deployment Guide

## Production URL

https://household-hub.pages.dev

## Environment Variables

Required in Cloudflare Pages:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SENTRY_DSN` (optional)

## Deploy Process

1. Push to `main` branch
2. Cloudflare Pages auto-deploys
3. GitHub Actions runs tests
4. Lighthouse CI validates performance

## Rollback

In Cloudflare Pages → Deployments:

1. Find previous successful deployment
2. Click "..." → "Rollback to this deployment"

## Monitoring

- **Errors**: https://sentry.io/organizations/your-org/projects/household-hub/
- **Performance**: Lighthouse CI reports in GitHub Actions
- **Uptime**: Cloudflare Analytics dashboard
```

---

## Step 11: Final Verification (10 min)

Run through complete deployment checklist:

```bash
# 1. Verify build
npm run build
# Expected: Clean build, no errors

# 2. Check bundle sizes
ls -lh dist/assets/*.js
# Expected: Main bundle <200KB

# 3. Run all tests
npm test && npm run test:e2e
# Expected: All tests pass

# 4. Verify Lighthouse scores
npm run lighthouse
# Expected: Performance ≥90, Accessibility ≥95
```

---

## Done!

🎉 **Congratulations! Your app is LIVE!**

Visit your production URL and celebrate!

**Files created**:

- `.github/workflows/deploy.yml` - CI/CD pipeline
- `.lighthouserc.json` - Performance budgets
- `src/lib/sentry.ts` - Error tracking with PII scrubbing
- `docs/USER-GUIDE.md` - User getting started guide
- `DEPLOYMENT.md` - Deployment quick reference

**Next**: Run through `checkpoint.md` for final verification
