# Quick Start Guide - Push Notification Worker

Get the push notification worker running in 5 minutes.

## Prerequisites

- Node.js 20+ installed
- Cloudflare account (free tier works)
- Supabase project set up
- VAPID keys generated

## Installation

```bash
cd workers/push-notifier
npm install
```

## Local Development

### 1. Create Local Environment File

```bash
cp .dev.vars.example .dev.vars
```

### 2. Edit .dev.vars

Fill in your actual values:

```bash
SUPABASE_URL=http://localhost:54321  # Or your Supabase URL
SUPABASE_JWT_SECRET=your-jwt-secret
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
ENVIRONMENT=development
```

### 3. Start Dev Server

```bash
npm run dev
```

Worker runs at: `http://localhost:8787`

### 4. Test Locally

```bash
# Get a JWT token from your PWA or Supabase client
export JWT_TOKEN="eyJhbGc..."

# Send test notification
curl -X POST http://localhost:8787/notify \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/test",
      "keys": { "p256dh": "test", "auth": "test" }
    },
    "title": "Test",
    "body": "Hello from local worker!"
  }'
```

## Production Deployment

### 1. Update wrangler.toml

Edit line 14:

```toml
SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
```

### 2. Set Secrets

```bash
wrangler secret put SUPABASE_JWT_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY
```

### 3. Deploy

```bash
npm run deploy
```

### 4. Test Production

```bash
curl -X POST https://household-hub-push.YOUR_SUBDOMAIN.workers.dev/notify \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

## Generate VAPID Keys

First time only:

```bash
npx web-push generate-vapid-keys
```

Save both keys - public key goes in PWA, private key stays in worker.

## Common Commands

```bash
npm run dev           # Start local dev server
npm run deploy        # Deploy to production
wrangler tail         # View live logs
wrangler secret list  # List configured secrets
```

## Cron Testing

```bash
# Test 8 AM job (transaction reminders)
curl "http://localhost:8787/__scheduled?cron=0+8+*+*+*"

# Test 9 AM job (budget alerts)
curl "http://localhost:8787/__scheduled?cron=0+9+*+*+*"
```

## Troubleshooting

### "Unauthorized" error

- Check JWT token is valid
- Verify `SUPABASE_JWT_SECRET` matches Supabase project

### "Subscription expired"

- User's push subscription is invalid
- Delete from database and re-subscribe

### CORS errors

- Update `CORS_HEADERS` in `src/index.ts`
- Ensure OPTIONS requests work

## Files Overview

```
src/
├── index.ts          # Main worker (fetch + scheduled handlers)
└── auth-utils.ts     # JWT verification

wrangler.toml         # Worker configuration
package.json          # Dependencies
.dev.vars             # Local secrets (gitignored)
```

## Key Features

✅ JWT authentication (HMAC-SHA256)
✅ Web Push API integration
✅ CORS support
✅ Cron triggers (8 AM, 9 AM UTC)
✅ Comprehensive error handling
✅ Production-ready TypeScript

## Next Steps

1. Deploy worker
2. Add worker URL to PWA environment
3. Update PWA to use VAPID public key
4. Test end-to-end notification flow

## Resources

- [Full README](./README.md) - Detailed documentation
- [Deployment Checklist](./DEPLOYMENT-CHECKLIST.md) - Step-by-step guide
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Web Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)

---

**Questions?** Check the [README](./README.md) or [DEPLOYMENT-CHECKLIST](./DEPLOYMENT-CHECKLIST.md).
