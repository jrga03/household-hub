# Troubleshooting: R2 Setup

Common issues and solutions when working with Cloudflare R2 and Workers.

---

## Wrangler CLI Issues

### Problem: "wrangler: command not found"

**Symptoms**:

```bash
wrangler --version
# zsh: command not found: wrangler
```

**Cause**: Wrangler not installed or not in PATH

**Solution**:

```bash
# Install globally
npm install -g wrangler

# Or use npx
npx wrangler --version

# Add to PATH if needed
echo 'export PATH="$PATH:$(npm config get prefix)/bin"' >> ~/.zshrc
source ~/.zshrc
```

---

### Problem: "You need to be logged in to do that"

**Symptoms**:

- Commands fail with authentication error
- `wrangler whoami` shows "Not logged in"

**Cause**: Not authenticated with Cloudflare

**Solution**:

```bash
# Login via browser
wrangler login

# If that fails, use API token
wrangler login --api-token YOUR_API_TOKEN

# Verify login
wrangler whoami
```

---

## R2 Bucket Issues

### Problem: "Bucket already exists" when creating

**Symptoms**:

- Dashboard shows "Bucket name already taken"
- Can't create bucket with chosen name

**Cause**: Bucket names are globally unique

**Solution**:

Use a unique name:

```
household-hub-backups-YOUR_UNIQUE_ID
household-hub-backups-production
your-company-household-backups
```

Update `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "household-hub-backups-xyz123"
```

---

### Problem: "Bucket not found" during deployment

**Symptoms**:

```
Error: Bucket "household-hub-backups" not found
```

**Cause**: Bucket name in wrangler.toml doesn't match actual bucket

**Solution**:

Verify bucket name:

```bash
# List all R2 buckets
wrangler r2 bucket list
```

Update wrangler.toml with correct name:

```toml
bucket_name = "actual-bucket-name-from-list"
```

---

## KV Namespace Issues

### Problem: "Namespace not found"

**Symptoms**:

```
Error: KV namespace with ID "abc123" not found
```

**Cause**: Wrong namespace ID in wrangler.toml

**Solution**:

List namespaces:

```bash
wrangler kv:namespace list
```

Update wrangler.toml with correct IDs:

```toml
[[kv_namespaces]]
binding = "JWT_CACHE"
id = "correct-id-here"
preview_id = "correct-preview-id-here"
```

---

### Problem: KV writes fail silently

**Symptoms**:

- No error but data not in KV
- `wrangler kv:key list` shows empty

**Cause**: Writing to preview namespace in production

**Solution**:

Ensure separate namespaces:

```toml
# Production namespace
[[kv_namespaces]]
binding = "JWT_CACHE"
id = "production-namespace-id"
preview_id = "preview-namespace-id"  # Different ID!
```

Test in dev:

```bash
# Uses preview namespace
wrangler dev

# Check preview namespace
wrangler kv:key list --namespace-id=preview-namespace-id
```

---

## Worker Deployment Issues

### Problem: "Script startup timed out"

**Symptoms**:

```
Error: Script startup exceeded 400ms
```

**Cause**: Worker code has slow initialization

**Solution**:

Avoid heavy operations at module scope:

```typescript
// ❌ Bad: Runs on every cold start
const heavyData = processLargeFile();

export default {
  async fetch() {},
};

// ✅ Good: Lazy load only when needed
let heavyData: any = null;

export default {
  async fetch() {
    if (!heavyData) {
      heavyData = await processLargeFile();
    }
  },
};
```

---

### Problem: "Module build failed" with TypeScript

**Symptoms**:

```
Error: Could not resolve "jose"
```

**Cause**: Missing dependencies or wrong tsconfig

**Solution 1**: Install dependencies

```bash
npm install jose
npm install -D @cloudflare/workers-types
```

**Solution 2**: Fix tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "lib": ["ES2020"],
    "types": ["@cloudflare/workers-types"],
    "moduleResolution": "node",
    "resolveJsonModule": true
  }
}
```

---

### Problem: Deployment succeeds but Worker returns errors

**Symptoms**:

- Deployment shows success
- All requests return 500 Internal Error
- No helpful error messages

**Cause**: Runtime errors not visible during deployment

**Solution**:

Use `wrangler tail` to see live logs:

```bash
# In one terminal
wrangler tail

# In another, make request
curl $WORKER_URL/api/backup/upload
```

Check logs for stack traces.

---

## JWT Validation Issues

### Problem: "JWT verification failed" with valid token

**Symptoms**:

- Token works in Supabase
- Worker rejects as invalid
- Console shows verification error

**Cause 1**: Wrong JWT secret

**Solution**:

Verify secret from Supabase dashboard:

1. Settings → API → Project Settings
2. Copy JWT Secret (not ANON KEY!)
3. Update Worker secret:

```bash
wrangler secret put SUPABASE_JWT_SECRET
# Paste JWT Secret
```

**Cause 2**: Wrong issuer/audience

**Solution**:

Update JWT verification:

```typescript
const { payload } = await jwtVerify(token, secret, {
  issuer: `${env.SUPABASE_URL}/auth/v1`, // Must match!
  audience: "authenticated", // Must match!
});
```

Check token claims:

```javascript
// In browser console
const token = "your-token";
const payload = JSON.parse(atob(token.split(".")[1]));
console.log(payload.iss); // Should be: https://xxx.supabase.co/auth/v1
console.log(payload.aud); // Should be: authenticated
```

---

### Problem: Token expired error for valid token

**Symptoms**:

- Token just created
- Shows as expired
- Clock skew suspected

**Cause**: Server time mismatch

**Solution**:

Check token expiry:

```javascript
const token = "your-token";
const payload = JSON.parse(atob(token.split(".")[1]));
const exp = new Date(payload.exp * 1000);
const now = new Date();
console.log("Expires:", exp);
console.log("Now:", now);
console.log("Diff seconds:", (exp - now) / 1000);
```

If diff is negative, token is expired. Get fresh token:

```javascript
const { data } = await supabase.auth.refreshSession();
const newToken = data.session?.access_token;
```

---

### Problem: "Invalid token" but token looks correct

**Symptoms**:

- Token format is correct (3 parts with dots)
- Payload decodes successfully
- Still fails verification

**Cause**: Using wrong algorithm (RS256 vs HS256)

**Solution**:

Check Supabase auth settings:

Most Supabase projects use HS256 (shared secret).

For HS256:

```typescript
const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
const { payload } = await jwtVerify(token, secret);
```

For RS256 (less common):

```typescript
import { importSPKI } from "jose";

// Fetch public key from Supabase
const jwksUrl = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const response = await fetch(jwksUrl);
const jwks = await response.json();

const publicKey = await importSPKI(jwks.keys[0].x5c[0], "RS256");
const { payload } = await jwtVerify(token, publicKey);
```

---

## CORS Issues

### Problem: Browser shows CORS error despite CORS headers

**Symptoms**:

```
Access to fetch at '...' from origin 'http://localhost:3000'
has been blocked by CORS policy
```

**Cause 1**: Missing CORS headers on error responses

**Solution**:

Ensure ALL responses include CORS headers:

```typescript
// ❌ Bad: Error missing CORS
if (!authenticated) {
  return new Response("Unauthorized", { status: 401 });
}

// ✅ Good: Error includes CORS
if (!authenticated) {
  return new Response("Unauthorized", {
    status: 401,
    headers: CORS_HEADERS,
  });
}
```

**Cause 2**: OPTIONS preflight not handled

**Solution**:

Handle OPTIONS early:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight FIRST
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Then auth/routing
    const userId = await authenticateRequest(request, env);
    // ...
  },
};
```

---

### Problem: CORS works in dev but not production

**Symptoms**:

- `wrangler dev` works fine
- Deployed Worker has CORS errors

**Cause**: Different CORS configuration

**Solution**:

Check production URL in fetch:

```typescript
// Frontend code
const WORKER_URL =
  import.meta.env.VITE_WORKER_URL || "https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev";

const response = await fetch(`${WORKER_URL}/api/backup/upload`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(data),
});
```

Verify WORKER_URL is correct production URL.

---

## R2 Access Issues

### Problem: "403 Forbidden" when accessing R2

**Symptoms**:

- Worker deployed successfully
- Requests fail with 403
- R2 binding seems broken

**Cause**: R2 bucket not bound to Worker

**Solution**:

Verify binding in wrangler.toml:

```toml
[[r2_buckets]]
binding = "BACKUPS"  # Must match env.BACKUPS in code
bucket_name = "household-hub-backups"
```

Verify in code:

```typescript
export interface Env {
  BACKUPS: R2Bucket; // Must match binding name
  // ...
}

// Usage
const object = await env.BACKUPS.get(key); // Uses binding
```

Redeploy:

```bash
wrangler deploy --force
```

---

### Problem: R2 operations slow or timeout

**Symptoms**:

- Upload/download takes very long
- Requests timeout
- Performance degraded

**Cause**: Large files or network issues

**Solution 1**: Use multipart upload for large files

```typescript
// For files >5MB
const upload = await env.BACKUPS.createMultipartUpload(key);

// Upload in chunks
for (const chunk of chunks) {
  await upload.uploadPart(partNumber, chunk);
}

await upload.complete();
```

**Solution 2**: Set timeout in Worker

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000); // 30s

try {
  const object = await env.BACKUPS.get(key, {
    signal: controller.signal,
  });
} finally {
  clearTimeout(timeout);
}
```

---

## Performance Issues

### Problem: Slow cold starts (>1 second)

**Symptoms**:

- First request after deploy is very slow
- Subsequent requests fast
- Users experience delays

**Cause**: Large Worker size or heavy initialization

**Solution 1**: Reduce bundle size

```bash
# Check bundle size
wrangler deploy --dry-run

# Should be < 1MB ideally
```

**Solution 2**: Minimize dependencies

```typescript
// ❌ Bad: Imports entire library
import * as jose from "jose";

// ✅ Good: Import only what you need
import { jwtVerify } from "jose";
```

**Solution 3**: Use KV caching

```typescript
// Cache expensive computations
let cachedData = await env.JWT_CACHE.get("expensive-data", "json");

if (!cachedData) {
  cachedData = await expensiveComputation();
  await env.JWT_CACHE.put("expensive-data", JSON.stringify(cachedData), {
    expirationTtl: 3600, // 1 hour
  });
}
```

---

### Problem: High latency for all requests

**Symptoms**:

- Every request takes >500ms
- No cold start involved
- Consistent slowness

**Cause**: Inefficient code or external API calls

**Solution**:

Profile with console.time:

```typescript
console.time("jwt-verify");
const payload = await verifyJWT(token, env);
console.timeEnd("jwt-verify");

console.time("r2-list");
const objects = await env.BACKUPS.list({ prefix });
console.timeEnd("r2-list");
```

View with `wrangler tail` to identify bottlenecks.

---

## Secrets Management Issues

### Problem: "Secret not found" error

**Symptoms**:

```
ReferenceError: SUPABASE_JWT_SECRET is not defined
```

**Cause**: Secret not set or wrong name

**Solution**:

List secrets:

```bash
wrangler secret list
```

Set if missing:

```bash
wrangler secret put SUPABASE_JWT_SECRET
```

Verify name matches wrangler.toml and code:

```toml
# wrangler.toml doesn't list secrets, only vars
[vars]
SUPABASE_URL = "..."

# Secrets set via CLI, accessed same as vars
```

```typescript
// In code
env.SUPABASE_JWT_SECRET; // Must match secret name exactly
```

---

### Problem: Secret rotation not working

**Symptoms**:

- Updated secret in dashboard
- Worker still uses old secret
- Requests fail after rotation

**Cause**: Worker not redeployed after secret change

**Solution**:

Redeploy after secret changes:

```bash
# Update secret
wrangler secret put SUPABASE_JWT_SECRET

# Deploy to activate new secret
wrangler deploy
```

Note: Secrets are encrypted at rest, changes require deployment.

---

## Prevention Tips

1. **Test locally first**: Use `wrangler dev` before deploying
2. **Use wrangler tail**: Monitor live logs during development
3. **Version your Worker**: Use git tags for deployments
4. **Monitor metrics**: Set up Cloudflare Analytics
5. **Test CORS**: Verify from actual frontend domain
6. **Cache strategically**: Use KV for expensive operations
7. **Handle errors**: Return proper error responses with CORS

---

## Getting Help

If you're stuck:

1. Check `wrangler tail` for live logs
2. Test with `curl` to isolate frontend issues
3. Verify JWT token in jwt.io
4. Check Cloudflare status page for outages
5. Review Cloudflare Workers docs
6. Post in Cloudflare Community forums

---

## Quick Fixes

```bash
# Clear local wrangler cache
rm -rf ~/.wrangler/

# Force redeploy
wrangler deploy --force

# Test locally
wrangler dev

# View live logs
wrangler tail

# Check bucket status
wrangler r2 bucket info household-hub-backups
```

---

**Remember**: Worker debugging is different from traditional servers. Use `console.log` liberally and watch with `wrangler tail`.
