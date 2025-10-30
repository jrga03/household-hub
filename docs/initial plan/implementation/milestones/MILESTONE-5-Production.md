# Milestone 5: Production Ready

**Goal**: Live, polished, installable Progressive Web App
**Time**: 7 hours (45 hours cumulative from start)
**Status**: Production deployment complete

## What You'll Have After This Milestone

✅ PWA manifest for installable app
✅ Service worker caching offline assets
✅ Push notifications for budget alerts
✅ Analytics dashboard with spending trends (optional)
✅ E2E tests covering critical paths
✅ Deployed to Cloudflare Pages with custom domain
✅ Monitoring active (errors, performance)
✅ Lighthouse scores: Performance ≥90, Accessibility ≥95

**🚀 PRODUCTION-READY, LIVE APPLICATION!**

## Chunks in This Milestone

### PWA Features (Required) - 4.5 hours

#### 041: PWA Manifest (1 hour)

**What**: Web app manifest for install prompt
**Outcome**: "Add to Home Screen" on mobile/desktop

**Includes**:

```json
{
  "name": "Household Hub",
  "short_name": "HH",
  "theme_color": "#4F46E5",
  "background_color": "#FFFFFF",
  "display": "standalone",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

#### 042: Service Worker (1.5 hours)

**What**: Cache static assets for offline use
**Outcome**: App shell loads offline

**Strategies**:

- **App shell**: Cache-first (HTML, CSS, JS)
- **API calls**: Network-first, fallback to cache
- **Images**: Cache-first with size limit
- **Workbox**: Pre-cache on install

#### 043: Push Notifications (2 hours)

**What**: Web Push API for budget alerts
**Outcome**: Notifications when spending exceeds budget

**Setup**:

- VAPID keys generation
- Service worker push listener
- Notification permission request
- Budget alert trigger logic

### Testing & Deploy (Required) - 3.5 hours

#### 044: Analytics Dashboard (1.5 hours) - OPTIONAL

**What**: Advanced spending trends and insights
**Outcome**: Charts showing monthly trends, category breakdown

**Features**:

- Monthly income vs expense chart
- Category spending pie chart
- Account balance history line chart
- Top spending categories

#### 045: E2E Tests (2 hours)

**What**: Playwright end-to-end tests
**Outcome**: Critical paths tested automatically

**Test Suites**:

1. Auth flow (signup, login, logout)
2. Account CRUD
3. Transaction CRUD
4. Offline functionality
5. Multi-device sync (requires 2 browser contexts)
6. Accessibility (axe-core integration)

#### 046: Deployment (1.5 hours)

**What**: Deploy to Cloudflare Pages
**Outcome**: Live app with custom domain

**Steps**:

- Connect GitHub repo
- Configure build settings
- Set environment variables
- Custom domain setup (optional)
- Deploy preview + production

## Why This Order?

1. **PWA manifest first** - Foundation for other PWA features
2. **Service worker** - Needs manifest to be valid PWA
3. **Push notifications** - Requires service worker
4. **Tests before deploy** - Catch issues before production
5. **Deploy last** - Only deploy tested code

**Parallel opportunity**: Can do chunk 044 (analytics) anytime after Milestone 2.

## Success Criteria

### PWA Checklist

- [ ] PWA manifest valid (test with Lighthouse)
- [ ] Service worker registered and active
- [ ] App installable on Chrome/Edge desktop
- [ ] App installable on iOS Safari (Add to Home Screen)
- [ ] App installable on Android Chrome
- [ ] Offline: App shell loads without network
- [ ] Offline: Shows cached data
- [ ] Icons display correctly (192px, 512px)
- [ ] Theme color matches brand

### Push Notifications Checklist

- [ ] Permission request shows on first budget creation
- [ ] Can grant/deny notification permission
- [ ] VAPID keys stored securely (environment variables)
- [ ] Service worker receives push events
- [ ] Notification shows when budget exceeded
- [ ] Click notification opens app to budget page
- [ ] Works on Chrome/Edge desktop
- [ ] Works on Android Chrome
- [ ] **iOS Safari**: No push (not supported), graceful degradation

### Testing Checklist

- [ ] All E2E tests pass
- [ ] Auth flow tested (signup, login, logout)
- [ ] CRUD operations tested (accounts, transactions)
- [ ] Offline scenarios tested
- [ ] Accessibility tests pass (axe-core)
- [ ] Visual regression tests (optional)
- [ ] Performance tests (optional)
- [ ] Can run tests in CI/CD

### Deployment Checklist

- [ ] App deployed to Cloudflare Pages
- [ ] Environment variables set correctly
- [ ] Preview deployments work for PRs
- [ ] Production deployment successful
- [ ] Custom domain configured (if applicable)
- [ ] HTTPS enabled and enforced
- [ ] Monitoring configured (Sentry or similar)
- [ ] Analytics configured (optional)

### Performance Checklist

- [ ] **Lighthouse Performance**: ≥90
- [ ] **Lighthouse Accessibility**: ≥95
- [ ] **Lighthouse Best Practices**: ≥90
- [ ] **Lighthouse SEO**: ≥80
- [ ] **First Contentful Paint (FCP)**: <1.5s
- [ ] **Time to Interactive (TTI)**: <3.5s
- [ ] **Largest Contentful Paint (LCP)**: <2.5s
- [ ] **Cumulative Layout Shift (CLS)**: <0.1
- [ ] **Total Blocking Time (TBT)**: <200ms

### Security Checklist

- [ ] All API keys in environment variables (not committed)
- [ ] Supabase RLS policies active
- [ ] No sensitive data in client-side code
- [ ] HTTPS enforced
- [ ] CSP headers configured
- [ ] CORS configured correctly
- [ ] No XSS vulnerabilities
- [ ] No CSRF vulnerabilities

## Common Issues & Solutions

### Issue: PWA install prompt doesn't show

**Symptom**: No "Install App" button on Chrome
**Solution**:

1. Check manifest.json is valid (Chrome DevTools → Application → Manifest)
2. Verify service worker registered (Application → Service Workers)
3. Ensure app served over HTTPS (required)
4. Check all icons exist and are correct size
5. Must visit site at least twice for Chrome install prompt

### Issue: Service worker not updating

**Symptom**: Old version cached, changes don't appear
**Solution**:

1. Increment service worker version in cache name
2. Use `skipWaiting()` in service worker
3. In DevTools: Application → Service Workers → "Update on reload"
4. For users: Implement update notification pattern
   ```typescript
   navigator.serviceWorker.register("/sw.js").then((reg) => {
     reg.addEventListener("updatefound", () => {
       // Show "Update available" notification
     });
   });
   ```

### Issue: Push notifications not working

**Symptom**: Permission granted but notifications don't appear
**Solution**:

1. Check VAPID keys match between client and server
2. Verify service worker has push event listener
3. Check notification permission is "granted"
4. Test with Web Push Testing Tool: https://web-push-codelab.glitch.me/
5. **iOS Safari**: Push not supported, hide UI for push features

### Issue: E2E tests flaky

**Symptom**: Tests pass sometimes, fail other times
**Solution**:

1. Add proper waits: `await page.waitForSelector('.transaction-list')`
2. Don't use `sleep()` - use explicit waits
3. Mock network calls for consistency
4. Disable animations in test environment
5. Run tests in headless mode for CI
6. Use `test.describe.configure({ retries: 2 })` for critical tests

### Issue: Cloudflare deployment fails

**Symptom**: Build succeeds locally, fails on Cloudflare
**Solution**:

1. Check Node version matches (set in Pages settings)
2. Verify all dependencies in `package.json`
3. Check build command is correct: `npm run build`
4. Ensure output directory is `dist` (or configured correctly)
5. Check environment variables set in Cloudflare dashboard
6. Review build logs for specific error

### Issue: Environment variables not working in production

**Symptom**: API calls fail with "Supabase URL undefined"
**Solution**:

1. Vite requires `VITE_` prefix: `VITE_SUPABASE_URL`
2. Set variables in Cloudflare Pages dashboard
3. Redeploy after adding variables
4. Check variables don't have quotes in dashboard
5. Verify `.env.local` not committed to Git

## Time Breakdown

| Chunk      | Activity                          | Time   | Cumulative |
| ---------- | --------------------------------- | ------ | ---------- |
| 041        | PWA manifest + icons              | 1hr    | 1hr        |
| 042        | Service worker + Workbox          | 1.5hr  | 2.5hr      |
| 043        | Push notifications + VAPID        | 2hr    | 4.5hr      |
| 044        | Analytics dashboard (optional)    | 1.5hr  | 6hr        |
| 045        | E2E tests (Playwright)            | 2hr    | 8hr        |
| 046        | Cloudflare Pages deployment       | 1.5hr  | 9.5hr      |
| **Buffer** | Troubleshooting, monitoring setup | -2.5hr | **7hr**    |

**Note**: Time assumes Milestones 1-2 complete at minimum. Milestones 3-4 optional but add more features to test.

## What Comes Next?

After completing this milestone, you're DONE with the core implementation! 🎉

### Post-Launch Activities

#### User Feedback & Iteration

- Monitor error logs (Sentry)
- Track user behavior (analytics)
- Collect feedback (in-app or email)
- Prioritize feature requests
- Fix bugs based on real usage

#### Performance Optimization

- Analyze bundle size (vite-bundle-visualizer)
- Code splitting for routes
- Lazy load heavy components
- Optimize images (WebP, lazy loading)
- Database query optimization

#### Feature Additions

- Multi-currency support (Phase 2)
- Multi-household support (Phase 2)
- Recurring transactions
- Receipt photo uploads
- Advanced budgeting (rollover, envelopes)
- Data visualization improvements
- Export formats (PDF, Excel)

#### Scaling Considerations

- Database indexes for slow queries
- Caching strategy (Redis)
- CDN for static assets
- Background job processing
- Rate limiting for API

## Verification Command

After completing all chunks (041-046):

```bash
# 1. Build production bundle
npm run build

# 2. Preview production build
npm run preview

# 3. Run E2E tests
npm run test:e2e

# 4. Run Lighthouse audit
npx lighthouse http://localhost:4173 --view
```

### Manual Testing Checklist

#### PWA Installation

1. Visit production URL in Chrome
2. **Expected**: Install icon in address bar
3. Click "Install"
4. **Expected**: App opens in standalone window
5. Close and reopen from desktop icon
6. **Expected**: App launches directly (no browser chrome)

#### Offline Capability

1. Open installed app
2. DevTools → Network → "Offline"
3. Refresh app
4. **Expected**: App shell loads from cache
5. **Expected**: Shows cached data
6. Create transaction
7. **Expected**: Queues for sync
8. Go back online
9. **Expected**: Syncs automatically

#### Push Notifications

1. Create budget with low limit
2. **Expected**: Permission prompt appears
3. Grant permission
4. Create expense exceeding budget
5. **Expected**: Push notification appears
6. Click notification
7. **Expected**: Opens app to budget page

#### Performance

1. Open production app in incognito
2. DevTools → Lighthouse → "Generate report"
3. **Expected**:
   - Performance ≥90
   - Accessibility ≥95
   - Best Practices ≥90
   - PWA: All checks pass

#### Deployment

1. Push to main branch
2. Check Cloudflare Pages dashboard
3. **Expected**: Auto-deploy triggers
4. Wait for build (~2-3 min)
5. **Expected**: Deployment succeeds
6. Visit production URL
7. **Expected**: Latest changes live

## Performance Verification

Run Lighthouse in CI:

```bash
# Install Lighthouse CI
npm install -g @lhci/cli

# Run Lighthouse CI
lhci autorun --config=lighthouserc.json

# Expected: All budgets pass
# - Performance ≥90
# - Accessibility ≥95
# - Best Practices ≥90
# - PWA score 100
```

Example `lighthouserc.json`:

```json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:4173"],
      "numberOfRuns": 3
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:pwa": ["error", { "minScore": 0.9 }]
      }
    }
  }
}
```

## Database Verification

Check production database health:

```sql
-- Verify data integrity
SELECT
  (SELECT COUNT(*) FROM accounts) as accounts,
  (SELECT COUNT(*) FROM categories) as categories,
  (SELECT COUNT(*) FROM transactions) as transactions,
  (SELECT COUNT(*) FROM transaction_events) as events,
  (SELECT COUNT(*) FROM devices) as devices,
  (SELECT COUNT(*) FROM sync_queue WHERE status = 'queued') as pending_sync;

-- Check RLS policies active
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND rowsecurity = false; -- Should return 0 rows

-- Monitor query performance
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check for slow queries (>100ms)
SELECT
  query,
  mean_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;
```

## References

- **Original Plan**: `docs/initial plan/IMPLEMENTATION-PLAN.md` Days 13-15
- **PWA Manifest**: `docs/initial plan/PWA-MANIFEST.md`
- **Deployment**: `docs/initial plan/DEPLOYMENT.md`
  - Cloudflare Pages setup
  - Environment variables
  - Custom domain
- **Testing**: `docs/initial plan/TESTING-PLAN.md`
  - E2E test scenarios
  - Accessibility testing
  - Performance budgets
- **Performance**: `docs/initial plan/PERFORMANCE-BUDGET.md`
  - Bundle size targets
  - Lighthouse score requirements
  - FCP, TTI, LCP budgets

## Key Architectural Points

### PWA Install Criteria

**Requirements for install prompt**:

1. Served over HTTPS
2. Has valid `manifest.json`
3. Has registered service worker
4. User visited site at least twice (Chrome)
5. 5-minute gap between visits (Chrome)

**Bypass during development**:

- Chrome flags: `chrome://flags/#bypass-app-banner-engagement-checks`
- Or: DevTools → Application → Manifest → "Add to home screen"

### Service Worker Caching Strategies

**Cache-First** (App shell):

```typescript
// Good for: HTML, CSS, JS, fonts
// Always fast, offline-capable
workbox.routing.registerRoute(/\.(?:js|css|html)$/, new workbox.strategies.CacheFirst());
```

**Network-First** (API calls):

```typescript
// Good for: Dynamic data
// Fresh when online, cached when offline
workbox.routing.registerRoute(
  /\/api\//,
  new workbox.strategies.NetworkFirst({
    networkTimeoutSeconds: 3,
  })
);
```

**Stale-While-Revalidate** (Images):

```typescript
// Good for: Images, media
// Fast response, background update
workbox.routing.registerRoute(
  /\.(?:png|jpg|jpeg|svg|gif)$/,
  new workbox.strategies.StaleWhileRevalidate()
);
```

### Push Notifications Flow

**Setup** (once per device):

1. Request permission: `Notification.requestPermission()`
2. Generate push subscription: `registration.pushManager.subscribe()`
3. Send subscription to server
4. Store in database with device ID

**Trigger** (when budget exceeded):

1. Server detects budget exceeded
2. Server sends push to all device subscriptions
3. Service worker receives push event
4. Service worker shows notification

**Click handling**:

```typescript
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/budgets"));
});
```

### Cloudflare Pages Configuration

**Build settings**:

```
Build command: npm run build
Build output: dist
Root directory: /
Node version: 18
```

**Environment variables** (in dashboard):

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
```

**Preview deployments**:

- Every PR gets preview URL
- Auto-deleted when PR closed
- Useful for testing before merge

---

**Ready to start?** → `chunks/041-pwa-manifest/README.md`

**Completed Milestones 1-2?** Minimum viable product ready to deploy.

**Completed Milestones 1-4?** Full-featured offline-first sync app ready for production!

---

## 🎉 Congratulations!

After completing Milestone 5, you have:

✅ A fully functional financial management app
✅ Offline-first architecture
✅ Multi-device synchronization
✅ Installable Progressive Web App
✅ Production deployment
✅ Comprehensive test coverage

**You built a production-grade application!**

### Share Your Success

- Deploy to custom domain
- Share with friends and family
- Collect feedback
- Iterate and improve

### Next Steps

- Monitor error logs
- Track user engagement
- Optimize performance
- Add requested features
- Scale as needed

**Welcome to production! 🚀**
