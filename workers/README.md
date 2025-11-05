# Cloudflare Workers (`/workers/`)

## Purpose

Serverless edge functions for Household Hub's backend infrastructure. Workers handle secure file uploads, push notifications, and automated maintenance tasks without traditional server management.

## Directory Contents

**2 worker services:**

- **`push-notifier/`** - Web Push notification handler (VAPID protocol) ✅ **PRODUCTION READY**
- **`r2-proxy/`** - R2 backup file upload/download proxy ⏸️ **DEFERRED to Phase B**

## Worker Overview

### push-notifier/ ✅ Production Ready

**Purpose:** Send Web Push notifications for budget alerts and transaction reminders

**Key features:**

- JWT authentication (validates Supabase tokens)
- VAPID protocol for Web Push API
- Scheduled cron jobs (budget alerts at 9 AM UTC, reminders at 8 AM UTC)
- CORS support for PWA access
- Comprehensive error handling

**Files:**

- `src/index.ts` (281 lines) - Main worker with fetch + scheduled handlers
- `src/auth-utils.ts` (87 lines) - JWT verification utilities
- `wrangler.toml` - Worker configuration (name, routes, bindings, cron)
- `package.json` - Dependencies (web-push ^3.6.6)
- `README.md` - Complete implementation guide
- `QUICK-START.md` - Setup instructions
- `DEPLOYMENT-CHECKLIST.md` - Pre-deploy verification
- `IMPLEMENTATION-SUMMARY.md` - Architecture overview

**Documentation:** [push-notifier/README.md](push-notifier/README.md)

**API endpoints:**

- `POST /send` - Send notification with JWT auth
- Cron: `0 9 * * *` - Daily budget alerts (9 AM UTC)
- Cron: `0 8 * * *` - Daily transaction reminders (8 AM UTC)

**Deployment status:** Production-ready, awaiting Phase C deployment

### r2-proxy/ ⏸️ Deferred to Phase B

**Purpose:** Secure proxy for R2 backup uploads/downloads with JWT validation

**Planned features:**

- JWT-authenticated R2 access
- User-scoped backup paths (`backups/{userId}/...`)
- Signed URL generation for direct uploads
- KV caching for JWT verification
- 5 API endpoints (upload, upload-direct, download, list, delete)

**Current backup strategy:**

- Manual CSV export (Phase A MVP)
- Works completely offline
- Sufficient for initial deployment

**Documentation:** [r2-proxy/README.md](r2-proxy/README.md)

**Implementation timeline:**

- Deploy 1-2 weeks after Phase A launch
- Requires Cloudflare R2 provisioning
- Full guide: `docs/implementation/deployment/r2-worker-deployment.md`

**Deferral rationale:**

- Phase A has manual CSV export (sufficient)
- Security audit required for automated backups
- R2 not needed for MVP functionality
- See DECISIONS.md #83 for full context

## Cloudflare Workers Architecture

### Edge Computing Model

**What are Cloudflare Workers?**

- Serverless JavaScript/TypeScript functions
- Run on Cloudflare's global edge network (300+ locations)
- Sub-millisecond cold start times
- Pay-per-request pricing (generous free tier)

**Benefits for Household Hub:**

- Low latency (runs near users)
- No server management
- Automatic scaling
- Cost-effective (free tier: 100K requests/day)

### Integration with Main App

**Main app (Vite PWA):**

```
Client → Supabase (database) ← JWT auth
  ↓
  └─→ Cloudflare Worker (push notifications, R2 backups)
       ↑
       └─ Validates JWT from Supabase
```

**Data flow:**

1. Client obtains Supabase JWT via authentication
2. Client sends request to Worker with JWT in Authorization header
3. Worker validates JWT signature (HMAC-SHA256)
4. Worker performs operation (send push, upload to R2)
5. Worker returns success/error response

**Security:**

- Worker validates JWT using Supabase JWT secret
- Service role key never exposed to client
- All secrets managed via Wrangler CLI
- Worker acts as secure proxy

### Free Tier Limits

**Cloudflare Workers free tier:**

- 100,000 requests/day
- 10ms CPU time per request
- No bandwidth charges
- Sufficient for thousands of users

**R2 free tier (Phase B):**

- 10 GB storage
- 1 million Class A operations/month
- 10 million Class B operations/month
- Sufficient for years of backups

## Development Workflow

### Local Development

**Prerequisites:**

- Node.js 18+ (Household Hub uses Node 18.20.8)
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account (free tier)

**Setup:**

```bash
cd workers/push-notifier  # or r2-proxy

# Install dependencies
npm install

# Set secrets locally
wrangler secret put SUPABASE_JWT_SECRET
wrangler secret put VAPID_PUBLIC_KEY
wrangler secret put VAPID_PRIVATE_KEY

# Run locally
npm run dev  # Starts local dev server on http://localhost:8787
```

**Testing:**

```bash
# Test push notification endpoint
curl -X POST http://localhost:8787/send \
  -H "Authorization: Bearer <jwt-token>" \
  -H "Content-Type: application/json" \
  -d '{"subscription": {...}, "title": "Test", "body": "Message"}'
```

### Deployment

**Deploy to production:**

```bash
cd workers/push-notifier

# Deploy to Cloudflare
wrangler deploy

# Verify deployment
curl https://push-notifier.household-hub.workers.dev/health
```

**Deployment checklist:**

1. Secrets configured via Wrangler CLI
2. `wrangler.toml` routes match domain
3. Environment variables set correctly
4. Test endpoints after deployment
5. Monitor logs: `wrangler tail`

**See also:** [push-notifier/DEPLOYMENT-CHECKLIST.md](push-notifier/DEPLOYMENT-CHECKLIST.md)

## Configuration

### wrangler.toml Structure

**Key configuration sections:**

```toml
name = "push-notifier"          # Worker name
main = "src/index.ts"           # Entry point
compatibility_date = "2024-10-14"

[vars]
# Public environment variables
ENVIRONMENT = "production"

[[kv_namespaces]]
# KV storage for JWT caching (optional)
binding = "JWT_CACHE"
id = "..."

[triggers]
# Cron schedules
crons = ["0 9 * * *", "0 8 * * *"]
```

**Secrets (not in wrangler.toml):**

- Set via: `wrangler secret put SECRET_NAME`
- Never committed to git
- Encrypted at rest in Cloudflare

### Environment Management

**Development:**

- Local secrets: `.dev.vars` file (gitignored)
- Local KV: In-memory simulation
- Local cron: Manual trigger via API

**Production:**

- Secrets: Wrangler CLI (`wrangler secret put`)
- KV: Cloudflare dashboard provisioning
- Cron: Automatic based on schedule

## Key Features

### 1. JWT Authentication

**Purpose:** Validate user identity before performing operations

**Implementation (push-notifier/src/auth-utils.ts:15-60):**

```typescript
export async function verifySupabaseJwt(token: string, secret: string): Promise<JwtPayload> {
  // 1. Parse JWT (header.payload.signature)
  // 2. Verify signature with HMAC-SHA256
  // 3. Check expiration
  // 4. Return user_id and metadata
}
```

**Used in:**

- All authenticated endpoints
- Ensures user can only access their own data
- Prevents unauthorized push notifications/backups

### 2. Web Push Protocol (VAPID)

**Purpose:** Send push notifications to PWA users

**VAPID keys:**

- Public key: Shared with client for subscription
- Private key: Worker secret for signing requests
- Generated once, reused for all notifications

**Flow:**

1. Client subscribes to push service (browser API)
2. Client sends subscription to worker
3. Worker sends notification via Web Push API
4. Browser displays notification to user

**See:** [push-notifier/README.md](push-notifier/README.md) for detailed flow

### 3. Scheduled Jobs (Cron)

**Purpose:** Automated daily notifications

**Schedules (push-notifier/wrangler.toml):**

```toml
crons = [
  "0 9 * * *",  # Budget alerts (9 AM UTC = 5 PM PHT)
  "0 8 * * *"   # Transaction reminders (8 AM UTC = 4 PM PHT)
]
```

**Handler (push-notifier/src/index.ts:220-250):**

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    const cron = event.cron;

    if (cron === "0 9 * * *") {
      // Send budget alerts to all users
    } else if (cron === "0 8 * * *") {
      // Send transaction reminders
    }
  },
};
```

**Benefits:**

- Automatic execution (no manual triggers)
- Reliable (Cloudflare guarantee)
- Cost-effective (included in free tier)

### 4. Error Handling

**Comprehensive error responses:**

```typescript
// Missing JWT
return new Response("Unauthorized", { status: 401 });

// Invalid JWT
return new Response("Invalid token", { status: 403 });

// Missing required fields
return new Response("Missing subscription", { status: 400 });

// Push service error
return new Response("Push failed", { status: 500 });
```

**Logging:**

- Console logs in worker (viewable via `wrangler tail`)
- Error details for debugging
- No sensitive data logged

## Common Use Cases

### 1. Sending Push Notification

**Client-side code:**

```typescript
// Obtain push subscription
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: VAPID_PUBLIC_KEY,
});

// Send notification via worker
const response = await fetch("https://push-notifier.workers.dev/send", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${supabaseJwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    subscription,
    title: "Budget Alert",
    body: "You've spent 90% of your grocery budget",
  }),
});
```

### 2. Automated Budget Alerts (Cron)

**Worker scheduled job:**

```typescript
async scheduled(event: ScheduledEvent, env: Env) {
  if (event.cron === "0 9 * * *") {
    // 1. Query Supabase for users with >80% budget usage
    // 2. For each user, get push subscription from database
    // 3. Send notification via Web Push API
    // 4. Log success/failure
  }
}
```

**Database query (example):**

```sql
SELECT user_id, category, budget_amount, actual_amount
FROM budget_alerts
WHERE actual_amount / budget_amount > 0.8
  AND last_alert_sent < NOW() - INTERVAL '1 day';
```

### 3. Uploading Backup to R2 (Phase B)

**Client-side code:**

```typescript
// Generate backup data
const backup = {
  transactions: await db.transactions.toArray(),
  accounts: await db.accounts.toArray(),
  categories: await db.categories.toArray(),
};

// Upload to R2 via worker
const response = await fetch("https://r2-proxy.workers.dev/upload", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${supabaseJwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(backup),
});
```

**Worker (Phase B implementation):**

```typescript
// 1. Verify JWT
// 2. Extract user_id
// 3. Generate backup filename: backups/{user_id}/backup-{timestamp}.json
// 4. Upload to R2 bucket
// 5. Return success + backup URL
```

## Critical Implementation Notes

### 1. JWT Secret Management

**Critical:** NEVER commit JWT secrets to git

**Proper setup:**

```bash
# Set secret via Wrangler CLI
wrangler secret put SUPABASE_JWT_SECRET
# Paste secret value (not shown in terminal)

# Verify secret set (shows name only, not value)
wrangler secret list
```

**Access in worker:**

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const jwt = request.headers.get("Authorization")?.replace("Bearer ", "");
    const payload = await verifySupabaseJwt(jwt, env.SUPABASE_JWT_SECRET);
    // ...
  },
};
```

### 2. CORS Configuration

**Required for PWA access:**

```typescript
// Handle preflight OPTIONS request
if (request.method === "OPTIONS") {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://household-hub.pages.dev",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}

// Add CORS headers to all responses
response.headers.set("Access-Control-Allow-Origin", "https://household-hub.pages.dev");
```

**Security:**

- Restrict to specific origin (not `*`)
- Only allow necessary methods
- Validate Authorization header

### 3. Cloudflare Workers Runtime

**Important differences from Node.js:**

**No Node.js APIs:**

- No `fs`, `path`, `crypto` (use Web Crypto API)
- No `Buffer` (use `Uint8Array`, `TextEncoder`)
- No `process.env` (use `env` parameter)

**Web standard APIs:**

- `fetch()` for HTTP requests
- `crypto.subtle` for cryptography
- `URL` for URL parsing
- `Response`, `Request` for HTTP handling

**Deno compatibility:**

- Supabase Edge Functions use Deno runtime
- Similar to Cloudflare Workers (Web standard APIs)
- TypeScript native

### 4. Cold Start Performance

**Cloudflare Workers:**

- Sub-millisecond cold starts
- No significant latency impact
- First request after deploy: ~5-10ms

**Optimization tips:**

- Minimize dependencies (use web-push, not heavy libraries)
- Avoid global async initialization
- Use lazy loading for optional features

## Troubleshooting

### Issue: "Unauthorized" (401) response

**Cause:** Missing or invalid JWT in Authorization header

**Fix:**

```typescript
// Ensure JWT is included
headers: {
  "Authorization": `Bearer ${supabaseSession.access_token}`,
}

// Verify JWT not expired
const decodedJwt = JSON.parse(atob(jwt.split(".")[1]));
console.log("JWT expires:", new Date(decodedJwt.exp * 1000));
```

### Issue: Push notification not received

**Check:**

1. Is subscription valid? (not expired)
2. Is VAPID configuration correct?
3. Are push permissions granted in browser?
4. Check browser console for errors

**Debug:**

```bash
# View worker logs
wrangler tail

# Test push locally
curl -X POST http://localhost:8787/send ...
```

### Issue: Cron job not triggering

**Cause:** Cron schedule misconfigured or worker not deployed

**Fix:**

```bash
# Verify cron schedule in wrangler.toml
crons = ["0 9 * * *"]  # Must be valid cron expression

# Redeploy worker
wrangler deploy

# Trigger manually for testing
curl -X POST https://push-notifier.workers.dev/scheduled \
  -H "X-Cron-Expression: 0 9 * * *"
```

### Issue: Worker exceeds CPU time limit

**Cause:** Complex computation or slow external API

**Fix:**

- Optimize code (reduce loops, use efficient algorithms)
- Move heavy processing to Supabase Edge Function
- Use Workers KV for caching

**Current workers:** Well within 10ms CPU limit

## Best Practices

### 1. Security First

**Always:**

- Validate JWT on every request
- Use environment secrets (never hardcode)
- Restrict CORS to specific origin
- Log errors, not sensitive data

**Never:**

- Expose service role keys to client
- Skip JWT validation for "convenience"
- Use `Access-Control-Allow-Origin: *` in production

### 2. Error Handling

**Return specific status codes:**

- 400: Bad request (missing fields)
- 401: Unauthorized (missing JWT)
- 403: Forbidden (invalid JWT)
- 500: Internal error (worker failure)

**Include helpful messages:**

```typescript
return new Response(JSON.stringify({ error: "Missing subscription object" }), {
  status: 400,
  headers: { "Content-Type": "application/json" },
});
```

### 3. Testing Before Deployment

**Local testing:**

```bash
# Start local worker
npm run dev

# Test endpoint
curl -X POST http://localhost:8787/send ...

# View logs in terminal
```

**Staging environment:**

- Deploy to staging worker first
- Test with real JWT from staging Supabase
- Verify cron jobs trigger correctly

**Production:**

- Deploy during low-traffic hours
- Monitor logs for errors
- Have rollback plan (`wrangler rollback`)

### 4. Monitoring

**Tools:**

```bash
# Stream logs in real-time
wrangler tail

# Filter by status
wrangler tail --status error

# View specific request
wrangler tail --search "user_id=abc123"
```

**Metrics (Cloudflare dashboard):**

- Request count
- Error rate
- CPU time usage
- Response time (p50, p99)

## Security Considerations

### JWT Verification

**Critical:** Always verify JWT signature

**Implementation:**

- Use HMAC-SHA256 with Supabase JWT secret
- Check expiration timestamp
- Validate issuer (iss claim)
- Never trust client-provided user_id (extract from JWT)

### Secret Management

**Workers secrets:**

- Encrypted at rest
- Never logged
- Not visible in Wrangler CLI (only names shown)

**Best practices:**

- Rotate secrets periodically
- Use different secrets per environment
- Document secret names (not values)

### CORS Restrictions

**Prevent CSRF:**

- Whitelist specific origins (not `*`)
- Validate Authorization header format
- Use HTTPS only (enforce via Worker)

## Related Components

### Main Application

- [/src/lib/push-notifications.ts](../src/lib/README.md) - Client-side push notification handling
- [/src/lib/backup.ts](../src/lib/README.md) - Backup export/import logic (Phase A)

### Documentation

- [/docs/initial plan/R2-BACKUP.md](../docs/initial%20plan/R2-BACKUP.md) - Phase B backup strategy
- [/docs/initial plan/PWA-MANIFEST.md](../docs/initial%20plan/PWA-MANIFEST.md) - Push notification setup
- [/docs/initial plan/DECISIONS.md](../docs/initial%20plan/DECISIONS.md) - #83 (R2 deferral rationale)

### Infrastructure

- [wrangler.toml](push-notifier/wrangler.toml) - Worker configuration
- [package.json](push-notifier/package.json) - Dependencies

## Further Context

### Cloudflare Documentation

- [Cloudflare Workers](https://developers.cloudflare.com/workers/) - Platform docs
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) - Deployment tool
- [Workers Runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/) - Available APIs

### Web Push

- [Web Push Protocol](https://web.dev/push-notifications-overview/) - Push notification guide
- [VAPID](https://datatracker.ietf.org/doc/html/rfc8292) - Voluntary Application Server Identification

### R2 Storage

- [Cloudflare R2](https://developers.cloudflare.com/r2/) - Object storage docs
- [R2 API](https://developers.cloudflare.com/r2/api/) - S3-compatible API

## Future Enhancements

### Planned Workers (Phase B+)

**Cleanup worker:**

- Delete old events (>90 days)
- Compact event log
- Archive historical data
- Cron: Weekly or monthly

**Analytics worker:**

- Pre-aggregate spending by category
- Cache dashboard metrics
- Reduce Supabase query load
- Update: Hourly or daily

**Export worker:**

- Generate PDF reports
- Email weekly summaries
- CSV export automation
- Scheduled: User preference

## Quick Reference

**Worker locations:**

- Push notifier: `workers/push-notifier/`
- R2 proxy: `workers/r2-proxy/` (deferred)

**Deploy worker:**

```bash
cd workers/push-notifier
wrangler deploy
```

**View logs:**

```bash
wrangler tail
```

**Set secret:**

```bash
wrangler secret put SECRET_NAME
```

**Test locally:**

```bash
npm run dev  # Starts localhost:8787
```

**Worker URLs:**

- Production: `https://{worker-name}.{subdomain}.workers.dev`
- Custom domain: Configure in `wrangler.toml` routes

**Free tier limits:**

- 100K requests/day
- 10ms CPU time/request
- 1MB script size
