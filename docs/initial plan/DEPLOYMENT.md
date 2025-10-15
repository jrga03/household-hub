# Deployment Guide

## Overview

Complete deployment setup for Household Hub using free-tier services with production-ready configuration.

## Infrastructure Stack

| Service              | Purpose                    | Free Tier Limits             |
| -------------------- | -------------------------- | ---------------------------- |
| **Supabase**         | Database, Auth, Realtime   | 500MB storage, 2GB bandwidth |
| **Cloudflare Pages** | Frontend hosting, CDN      | Unlimited sites, bandwidth   |
| **Cloudflare R2**    | Object storage for backups | 10GB storage, 1M requests    |
| **GitHub Actions**   | CI/CD pipeline             | 2000 minutes/month           |
| **Sentry**           | Error tracking             | 5K errors/month              |

## Prerequisites

- GitHub account
- Cloudflare account (free)
- Supabase account (free)
- Domain name (optional, can use .pages.dev)
- Node.js 20+ installed locally

## Step 1: Supabase Setup

### 1.1 Create Project

1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Save credentials:

```env
SUPABASE_URL=https://[PROJECT_ID].supabase.co
SUPABASE_ANON_KEY=[ANON_KEY]
SUPABASE_SERVICE_KEY=[SERVICE_KEY]
```

### 1.2 Database Setup

```bash
# Clone repository
git clone [your-repo]
cd household-hub

# Link to Supabase
npx supabase login
npx supabase link --project-ref [PROJECT_ID]

# Run migrations
npx supabase db push
```

### 1.3 Enable Services

In Supabase Dashboard:

1. **Authentication**
   - Enable Email/Password
   - Configure email templates
   - Set redirect URLs

2. **Storage**
   - Create bucket: `snapshots`
   - Create bucket: `documents`
   - Set policies for authenticated users

3. **Realtime**
   - Enable replication for `transactions` table
   - Configure broadcast settings

### 1.4 Edge Functions

```bash
# Deploy edge functions
npx supabase functions deploy snapshot-cleanup
npx supabase functions deploy budget-rollover
npx supabase functions deploy export-data
```

### 1.5 Database Triggers

```sql
-- Note: Using indexes instead of materialized views per Decision #64
-- Direct queries with proper indexing provide sufficient performance for MVP

-- Auto-update timestamps trigger (already included in migrations)
-- See DATABASE.md for complete trigger definitions

-- Cleanup policy for old sync queue entries
CREATE OR REPLACE FUNCTION cleanup_old_sync_queue()
RETURNS void AS $$
BEGIN
  DELETE FROM sync_queue
  WHERE status = 'completed'
  AND updated_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- Note: Scheduled tasks handled by Cloudflare Workers calling Supabase Edge Functions
-- This approach works on Supabase free tier (pg_cron not available)
-- See Step 2.5 for Cloudflare Worker cron configuration
```

## Step 2: Cloudflare Setup

### 2.1 Pages Setup

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create Pages project
wrangler pages project create household-hub
```

### 2.2 Build Configuration

```toml
# wrangler.toml
name = "household-hub"
compatibility_date = "2024-01-01"

[build]
command = "npm run build"
directory = "dist"

[env.production]
vars = {
  VITE_SUPABASE_URL = "https://[PROJECT_ID].supabase.co",
  VITE_SUPABASE_ANON_KEY = "[ANON_KEY]"
}

[[redirects]]
from = "/*"
to = "/index.html"
status = 200
```

### 2.3 R2 Storage Setup

```bash
# Create R2 bucket for backups
wrangler r2 bucket create household-backups

# Configure CORS
wrangler r2 bucket cors add household-backups --rules '[
  {
    "allowedOrigins": ["https://household-hub.pages.dev"],
    "allowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "allowedHeaders": ["*"],
    "maxAgeSeconds": 3600
  }
]'
```

### 2.4 Workers for Compression

```javascript
// workers/compression.worker.js
import { compress, decompress } from "@stardazed/zlib-fork";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const { method } = request;

  if (method === "POST") {
    const data = await request.arrayBuffer();
    const compressed = await compress(data, { level: 6 });

    return new Response(compressed, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Encoding": "br",
      },
    });
  }

  return new Response("Method not allowed", { status: 405 });
}
```

Deploy worker:

```bash
wrangler publish workers/compression.worker.js
```

### 2.5 Cloudflare Workers Cron Jobs

Configure scheduled tasks (replaces pg_cron for free tier compatibility):

```javascript
// workers/scheduled-tasks.js
export default {
  async scheduled(event, env, ctx) {
    // Daily snapshot cleanup (2 AM UTC)
    if (event.cron === "0 2 * * *") {
      await cleanupSnapshots(env);
    }

    // Weekly sync queue cleanup (Sunday 3 AM UTC)
    if (event.cron === "0 3 * * 0") {
      await cleanupSyncQueue(env);
    }

    // Monthly budget target copy-forward (1st of month, 1 AM UTC)
    // Optional: Copies previous month's targets to new month
    if (event.cron === "0 1 1 * *") {
      await copyBudgetTargetsForward(env);
    }
  },
};

async function cleanupSnapshots(env) {
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/snapshot-cleanup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  return response.json();
}

async function cleanupSyncQueue(env) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cleanup_old_sync_queue`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  });
  return response.json();
}

async function copyBudgetTargetsForward(env) {
  // Optional: Copy previous month's budget targets to new month
  // Note: Budgets are targets, not balances - no mathematical rollover
  const response = await fetch(`${env.SUPABASE_URL}/functions/v1/copy-budget-targets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  return response.json();
}
```

Configure cron triggers in `wrangler.toml`:

```toml
[triggers]
crons = [
  "0 2 * * *",    # Daily cleanup at 2 AM UTC
  "0 3 * * 0",    # Weekly sync cleanup
  "0 1 1 * *"     # Monthly budget target copy-forward (optional)
]
```

Deploy:

```bash
wrangler deploy workers/scheduled-tasks.js
```

## Step 3: GitHub Actions CI/CD

### 3.1 Repository Secrets

Add these secrets in GitHub repository settings:

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
SENTRY_DSN
```

### 3.2 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Run type check
        run: npm run type-check

      - name: Run tests
        run: npm run test

      - name: Run linting
        run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Build application
        env:
          VITE_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          VITE_SENTRY_DSN: ${{ secrets.SENTRY_DSN }}
        run: npm run build

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  deploy:
    needs: build
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Download build artifacts
        uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist/

      - name: Deploy to Cloudflare Pages
        uses: cloudflare/pages-action@v1
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          projectName: household-hub
          directory: dist
          gitHubToken: ${{ secrets.GITHUB_TOKEN }}

  migrate:
    needs: deploy
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Run migrations
        env:
          SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_SERVICE_KEY }}
        run: |
          supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_ID }}
          supabase db push
```

## Step 4: Environment Configuration

### 4.1 Development Environment

```env
# .env.local
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=your-local-anon-key
VITE_APP_URL=http://localhost:5173
```

### 4.2 Staging Environment

```env
# .env.staging
VITE_SUPABASE_URL=https://[STAGING_PROJECT].supabase.co
VITE_SUPABASE_ANON_KEY=[STAGING_ANON_KEY]
VITE_APP_URL=https://staging.household-hub.pages.dev
VITE_SENTRY_ENVIRONMENT=staging
```

### 4.3 Production Environment

```env
# .env.production
VITE_SUPABASE_URL=https://[PROD_PROJECT].supabase.co
VITE_SUPABASE_ANON_KEY=[PROD_ANON_KEY]
VITE_APP_URL=https://household-hub.pages.dev
VITE_SENTRY_ENVIRONMENT=production
VITE_SENTRY_DSN=[SENTRY_DSN]
```

## Step 5: PWA Configuration

### 5.1 Manifest Configuration

```json
// public/manifest.json
{
  "name": "Household Hub",
  "short_name": "HHub",
  "description": "Comprehensive household management system",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#ffffff",
  "background_color": "#ffffff",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "shortcuts": [
    {
      "name": "Add Transaction",
      "url": "/transaction/new",
      "icons": [{ "src": "/add-icon.png", "sizes": "96x96" }]
    },
    {
      "name": "View Budget",
      "url": "/budget",
      "icons": [{ "src": "/budget-icon.png", "sizes": "96x96" }]
    }
  ],
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [
        {
          "name": "receipt",
          "accept": ["image/*", "application/pdf"]
        }
      ]
    }
  }
}
```

### 5.2 Service Worker

```javascript
// public/sw.js
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";

// Precache static assets
precacheAndRoute(self.__WB_MANIFEST);

// API calls - Network First
registerRoute(
  ({ url }) => url.pathname.startsWith("/api"),
  new NetworkFirst({
    cacheName: "api-cache",
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          if (response && response.status === 200) {
            return response;
          }
          return null;
        },
      },
    ],
  })
);

// Static assets - Stale While Revalidate
registerRoute(
  ({ request }) =>
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image",
  new StaleWhileRevalidate({
    cacheName: "static-cache",
  })
);

// Background sync for offline transactions
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-transactions") {
    event.waitUntil(syncPendingTransactions());
  }
});
```

### 5.3 Cache Policy for Sensitive Data

**Service Worker Cache Rules:**

```javascript
// sw.js - Cache policy for PII and financial data

const CACHE_RULES = {
  // NEVER cache these patterns
  neverCache: [
    /\/api\/transactions/,
    /\/api\/accounts/,
    /\/api\/budgets/,
    /\/auth\//,
    /\.json$/, // User-specific data
  ],

  // Always cache (static assets only)
  alwaysCache: [/\.js$/, /\.css$/, /\.woff2$/, /\.png$/, /\.svg$/],
};

// Cache handler
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache sensitive data
  if (CACHE_RULES.neverCache.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache static assets only
  if (CACHE_RULES.alwaysCache.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
    return;
  }

  // Network-first for everything else
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
```

**HTTP Headers:**

```typescript
// Cloudflare Pages headers (_headers file)
/api/*
  Cache-Control: no-store, no-cache, must-revalidate
  X-Content-Type-Options: nosniff

/assets/*
  Cache-Control: public, max-age=31536000, immutable
```

### 5.4 Service Key Usage Policy

**Minimize Service Role Usage:**

Only use `SUPABASE_SERVICE_KEY` for:

1. Database migrations in CI/CD
2. Scheduled cleanup operations (cron workers)
3. Backup operations

**Prefer Anon Key:**

- All user-facing API calls
- Realtime subscriptions
- Storage operations (with RLS)

**Worker Implementation:**

```typescript
// workers/scheduled-tasks.ts
export default {
  async scheduled(event, env, ctx) {
    // Use service key ONLY for cleanup
    const supabase = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_KEY // Service role for admin operations
    );

    // Cleanup operations bypass RLS
    await supabase.rpc("cleanup_old_sync_queue");

    // Never expose service key to client
    // Never use for user data operations
  },
};
```

### 5.5 Secrets Management

**GitHub Actions Secrets:**

```yaml
# Required secrets in repository settings
SUPABASE_URL              # Supabase project URL
SUPABASE_ANON_KEY         # Public anon key (safe for client)
SUPABASE_SERVICE_KEY      # Admin key (CI/Workers only)
CLOUDFLARE_API_TOKEN      # Deployment token
CLOUDFLARE_ACCOUNT_ID     # CF account ID
SENTRY_DSN                # Error tracking (public)
SENTRY_AUTH_TOKEN         # Release tracking (secret)
```

**Cloudflare Workers Secrets:**

```bash
# Set via Wrangler CLI
wrangler secret put SUPABASE_SERVICE_KEY
wrangler secret put VAPID_PRIVATE_KEY
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

**Secret Rotation Policy:**

- **Supabase Keys**: Rotate every 90 days via dashboard
- **CF API Tokens**: Rotate every 180 days, use OIDC when possible
- **VAPID Keys**: Rotate yearly (requires user re-subscription)
- **R2 Keys**: Rotate every 90 days

**Least Privilege:**

- CI uses service_role only for DB migrations
- Workers use anon key where possible
- Service key scoped to specific RPC functions only:
  - `compact_old_events()`
  - `cleanup_old_sync_queue()`
  - `cleanup_old_snapshots()`

## Step 6: Monitoring Setup

### 6.0 Service Level Objectives (SLOs)

**Key SLOs:**

1. **Sync Success Rate**: ≥ 98%
   - Metric: `(successful_syncs / total_sync_attempts) * 100`
   - Alert: < 95% for 5 minutes
   - Action: Check Supabase status, review error logs

2. **API Error Rate**: < 1%
   - Metric: `(5xx_responses / total_requests) * 100`
   - Alert: > 2% for 5 minutes
   - Action: Check database connections, review worker logs

3. **P95 API Latency**: < 800ms
   - Metric: 95th percentile of API response times
   - Alert: > 1500ms for 10 minutes
   - Action: Check database query performance, review indexes

4. **Storage Usage**: < 80% of quota
   - Metric: Current storage / Available quota
   - Alert: > 85%
   - Action: Run compaction, review retention policies

5. **Sync Queue Length**: < 50 pending items per device
   - Metric: Count of queued sync operations
   - Alert: > 100 items for 30 minutes
   - Action: Check offline duration, review sync errors

**Dashboard Configuration:**

```typescript
// Sentry Performance Monitoring
Sentry.init({
  tracesSampleRate: 0.1, // 10% of transactions

  beforeSendTransaction(event) {
    // Add custom tags
    event.tags = {
      ...event.tags,
      sync_state: getSyncState(),
      queue_length: getSyncQueueLength(),
    };
    return event;
  },
});

// Custom metrics
function recordSyncMetric(success: boolean, duration: number) {
  if (window.Sentry) {
    Sentry.metrics.distribution("sync.duration", duration, {
      tags: { success: success.toString() },
    });
  }
}
```

**Cloudflare Analytics:**

- Real-time traffic monitoring
- Geographic distribution
- Performance insights
- Security events

**Alert Channels:**

- **Critical**: Email + PagerDuty
- **Warning**: Email
- **Info**: Dashboard only

### 6.1 Sentry Configuration

```typescript
// src/lib/sentry.ts
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "development",
  integrations: [
    new Sentry.BrowserTracing(),
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  beforeSend(event, hint) {
    // Filter sensitive data
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    return event;
  },
});
```

### 6.2 Performance Monitoring

```typescript
// src/lib/performance.ts
export function trackPerformance() {
  // Web Vitals
  if ("PerformanceObserver" in window) {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Send to analytics
        analytics.track("web-vital", {
          name: entry.name,
          value: entry.startTime,
          metric: entry.entryType,
        });
      }
    });

    observer.observe({ entryTypes: ["largest-contentful-paint", "first-input", "layout-shift"] });
  }

  // Custom metrics
  performance.mark("app-interactive");

  window.addEventListener("load", () => {
    performance.measure("app-load-time", "navigationStart", "app-interactive");

    const measure = performance.getEntriesByName("app-load-time")[0];
    analytics.track("app-load", { duration: measure.duration });
  });
}
```

## Step 7: Security Configuration

### 7.1 Content Security Policy

```typescript
// cloudflare-pages-headers.txt
/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://*.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
```

### 7.2 Environment Variables Security

```typescript
// src/lib/config.ts
const config = {
  supabase: {
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  },
  app: {
    url: import.meta.env.VITE_APP_URL || window.location.origin,
    environment: import.meta.env.MODE,
  },
};

// Validate required config
if (!config.supabase.url || !config.supabase.anonKey) {
  throw new Error("Missing required Supabase configuration");
}

export default config;
```

### 7.3 Cloudflare Worker JWT Verification

```typescript
// workers/auth-utils.ts
import { importSPKI, jwtVerify } from "jose";

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  aud: string;
  exp: number;
  iat: number;
}

export class JWTVerifier {
  private cachedKeys: Map<string, CryptoKey> = new Map();
  private cacheExpiry = 0;

  constructor(
    private supabaseUrl: string,
    private jwtSecret?: string,
    private kvCache?: KVNamespace
  ) {}

  async verify(token: string): Promise<JWTPayload | null> {
    try {
      // HS256 verification (shared secret)
      if (this.jwtSecret) {
        const secret = new TextEncoder().encode(this.jwtSecret);
        const { payload } = await jwtVerify(token, secret, {
          issuer: `${this.supabaseUrl}/auth/v1`,
          audience: "authenticated",
        });
        return payload as JWTPayload;
      }

      // RS256 verification (public key)
      const keys = await this.getPublicKeys();
      for (const [kid, key] of keys) {
        try {
          const { payload } = await jwtVerify(token, key, {
            issuer: `${this.supabaseUrl}/auth/v1`,
            audience: "authenticated",
          });
          return payload as JWTPayload;
        } catch {
          continue; // Try next key
        }
      }

      return null;
    } catch (error) {
      console.error("JWT verification failed:", error);
      return null;
    }
  }

  private async getPublicKeys(): Promise<Map<string, CryptoKey>> {
    const now = Date.now();

    // Check memory cache
    if (this.cachedKeys.size > 0 && this.cacheExpiry > now) {
      return this.cachedKeys;
    }

    // Check KV cache
    if (this.kvCache) {
      const cached = await this.kvCache.get("jwks", "json");
      if (cached && cached.expiry > now) {
        // Reconstruct CryptoKey objects
        for (const [kid, keyData] of Object.entries(cached.keys)) {
          const key = await crypto.subtle.importKey(
            "jwk",
            keyData as JsonWebKey,
            { name: "RSA-PSS", hash: "SHA-256" },
            false,
            ["verify"]
          );
          this.cachedKeys.set(kid, key);
        }
        this.cacheExpiry = cached.expiry;
        return this.cachedKeys;
      }
    }

    // Fetch fresh JWKS
    const response = await fetch(`${this.supabaseUrl}/auth/v1/.well-known/jwks.json`);
    const jwks = await response.json();

    // Parse and cache keys
    this.cachedKeys.clear();
    for (const key of jwks.keys) {
      const cryptoKey = await crypto.subtle.importKey(
        "jwk",
        key,
        { name: "RSA-PSS", hash: "SHA-256" },
        false,
        ["verify"]
      );
      this.cachedKeys.set(key.kid, cryptoKey);
    }

    // Cache for 24 hours
    this.cacheExpiry = now + 24 * 60 * 60 * 1000;

    // Store in KV if available
    if (this.kvCache) {
      const keyData: Record<string, any> = {};
      for (const [kid, key] of this.cachedKeys) {
        keyData[kid] = await crypto.subtle.exportKey("jwk", key);
      }
      await this.kvCache.put(
        "jwks",
        JSON.stringify({
          keys: keyData,
          expiry: this.cacheExpiry,
        })
      );
    }

    return this.cachedKeys;
  }
}

// Usage in Worker
export async function authenticateRequest(request: Request, env: Env): Promise<JWTPayload | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const verifier = new JWTVerifier(env.SUPABASE_URL, env.SUPABASE_JWT_SECRET, env.JWT_CACHE);

  return await verifier.verify(token);
}
```

### 7.4 R2 Storage Security

````typescript
// workers/r2-security.ts
export function generateSecurePath(
  userId: string,
  type: 'backup' | 'attachment',
  filename: string
): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  // Namespace by household and user
  return `households/${getHouseholdId(userId)}/${type}s/${userId}/${year}/${month}/${filename}`;
}

export async function generateSignedUrl(
  bucket: R2Bucket,
  key: string,
  operation: 'upload' | 'download'
): Promise<{ url: string; expiresAt: Date }> {
  const expiresIn = 3600; // 1 hour

  if (operation === 'upload') {
    const multipartUpload = await bucket.createMultipartUpload(key);
    return {
      url: multipartUpload.uploadUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000)
    };
  } else {
    // For downloads, create a signed URL
    const object = await bucket.get(key);
    if (!object) {
      throw new Error('Object not found');
    }

    // Generate temporary public URL (R2 doesn't have native signed URLs)
    // Use Worker as proxy for secure access
    const url = `https://your-worker.dev/download?key=${encodeURIComponent(key)}`;
    return {
      url,
      expiresAt: new Date(Date.now() + expiresIn * 1000)
    };
  }
}

## Step 8: Deployment Commands

### 8.1 Initial Deployment

```bash
# 1. Setup project
git clone [repo]
cd household-hub
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your values

# 3. Test locally
npm run dev

# 4. Build for production
npm run build

# 5. Deploy to Cloudflare Pages
npm run deploy

# 6. Run database migrations
npm run migrate:deploy
````

### 8.2 Update Deployment

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install dependencies
npm ci

# 3. Run migrations if needed
npm run migrate:deploy

# 4. Deploy
npm run deploy

# 5. Verify deployment
npm run health-check
```

## Step 9: Backup Strategy

### 9.1 Automated Backups

```typescript
// supabase/functions/daily-backup/index.ts
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_KEY")!);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${Deno.env.get("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: Deno.env.get("R2_ACCESS_KEY")!,
    secretAccessKey: Deno.env.get("R2_SECRET_KEY")!,
  },
});

Deno.serve(async () => {
  // Export data
  const { data: transactions } = await supabase.from("transactions").select("*");

  const backup = {
    timestamp: new Date().toISOString(),
    transactions,
    // Add other tables...
  };

  // Compress and upload to R2
  const compressed = await compress(JSON.stringify(backup));

  await r2.send(
    new PutObjectCommand({
      Bucket: "household-backups",
      Key: `backup-${new Date().toISOString()}.json.br`,
      Body: compressed,
    })
  );

  return new Response("Backup completed");
});
```

### 9.2 Manual Backup

```bash
# Create manual backup
npm run backup:create

# List backups
npm run backup:list

# Restore from backup
npm run backup:restore -- --date=2024-01-01
```

## Step 10: Health Checks

### 10.1 Endpoint Monitoring

```typescript
// pages/api/health.ts
export async function onRequest({ env }) {
  const checks = {
    database: false,
    storage: false,
    cache: false,
  };

  try {
    // Check database
    const dbResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
    });
    checks.database = dbResponse.ok;

    // Check storage
    const storageResponse = await fetch(`${env.R2_URL}/health`);
    checks.storage = storageResponse.ok;

    // Overall health
    const healthy = Object.values(checks).every((v) => v);

    return new Response(
      JSON.stringify({
        status: healthy ? "healthy" : "degraded",
        checks,
        timestamp: new Date().toISOString(),
      }),
      {
        status: healthy ? 200 : 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        status: "error",
        error: error.message,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
```

### 10.2 Uptime Monitoring

Setup external monitoring:

1. **UptimeRobot** (free tier)
2. **Cloudflare Analytics** (built-in)
3. **GitHub Actions** scheduled checks

## Rollback Procedure

### Quick Rollback

```bash
# 1. Revert to previous deployment
wrangler pages deployments list
wrangler pages deployments rollback [deployment-id]

# 2. Restore database if needed
npm run db:restore -- --backup-id=[backup-id]

# 3. Clear cache
npm run cache:clear

# 4. Notify users
npm run notify:maintenance -- --message="Brief maintenance completed"
```

## Production Checklist

### Pre-Deployment

- [ ] All tests passing
- [ ] Security audit completed
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Backup created

### Deployment

- [ ] Deploy to staging first
- [ ] Run smoke tests
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify data integrity

### Post-Deployment

- [ ] Monitor error tracking
- [ ] Check user feedback
- [ ] Verify analytics
- [ ] Document any issues
- [ ] Update runbook

## Troubleshooting

### Common Issues

1. **Build Failures**

```bash
# Clear cache and retry
rm -rf node_modules dist
npm ci
npm run build
```

2. **Database Connection Issues**

```bash
# Check Supabase status
curl https://status.supabase.com/api/v2/status.json

# Test connection
npx supabase db remote status
```

3. **Deployment Stuck**

```bash
# Cancel and retry
wrangler pages deployment cancel [deployment-id]
npm run deploy
```

4. **Service Worker Issues**

```javascript
// Force update service worker
navigator.serviceWorker.getRegistration().then((reg) => {
  reg.unregister();
  window.location.reload();
});
```

## Support & Maintenance

### Regular Maintenance Tasks

- Weekly: Review error logs
- Monthly: Update dependencies
- Quarterly: Security audit
- Yearly: Major version upgrades

### Support Channels

- GitHub Issues for bugs
- Discord for community support
- Email for critical issues

### Documentation

- Keep deployment logs
- Document configuration changes
- Maintain runbook for incidents
- Update architecture diagrams
