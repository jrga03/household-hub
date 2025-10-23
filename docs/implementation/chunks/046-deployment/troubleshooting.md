# Troubleshooting: Deployment

---

## Deployment Failures

### Problem: Build fails in Cloudflare Pages

**Symptoms**: "Build failed" in deployment log

**Common Causes**:

1. **Missing environment variables**:
   - Check Settings → Environment variables
   - Ensure all `VITE_*` variables set
   - Redeploy after adding variables

2. **TypeScript errors**:

   ```bash
   # Build locally to see errors
   npm run build
   ```

3. **Node version mismatch**:
   - Cloudflare Pages uses Node 18 by default
   - Add `.node-version` file:
     ```
     20
     ```

---

### Problem: "Command failed with exit code 1"

**Solution**: Check build logs in Cloudflare dashboard

**Common fixes**:

- Install missing dependencies
- Fix TypeScript errors
- Resolve import path issues

---

## Runtime Errors

### Problem: Site loads but shows blank page

**Causes**:

1. **Check browser console** for JavaScript errors

2. **Missing environment variables**:

   ```javascript
   console.log("Supabase URL:", import.meta.env.VITE_SUPABASE_URL);
   // Should not be undefined
   ```

3. **Service worker issues**:
   - DevTools → Application → Clear storage
   - Unregister service worker
   - Reload

---

### Problem: "Failed to fetch" or API errors

**Causes**:

1. **CORS issues**:
   - Check Supabase dashboard → Settings → API
   - Verify production URL allowed in CORS

2. **Wrong environment variables**:
   - Verify Supabase URL/key in Cloudflare Pages
   - Check using correct project (not staging)

3. **RLS policies**:
   - Test queries in Supabase SQL editor
   - Verify policies allow operations

---

## SSL/HTTPS Issues

### Problem: "Not Secure" warning

**Cause**: Mixed content (HTTP resources on HTTPS page)

**Solution**:

```typescript
// Ensure all URLs use HTTPS
const API_URL = "https://api.example.com"; // Not http://
```

---

### Problem: Certificate error

**Cause**: DNS not propagated yet

**Solution**: Wait 5-10 minutes, clear browser cache

---

## PWA Issues

### Problem: Install prompt doesn't appear in production

**Check**:

1. **HTTPS**: Required for PWA
2. **Service worker**: Must register successfully
3. **Manifest**: Valid and served correctly
4. **Engagement**: User must interact with site first

**Debug**:

```javascript
// Check PWA install criteria
navigator.serviceWorker.ready.then((reg) => {
  console.log("SW ready:", !!reg);
});

// Check manifest
fetch("/manifest.webmanifest")
  .then((r) => r.json())
  .then(console.log);
```

---

### Problem: Service worker won't update

**Solution**:

1. **Force update**:
   - DevTools → Application → Service Workers
   - Check "Update on reload"
   - Click "Unregister" then reload

2. **Increase version**:
   ```typescript
   // In vite.config.ts
   VitePWA({
     manifestVersion: 2, // Increment this
   });
   ```

---

## Sentry Issues

### Problem: Errors not appearing in Sentry

**Check**:

1. **DSN configured**:

   ```javascript
   console.log("Sentry DSN:", import.meta.env.VITE_SENTRY_DSN);
   ```

2. **Sentry initialized**:

   ```javascript
   // Should be before app render
   initSentry();
   ```

3. **Test manually**:
   ```javascript
   Sentry.captureMessage("Test message");
   ```

---

### Problem: Too much PII in Sentry

**Solution**: Enhance `beforeSend` hook:

```typescript
beforeSend(event) {
  // Remove more sensitive data
  if (event.user) {
    delete event.user.email;
  }

  // Sanitize error messages
  if (event.message) {
    event.message = event.message.replace(/\d+/g, '[REDACTED]');
  }

  return event;
}
```

---

## Lighthouse Issues

### Problem: Lighthouse scores failing

**Solutions by category**:

**Performance (<90)**:

- Reduce bundle size
- Optimize images
- Enable caching
- Code splitting

**Accessibility (<95)**:

- Add ARIA labels
- Fix color contrast
- Add alt text
- Keyboard navigation

**Best Practices (<90)**:

- Use HTTPS everywhere
- Fix console errors
- Update dependencies

**SEO (<90)**:

- Add meta description
- Add Open Graph tags
- Ensure mobile-friendly

---

## Custom Domain Issues

### Problem: Domain doesn't resolve

**Causes**:

1. **DNS not propagated**: Wait up to 24 hours

2. **Wrong DNS settings**:

   ```
   # Should be CNAME, not A record
   Type: CNAME
   Name: @
   Value: your-site.pages.dev
   ```

3. **Check DNS propagation**:
   ```bash
   nslookup your-domain.com
   ```

---

### Problem: "Too many redirects"

**Cause**: DNS misconfigured or HTTPS redirect loop

**Solution**:

- Check DNS settings in Cloudflare
- Ensure HTTPS/SSL set to "Full"

---

## Database Issues

### Problem: Production queries slow

**Solutions**:

1. **Add indexes**:

   ```sql
   CREATE INDEX idx_transactions_date ON transactions(date);
   ```

2. **Check query plans**:

   ```sql
   EXPLAIN ANALYZE SELECT * FROM transactions WHERE date > '2025-01-01';
   ```

3. **Monitor in Supabase dashboard** → Database → Query Performance

---

## Rollback Procedure

### Before Rolling Back

**CRITICAL**: Check if database schema changed between deployments

```bash
# 1. Check migrations between deployments
git log --oneline --since="1 day ago" -- supabase/migrations/

# 2. If migrations exist, note them for rollback
```

**If schema changed**: Rollback database FIRST, then frontend

---

### Database Rollback (If Needed)

**Only if migrations were applied in broken deployment:**

```bash
# 1. Create rollback migration
npx supabase migration new rollback_<feature_name>

# 2. Write reverse migration
# Example: If migration added column, DROP it
# If migration created table, DROP TABLE

# 3. Apply rollback migration
npx supabase db push
```

**Example rollback migration**:

```sql
-- Rollback for: Added user_preferences table

DROP TABLE IF EXISTS user_preferences CASCADE;
```

**Verify rollback**:

```bash
npx supabase db diff
# Should show no pending changes
```

---

### Frontend Rollback

#### Quick Rollback (Cloudflare Dashboard)

1. Cloudflare Pages dashboard
2. Deployments tab
3. Find previous **working** deployment
   - ✅ Check it was successful (green checkmark)
   - ✅ Verify timestamp is before issue started
4. Click "..." → "Rollback to this deployment"
5. Confirm

**Takes 1-2 minutes to apply.**

**Verify**:

- Visit production URL
- Test critical paths (auth, transactions)
- Check browser console for errors

---

#### Manual Rollback (Git)

```bash
# Option 1: Revert last commit (safer, preserves history)
git revert HEAD
git push origin main

# Option 2: Revert specific commit
git log --oneline  # Find commit hash
git revert <commit-hash>
git push origin main

# Option 3: Hard reset (DANGER: rewrites history)
git reset --hard <working-commit-hash>
git push origin main --force
```

**⚠️ NEVER force push to main** unless absolutely necessary and team is notified

---

### Complete Rollback Checklist

Use this for production incidents:

#### Phase 1: Assess (2 min)

- [ ] Identify broken deployment timestamp
- [ ] Check if schema changed: `git log supabase/migrations/`
- [ ] Find last working deployment
- [ ] Notify team (if applicable)

#### Phase 2: Database Rollback (5-10 min, if needed)

- [ ] Create rollback migration
- [ ] Test rollback in staging first (if available)
- [ ] Apply to production: `npx supabase db push`
- [ ] Verify: `npx supabase db diff`

#### Phase 3: Frontend Rollback (2 min)

- [ ] Cloudflare Pages → Rollback to previous deployment
- [ ] OR: Git revert and push
- [ ] Wait for deployment (1-2 min)

#### Phase 4: Verify (5 min)

- [ ] Visit production URL
- [ ] Test auth flow
- [ ] Create test transaction
- [ ] Check browser console
- [ ] Check Sentry for errors
- [ ] Monitor for 15 minutes

#### Phase 5: Root Cause (Later)

- [ ] Review failed deployment logs
- [ ] Identify what broke
- [ ] Create fix in development
- [ ] Test thoroughly before redeploying

---

## Prevention Tips

1. **Test staging first**: Deploy to staging before production
2. **Monitor after deploy**: Watch Sentry for 30 minutes post-deploy
3. **Gradual rollout**: Use preview deployments to test
4. **Keep dependencies updated**: Regular `npm update`
5. **Document changes**: Clear commit messages
6. **Backup before deploy**: Export data just in case

---

## Emergency Contacts

**Critical production issues**:

1. Check status pages:
   - https://www.cloudflarestatus.com/
   - https://status.supabase.com/

2. Rollback immediately if user-facing issues

3. Fix in development, test thoroughly, redeploy

---

## Quick Fixes

```bash
# Clear everything and redeploy
# In Cloudflare Pages dashboard:
# 1. Settings → Functions → Purge cache
# 2. Deployments → Retry deployment

# Local debugging
npm run build
npm run preview
# Test as production locally

# Force fresh deploy
git commit --allow-empty -m "Force redeploy"
git push
```

---

**Remember**: Production issues are stressful but manageable. Always have a rollback plan ready!
