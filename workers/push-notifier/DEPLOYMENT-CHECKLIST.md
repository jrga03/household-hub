# Push Notification Worker Deployment Checklist

Use this checklist to ensure proper deployment of the Household Hub push notification worker.

## Pre-Deployment

### 1. Generate VAPID Keys (First Time Only)

```bash
# Install web-push CLI globally
npm install -g web-push

# Generate keys
npx web-push generate-vapid-keys

# Save output - you'll need both keys
```

**Output example:**

```
Public Key:  BLc5asl8GQ8vq4B3sdmA0mZ1Oaw7mB199CDw5nIvP24cU5vJxgFV8OxKCbPNQqyqC36HrpV_KeNTp0N5mvVcCqM
Private Key: c6yxglDendazbZ0KtiWEW8palsOcSD4z_cAU9D467XQ
```

**Security Note**: Keep the private key secret! Only the public key goes in your PWA.

---

### 2. Gather Supabase Credentials

From Supabase Dashboard → Settings → API:

- [ ] Copy `SUPABASE_URL` (e.g., https://xxxxx.supabase.co)
- [ ] Copy `anon public` key (NOT needed for worker)
- [ ] Copy `service_role` key (⚠️ SECRET - for worker only)

From Supabase Dashboard → Settings → API → JWT Settings:

- [ ] Copy `JWT Secret` (⚠️ SECRET)

---

### 3. Update Configuration Files

#### wrangler.toml

```bash
cd workers/push-notifier
```

Edit `wrangler.toml` and update:

```toml
[env.production]
vars = {
  ENVIRONMENT = "production",
  SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co"  # ← Update this line
}
```

---

## Deployment Steps

### 4. Install Dependencies

```bash
npm install
```

Expected output:

```
added 150 packages
```

---

### 5. Set Production Secrets

```bash
# Set Supabase JWT secret
wrangler secret put SUPABASE_JWT_SECRET
# Paste secret when prompted

# Set Supabase service role key
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Paste key when prompted

# Set VAPID public key
wrangler secret put VAPID_PUBLIC_KEY
# Paste public key when prompted

# Set VAPID private key
wrangler secret put VAPID_PRIVATE_KEY
# Paste private key when prompted
```

**Verification:**

```bash
wrangler secret list
```

Expected output:

```
SUPABASE_JWT_SECRET
SUPABASE_SERVICE_ROLE_KEY
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
```

---

### 6. Deploy to Cloudflare

```bash
npm run deploy
```

Expected output:

```
✨ Built successfully, built project size is 50 KiB
✨ Published household-hub-push
   https://household-hub-push.YOUR_SUBDOMAIN.workers.dev
```

**Save the worker URL** - you'll need it in your PWA configuration.

---

## Post-Deployment Verification

### 7. Test Worker Health

```bash
curl https://household-hub-push.YOUR_SUBDOMAIN.workers.dev
```

Expected: 405 Method Not Allowed (OPTIONS/GET not supported)

---

### 8. Test OPTIONS Request (CORS)

```bash
curl -X OPTIONS https://household-hub-push.YOUR_SUBDOMAIN.workers.dev/notify \
  -H "Origin: https://household-hub.pages.dev" \
  -v
```

Expected headers in response:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

### 9. Test JWT Validation

Get a valid JWT token from your PWA (from localStorage or Supabase client):

```bash
export JWT_TOKEN="your-jwt-token-here"

curl -X POST https://household-hub-push.YOUR_SUBDOMAIN.workers.dev/notify \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/test",
      "keys": {
        "p256dh": "test-key",
        "auth": "test-auth"
      }
    },
    "title": "Test Notification",
    "body": "Deployment verification test"
  }'
```

Expected response (might fail to send, but JWT should be valid):

```json
{
  "success": false,
  "error": "Failed to send notification: ..."
}
```

**OR** (if subscription is valid):

```json
{
  "success": true,
  "message": "Notification sent successfully"
}
```

---

### 10. Test Cron Triggers

```bash
# Test transaction reminders (8 AM job)
curl "https://household-hub-push.YOUR_SUBDOMAIN.workers.dev/__scheduled?cron=0+8+*+*+*"

# Test budget alerts (9 AM job)
curl "https://household-hub-push.YOUR_SUBDOMAIN.workers.dev/__scheduled?cron=0+9+*+*+*"
```

**Note**: These will call Supabase Edge Functions. Check worker logs:

```bash
wrangler tail
```

Expected logs:

```
Cron triggered: 0 8 * * * at 2024-01-15T08:00:00.000Z
Transaction reminders function called successfully
```

---

## Update PWA Configuration

### 11. Add Worker URL to PWA Environment

In your frontend project, update `.env.production`:

```bash
VITE_PUSH_WORKER_URL=https://household-hub-push.YOUR_SUBDOMAIN.workers.dev
VITE_VAPID_PUBLIC_KEY=BLc5asl8GQ8vq4B3sdmA0mZ1Oaw7mB199CDw5nIvP24cU5vJxgFV8OxKCbPNQqyqC36HrpV_KeNTp0N5mvVcCqM
```

### 12. Update Service Worker Registration

Ensure your PWA uses the VAPID public key when registering for push:

```typescript
// src/lib/push-notifications.ts
const registration = await navigator.serviceWorker.ready;

const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
});
```

---

## Monitoring Setup

### 13. Enable Worker Analytics

In Cloudflare Dashboard:

1. Go to Workers & Pages → household-hub-push
2. Navigate to Metrics tab
3. Enable Analytics (included in free tier)

### 14. Set Up Alerts (Optional)

In Cloudflare Dashboard → Notifications:

- [ ] Alert on worker error rate > 5%
- [ ] Alert on worker invocations > 80k/day
- [ ] Alert on cron failure

---

## Troubleshooting Common Issues

### Issue: "Unauthorized: Invalid JWT signature"

**Cause**: JWT secret mismatch

**Fix**:

```bash
# Get correct secret from Supabase Dashboard → Settings → API → JWT Settings
wrangler secret put SUPABASE_JWT_SECRET
# Paste correct value
```

### Issue: Cron jobs not running

**Cause**: Crons require deployed worker (not dev mode)

**Fix**: Ensure worker is deployed via `npm run deploy`

### Issue: CORS errors in browser

**Cause**: Incorrect CORS headers

**Fix**: Update `src/index.ts` CORS_HEADERS to match your domain

### Issue: "Failed to send notification: Subscription expired"

**Cause**: User's push subscription is invalid (HTTP 410)

**Fix**: Delete subscription from database, prompt user to re-enable notifications

---

## Rollback Procedure

If deployment fails or causes issues:

```bash
# 1. List recent deployments
wrangler deployments list

# 2. Rollback to previous version
wrangler rollback [deployment-id]

# 3. Verify rollback
curl https://household-hub-push.YOUR_SUBDOMAIN.workers.dev
```

---

## Security Checklist

- [ ] All secrets set via `wrangler secret put` (not in wrangler.toml)
- [ ] No secrets committed to Git
- [ ] VAPID private key never exposed to client
- [ ] Service role key only used in cron jobs (server-side)
- [ ] JWT verification enabled for all POST requests
- [ ] CORS headers restrict origin (update from `*` to specific domain)
- [ ] Worker URL uses HTTPS
- [ ] Logs don't expose sensitive data

---

## Post-Deployment Testing (End-to-End)

### Test Full Notification Flow

1. **In PWA**: Request notification permission
2. **In PWA**: Subscribe to push notifications (generates subscription object)
3. **In PWA**: Send test notification via worker
4. **Verify**: Notification appears in browser/device

### Test Scheduled Notifications

1. Wait for cron trigger (or manually trigger via `__scheduled` endpoint)
2. Check Supabase Edge Function logs
3. Verify notifications sent to subscribed users

---

## Documentation Updates

After successful deployment:

- [ ] Update `README.md` with actual worker URL
- [ ] Document VAPID public key in PWA docs
- [ ] Update architecture diagrams with worker endpoint
- [ ] Add worker URL to deployment guide

---

## Checklist Summary

### Pre-Deployment

- [ ] Generate VAPID keys
- [ ] Gather Supabase credentials
- [ ] Update wrangler.toml

### Deployment

- [ ] Install dependencies
- [ ] Set production secrets
- [ ] Deploy to Cloudflare

### Verification

- [ ] Test worker health
- [ ] Test CORS
- [ ] Test JWT validation
- [ ] Test cron triggers

### Integration

- [ ] Update PWA environment variables
- [ ] Update service worker registration
- [ ] Enable monitoring

### Security

- [ ] Verify no secrets in Git
- [ ] Confirm CORS restrictions
- [ ] Test JWT validation

---

**Deployment Date**: **\*\***\_\_\_**\*\***
**Deployed By**: **\*\***\_\_\_**\*\***
**Worker URL**: https://household-hub-push._______________.workers.dev
**Version**: 1.0.0 (Chunk 043)
