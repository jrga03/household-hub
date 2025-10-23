# Verification: Push Notifications

Complete verification checklist for chunk 043.

---

## Prerequisites Verification

Before starting implementation, verify all prerequisites are met:

### 1. Devices Table Exists (Chunk 027)

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM devices;"
```

**Expected**: Returns a count (>= 0). If error "relation does not exist", complete chunk 027 first.

```bash
psql $DATABASE_URL -c "\d devices" | grep "device_id"
```

**Expected**: Shows `id` column of type TEXT.

### 2. Profiles Has Notification Preferences

```bash
psql $DATABASE_URL -c "SELECT notification_preferences FROM profiles LIMIT 1;"
```

**Expected**: Returns JSONB like `{"budget_alerts": true, "mentions": true, "due_dates": true}`.

If column doesn't exist, add migration:

```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS notification_preferences JSONB
DEFAULT '{"budget_alerts": true, "mentions": true, "due_dates": true}';
```

### 3. Service Worker Registered (Chunks 041-042)

Visit app in browser:

1. Open DevTools → Application → Service Workers
2. **Expected**: Service worker shows "activated and running"
3. **Expected**: Status is green (not installing, not waiting)

### 4. PWA Manifest Configured

```bash
test -f public/manifest.json && echo "✅ Manifest exists" || echo "❌ Create manifest"
```

---

## Implementation Verification

### Step 1: VAPID Keys Generated

```bash
# Check keys were generated
test -n "$VAPID_PUBLIC_KEY" && echo "✅ Public key set"
test -n "$VAPID_PRIVATE_KEY" && echo "✅ Private key set"
```

**Expected**: Both keys should be base64-url encoded strings starting with 'B' (public) and alphanumeric (private).

Store keys securely for next steps.

---

### Step 2: Cloudflare Worker Deployed

```bash
# Check worker responds
curl https://household-hub-push.your-subdomain.workers.dev

```

**Expected**:

- 401 Unauthorized (expected - no JWT provided)
- NOT 404 or connection refused

```bash
# Verify secrets are set
cd workers/push-notifier
wrangler secret list
```

**Expected output**:

```
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
SUPABASE_JWT_SECRET
SUPABASE_SERVICE_ROLE_KEY
```

---

### Step 3: Push Subscription Hook Works

1. Import hook in a test component
2. Check state values:

```typescript
const { permission, isSubscribed, canAsk, isDenied } = usePushNotifications();
console.log({ permission, isSubscribed, canAsk, isDenied });
```

**Expected**:

- `permission`: "default", "granted", or "denied"
- `isSubscribed`: boolean
- `canAsk`: true if permission is "default"
- `isDenied`: true if permission is "denied"

---

### Step 4: Notification Preferences Functional

1. Open NotificationSettings component
2. Enable notifications
3. Toggle a preference switch
4. Check database:

```sql
SELECT notification_preferences FROM profiles WHERE id = 'your-user-id';
```

**Expected**: Preferences reflect toggle changes in real-time.

---

### Step 5: Database Schema Correct

```bash
psql $DATABASE_URL -c "\d push_subscriptions"
```

**Expected output should include**:

```
Column      | Type                        | Modifiers
------------+-----------------------------+----------
id          | uuid                        | not null default gen_random_uuid()
user_id     | uuid                        | not null
device_id   | text                        | not null
endpoint    | text                        | not null
p256dh      | text                        | not null
auth        | text                        | not null
created_at  | timestamp with time zone    | not null default now()
updated_at  | timestamp with time zone    | not null default now()

Indexes:
    "push_subscriptions_pkey" PRIMARY KEY, btree (id)
    "push_subscriptions_user_id_device_id_key" UNIQUE CONSTRAINT, btree (user_id, device_id)
    "idx_push_subscriptions_user" btree (user_id)
    "idx_push_subscriptions_device" btree (device_id)

Foreign-key constraints:
    "push_subscriptions_device_id_fkey" FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
```

**Critical checks**:

- ✅ `device_id` column exists and references `devices(id)`
- ✅ Separate `p256dh` and `auth` columns (NOT JSONB)
- ✅ UNIQUE constraint on `(user_id, device_id)`
- ✅ Both indexes exist

---

### Step 5.5: RPC Function Exists

```bash
psql $DATABASE_URL -c "\df check_budget_thresholds"
```

**Expected**: Function exists with return type `TABLE(id uuid, user_id uuid, ...)`

Test function:

```sql
SELECT * FROM check_budget_thresholds();
```

**Expected**: Returns budgets >= 80% of target (may be empty if no budgets exceed threshold).

---

### Step 6: Budget Alerts Function Deployed

```bash
supabase functions list | grep budget-alerts
```

**Expected**: Shows `budget-alerts` function.

Test invocation:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/budget-alerts \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Expected**: Returns `{"success": true}` (or `{"message": "No budgets to alert"}`).

---

### Step 6.5: Transaction Reminders Deployed

```bash
supabase functions list | grep transaction-reminders
```

**Expected**: Shows `transaction-reminders` function.

Test invocation:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/transaction-reminders \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```

**Expected**: Returns success response.

---

### Step 7: Service Worker Push Handlers

1. Open DevTools → Application → Service Workers
2. Click "Update" to reload SW
3. Check SW source includes:

```javascript
self.addEventListener('push', ...)
self.addEventListener('notificationclick', ...)
```

**Manual test**:

```javascript
// In browser console
navigator.serviceWorker.ready.then(async (reg) => {
  await reg.showNotification("Test", {
    body: "Service worker notification test",
    icon: "/icons/icon-192x192.png",
  });
});
```

**Expected**: Notification appears in system tray.

---

### Step 8: End-to-End Test

1. **Subscribe to push**:
   - Open app
   - Go to notification settings
   - Click "Enable Notifications"
   - Grant permission in browser prompt

2. **Verify subscription saved**:

```sql
SELECT * FROM push_subscriptions WHERE user_id = 'your-user-id';
```

**Expected**: Row with `device_id`, `endpoint`, `p256dh`, `auth`.

3. **Test worker notification**:

```bash
# Get subscription details from database
SUBSCRIPTION='{"endpoint":"...","keys":{"p256dh":"...","auth":"..."}}'

# Get your JWT token from DevTools → Application → Local Storage → supabase.auth.token

curl -X POST https://household-hub-push.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d "{
    \"subscription\": $SUBSCRIPTION,
    \"title\": \"Test Notification\",
    \"body\": \"Worker is sending this\",
    \"data\": {\"tag\": \"test\", \"url\": \"/\"}
  }"
```

**Expected**:

- Response: `{"success": true}`
- Notification appears on device
- Clicking notification opens app to `/`

4. **Test cron trigger** (if deployed with cron):

```bash
# Manually trigger cron (if using Cloudflare Pages)
wrangler pages deployment tail --project=household-hub

# Wait for scheduled time (9 AM) or trigger manually via dashboard
```

**Expected**: Budget alerts function is called at 9 AM, transaction reminders at 8 AM.

---

## Security Verification

### JWT Validation Works

Test unauthorized request:

```bash
curl -X POST https://household-hub-push.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"subscription": {}, "title": "Test", "body": "Test"}'
```

**Expected**: 401 Unauthorized (no Bearer token).

Test invalid token:

```bash
curl -X POST https://household-hub-push.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid.token.here" \
  -d '{"subscription": {}, "title": "Test", "body": "Test"}'
```

**Expected**: 401 Unauthorized (invalid JWT).

---

## Browser Compatibility

### Chrome/Edge

- ✅ Permission prompt appears
- ✅ Notification displays
- ✅ Click routing works

### Firefox

- ✅ Permission prompt appears
- ✅ Notification displays
- ⚠️ Install prompt may not show (Firefox doesn't support)

### Safari (macOS/iOS 16.4+)

- ✅ Permission prompt appears (iOS requires PWA installed)
- ✅ Notification displays
- ⚠️ Background sync not supported (use fallback)

---

## Performance Checks

### Subscription Time

```javascript
console.time("subscribe");
await usePushNotifications().subscribe();
console.timeEnd("subscribe");
```

**Expected**: < 2 seconds.

### Worker Response Time

```bash
time curl -X POST https://household-hub-push.your-subdomain.workers.dev \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subscription": {...}, "title": "Test", "body": "Test"}'
```

**Expected**: < 500ms.

---

## Common Issues

### "device_id not found" Error

**Cause**: devices table doesn't exist or DeviceManager not initialized.

**Fix**:

1. Complete chunk 027 (devices table)
2. Ensure `window.deviceManager.getDeviceId()` is available

### Notification Permission Denied

**Cause**: User previously denied, or browser settings block.

**Fix**: Instruct user to reset in browser settings → Site Settings → Notifications.

### Worker 401 Error

**Cause**: JWT validation failing.

**Fix**:

1. Verify `SUPABASE_JWT_SECRET` matches project JWT secret
2. Check token is valid (not expired)
3. Ensure Authorization header format: `Bearer <token>`

### Cron Not Triggering

**Cause**: Worker not deployed with cron triggers.

**Fix**:

1. Verify `[triggers]` section in `wrangler.toml`
2. Redeploy worker: `wrangler deploy`
3. Check Cloudflare dashboard → Workers → Triggers

---

## Success Criteria

- [ ] All prerequisites met (devices table, profiles field, service worker)
- [ ] VAPID keys generated and stored in worker secrets
- [ ] Cloudflare Worker deployed and responds (with JWT validation)
- [ ] Push subscription hook creates database records with device_id
- [ ] Notification preferences save to profiles table
- [ ] Database schema matches DATABASE.md specification exactly
- [ ] check_budget_thresholds RPC function exists and works
- [ ] Budget alerts and transaction reminders functions deployed
- [ ] Service worker push/notificationclick handlers added
- [ ] End-to-end test: notification sent → received → clicked → routed
- [ ] Security: Unauthorized requests return 401
- [ ] Cron triggers configured for 8 AM and 9 AM

---

## Next Chunk

Once all verifications pass, proceed to **Chunk 044: Analytics Dashboard**.
