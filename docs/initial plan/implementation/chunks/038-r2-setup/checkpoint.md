# Checkpoint: R2 Setup

Run these verifications to ensure everything works correctly.

---

## 1. Wrangler CLI Installed ✓

```bash
wrangler --version
```

**Expected**: Version 3.x.x or higher

```bash
wrangler whoami
```

**Expected**: Shows your Cloudflare account email

---

## 2. R2 Bucket Created ✓

Via Cloudflare Dashboard:

1. Go to R2 section
2. Verify `household-hub-backups` bucket exists

**Visual checks**:

- [ ] Bucket listed in R2 dashboard
- [ ] Location shows as "Automatic"
- [ ] Created date visible
- [ ] No objects yet (empty bucket)

---

## 3. KV Namespace Created ✓

```bash
wrangler kv:namespace list
```

**Expected**: Shows `JWT_CACHE` namespace

**In Cloudflare Dashboard**:

- [ ] Workers → KV shows `JWT_CACHE`
- [ ] Both production and preview namespaces exist
- [ ] Namespace IDs visible

---

## 4. Worker Configuration Valid ✓

Check `workers/r2-proxy/wrangler.toml`:

**Required sections**:

- [ ] `[[r2_buckets]]` with correct bucket_name
- [ ] `[[kv_namespaces]]` with correct IDs
- [ ] `[vars]` with SUPABASE_URL
- [ ] No syntax errors

**Verify**:

```bash
cd workers/r2-proxy
wrangler deploy --dry-run
```

**Expected**: No configuration errors

---

## 5. Secrets Configured ✓

```bash
cd workers/r2-proxy
wrangler secret list
```

**Expected**: Shows `SUPABASE_JWT_SECRET`

**Verify secret value** (careful not to expose):

```bash
# This will fail if secret not set
wrangler deploy
```

**Expected**: Deployment succeeds (secret loaded)

---

## 6. TypeScript Compiles ✓

```bash
cd workers/r2-proxy
npx tsc --noEmit
```

**Expected**: No TypeScript errors in:

- `src/index.ts`
- `src/auth.ts`
- `src/handlers.ts`
- `src/types.ts`

---

## 7. Worker Deployed Successfully ✓

```bash
wrangler deploy
```

**Expected output**:

```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Published household-hub-r2-proxy (X.XXs)
  https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev
```

**Visual checks**:

- [ ] Deployment completes without errors
- [ ] Worker URL displayed
- [ ] Worker appears in Cloudflare dashboard
- [ ] Status shows "Active"

---

## 8. Worker Responds to Requests ✓

Test root path (should 404):

```bash
WORKER_URL="https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev"

curl $WORKER_URL
```

**Expected**: `Not found` with 404 status

Test OPTIONS (CORS preflight):

```bash
curl -X OPTIONS $WORKER_URL/api/backup/upload \
  -H "Origin: http://localhost:3000"
```

**Expected**: 200 OK with CORS headers

---

## 9. JWT Validation Works ✓

**Test with invalid token**:

```bash
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer invalid-token"
```

**Expected**: `Unauthorized: Invalid token` with 401 status

**Test with no token**:

```bash
curl -X POST "$WORKER_URL/api/backup/upload"
```

**Expected**: `Unauthorized: Missing token` with 401 status

---

## 10. Upload Endpoint Returns Signed URL ✓

**Get valid token from Supabase**:

Prerequisites for this test:

1. **Dev server running**: `npm run dev` (in project root)
2. **App accessible**: Open http://localhost:3000 in browser
3. **Logged in**: Complete login flow (email/password from chunk 002)
4. **Supabase client available**: App initialized with Supabase

Steps to get token:

1. Open browser DevTools (F12 or Cmd+Opt+I)
2. Go to **Console** tab
3. Run this command:

```javascript
// Get current session
const { data, error } = await window.supabase.auth.getSession();

if (error) {
  console.error("Auth error:", error);
} else if (!data.session) {
  console.error("No session - please log in first");
} else {
  const token = data.session.access_token;
  console.log("Access Token:", token);
  console.log("\nToken expires:", new Date(data.session.expires_at * 1000));

  // Copy token to clipboard (Chrome/Edge)
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(token);
    console.log("✓ Token copied to clipboard!");
  }
}
```

**Troubleshooting**:

- **"supabase is not defined"**: Supabase client not initialized. Check chunk 002 implementation.
- **"No session"**: Log out and log in again, then retry.
- **Token expired**: Token is valid for 1 hour. Log in again to get fresh token.

**Expected output**: Long JWT string (3 parts separated by dots, ~500+ characters)

---

**Test upload endpoint**:

```bash
TOKEN="your-token-here"

curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.gz",
    "contentType": "application/gzip",
    "checksum": "abc123"
  }'
```

**Expected JSON**:

```json
{
  "url": "...",
  "key": "backups/{userId}/2025/01/test.gz",
  "expiresAt": "2025-01-15T..."
}
```

**Visual checks**:

- [ ] Response is valid JSON
- [ ] `key` contains user ID
- [ ] `key` contains correct date path
- [ ] `expiresAt` is ~1 hour from now
- [ ] No error in response

---

## 11. List Endpoint Returns Empty Array ✓

```bash
curl "$WORKER_URL/api/backup/list" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected JSON**:

```json
{
  "backups": []
}
```

(Empty because no backups uploaded yet)

---

## 12. User-Scoped Access Enforced ✓

**Test cross-user access** (should fail):

```bash
curl -X POST "$WORKER_URL/api/backup/download" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "backups/different-user-id/2025/01/test.gz"
  }'
```

**Expected**: `Forbidden: Access denied` with 403 status

**Verify**:

- [ ] Cannot access other users' backups
- [ ] Own user ID extracted from JWT correctly
- [ ] Path validation working

---

## 13. R2 Bindings Work ✓

**Test via wrangler**:

```bash
wrangler tail
```

Then make a request to the Worker.

**Expected logs**:

```
[R2 Access] {"userId":"...","path":"/api/backup/upload",...}
```

**Visual checks**:

- [ ] Logs appear in real-time
- [ ] R2 operations logged
- [ ] User ID present in logs
- [ ] No R2 connection errors

---

## 14. KV Caching Works ✓

Check that access logs are stored in KV:

Via Cloudflare Dashboard:

1. Go to Workers → KV
2. Select `JWT_CACHE` namespace
3. View keys

**Expected**:

- [ ] Keys like `r2-access:2025-01-15T...:{userId}` exist
- [ ] Values contain JSON log data
- [ ] TTL set to 30 days

---

## 15. Error Handling Works ✓

**Test with malformed JSON**:

```bash
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d 'invalid-json'
```

**Expected**: `Internal error` with 500 status

**Test with missing required field**:

```bash
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected**: Error response (not crash)

**Visual checks**:

- [ ] Worker doesn't crash on bad input
- [ ] Error responses are consistent
- [ ] Errors logged properly

---

## 16. CORS Headers Present ✓

```bash
curl -i "$WORKER_URL/api/backup/list" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected headers**:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

**Visual checks**:

- [ ] All CORS headers present
- [ ] OPTIONS requests succeed
- [ ] Web app can make requests

---

## 17. Performance Check ✓

Measure latency:

```bash
time curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.gz",
    "contentType": "application/gzip"
  }'
```

**Expected**: < 200ms total time (cold start may be higher)

**After 2-3 requests** (warm):

**Expected**: < 100ms consistently

---

## Success Criteria

- [ ] Wrangler CLI working
- [ ] R2 bucket created
- [ ] KV namespace configured
- [ ] Worker configuration valid
- [ ] Secrets set correctly
- [ ] TypeScript compiles
- [ ] Worker deployed successfully
- [ ] All endpoints respond
- [ ] JWT validation working
- [ ] Signed URLs generated
- [ ] User-scoped access enforced
- [ ] R2 bindings functional
- [ ] KV caching operational
- [ ] Error handling robust
- [ ] CORS headers correct
- [ ] Performance acceptable

---

## Common Issues

### Issue: Deployment fails with "Bucket not found"

**Solution**: Verify bucket name in wrangler.toml matches actual bucket

### Issue: JWT verification fails

**Solution**: Ensure SUPABASE_JWT_SECRET is correct, check issuer/audience

### Issue: CORS errors in browser

**Solution**: Verify CORS headers in all responses, check OPTIONS handling

### Issue: Slow response times

**Solution**: Check KV caching is working, verify R2 region selection

---

## Next Steps

Once all checkpoints pass:

1. Save Worker URL to environment variables
2. Update frontend to use Worker URL
3. Move to **Chunk 039: Backup Encryption**

---

**Estimated Time**: 15-20 minutes to verify all checkpoints
