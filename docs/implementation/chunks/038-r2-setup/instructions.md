# Instructions: R2 Setup

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Install Wrangler CLI (5 min)

```bash
# Install globally
npm install -g wrangler

# Verify installation
wrangler --version

# Login to Cloudflare
wrangler login
```

This will open your browser for authentication.

**Verify**: `wrangler whoami` shows your account

---

## Step 2: Create R2 Bucket (5 min)

Via Cloudflare Dashboard:

1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. Select your account
3. Navigate to **R2** in the left sidebar
4. Click **Create bucket**
5. Name: `household-hub-backups`
6. Location: **Automatic** (recommended)
7. Click **Create bucket**

**Verify**: Bucket appears in R2 dashboard

---

## Step 3: Create KV Namespace for JWT Caching (5 min)

```bash
# Create production KV namespace
wrangler kv:namespace create "JWT_CACHE"

# Note the ID returned, you'll need it for wrangler.toml

# Create preview namespace for dev
wrangler kv:namespace create "JWT_CACHE" --preview
```

**Output example**:

```
✨ Success! Created KV namespace JWT_CACHE
    ID: abc123xyz456
```

**Verify**: Namespaces visible in Cloudflare dashboard under Workers > KV

---

## Step 4: Initialize Worker Project (10 min)

```bash
# Create worker directory
mkdir -p workers/r2-proxy
cd workers/r2-proxy

# Initialize with wrangler
wrangler init

# Install dependencies
npm install jose
npm install -D @cloudflare/workers-types
```

Create `wrangler.toml`:

```toml
name = "household-hub-r2-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-15"

# R2 Bucket binding
[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "household-hub-backups"

# KV Namespace binding
[[kv_namespaces]]
binding = "JWT_CACHE"
id = "YOUR_KV_NAMESPACE_ID"  # Replace with ID from step 3
preview_id = "YOUR_PREVIEW_KV_ID"  # Replace with preview ID

# Environment variables
[vars]
SUPABASE_URL = "https://your-project.supabase.co"

# Secrets (set via wrangler secret put)
# SUPABASE_JWT_SECRET = "..." (set in step 5)
```

**Update the IDs** with your actual KV namespace IDs from step 3.

**Verify**: `wrangler.toml` has correct configuration

---

## Step 5: Set Worker Secrets (5 min)

Get your Supabase JWT secret from Supabase dashboard:

1. Go to **Settings** → **API**
2. Copy **JWT Secret** from **Project Settings**

Set as Worker secret:

```bash
wrangler secret put SUPABASE_JWT_SECRET
# Paste your JWT secret when prompted
```

**Verify**: `wrangler secret list` shows `SUPABASE_JWT_SECRET`

---

## Step 6: Create TypeScript Types (5 min)

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

---

## Step 7: Create JWT Validation Module (15 min)

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

---

## Step 8: Create Route Handlers (20 min)

Create `src/handlers.ts`:

```typescript
import type { Env, SignedUrlRequest, SignedUrlResponse, R2AccessLog } from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

    // Create multipart upload (for files >5MB)
    const upload = await env.BACKUPS.createMultipartUpload(key, {
      customMetadata: {
        userId,
        checksum: body.checksum || "",
        timestamp: date.toISOString(),
        contentType: body.contentType,
      },
    });

    const response: SignedUrlResponse = {
      url: upload.uploadId, // In practice, you'd generate a signed URL here
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

---

## Step 9: Create Main Worker Entry (10 min)

Create `src/index.ts`:

```typescript
import { authenticateRequest } from "./auth";
import {
  handleUploadRequest,
  handleDownloadRequest,
  handleListRequest,
  handleDeleteRequest,
  logR2Access,
} from "./handlers";
import type { Env, R2AccessLog } from "./types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

---

## Step 10: Deploy Worker (5 min)

```bash
# Build and deploy
wrangler deploy

# Verify deployment
wrangler tail
```

**Output**:

```
Published household-hub-r2-proxy (1.23s)
  https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev
```

**Save this URL** - you'll use it in the client app.

**Verify**: Visit the URL, should return 404 (expected for root path)

---

## Step 11: Test Worker Endpoints (10 min)

Use `curl` or Postman to test:

```bash
# Get your Supabase access token
# (From browser console after logging in: supabase.auth.getSession())
TOKEN="your-access-token"

WORKER_URL="https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev"

# Test upload URL generation
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test-backup.gz",
    "contentType": "application/gzip",
    "checksum": "abc123"
  }'

# Expected: JSON with url, key, expiresAt
```

**Test list endpoint**:

```bash
curl "$WORKER_URL/api/backup/list" \
  -H "Authorization: Bearer $TOKEN"

# Expected: { "backups": [] } (empty for now)
```

**Verify**: Endpoints return expected JSON (not errors)

---

## Done!

When the Worker deploys successfully and endpoints respond correctly, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Production Considerations**:

- Set proper CORS origin (not wildcard)
- Add rate limiting with Durable Objects
- Enable Cloudflare Analytics
- Set up error tracking (Sentry)
- Add health check endpoint

**Cost Monitoring**:

- View R2 usage in Cloudflare dashboard
- Set up billing alerts
- Monitor Worker invocations

**Security**:

- Rotate JWT secret regularly
- Use preview environment for testing
- Review R2 access logs periodically
- Implement request throttling
