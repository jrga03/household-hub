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

### Quick Rollback

1. Cloudflare Pages dashboard
2. Deployments tab
3. Find previous working deployment
4. Click "..." → "Rollback to this deployment"
5. Confirm

**Takes 1-2 minutes to apply.**

### Manual Rollback

```bash
# Revert to previous commit
git revert HEAD
git push origin main

# Or reset to specific commit
git reset --hard <commit-hash>
git push origin main --force
```

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
