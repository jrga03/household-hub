# Checkpoint: Push Notifications

---

## Prerequisites Verified ✓

```bash
# 1. Check devices table exists (chunk 027)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM devices;"

# 2. Check profiles has notification_preferences
psql $DATABASE_URL -c "SELECT notification_preferences FROM profiles LIMIT 1;"

# 3. Check service worker registered
# DevTools → Application → Service Workers → "activated and running"
```

**Expected**: All checks pass before proceeding.

---

## 1. VAPID Keys Generated ✓

```bash
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

## 2. Worker Deployed with JWT Validation ✓

```bash
curl https://household-hub-push.your-subdomain.workers.dev
```

**Expected**: 401 Unauthorized (JWT required - this is correct!)

Test with invalid token:

```bash
curl -X POST https://household-hub-push.your-subdomain.workers.dev \
  -H "Authorization: Bearer invalid" \
  -H "Content-Type: application/json" \
  -d '{"subscription":{},"title":"Test","body":"Test"}'
```

**Expected**: 401 Unauthorized (JWT validation working!)

---

## 3. Database Schema Correct ✓

```bash
psql $DATABASE_URL -c "\d push_subscriptions"
```

**Critical checks**:

- ✅ `device_id` column exists (TEXT, NOT NULL, references devices(id))
- ✅ Separate `p256dh` and `auth` columns (NOT JSONB)
- ✅ UNIQUE constraint on `(user_id, device_id)`
- ✅ Indexes on `user_id` and `device_id`

---

## 4. RPC Function Exists ✓

```bash
psql $DATABASE_URL -c "SELECT * FROM check_budget_thresholds();"
```

**Expected**: Returns budgets >= 80% threshold (may be empty).

---

## 5. Permission Request Works ✓

**Test**:

1. Open NotificationSettings component
2. Click "Enable Notifications"
3. **Expected**: Browser permission prompt appears
4. Click "Allow"
5. **Expected**: UI updates to show notification preferences (3 switches)

---

## 6. Subscription Created with device_id ✓

Check database:

```sql
SELECT user_id, device_id, endpoint, p256dh, auth FROM push_subscriptions;
```

**Expected**:

- Row exists with your user_id
- `device_id` is populated (from DeviceManager)
- `endpoint`, `p256dh`, `auth` are separate fields

---

## 7. Notification Preferences Functional ✓

1. Toggle "Budget Alerts" switch OFF
2. Check database:

```sql
SELECT notification_preferences FROM profiles WHERE id = 'your-user-id';
```

**Expected**: `{"budget_alerts": false, "mentions": true, "due_dates": true}`

---

## 8. Service Worker Push Handlers ✓

```javascript
// In browser console
navigator.serviceWorker.ready.then(async (reg) => {
  await reg.showNotification("SW Test", {
    body: "Service worker notification",
    icon: "/icons/icon-192x192.png",
  });
});
```

**Expected**: Notification appears in system tray.

Click notification → **Expected**: App window focuses or opens.

---

## 9. Worker Sends Notifications (Authenticated) ✓

Get your JWT token from DevTools → Application → Local Storage → `supabase.auth.token`.

Test via API:

```bash
curl -X POST https://household-hub-push.your-subdomain.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "subscription": {
      "endpoint": "...",
      "keys": {"p256dh": "...", "auth": "..."}
    },
    "title": "Test from Worker",
    "body": "JWT validated successfully!",
    "data": {"tag": "test"}
  }'
```

**Expected**:

- Response: `{"success": true}`
- Notification appears on device
- Clicking notification opens/focuses app

---

## 10. Budget Alerts Function Works ✓

```bash
supabase functions invoke budget-alerts
```

**Expected**: Returns `{"success": true}` or `{"message": "No budgets to alert"}`.

---

## 11. Transaction Reminders Function Works ✓

```bash
supabase functions invoke transaction-reminders
```

**Expected**: Returns success response.

---

## 12. Cron Triggers Configured ✓

Check `workers/push-notifier/wrangler.toml`:

```toml
[triggers]
crons = ["0 9 * * *", "0 8 * * *"]
```

**Expected**: Two cron schedules (8 AM for reminders, 9 AM for budget alerts).

Verify worker `scheduled` handler calls both functions.

---

## Success Criteria

- [ ] All prerequisites verified (devices table, profiles field, service worker)
- [ ] VAPID keys + JWT secret + service role key stored in worker
- [ ] Cloudflare Worker deployed with JWT validation (401 for unauthorized)
- [ ] Database schema matches DATABASE.md (device_id, p256dh, auth separate)
- [ ] check_budget_thresholds RPC function exists and works
- [ ] Permission request works and creates subscription with device_id
- [ ] Notification preferences save to database in real-time
- [ ] Service worker push and notificationclick handlers added
- [ ] Manual test notification displays
- [ ] Worker sends notifications with valid JWT
- [ ] Budget alerts and transaction reminders functions deployed
- [ ] Cron triggers configured for 8 AM and 9 AM

---

## Next Steps

1. Test on mobile devices (iOS, Android)
2. Verify cron triggers at scheduled times
3. Run full E2E test from verification.md
4. Move to **Chunk 044: Analytics Dashboard**
