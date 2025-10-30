# Chunk 043: Push Notifications

## At a Glance

- **Time**: 2 hours
- **Milestone**: Production (3 of 6)
- **Prerequisites**:
  - Chunk 027 (devices table - for device-scoped subscriptions)
  - Chunks 041-042 (PWA + Service Worker)
- **Can Skip**: Yes - but recommended for user engagement

## What You're Building

Web Push notification system for budget alerts and reminders:

- VAPID key generation and storage
- Cloudflare Worker for push delivery
- Push subscription management
- Notification permission flow
- Budget threshold alerts
- Notification preferences UI
- Supabase cron trigger for alerts

## Why This Matters

Push notifications **drive user engagement**:

- **Budget alerts**: Warn when spending approaches limits
- **Reminders**: Pending transactions need attention
- **Retention**: 3x higher engagement with notifications
- **Timely updates**: Sync completion, errors
- **Native feel**: Like installed apps
- **Multi-device**: Subscriptions scoped per device for proper notification targeting

Per Day 14 implementation plan, this completes the notification system. Push subscriptions are **device-scoped** (linked to devices table from chunk 027) to ensure each device receives notifications appropriately.

## Before You Start

Verify prerequisites:

```bash
# 1. Check devices table exists (from chunk 027)
psql $DATABASE_URL -c "SELECT COUNT(*) FROM devices;"

# 2. Check profiles has notification_preferences field
psql $DATABASE_URL -c "SELECT notification_preferences FROM profiles LIMIT 1;"

# 3. Check service worker is registered (chunks 041-042)
# Visit app in browser, open DevTools → Application → Service Workers
# Should show "activated and running"

# 4. Verify PWA manifest configured
test -f public/manifest.json && echo "✅ PWA manifest exists"
```

If any checks fail, complete the prerequisite chunks first.

## Related Documentation

- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 490-521
- **Original**: `docs/initial plan/DATABASE.md` lines 9-38 (push_subscriptions schema)
- **Original**: `docs/initial plan/DECISIONS.md` lines 637-645 (Decision #58: Cloudflare Worker)
- **Original**: `docs/initial plan/DEPLOYMENT.md` lines 836-892 (JWT validation pattern)
- **External**: [Web Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- **External**: [VAPID Protocol](https://datatracker.ietf.org/doc/html/rfc8292)

## Key Files Created

```
workers/push-notifier/
├── src/index.ts           # Cloudflare Worker
├── wrangler.toml          # Worker config
└── package.json
src/
├── components/
│   └── NotificationSettings.tsx
├── hooks/
│   └── usePushNotifications.ts
└── lib/
    └── push-subscription.ts
supabase/functions/
└── budget-alerts/
    └── index.ts           # Cron trigger
```

## Browser Support

- ✅ Chrome 42+ (Desktop/Android)
- ✅ Firefox 44+
- ✅ Edge 17+
- ⚠️ Safari 16.4+ (iOS/macOS - limited)
- ❌ Safari < 16.4 (no support)

## Design Patterns

### Permission Request Pattern

```typescript
// Request permission only when user initiates
const requestPermission = async () => {
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    await subscribeToPush();
  }
};
```

### Subscription Pattern

```
Client → Request Permission → Subscribe → Send to Server → Store in DB
```

---

**Ready?** → Open `instructions.md` to begin
