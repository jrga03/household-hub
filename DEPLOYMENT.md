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
- **Keep-alive**: a Cloudflare Worker cron (free tier), see [Keep-alive Worker](#keep-alive-worker)
- **Assistant**: a Cloudflare Worker in front of Workers AI (free tier), see [Assistant Worker](#assistant-worker)

---

## Environment Variables

### Required Variables

Configure these in **Cloudflare Pages** → Settings → Environment variables:

| Variable                 | Description                           | Example                                   |
| ------------------------ | ------------------------------------- | ----------------------------------------- |
| `VITE_SUPABASE_URL`      | Production Supabase project URL       | `https://xxx.supabase.co`                 |
| `VITE_SUPABASE_ANON_KEY` | Production Supabase anon key (public) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |

### Optional Variables

| Variable             | Description                                                                                                                                                         | Example                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `VITE_SENTRY_DSN`    | Sentry project DSN for error tracking                                                                                                                               | `https://xxx@sentry.io/xxx`                       |
| `VITE_APP_VERSION`   | App version for release tracking                                                                                                                                    | `0.0.1` (from package.json)                       |
| `VITE_ASSISTANT_URL` | The [Assistant Worker](#assistant-worker)'s URL. Unset, the app has no Assistant screen or nav entry. Its origin must also be in `connect-src` in `public/_headers` | `https://household-hub-assistant.xxx.workers.dev` |

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

## Keep-alive Worker

Supabase Free pauses a project after a week without activity, and a paused project refuses every sync until someone restores it in the dashboard. `workers/keep-alive` is a separate Cloudflare Worker whose cron (`0 0 */3 * *`, 00:00 UTC on days 1, 4, 7, …, 31) calls `public.keep_alive()` through the REST API, so runs are never more than 3 days apart.

The function returns `true` and reads no table. Of the client roles, only `anon` can execute it, and `anon` has no grant on households, membership or events (`supabase/tests/060_keep_alive.sql`). So the Worker uses the anon key, which is already public in the app bundle.

### Secrets

| Secret              | Value                                                |
| ------------------- | ---------------------------------------------------- |
| `SUPABASE_URL`      | Production Supabase project URL                      |
| `SUPABASE_ANON_KEY` | Production anon (publishable) key, same as the app's |

```bash
cd workers/keep-alive
npx wrangler@4.149.0 secret put SUPABASE_URL
npx wrangler@4.149.0 secret put SUPABASE_ANON_KEY
npx wrangler@4.149.0 deploy
```

Deploy again only when `workers/keep-alive` changes; pushes to `main` don't deploy it.

### Run it locally

With `supabase start` running and the migrations applied:

```bash
cd workers/keep-alive
cp .dev.vars.example .dev.vars   # fill SUPABASE_ANON_KEY from `supabase status -o env`
npx wrangler@4.149.0 dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+0+*/3+*+*"
```

The Wrangler log prints `Supabase keep-alive succeeded`. A failed query logs `Supabase keep-alive failed: <status> <body>` as an error and fails the run, which shows up under the Worker's Observability tab in Cloudflare (enabled in `wrangler.jsonc`).

---

## Assistant Worker

`workers/assistant` is the in-app assistant's only server part. It accepts `POST` with `Authorization: Bearer <Supabase access token>` and `{ messages, tools }` in the OpenAI chat shape, verifies the token, and streams `@cf/openai/gpt-oss-120b` back as server-sent events through the `AI` binding. The app defines the tools; the Worker only forwards them. It keeps no conversation and never logs message content.

- **Token check:** ES256 against `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (held in memory, refetched for an unknown key id at most once a minute), with `exp`, `aud: "authenticated"` and `iss: <SUPABASE_URL>/auth/v1`. Anything else gets `401`.
- **CORS:** only the origins in `ALLOWED_ORIGINS` get CORS headers, and a request from any other origin gets `403`. A request with no `Origin` header (curl, a script) still needs a valid token; browsers always send `Origin` on the app's cross-origin calls.
- **Limits:** on AiError 3040 (out of capacity) it retries once after 1 s, then answers `503 { "error": "busy" }`. On 3036 (daily neurons used up) it answers `429 { "error": "daily_limit", "resetsAt": "<next 00:00 UTC>" }`. Other model failures answer `502 { "error": "upstream" }` and log only the error code.

### Settings

| Setting           | Kind    | Value                                                                 |
| ----------------- | ------- | --------------------------------------------------------------------- |
| `AI`              | Binding | Workers AI, declared in `wrangler.jsonc`                              |
| `SUPABASE_URL`    | Secret  | Production Supabase project URL, no trailing slash                    |
| `ALLOWED_ORIGINS` | Secret  | Comma-separated app origins, e.g. the Pages URL and any custom domain |

Set the secrets in the Worker's **Settings → Variables and Secrets** as type **Secret**: a plain variable set in the dashboard is replaced by the next deploy, a secret is kept.

### Deploy

The Worker is connected to this repository with Workers Builds (**Workers & Pages → Create → Import a repository**):

| Field             | Value                                                   |
| ----------------- | ------------------------------------------------------- |
| Project name      | `household-hub-assistant` (must match `wrangler.jsonc`) |
| Root directory    | `workers/assistant`                                     |
| Build command     | empty                                                   |
| Deploy command    | `npx wrangler@4.149.0 deploy`                           |
| Build watch paths | include `workers/assistant/*`                           |

So a push to `main` that changes `workers/assistant` deploys it, and other pushes don't. Without the watch path, every push to `main` redeploys it.

To deploy from a terminal instead (check the account with `npx wrangler@4.149.0 whoami` first):

```bash
cd workers/assistant
npx wrangler@4.149.0 secret put SUPABASE_URL
npx wrangler@4.149.0 secret put ALLOWED_ORIGINS
npx wrangler@4.149.0 deploy
```

Workers AI on the Free plan gives 10,000 neurons a day, reset at 00:00 UTC; a three-call turn with two small tools cost about 50 in the prototype.

### Run it locally

With `supabase start` running. The `AI` binding always calls Cloudflare, so `wrangler dev` needs `npx wrangler@4.149.0 login` and spends the account's daily neurons.

```bash
cd workers/assistant
cp .dev.vars.example .dev.vars
npx wrangler@4.149.0 dev
```

Get a local access token by signing in to the app (or `POST $API_URL/auth/v1/token?grant_type=password` with the anon key), then:

```bash
curl -N http://localhost:8787 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"How much is in BPI?"}],"tools":[{"type":"function","function":{"name":"get_account_balances","parameters":{"type":"object","properties":{}}}}]}'
```

The reply streams `data:` chunks carrying `delta.tool_calls` and ends with `data: [DONE]`.

---

## Build Configuration

### Cloudflare Pages Settings

Configure in Cloudflare Pages dashboard:

| Setting                | Value                     |
| ---------------------- | ------------------------- |
| Build command          | `npm run build`           |
| Build output directory | `dist`                    |
| Root directory         | `/` (project root)        |
| Node version           | `26` (read from `.nvmrc`) |
| Install command        | `npm ci` (auto-detected)  |

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
