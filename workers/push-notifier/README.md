# Household Hub Push Notification Worker

Production-ready Cloudflare Worker for handling Web Push notifications in the Household Hub application.

## Features

- **JWT Authentication**: Validates Supabase JWT tokens before sending notifications
- **Web Push API**: Sends notifications using VAPID protocol
- **Scheduled Jobs**: Triggers budget alerts (9 AM UTC) and transaction reminders (8 AM UTC) via cron
- **Security First**: Service role key never exposed to client, all secrets managed via Wrangler CLI
- **CORS Support**: Handles cross-origin requests with proper headers
- **Error Handling**: Comprehensive error handling with specific status codes and messages

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Client (PWA)                       │
│  - Obtains PushSubscription from browser             │
│  - Sends subscription + notification request         │
│  - Includes JWT in Authorization header              │
└────────────────────┬────────────────────────────────┘
                     │ HTTPS + JWT
                     ▼
┌─────────────────────────────────────────────────────┐
│          Cloudflare Worker (This Service)            │
│  1. Verify JWT signature (HMAC-SHA256)               │
│  2. Extract user ID from JWT payload                 │
│  3. Configure web-push with VAPID keys               │
│  4. Send notification via Web Push API               │
│  5. Return success/error response                    │
└────────────────────┬────────────────────────────────┘
                     │ Web Push Protocol
                     ▼
┌─────────────────────────────────────────────────────┐
│            Browser Push Service                      │
│  (Firebase Cloud Messaging, Apple Push, etc.)        │
└─────────────────────────────────────────────────────┘
```

## File Structure

```
workers/push-notifier/
├── src/
│   ├── index.ts          # Main worker (fetch + scheduled handlers)
│   └── auth-utils.ts     # JWT verification utilities
├── package.json          # Dependencies (web-push ^3.6.6)
├── wrangler.toml         # Worker configuration
├── tsconfig.json         # TypeScript configuration
└── README.md            # This file
```

## Installation

```bash
cd workers/push-notifier
npm install
```

## Development

### Local Testing

```bash
npm run dev
```

This starts Wrangler in dev mode on `http://localhost:8787`.

### Testing Push Notifications Locally

```bash
# Send a test notification
curl -X POST http://localhost:8787/notify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    },
    "title": "Test Notification",
    "body": "This is a test notification from Household Hub",
    "urgency": "normal"
  }'
```

### Testing Cron Triggers Locally

```bash
# Trigger the 8 AM job (transaction reminders)
curl "http://localhost:8787/__scheduled?cron=0+8+*+*+*"

# Trigger the 9 AM job (budget alerts)
curl "http://localhost:8787/__scheduled?cron=0+9+*+*+*"
```

## Deployment

### Step 1: Set Secrets

All sensitive credentials must be set via Wrangler CLI (never committed to Git):

```bash
# Supabase JWT secret (from Supabase Dashboard > Settings > API)
wrangler secret put SUPABASE_JWT_SECRET

# Supabase service role key (for server-side operations only)
wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# VAPID public key (generated via web-push CLI)
wrangler secret put VAPID_PUBLIC_KEY

# VAPID private key (generated via web-push CLI)
wrangler secret put VAPID_PRIVATE_KEY
```

### Step 2: Update wrangler.toml

Edit `wrangler.toml` and replace placeholder values:

```toml
[env.production]
vars = {
  ENVIRONMENT = "production",
  SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co"  # ← Update this
}
```

### Step 3: Deploy to Production

```bash
npm run deploy
```

### Step 4: Verify Deployment

```bash
# Check worker logs
wrangler tail

# Send test notification
curl -X POST https://household-hub-push.YOUR_SUBDOMAIN.workers.dev/notify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

## VAPID Keys Generation

If you don't have VAPID keys yet, generate them using the `web-push` CLI:

```bash
# Install web-push globally
npm install -g web-push

# Generate VAPID keys
web-push generate-vapid-keys

# Output will look like:
# =======================================
# Public Key:
# <your-generated-public-key>
#
# Private Key:
# <your-generated-private-key>
# =======================================
```

**Security Note**: The private key should **NEVER** be exposed to the client. Only the public key is shared with the PWA.

## Environment Variables

| Variable                    | Type   | Description                                          |
| --------------------------- | ------ | ---------------------------------------------------- |
| `SUPABASE_URL`              | Public | Supabase project URL (e.g., https://xxx.supabase.co) |
| `SUPABASE_JWT_SECRET`       | Secret | JWT signing secret (from Supabase Dashboard)         |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Service role key for server-side operations          |
| `VAPID_PUBLIC_KEY`          | Secret | VAPID public key for Web Push                        |
| `VAPID_PRIVATE_KEY`         | Secret | VAPID private key (never expose to client)           |
| `ENVIRONMENT`               | Public | Environment name (development/production)            |

## API Reference

### POST /notify

Sends a push notification to a single subscription.

**Authentication**: Required (JWT in `Authorization: Bearer <token>` header)

**Request Body**:

```typescript
{
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  };
  title: string;
  body: string;
  data?: Record<string, any>;
  urgency?: 'very-low' | 'low' | 'normal' | 'high'; // Default: 'normal'
}
```

**Response (Success - 200)**:

```json
{
  "success": true,
  "message": "Notification sent successfully"
}
```

**Response (Error - 401)**:

```json
{
  "error": "Unauthorized: Invalid JWT signature"
}
```

**Response (Error - 500)**:

```json
{
  "error": "Failed to send notification: Subscription expired"
}
```

### Cron Triggers

The worker automatically calls Supabase Edge Functions at scheduled times:

| Cron Schedule | Time (UTC) | Calls Function          | Purpose                     |
| ------------- | ---------- | ----------------------- | --------------------------- |
| `0 8 * * *`   | 8 AM       | `transaction-reminders` | Daily transaction reminders |
| `0 9 * * *`   | 9 AM       | `budget-alerts`         | Daily budget alerts         |

These cron jobs use the `SUPABASE_SERVICE_ROLE_KEY` for authentication (server-side only).

## Error Handling

The worker returns specific HTTP status codes:

- `200` - Notification sent successfully
- `204` - OPTIONS preflight (CORS)
- `400` - Invalid request body or missing fields
- `401` - Unauthorized (invalid/missing JWT)
- `405` - Method not allowed (only POST supported)
- `500` - Internal error (notification delivery failed)

Common error scenarios:

1. **Missing Authorization Header**: Returns 401 with `"Missing Authorization header"`
2. **Invalid JWT Signature**: Returns 401 with `"Invalid JWT signature"`
3. **Expired Token**: Returns 401 with `"Token expired at <timestamp>"`
4. **Subscription Expired**: Returns 500 with `"Subscription expired"` (HTTP 410 from push service)
5. **Invalid Subscription**: Returns 400 with `"Invalid subscription format"`

## Security Considerations

### JWT Verification (Decision #65)

This worker validates JWT tokens to prevent unauthorized notification spam:

1. **Signature Verification**: HMAC-SHA256 signature checked against `SUPABASE_JWT_SECRET`
2. **Expiry Check**: Token `exp` claim validated against current time
3. **Algorithm Check**: Only HS256 allowed (prevents algorithm confusion attacks)
4. **User Scoping**: User ID extracted from `sub` claim and included in notification data

### VAPID Key Management

- **Private Key**: Stored as Wrangler secret, never exposed to client
- **Public Key**: Shared with PWA for subscription registration
- **Rotation**: Change keys via `wrangler secret put` (requires user re-subscription)

### Service Role Key Usage

- **Scope**: Only used for scheduled cron jobs (server-side)
- **Never Exposed**: Not accessible from client-side code
- **Least Privilege**: Only calls specific Edge Functions (`transaction-reminders`, `budget-alerts`)

### CORS Configuration

Current configuration allows all origins (`*`). For production, update CORS headers in `src/index.ts`:

```typescript
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://household-hub.pages.dev", // Specific domain
  // ...
};
```

## Monitoring

### View Worker Logs

```bash
wrangler tail
```

### Monitor Cron Execution

Cron triggers are logged with timestamps:

```
Cron triggered: 0 8 * * * at 2024-01-15T08:00:00.000Z
Transaction reminders function called successfully
```

### Check Notification Delivery

The worker logs all notification attempts:

```typescript
// Success
console.log("Notification sent to:", subscription.endpoint);

// Failure
console.error("Push notification failed:", error);
```

## Troubleshooting

### Issue: "Unauthorized: Invalid JWT signature"

**Cause**: `SUPABASE_JWT_SECRET` doesn't match Supabase project secret.

**Solution**:

1. Get JWT secret from Supabase Dashboard > Settings > API
2. Update secret: `wrangler secret put SUPABASE_JWT_SECRET`

### Issue: "Subscription expired"

**Cause**: User's push subscription is no longer valid (HTTP 410 from push service).

**Solution**:

1. Delete expired subscription from database
2. Prompt user to re-enable notifications in PWA

### Issue: Cron jobs not triggering

**Cause**: Cron triggers require deployed worker (don't work in `wrangler dev`).

**Solution**:

1. Deploy worker: `npm run deploy`
2. Test scheduled handler manually: `curl "https://your-worker.dev/__scheduled?cron=0+8+*+*+*"`

### Issue: CORS errors in browser

**Cause**: Missing or incorrect CORS headers.

**Solution**:

1. Check browser console for specific CORS error
2. Update `CORS_HEADERS` in `src/index.ts` to match your domain
3. Ensure OPTIONS requests return 204 status

## Performance

- **Cold Start**: ~10ms (Cloudflare Workers are fast!)
- **JWT Verification**: ~5ms (WebCrypto API)
- **Push Delivery**: ~100-500ms (depends on push service)
- **Cron Execution**: <1s per job

## Limits (Free Tier)

- **Requests**: 100,000/day
- **CPU Time**: 10ms per request
- **Workers**: 10 scripts per account
- **Cron Triggers**: 3 schedules per script

## Related Documentation

- [DEPLOYMENT.md](/docs/initial plan/DEPLOYMENT.md) - Full deployment guide
- [SECURITY.md](/docs/initial plan/SECURITY.md) - Security threat model
- [DECISIONS.md](/docs/initial plan/DECISIONS.md) - Architectural decisions
- [Web Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) - MDN docs
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) - Official docs
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) - Deployment tool

## Support

For issues or questions:

- GitHub Issues: [household-hub/issues](https://github.com/your-org/household-hub/issues)
- Project Documentation: `/docs/initial plan/`

---

**Version**: 1.0.0 (Chunk 043)
**Last Updated**: 2024-01-15
