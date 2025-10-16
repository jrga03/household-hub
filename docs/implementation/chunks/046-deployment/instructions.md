# Instructions: Deployment

Follow these steps in order. Estimated time: 1.5 hours.

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

      // PII Scrubbing (Decision #84)
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

- Settings → Secrets → Actions
- Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

---

## Step 6: Custom Domain (Optional, 10 min)

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

## Step 7: Final Production Checks (15 min)

### Build & Deploy

```bash
# Final build check
npm run build

# Check bundle size
npm run build -- --mode analyze

# Verify no console errors
npm run preview
# Open browser, check console
```

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

## Step 8: Document Deployment (10 min)

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

## Done!

🎉 **Congratulations! Your app is LIVE!**

Visit your production URL and celebrate!

**Next**: Run through `checkpoint.md` for final verification
