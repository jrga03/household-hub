# Deployment Guide

Quick reference for deploying Household Hub to production.

## Production Environment

### Live URL

Production: `https://household-hub-xxx.pages.dev` (Cloudflare Pages auto-generated)

Custom domain (if configured): `https://yourdomain.com`

### Infrastructure

- **Hosting**: Cloudflare Pages (free tier)
- **Database**: Supabase PostgreSQL (free tier, 500MB)
- **CDN**: Cloudflare Global Network (automatic)
- **SSL**: Automatic HTTPS with Cloudflare
- **Error Tracking**: Sentry (free tier, 5K errors/month)

---

## Environment Variables

### Required Variables

Configure these in **Cloudflare Pages** → Settings → Environment variables:

| Variable                 | Description                           | Example                                   |
| ------------------------ | ------------------------------------- | ----------------------------------------- |
| `VITE_SUPABASE_URL`      | Production Supabase project URL       | `https://xxx.supabase.co`                 |
| `VITE_SUPABASE_ANON_KEY` | Production Supabase anon key (public) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

### Optional Variables

| Variable           | Description                           | Example                     |
| ------------------ | ------------------------------------- | --------------------------- |
| `VITE_SENTRY_DSN`  | Sentry project DSN for error tracking | `https://xxx@sentry.io/xxx` |
| `VITE_APP_VERSION` | App version for release tracking      | `0.0.1` (from package.json) |

### How to Get Variables

**Supabase Credentials**:

1. Go to https://supabase.com/dashboard
2. Select your project
3. Settings → API
4. Copy "Project URL" and "anon public" key

**Sentry DSN**:

1. Go to https://sentry.io/
2. Create or select project
3. Settings → Client Keys (DSN)
4. Copy DSN

### GitHub Secrets

For GitHub Actions to work, add these secrets in **Repository Settings** → Secrets and variables → Actions:

| Secret                   | Required | Description                                    |
| ------------------------ | -------- | ---------------------------------------------- |
| `VITE_SUPABASE_URL`      | Yes      | Production Supabase URL                        |
| `VITE_SUPABASE_ANON_KEY` | Yes      | Production Supabase anon key                   |
| `VITE_SENTRY_DSN`        | No       | Sentry DSN for error tracking                  |
| `LHCI_GITHUB_APP_TOKEN`  | No       | GitHub token for Lighthouse CI comments on PRs |

**Note**: If secrets are not set, CI uses dummy values to allow build to succeed.

---

## Deployment Process

### Automatic Deployment (Recommended)

Cloudflare Pages automatically deploys on every push to `main` branch.

**Workflow**:

1. Push commit to `main` branch
2. GitHub Actions runs tests and Lighthouse CI
3. Cloudflare Pages detects push and starts build
4. Build completes in 2-5 minutes
5. New version live at production URL

**To trigger deployment**:

```bash
# Make changes
git add .
git commit -m "feat: add new feature"
git push origin main

# Cloudflare Pages auto-deploys
```

### Manual Deployment

If needed, trigger deployment manually:

**Option 1: Via Cloudflare Dashboard**

1. Go to Cloudflare Pages dashboard
2. Select "household-hub" project
3. Go to Deployments tab
4. Click "Create deployment"
5. Select branch and deploy

**Option 2: Via Git Force Push**

```bash
# Empty commit to trigger rebuild
git commit --allow-empty -m "chore: force redeploy"
git push origin main
```

### Preview Deployments

Every branch and PR automatically gets a preview deployment:

**Automatic**:

- Push to any branch (not main) → Preview deployment created
- URL: `https://<commit-hash>.household-hub.pages.dev`
- Uses **production** environment variables (same Supabase)
- Deleted automatically when branch is deleted

**Testing previews**:

1. Create feature branch: `git checkout -b feature/new-feature`
2. Make changes and push: `git push origin feature/new-feature`
3. Check Cloudflare Pages dashboard for preview URL
4. Test changes before merging to main

---

## Build Configuration

### Cloudflare Pages Settings

Configure in Cloudflare Pages dashboard:

| Setting                | Value                                     |
| ---------------------- | ----------------------------------------- |
| Build command          | `npm run build`                           |
| Build output directory | `dist`                                    |
| Root directory         | `/` (project root)                        |
| Node version           | `20` (add `.node-version` file with `20`) |
| Install command        | `npm ci` (auto-detected)                  |

### Build Process

1. **Install**: `npm ci` (clean install from package-lock.json)
2. **Type Check**: `tsc -b` (TypeScript compilation check)
3. **Build**: `vite build` (production build)
4. **Output**: Static files in `dist/` directory

**Build time**: 2-3 minutes typically

### Build Artifacts

After build, `dist/` contains:

```
dist/
├── index.html           # Entry point
├── assets/
│   ├── index-[hash].js  # Main bundle (~200KB target)
│   ├── vendor-[hash].js # Dependencies
│   └── index-[hash].css # Styles
├── manifest.webmanifest # PWA manifest
└── sw.js                # Service worker
```

**Performance budgets**:

- Main bundle: <200KB (gzipped)
- FCP: <1.5s
- LCP: <2.5s
- TBT: <200ms

---

## Monitoring & Observability

### Error Tracking (Sentry)

**Dashboard**: https://sentry.io/organizations/your-org/projects/household-hub/

**What's tracked**:

- JavaScript errors in production
- Unhandled promise rejections
- Performance metrics (10% sampling)

**What's NOT tracked** (PII scrubbing, Decision #87):

- Transaction amounts
- Account balances
- Descriptions and notes
- Email addresses
- Personal information

**Alerts**:

- Email notifications for new errors
- Slack/Discord integration (optional)
- Weekly digest reports

### Performance Monitoring (Lighthouse CI)

**GitHub Actions**:

- Runs on every push to `main`
- Results available in Actions artifacts
- Failing scores block deployment (can override)

**Run locally**:

```bash
# Build and run Lighthouse
npm run build
npm run preview &
npm run lighthouse
```

**Targets**:

- Performance: ≥90
- Accessibility: ≥95
- Best Practices: ≥90
- SEO: ≥90

### Cloudflare Analytics

**Dashboard**: Cloudflare Pages → Analytics

**Metrics**:

- Page views
- Unique visitors
- Bandwidth usage
- Request count
- Cache hit rate

**Free tier limits**:

- Unlimited bandwidth
- Unlimited requests
- 500 builds/month

---

## Rollback Procedure

### When to Rollback

Rollback if:

- Critical bug in production
- Performance degradation
- Data corruption risk
- Security vulnerability

### Quick Rollback (5 minutes)

**Via Cloudflare Dashboard** (fastest):

1. Go to Cloudflare Pages → Deployments
2. Find previous **successful** deployment (green checkmark)
3. Click "..." → "Rollback to this deployment"
4. Confirm rollback
5. Previous version live in 1-2 minutes

**Verify**:

```bash
# Test production site
curl -I https://household-hub-xxx.pages.dev
# Check status code 200

# Test critical paths
# - Sign in
# - Create transaction
# - View accounts
```

### Git Rollback (10 minutes)

**Option 1: Revert commit** (safer, preserves history):

```bash
# Find commit to revert
git log --oneline

# Revert specific commit
git revert <commit-hash>
git push origin main

# Cloudflare auto-deploys reverted version
```

**Option 2: Hard reset** (DANGER: rewrites history):

```bash
# Only use if absolutely necessary
git reset --hard <working-commit-hash>
git push origin main --force

# WARNING: Notify team before force push!
```

### Database Rollback

**If schema changed** between deployments:

1. Check for migrations:

   ```bash
   git log --oneline --since="1 day ago" -- supabase/migrations/
   ```

2. If migrations found, rollback database FIRST:

   ```bash
   # Create rollback migration
   npx supabase migration new rollback_feature_name

   # Write reverse migration (e.g., DROP TABLE, DROP COLUMN)
   # Apply to production
   npx supabase db push
   ```

3. Then rollback frontend (see above)

**⚠️ Critical**: Always rollback database before frontend if schema changed!

### Post-Rollback Checklist

After rollback:

- [ ] Site loads correctly
- [ ] Test auth flow (sign in/out)
- [ ] Create test transaction
- [ ] Check Sentry for new errors
- [ ] Monitor for 15 minutes
- [ ] Notify users if needed (status page, email)
- [ ] Document incident in GitHub issue
- [ ] Fix bug in development
- [ ] Test thoroughly before redeploying

---

## Deployment Checklist

### Pre-Deployment

Before deploying new version:

- [ ] All tests passing (`npm test && npm run test:e2e`)
- [ ] Build succeeds locally (`npm run build`)
- [ ] No TypeScript errors (`npx tsc --noEmit`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Database migrations applied (if any)
- [ ] Environment variables documented
- [ ] RLS policies tested
- [ ] Performance tested (10k+ transactions)
- [ ] Offline mode works
- [ ] PWA installs correctly

### Deployment

During deployment:

- [ ] Push to main branch
- [ ] GitHub Actions green (all tests pass)
- [ ] Cloudflare Pages build succeeds
- [ ] Deployment completes (check dashboard)
- [ ] New version live at production URL

### Post-Deployment

After deployment:

- [ ] Site loads at production URL
- [ ] HTTPS working (padlock icon)
- [ ] PWA installs successfully
- [ ] Service worker registers
- [ ] Offline mode works
- [ ] Auth flow works (sign up, sign in, sign out)
- [ ] Create/edit/delete transaction
- [ ] Accounts display correctly
- [ ] Budgets calculate correctly
- [ ] No console errors (check DevTools)
- [ ] Sentry monitoring active
- [ ] Lighthouse scores meet targets (≥90/95/90/90)
- [ ] Monitor Sentry for 30 minutes post-deploy

### If Issues Arise

If ANY critical issue:

1. **Rollback immediately** (see Rollback Procedure above)
2. Notify team
3. Check Sentry for errors
4. Review Cloudflare logs
5. Fix in development
6. Test thoroughly
7. Redeploy when ready

---

## Troubleshooting

### Build Failures

**"Build failed" in Cloudflare Pages**:

1. Check build logs in Cloudflare dashboard
2. Common causes:
   - Missing environment variables
   - TypeScript errors
   - Node version mismatch
3. Fix locally and redeploy:
   ```bash
   npm run build  # Test locally
   git push origin main  # Redeploy
   ```

### Runtime Errors

**Site loads but shows blank page**:

1. Check browser console for errors
2. Verify environment variables set in Cloudflare
3. Check Sentry for error reports
4. Rollback if needed

**"Failed to fetch" or API errors**:

1. Verify Supabase URL and key in Cloudflare
2. Check Supabase dashboard for downtime
3. Test RLS policies in Supabase SQL editor
4. Check CORS settings

### Performance Issues

**Slow page loads**:

1. Run Lighthouse audit: `npm run lighthouse`
2. Check bundle sizes: `ls -lh dist/assets/*.js`
3. Review Cloudflare Analytics for traffic spikes
4. Check Supabase query performance

**Large bundle size**:

1. Analyze bundle: `npm run build`
2. Check for unused dependencies
3. Use dynamic imports for large libraries
4. Code splitting with React.lazy()

---

## Support & Resources

### Status Pages

- **Cloudflare**: https://www.cloudflarestatus.com/
- **Supabase**: https://status.supabase.com/
- **Sentry**: https://status.sentry.io/

### Documentation

- **Cloudflare Pages Docs**: https://developers.cloudflare.com/pages/
- **Supabase Docs**: https://supabase.com/docs
- **Sentry Docs**: https://docs.sentry.io/

### Internal Docs

- **User Guide**: `docs/USER-GUIDE.md`
- **Implementation Plan**: `docs/implementation/`
- **Database Schema**: `docs/initial plan/DATABASE.md`
- **Architecture Decisions**: `docs/initial plan/DECISIONS.md`

### Contact

- **GitHub Issues**: https://github.com/your-org/household-hub/issues
- **Email**: support@household-hub.app (check README for actual contact)

---

## Maintenance

### Weekly

- [ ] Check Sentry for new errors
- [ ] Review Cloudflare Analytics (traffic, performance)
- [ ] Monitor storage quotas (Supabase dashboard)
- [ ] Test critical paths in production

### Monthly

- [ ] Update dependencies: `npm update`
- [ ] Review Lighthouse scores
- [ ] Database maintenance (VACUUM, ANALYZE in Supabase)
- [ ] Backup verification (manual export test)
- [ ] Security audit (npm audit)

### Quarterly

- [ ] Major dependency updates
- [ ] Performance optimization review
- [ ] User feedback review
- [ ] Feature prioritization
- [ ] Security penetration test (optional)

---

**Last updated**: January 2025 | Version 0.0.1 MVP

For detailed implementation instructions, see `docs/implementation/chunks/046-deployment/`.
