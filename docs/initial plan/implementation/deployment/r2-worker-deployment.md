# R2 Worker Deployment Guide

> **Purpose**: Complete step-by-step guide for deploying Cloudflare R2 backup infrastructure for Household Hub. This guide implements chunks 038-040.

**Last Updated**: 2025-10-29
**Status**: Ready for future implementation (deferred from development phase)
**Estimated Time**: 60 minutes

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Local Development Setup](#local-development-setup)
5. [Production Deployment](#production-deployment)
6. [Testing & Verification](#testing--verification)
7. [Security Configuration](#security-configuration)
8. [Troubleshooting](#troubleshooting)
9. [Rollback Procedures](#rollback-procedures)
10. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Overview

This guide implements a secure R2 backup system with:

- **Cloudflare R2 bucket** for object storage (S3-compatible, no egress fees)
- **Cloudflare Worker** as JWT-authenticated proxy
- **User-scoped access** (users can only access their own backups)
- **Signed URLs** for secure uploads/downloads
- **KV caching** for JWT verification performance

### What Gets Deployed

- 1 R2 bucket (`household-hub-backups-prod`)
- 1 KV namespace (`JWT_CACHE`)
- 1 Cloudflare Worker with 5 endpoints
- 5 source files (~600 lines of TypeScript)

###Why This Strategy?

**Option 1 vs Option 2**:

- ✅ **Worker Proxy** (implemented): Simple, secure, works for typical backups (<100MB)
- ⏳ **Multipart Upload** (Phase C): Better for large files (>100MB), more complex

For typical household financial data (~5MB compressed), the Worker proxy is sufficient.

---

## Prerequisites

### Required Accounts & Access

- [ ] **Cloudflare Account**: Free tier (no credit card required)
  - Sign up: https://dash.cloudflare.com/sign-up
  - Verify email address

- [ ] **Production Supabase**: Project deployed and accessible
  - Project URL: `https://YOUR_PROJECT.supabase.co`
  - JWT Secret available (Settings → API → JWT Secret)

- [ ] **Wrangler CLI**: Installed and authenticated

  ```bash
  npm install -g wrangler
  wrangler login
  wrangler whoami  # Should show your account
  ```

- [ ] **Node.js**: Version 18+ required
  ```bash
  node --version  # Should be v18 or higher
  ```

### Required Chunks Completed

- [x] **Chunk 002**: Auth flow (Supabase authentication working)
- [x] **Chunk 019**: Dexie setup (IndexedDB schema configured)
- [x] **Chunk 036**: CSV export (manual backup baseline)

---

## Architecture

### Upload Flow (Phase B)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Client (Browser)                                          │
│    - Gather data from IndexedDB                              │
│    - Compress with gzip                                      │
│    - Encrypt with AES-GCM (chunk 039)                        │
│    - Generate SHA-256 checksum                               │
└────────────────┬────────────────────────────────────────────┘
                 │ POST /api/backup/upload
                 │ {filename, contentType, checksum}
                 │ Authorization: Bearer <JWT>
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Cloudflare Worker (R2 Proxy)                             │
│    - Verify JWT with Supabase secret                        │
│    - Extract userId from token                              │
│    - Generate user-scoped key path                          │
│    - Return upload endpoint                                 │
└────────────────┬────────────────────────────────────────────┘
                 │ Returns: {url, key, expiresAt}
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Client uploads encrypted backup                          │
│    POST /api/backup/upload-direct                           │
│    Headers: {Authorization, x-backup-key, content-type}     │
│    Body: <encrypted file data>                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Worker streams to R2                                     │
│    - Validates x-backup-key matches userId                  │
│    - Streams body to R2 (no temp storage)                   │
│    - Stores customMetadata {userId, timestamp}              │
└────────────────┬────────────────────────────────────────────┘
                 │ Success: {success: true, key}
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Client records metadata in Supabase                      │
│    INSERT INTO snapshots {key, checksum, size_bytes, ...}   │
└─────────────────────────────────────────────────────────────┘
```

### Worker Endpoints

| Endpoint                    | Method | Purpose                     | Auth               |
| --------------------------- | ------ | --------------------------- | ------------------ |
| `/api/backup/upload`        | POST   | Get upload endpoint + key   | JWT required       |
| `/api/backup/upload-direct` | POST   | Upload encrypted file to R2 | JWT + key required |
| `/api/backup/download`      | POST   | Download encrypted backup   | JWT required       |
| `/api/backup/list`          | GET    | List user's backups         | JWT required       |
| `/api/backup/delete`        | DELETE | Delete specific backup      | JWT required       |

### User-Scoped Paths

All backups stored with user ID prefix:

```
backups/{userId}/{year}/{month}/{filename}

Example: backups/abc123/2025/01/backup-1705345200000.gz.enc
```

This enforces user isolation at the path level.

---

## Local Development Setup

### Step 1: Create R2 Bucket

**Via Cloudflare Dashboard** (recommended for first-time):

1. Go to https://dash.cloudflare.com
2. Navigate to **R2** in left sidebar
3. Click **Create bucket**
4. Name: `household-hub-backups-dev` (for testing)
5. Location: **Automatic**
6. Click **Create bucket**

**Via CLI** (alternative):

```bash
npx wrangler r2 bucket create household-hub-backups-dev
```

**Verification**:

```bash
npx wrangler r2 bucket list
# Expected: household-hub-backups-dev
```

### Step 2: Create KV Namespace

```bash
# Create production namespace
npx wrangler kv:namespace create "JWT_CACHE"
# Output: ✨ Success! Created KV namespace JWT_CACHE
#   ID: abc123xyz456

# Create preview namespace for dev
npx wrangler kv:namespace create "JWT_CACHE" --preview
# Output: ✨ Success! Created KV namespace JWT_CACHE
#   Preview ID: def789ghi012
```

**Save these IDs** - you'll need them for `wrangler.toml`

### Step 3: Initialize Worker Project

Create the Worker directory structure:

```bash
# From project root
mkdir -p workers/r2-proxy/src
cd workers/r2-proxy
```

Create `package.json`:

```json
{
  "name": "household-hub-r2-proxy",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "jose": "^5.2.0"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20240208.0",
    "typescript": "^5.3.3",
    "wrangler": "^3.25.0"
  }
}
```

Install dependencies:

```bash
npm install
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020"],
    "types": ["@cloudflare/workers-types"],
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### Step 4: Create Worker Source Files

Create `src/types.ts`:

```typescript
export interface Env {
  BACKUPS: R2Bucket;
  JWT_CACHE: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_JWT_SECRET: string;
}

export interface SignedUrlRequest {
  filename: string;
  contentType: string;
  checksum?: string;
}

export interface SignedUrlResponse {
  url: string;
  key: string;
  expiresAt: string;
}

export interface R2AccessLog {
  userId: string;
  path: string;
  method: string;
  granted: boolean;
  statusCode: number;
  timestamp: string;
  ip?: string | null;
  userAgent?: string | null;
  error?: string;
}

export interface JWTPayload {
  sub: string; // User ID
  exp: number;
  iat: number;
  role?: string;
  aud?: string;
  iss?: string;
}
```

Create `src/auth.ts`:

```typescript
import { jwtVerify } from "jose";
import type { Env, JWTPayload } from "./types";

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function verifyJWT(token: string, env: Env): Promise<JWTPayload | null> {
  try {
    // Use HS256 with shared secret (typical Supabase setup)
    const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);

    const { payload } = await jwtVerify(token, secret, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });

    // Validate payload structure
    if (!payload.sub || typeof payload.sub !== "string") {
      console.error("Invalid JWT payload: missing sub");
      return null;
    }

    return payload as JWTPayload;
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}

export function extractToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.substring(7);
}

export async function authenticateRequest(request: Request, env: Env): Promise<string | Response> {
  const token = extractToken(request);

  if (!token) {
    return new Response("Unauthorized: Missing token", { status: 401 });
  }

  const payload = await verifyJWT(token, env);

  if (!payload) {
    return new Response("Unauthorized: Invalid token", { status: 401 });
  }

  // Check expiry
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return new Response("Unauthorized: Token expired", { status: 401 });
  }

  return payload.sub; // Return user ID
}
```

Create `src/handlers.ts`:

```typescript
import type { Env, SignedUrlRequest, SignedUrlResponse, R2AccessLog } from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-backup-key",
};

export async function handleUploadRequest(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  try {
    const body: SignedUrlRequest = await request.json();

    // Generate object key with user ID and timestamp
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");

    const key = `backups/${userId}/${year}/${month}/${body.filename}`;

    // Return Worker endpoint for client to POST file data
    const response: SignedUrlResponse = {
      url: `/api/backup/upload-direct`, // Client will POST here with file
      key,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    };

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error("Upload request failed:", error);
    return new Response("Internal error", { status: 500, headers: CORS_HEADERS });
  }
}

export async function handleDirectUpload(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  try {
    const contentType = request.headers.get("content-type") || "";
    const key = request.headers.get("x-backup-key");

    if (!key || !key.startsWith(`backups/${userId}/`)) {
      return new Response("Invalid or unauthorized backup key", {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    // Stream upload to R2 (handles large files efficiently)
    await env.BACKUPS.put(key, request.body, {
      httpMetadata: {
        contentType: contentType || "application/octet-stream",
      },
      customMetadata: {
        userId,
        timestamp: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ success: true, key }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error("Direct upload failed:", error);
    return new Response("Upload error", { status: 500, headers: CORS_HEADERS });
  }
}

export async function handleDownloadRequest(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  try {
    const { key } = await request.json();

    // Verify key belongs to user
    if (!key.startsWith(`backups/${userId}/`)) {
      return new Response("Forbidden: Access denied", {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    // Get object
    const object = await env.BACKUPS.get(key);

    if (!object) {
      return new Response("Not found", { status: 404, headers: CORS_HEADERS });
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
        "Content-Length": object.size.toString(),
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error("Download request failed:", error);
    return new Response("Internal error", { status: 500, headers: CORS_HEADERS });
  }
}

export async function handleListRequest(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  try {
    const prefix = `backups/${userId}/`;

    const objects = await env.BACKUPS.list({
      prefix,
      limit: 100,
    });

    const backups = objects.objects.map((obj) => ({
      key: obj.key,
      size: obj.size,
      uploaded: obj.uploaded.toISOString(),
      checksum: obj.checksums.md5,
    }));

    return new Response(JSON.stringify({ backups }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error("List request failed:", error);
    return new Response("Internal error", { status: 500, headers: CORS_HEADERS });
  }
}

export async function handleDeleteRequest(
  request: Request,
  env: Env,
  userId: string
): Promise<Response> {
  try {
    const { key } = await request.json();

    // Verify key belongs to user
    if (!key.startsWith(`backups/${userId}/`)) {
      return new Response("Forbidden: Access denied", {
        status: 403,
        headers: CORS_HEADERS,
      });
    }

    await env.BACKUPS.delete(key);

    return new Response(JSON.stringify({ success: true }), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (error) {
    console.error("Delete request failed:", error);
    return new Response("Internal error", { status: 500, headers: CORS_HEADERS });
  }
}

export async function logR2Access(env: Env, log: R2AccessLog): Promise<void> {
  try {
    const logKey = `r2-access:${log.timestamp}:${log.userId}`;

    await env.JWT_CACHE.put(logKey, JSON.stringify(log), {
      expirationTtl: 60 * 60 * 24 * 30, // 30 days
    });

    console.log("[R2 Access]", JSON.stringify(log));
  } catch (error) {
    console.error("Failed to log R2 access:", error);
  }
}
```

Create `src/index.ts`:

```typescript
import { authenticateRequest } from "./auth";
import {
  handleUploadRequest,
  handleDirectUpload,
  handleDownloadRequest,
  handleListRequest,
  handleDeleteRequest,
  logR2Access,
} from "./handlers";
import type { Env, R2AccessLog } from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-backup-key",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Authenticate request
    const authResult = await authenticateRequest(request, env);

    if (typeof authResult !== "string") {
      // Auth failed, authResult is error Response
      return authResult;
    }

    const userId = authResult;
    let response: Response;
    let accessGranted = true;

    // Route handling
    try {
      switch (url.pathname) {
        case "/api/backup/upload":
          response = await handleUploadRequest(request, env, userId);
          break;

        case "/api/backup/upload-direct":
          response = await handleDirectUpload(request, env, userId);
          break;

        case "/api/backup/download":
          response = await handleDownloadRequest(request, env, userId);
          break;

        case "/api/backup/list":
          response = await handleListRequest(request, env, userId);
          break;

        case "/api/backup/delete":
          response = await handleDeleteRequest(request, env, userId);
          break;

        default:
          response = new Response("Not found", { status: 404, headers: CORS_HEADERS });
          accessGranted = false;
      }
    } catch (error) {
      console.error("Request handler error:", error);
      response = new Response("Internal error", {
        status: 500,
        headers: CORS_HEADERS,
      });
      accessGranted = false;
    }

    // Log access
    const log: R2AccessLog = {
      userId,
      path: url.pathname,
      method: request.method,
      granted: accessGranted && response.ok,
      statusCode: response.status,
      timestamp: new Date().toISOString(),
      ip: request.headers.get("cf-connecting-ip"),
      userAgent: request.headers.get("user-agent"),
    };

    await logR2Access(env, log);

    return response;
  },
};
```

### Step 5: Configure wrangler.toml

Create `wrangler.toml` (for local dev with local Supabase):

```toml
name = "household-hub-r2-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-15"

# R2 Bucket binding
[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "household-hub-backups-dev"

# KV Namespace binding
[[kv_namespaces]]
binding = "JWT_CACHE"
id = "YOUR_KV_NAMESPACE_ID"        # Replace with ID from step 2
preview_id = "YOUR_PREVIEW_KV_ID"  # Replace with preview ID from step 2

# Environment variables
[vars]
SUPABASE_URL = "http://127.0.0.1:54331"  # Local Supabase (adjust port if different)

# Secrets (set via wrangler secret put)
# SUPABASE_JWT_SECRET = "..." (set in step 6)
```

### Step 6: Set JWT Secret

For **local Supabase**, use the default JWT secret:

```bash
npx wrangler secret put SUPABASE_JWT_SECRET
# When prompted, paste: super-secret-jwt-token-with-at-least-32-characters-long
```

For **production Supabase** (when deploying):

1. Go to Supabase Dashboard → Settings → API
2. Copy **JWT Secret** (long base64 string)
3. Run the secret command and paste the production secret

### Step 7: Test Locally

Run the Worker locally:

```bash
npx wrangler dev
# Worker runs on http://localhost:8787
```

Test in another terminal:

```bash
# Get JWT token from your local app (browser console after login):
# const { data } = await window.supabase.auth.getSession()
# console.log(data.session.access_token)

TOKEN="your-jwt-token-here"

# Test list endpoint
curl http://localhost:8787/api/backup/list \
  -H "Authorization: Bearer $TOKEN"

# Expected: {"backups": []}

# Test upload URL generation
curl -X POST http://localhost:8787/api/backup/upload \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.gz",
    "contentType": "application/gzip",
    "checksum": "abc123"
  }'

# Expected: {"url": "/api/backup/upload-direct", "key": "backups/USER_ID/2025/10/test.gz", "expiresAt": "..."}
```

**Verification checklist**:

- [ ] Worker starts without errors
- [ ] List endpoint returns empty array
- [ ] Upload endpoint returns valid response
- [ ] Invalid JWT returns 401
- [ ] TypeScript compiles without errors

---

## Production Deployment

### Step 1: Update wrangler.toml for Production

Replace `wrangler.toml` with production configuration:

```toml
name = "household-hub-r2-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-15"

# R2 Bucket binding
[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "household-hub-backups-prod"  # Production bucket

# KV Namespace binding
[[kv_namespaces]]
binding = "JWT_CACHE"
id = "YOUR_PRODUCTION_KV_ID"        # Production namespace ID
preview_id = "YOUR_PREVIEW_KV_ID"   # Preview namespace ID

# Environment variables
[vars]
SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"  # Production Supabase URL
```

### Step 2: Create Production R2 Bucket

```bash
npx wrangler r2 bucket create household-hub-backups-prod
```

### Step 3: Set Production JWT Secret

```bash
npx wrangler secret put SUPABASE_JWT_SECRET
# Paste production JWT secret from Supabase dashboard
```

### Step 4: Deploy Worker

```bash
npx wrangler deploy
```

**Expected output**:

```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Published household-hub-r2-proxy (X.XXs)
  https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev
```

**Save this URL** - you'll use it in your client app configuration.

### Step 5: Update Frontend Configuration

Add Worker URL to your frontend environment variables:

**.env.production**:

```bash
VITE_R2_WORKER_URL=https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev
```

---

## Testing & Verification

### Manual Testing Checklist

- [ ] **Health check**: Worker responds to root path (should 404, expected)
- [ ] **CORS**: OPTIONS request returns correct headers
- [ ] **JWT validation**: Invalid token returns 401
- [ ] **Upload URL**: Returns valid key and URL
- [ ] **List backups**: Returns empty array initially
- [ ] **User isolation**: Cannot access other user's paths (403)

### Test Script

```bash
#!/bin/bash
WORKER_URL="https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev"
TOKEN="your-production-jwt-token"

echo "Testing CORS..."
curl -X OPTIONS "$WORKER_URL/api/backup/upload" \
  -H "Origin: https://your-app.pages.dev" \
  -I | grep "Access-Control"

echo "Testing invalid JWT..."
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer invalid-token"
# Expected: Unauthorized: Invalid token

echo "Testing list endpoint..."
curl "$WORKER_URL/api/backup/list" \
  -H "Authorization: Bearer $TOKEN"
# Expected: {"backups": []}

echo "Testing upload URL generation..."
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.gz",
    "contentType": "application/gzip"
  }'
# Expected: {"url": "...", "key": "backups/USER_ID/...", "expiresAt": "..."}

echo "All tests completed!"
```

---

## Security Configuration

### CORS Restrictions

For production, **restrict CORS** to your domain:

In `src/handlers.ts` and `src/index.ts`, change:

```typescript
// ❌ Development (allows all origins)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  // ...
};

// ✅ Production (restrict to your domain)
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://household-hub.pages.dev",
  // ...
};
```

### JWT Secret Rotation

To rotate JWT secret:

1. Generate new secret in Supabase dashboard
2. Update Worker secret:
   ```bash
   npx wrangler secret put SUPABASE_JWT_SECRET
   ```
3. Redeploy:
   ```bash
   npx wrangler deploy
   ```

### Rate Limiting (Optional)

Add rate limiting with Durable Objects (Phase C enhancement):

```typescript
// Future: Implement rate limiting
// - 100 requests per minute per user
// - Use Durable Objects for distributed counting
// - Return 429 Too Many Requests if exceeded
```

---

## Troubleshooting

### Issue: Worker deployment fails

**Symptoms**: `wrangler deploy` errors

**Solutions**:

1. Check wrangler.toml syntax
2. Verify R2 bucket exists: `npx wrangler r2 bucket list`
3. Verify KV namespace IDs are correct
4. Ensure logged in: `npx wrangler whoami`

### Issue: JWT verification fails

**Symptoms**: All requests return 401

**Solutions**:

1. Verify JWT secret is correct:

   ```bash
   npx wrangler secret list
   # Should show SUPABASE_JWT_SECRET
   ```

2. Check Supabase URL matches:

   ```bash
   # In wrangler.toml
   SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"
   ```

3. Verify token in jwt.io:
   - Decode your JWT token
   - Check `iss` claim matches `${SUPABASE_URL}/auth/v1`
   - Check `aud` claim is "authenticated"

### Issue: CORS errors in browser

**Symptoms**: Browser console shows CORS policy errors

**Solutions**:

1. Ensure all responses include CORS headers (even errors)
2. Handle OPTIONS preflight:

   ```typescript
   if (request.method === "OPTIONS") {
     return new Response(null, { headers: CORS_HEADERS });
   }
   ```

3. Check origin restriction matches your domain

### Issue: R2 access denied

**Symptoms**: 403 errors when accessing R2

**Solutions**:

1. Verify R2 binding in wrangler.toml:

   ```toml
   [[r2_buckets]]
   binding = "BACKUPS"  # Must match env.BACKUPS in code
   bucket_name = "household-hub-backups-prod"
   ```

2. Redeploy with --force:
   ```bash
   npx wrangler deploy --force
   ```

---

## Rollback Procedures

### Emergency Rollback

If Worker is causing issues:

```bash
# 1. Check logs
npx wrangler tail

# 2. Rollback to previous version
npx wrangler rollback

# 3. If still failing, delete Worker (emergency)
npx wrangler delete household-hub-r2-proxy
```

**Impact**: App continues using CSV export (chunks 036-037)

### Gradual Rollback

For graceful rollback:

1. Update frontend to use CSV export only
2. Wait for all users to update
3. Delete Worker and R2 resources

---

## Monitoring & Maintenance

### Monitor Worker Metrics

View metrics in Cloudflare Dashboard:

1. Go to **Workers & Pages**
2. Select `household-hub-r2-proxy`
3. View **Metrics** tab

**Key metrics**:

- Requests per second
- Error rate
- CPU time
- Response time

### View Worker Logs

```bash
# Real-time logs
npx wrangler tail

# Filter by status code
npx wrangler tail --status 500

# Filter by user
npx wrangler tail | grep "userId-abc123"
```

### R2 Storage Monitoring

Check storage usage:

1. Go to Cloudflare Dashboard → R2
2. Select `household-hub-backups-prod`
3. View **Metrics** tab

**Watch for**:

- Storage approaching 10GB (free tier limit)
- Unusual upload/download patterns
- Failed requests

### Cleanup Old Backups

Implement cleanup policy (Phase C):

```typescript
// Future: Cron-based cleanup
// - Delete backups older than 90 days
// - Keep last 10 backups per user
// - Run daily at 2 AM UTC
```

---

## Next Steps

After R2 infrastructure is deployed:

1. **Chunk 039**: Implement client-side encryption
   - AES-GCM with WebCrypto API
   - Auth-derived encryption keys
   - Encrypted file format

2. **Chunk 040**: Build backup UI
   - BackupManager component
   - RestoreManager component
   - Backup history list
   - Progress indicators

3. **Test complete flow**:
   - Create encrypted backup
   - Upload to R2 via Worker
   - Download and decrypt
   - Restore to IndexedDB

---

## Cost Summary

**Cloudflare R2 Free Tier**:

- Storage: 10GB
- Class A operations: 1M/month (writes)
- Class B operations: 10M/month (reads)
- Egress: Free (no bandwidth charges) ✅

**Typical household usage**:

- Daily backup: ~5MB
- Monthly: ~150MB
- Annual: ~1.8GB
- **Cost**: $0 (within free tier)

**Cloudflare Workers Free Tier**:

- Requests: 100,000/day
- CPU time: 10ms/request
- **Cost**: $0 (sufficient for backups)

**Total monthly cost**: $0 ✅

---

**Questions?** See:

- [Chunk 038 Troubleshooting](../chunks/038-r2-setup/troubleshooting.md)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
