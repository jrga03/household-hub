# Troubleshooting: Push Notifications

---

## Prerequisites Issues

### Problem: "relation 'devices' does not exist"

**Cause**: Devices table not created (chunk 027 not completed).

**Solution**:

1. Complete chunk 027 first:

   ```bash
   cd docs/implementation/chunks/027-devices-table
   cat instructions.md
   ```

2. Verify devices table exists:
   ```sql
   SELECT * FROM devices LIMIT 1;
   ```

---

### Problem: Column "device_id" does not exist in push_subscriptions

**Cause**: Old migration schema used (JSONB subscription instead of separate fields).

**Solution**:

1. Drop and recreate table with correct schema:

   ```sql
   DROP TABLE IF EXISTS push_subscriptions CASCADE;
   ```

2. Run migration from Step 5 of instructions.md (correct schema with device_id).

3. Verify schema:
   ```sql
   \d push_subscriptions
   ```

**Expected**: `device_id TEXT NOT NULL REFERENCES devices(id)`

---

### Problem: "notification_preferences" column not found in profiles

**Cause**: Profiles table missing notification preferences field.

**Solution**:

```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB
DEFAULT '{"budget_alerts": true, "mentions": true, "due_dates": true}';
```

---

## Permission Issues

### Problem: Permission prompt never shows

**Cause**: Already denied or browser policy

**Solution**:

1. Check permission status:

   ```javascript
   console.log(Notification.permission);
   ```

2. Reset in browser settings:
   - Chrome: Settings → Privacy → Site Settings → Notifications
   - Safari: Preferences → Websites → Notifications

---

## Subscription Issues

### Problem: "PushManager not available"

**Cause**: Service worker not active or HTTPS required

**Solution**:

```javascript
// Check prerequisites
console.log("SW:", "serviceWorker" in navigator);
console.log("Push:", "PushManager" in window);
console.log("Secure:", window.isSecureContext);
```

---

### Problem: VAPID key error

**Symptoms**: "Invalid VAPID key"

**Solution**: Verify key format:

```javascript
// Must be base64-url encoded, no padding
const key = "BM8xyz..."; // Should start with 'B' usually
```

---

## JWT/Authentication Issues

### Problem: Worker returns 401 Unauthorized

**Cause**: Missing or invalid JWT token.

**Solution**:

1. Check Authorization header is present:

   ```bash
   curl -v https://your-worker.workers.dev
   ```

   Look for `Authorization: Bearer <token>`

2. Verify JWT secret matches Supabase:
   - Get secret: Supabase Dashboard → Settings → API → JWT Secret
   - Compare with worker: `wrangler secret list` (should show SUPABASE_JWT_SECRET)

3. Check token expiry:

   ```javascript
   const token = localStorage.getItem("supabase.auth.token");
   const payload = JSON.parse(atob(token.split(".")[1]));
   console.log("Expires:", new Date(payload.exp * 1000));
   ```

4. Get fresh token:
   ```javascript
   const {
     data: { session },
   } = await supabase.auth.getSession();
   console.log("Token:", session.access_token);
   ```

---

### Problem: "JWT verification failed: Invalid signature"

**Cause**: JWT secret mismatch between Supabase and Worker.

**Solution**:

```bash
# Update JWT secret in worker
wrangler secret put SUPABASE_JWT_SECRET
# Paste exact JWT Secret from Supabase Dashboard → Settings → API

# Redeploy
wrangler deploy
```

---

## RPC Function Issues

### Problem: "function check_budget_thresholds() does not exist"

**Cause**: RPC function not created (Step 5.5 skipped).

**Solution**:

Run the SQL from Step 5.5 in instructions.md:

```sql
CREATE OR REPLACE FUNCTION check_budget_thresholds() ...
```

Verify:

```sql
\df check_budget_thresholds
```

---

### Problem: check_budget_thresholds returns empty result

**Cause**: No budgets exceed 80% threshold (this is normal).

**Solution**: Create test budget with high spending to verify:

```sql
-- Create test budget
INSERT INTO budgets (category_id, amount_cents, month_key, household_id)
VALUES ('your-category-id', 10000, '2025-10-01', 'your-household-id');

-- Create test expense (90% of budget)
INSERT INTO transactions (amount_cents, type, category_id, date, household_id)
VALUES (9000, 'expense', 'your-category-id', CURRENT_DATE, 'your-household-id');

-- Should now return the budget
SELECT * FROM check_budget_thresholds();
```

---

## Service Worker Issues

### Problem: Push event handler not firing

**Cause**: Service worker not updated or incorrect registration.

**Solution**:

1. Force update SW:
   - DevTools → Application → Service Workers → "Update"
   - Or clear site data and reload

2. Check SW source includes push handler:

   ```javascript
   // Should see this in SW source
   self.addEventListener('push', ...)
   ```

3. Verify Vite PWA config (if using):
   ```typescript
   VitePWA({
     strategies: "injectManifest",
     srcDir: "src",
     filename: "sw.ts",
   });
   ```

---

## Notification Issues

### Problem: Notifications don't appear

**Causes & Solutions**:

1. **Do Not Disturb enabled**: Check system settings
2. **Browser closed**: Background notifications require persistent SW
3. **Permission denied**: User blocked notifications
4. **Service worker not handling push events**: Check troubleshooting above

---

### Problem: Notification click doesn't route correctly

**Cause**: notificationclick handler not implemented or wrong URL.

**Solution**:

Check service worker has notificationclick handler:

```javascript
self.addEventListener("notificationclick", (event) => {
  const targetUrl = event.notification.data?.url || "/";
  clients.openWindow(targetUrl);
});
```

---

### Problem: iOS Safari no notifications

**Cause**: iOS Safari 16.4+ required and PWA must be installed.

**Solution**:

1. Check iOS version >= 16.4
2. Ensure PWA is installed to home screen (not just in browser)
3. Provide fallback UI for unsupported versions

---

## Worker Issues

### Problem: Worker returns 500 error

**Check logs**:

```bash
cd workers/push-notifier
wrangler tail
```

**Common fixes**:

- Verify all secrets set: `wrangler secret list`
- Check subscription format (endpoint, keys.p256dh, keys.auth)
- Verify VAPID keys match
- Check JWT validation isn't throwing

---

### Problem: Worker cron not triggering

**Cause**: Cron triggers not configured or wrong schedule.

**Solution**:

1. Check wrangler.toml has triggers:

   ```toml
   [triggers]
   crons = ["0 9 * * *", "0 8 * * *"]
   ```

2. Verify scheduled handler exists in worker:

   ```typescript
   async scheduled(event, env, ctx) { ... }
   ```

3. Check Cloudflare dashboard: Workers → household-hub-push → Triggers

4. Test manually via Cloudflare dashboard "Send Test Event"

---

## Database Issues

### Problem: Foreign key violation on device_id

**Cause**: Trying to insert subscription with device_id that doesn't exist in devices table.

**Solution**:

1. Ensure device is registered first:

   ```typescript
   const deviceId = await window.deviceManager.getDeviceId();
   // Device should auto-register on app load (chunk 027)
   ```

2. Verify device exists:

   ```sql
   SELECT * FROM devices WHERE id = 'your-device-id';
   ```

3. If device missing, trigger registration:
   ```typescript
   await window.deviceManager.registerDevice();
   ```

---

## Quick Fixes

```bash
# Reset worker secrets
cd workers/push-notifier

wrangler secret delete VAPID_PUBLIC_KEY
wrangler secret delete VAPID_PRIVATE_KEY
wrangler secret delete SUPABASE_JWT_SECRET
wrangler secret delete SUPABASE_SERVICE_ROLE_KEY

# Generate new VAPID keys
npx web-push generate-vapid-keys

# Re-add all secrets
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put SUPABASE_JWT_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Redeploy
wrangler deploy
```

---

## Debug Checklist

When notifications aren't working, check in order:

1. ✅ Prerequisites met (devices table, profiles field, service worker active)
2. ✅ VAPID keys generated and stored in worker
3. ✅ JWT secret matches Supabase project
4. ✅ Database schema correct (device_id, p256dh, auth separate)
5. ✅ Permission granted in browser
6. ✅ Subscription created in database with device_id
7. ✅ Service worker push event handler exists
8. ✅ Worker JWT validation passes (401 for invalid tokens)
9. ✅ RPC function check_budget_thresholds exists
10. ✅ Supabase Edge Functions deployed (budget-alerts, transaction-reminders)

Run verification.md for comprehensive testing.
