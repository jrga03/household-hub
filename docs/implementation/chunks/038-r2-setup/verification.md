# Verification: R2 Setup

Run these checks **AFTER** completing implementation.

---

## Post-Implementation Verification

### 1. Worker Deployed Successfully

```bash
# Check deployment status
wrangler deployments list

# Expected: Recent deployment with "Active" status
```

**Visual Check**:

- Visit Cloudflare dashboard → Workers & Pages
- Verify `household-hub-r2-proxy` appears in list
- Status shows green "Active" indicator

---

### 2. R2 Bucket Accessible

```bash
# List buckets
wrangler r2 bucket list

# Expected: "household-hub-backups" in list
```

**Via Dashboard**:

1. Go to Cloudflare dashboard → R2
2. Verify bucket `household-hub-backups` exists
3. Check location shows "Automatic"
4. Bucket should be empty (no objects yet)

---

### 3. KV Namespace Configured

```bash
# List KV namespaces
wrangler kv:namespace list

# Expected: JWT_CACHE namespace visible
```

**Check Binding**:

```bash
# View wrangler.toml
cat workers/r2-proxy/wrangler.toml | grep -A 3 "kv_namespaces"

# Expected:
# [[kv_namespaces]]
# binding = "JWT_CACHE"
# id = "your-namespace-id"
```

---

### 4. Secrets Set Correctly

```bash
# Verify secrets (doesn't show values, just names)
cd workers/r2-proxy
wrangler secret list

# Expected: SUPABASE_JWT_SECRET listed
```

**If missing**:

```bash
# Set secret again
wrangler secret put SUPABASE_JWT_SECRET
# Paste your JWT secret when prompted
```

---

### 5. JWT Validation Working

**Test with valid token**:

```bash
# Get token from browser console (see checkpoint.md for instructions)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Your Worker URL from deployment
WORKER_URL="https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev"

curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test-backup.gz",
    "contentType": "application/gzip",
    "checksum": "abc123"
  }'

# Expected: JSON with {url, key, expiresAt}
# Example:
# {
#   "url": "/api/backup/upload-direct",
#   "key": "backups/user-id-here/2025/01/test-backup.gz",
#   "expiresAt": "2025-01-15T12:34:56.789Z"
# }
```

**Test with invalid token**:

```bash
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer invalid-token" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.gz","contentType":"application/gzip"}'

# Expected: "Unauthorized: Invalid token" with 401 status
```

**Test with no token**:

```bash
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.gz","contentType":"application/gzip"}'

# Expected: "Unauthorized: Missing token" with 401 status
```

---

### 6. User-Scoped Access Enforced

**Test cross-user access (should fail)**:

```bash
curl -X POST "$WORKER_URL/api/backup/download" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"backups/different-user-id/2025/01/test.gz"}'

# Expected: "Forbidden: Access denied" with 403 status
```

**Verification**:

- Worker extracts userId from JWT
- Compares with userId in requested path
- Rejects if mismatch

---

### 7. CORS Headers Present

```bash
# Test OPTIONS preflight
curl -i -X OPTIONS "$WORKER_URL/api/backup/upload" \
  -H "Origin: http://localhost:3000"

# Expected headers:
# HTTP/1.1 200 OK
# Access-Control-Allow-Origin: *
# Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS
# Access-Control-Allow-Headers: Content-Type, Authorization
```

**Test actual request has CORS**:

```bash
curl -i "$WORKER_URL/api/backup/list" \
  -H "Authorization: Bearer $TOKEN"

# Should include CORS headers in response
```

---

### 8. R2 Access Logging Working

**Trigger a logged event**:

```bash
# Make any request to Worker
curl "$WORKER_URL/api/backup/list" \
  -H "Authorization: Bearer $TOKEN"
```

**Check KV for logs**:

1. Go to Cloudflare dashboard → Workers → KV
2. Select `JWT_CACHE` namespace
3. Browse keys
4. Look for keys like `r2-access:2025-01-15T12:34:56.789Z:user-id`

**Expected log structure**:

```json
{
  "userId": "user-id-here",
  "path": "/api/backup/list",
  "method": "GET",
  "granted": true,
  "statusCode": 200,
  "timestamp": "2025-01-15T12:34:56.789Z",
  "ip": "1.2.3.4",
  "userAgent": "curl/7.64.1"
}
```

---

### 9. Performance Check

**Measure cold start**:

```bash
# Wait 5 minutes (Workers go cold)
# Then time first request
time curl "$WORKER_URL/api/backup/list" \
  -H "Authorization: Bearer $TOKEN"

# Expected: total time <200ms (cold start)
```

**Measure warm performance**:

```bash
# Immediate subsequent request
time curl "$WORKER_URL/api/backup/list" \
  -H "Authorization: Bearer $TOKEN"

# Expected: total time <100ms (warm)
```

**Run 10 requests**:

```bash
for i in {1..10}; do
  time curl "$WORKER_URL/api/backup/list" \
    -H "Authorization: Bearer $TOKEN" \
    2>&1 | grep "real"
done

# Expected: Most <100ms, none >200ms
```

---

### 10. Error Handling Verification

**Test missing Authorization header**:

```bash
curl -i "$WORKER_URL/api/backup/upload"

# Expected: 401 Unauthorized
```

**Test invalid JSON body**:

```bash
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d 'invalid-json'

# Expected: 500 Internal error (graceful handling)
```

**Test non-existent endpoint**:

```bash
curl -i "$WORKER_URL/api/nonexistent" \
  -H "Authorization: Bearer $TOKEN"

# Expected: 404 Not found with CORS headers
```

**Test malformed request**:

```bash
curl -X POST "$WORKER_URL/api/backup/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: Error response (not crash)
# Worker should handle missing filename gracefully
```

---

### 11. TypeScript Compilation Check

```bash
cd workers/r2-proxy
npx tsc --noEmit

# Expected: No errors
# If errors, fix before proceeding
```

---

### 12. Wrangler Configuration Valid

```bash
# Dry-run deployment
cd workers/r2-proxy
wrangler deploy --dry-run

# Expected: "Deployment would succeed" message
# No configuration errors
```

**Verify wrangler.toml contents**:

```bash
cat wrangler.toml
```

**Required sections**:

- `[[r2_buckets]]` with correct bucket_name
- `[[kv_namespaces]]` with correct IDs
- `[vars]` with SUPABASE_URL
- No syntax errors

---

## Integration Tests (For Chunks 039-040)

After chunks 039 (encryption) and 040 (orchestration) are complete, verify end-to-end:

### Full Backup Upload Flow

1. **Client generates encrypted backup** (chunk 039)
   - Gather data from IndexedDB
   - Compress with gzip
   - Encrypt with AES-GCM
   - Generate checksum

2. **Client requests upload URL** (this Worker)

   ```typescript
   const { url, key } = await fetch(`${workerUrl}/api/backup/upload`, {
     method: "POST",
     headers: {
       Authorization: `Bearer ${token}`,
       "Content-Type": "application/json",
     },
     body: JSON.stringify({
       filename: "backup-1234567890.gz.enc",
       contentType: "application/octet-stream",
       checksum: sha256Hash,
     }),
   }).then((r) => r.json());
   ```

3. **Client uploads to Worker**

   ```typescript
   await fetch(`${workerUrl}${url}`, {
     method: "POST",
     headers: {
       Authorization: `Bearer ${token}`,
       "x-backup-key": key,
       "Content-Type": "application/octet-stream",
     },
     body: encryptedData,
   });
   ```

4. **Verify R2 storage**

   ```bash
   wrangler r2 object list household-hub-backups --prefix "backups/"

   # Expected: backup file listed with correct path
   ```

5. **Verify Supabase metadata**
   - Check `snapshots` table has record
   - Checksum matches
   - Size matches encrypted file size

6. **Download and verify**
   - Download via Worker
   - Decrypt (chunk 039)
   - Decompress
   - Verify data integrity

---

## Manual End-to-End Test

**Prerequisites**: Chunks 038, 039, 040 complete

1. Open app in browser (http://localhost:3000)
2. Log in with test account
3. Navigate to Settings → Backups
4. Click "Create Backup"
5. Wait for upload completion
6. Verify success toast
7. Check backup appears in list
8. Click "Download" on backup
9. Verify file downloads
10. Optional: Restore from backup

**Expected**: All steps complete without errors

---

## Rollback Procedure

If verification fails:

```bash
# 1. Check Worker logs for errors
wrangler tail

# 2. Review recent deployment
wrangler deployments list

# 3. Rollback to previous version
wrangler rollback

# 4. Delete test uploads from R2
wrangler r2 object delete household-hub-backups "backups/test-user/2025/01/test-backup.gz"

# 5. Clear test logs from KV
wrangler kv:key delete --namespace-id="YOUR_KV_ID" "r2-access:test-key"

# 6. Review code changes
git diff HEAD~1

# 7. Fix issues and redeploy
wrangler deploy
```

---

## Common Issues and Solutions

### Issue: "Bucket not found" error

**Cause**: Bucket name mismatch in wrangler.toml

**Fix**:

```bash
# Verify actual bucket name
wrangler r2 bucket list

# Update wrangler.toml
# bucket_name = "actual-bucket-name-from-list"

# Redeploy
wrangler deploy
```

### Issue: JWT verification always fails

**Cause**: Wrong JWT secret or issuer/audience mismatch

**Fix**:

```bash
# 1. Verify secret is correct
# Get from Supabase dashboard → Settings → API → JWT Secret

# 2. Reset secret
wrangler secret put SUPABASE_JWT_SECRET

# 3. Check SUPABASE_URL in wrangler.toml matches project

# 4. Test with fresh token (old tokens expire)
```

### Issue: CORS errors in browser

**Cause**: CORS headers missing on error responses

**Fix**: Ensure ALL responses include CORS headers (check handlers.ts)

### Issue: Performance slower than expected

**Cause**: Cold starts or network latency

**Fix**:

```bash
# Monitor with tail
wrangler tail

# Check for slow operations
# Consider caching more aggressively
```

---

## Success Criteria

All checkboxes must be checked before proceeding to chunk 039:

- [ ] Worker deployed and accessible at workers.dev URL
- [ ] JWT validation working (valid and invalid tokens tested)
- [ ] User-scoped access enforced (cross-user access blocked)
- [ ] CORS headers present on all responses (including errors)
- [ ] R2 access logging functional (logs in KV)
- [ ] Performance acceptable (<200ms cold, <100ms warm)
- [ ] Error handling robust (doesn't crash on bad input)
- [ ] TypeScript compiles without errors
- [ ] Wrangler configuration valid (dry-run succeeds)
- [ ] All test endpoints return expected responses
- [ ] Ready to proceed to chunk 039 (encryption layer)

---

**If all criteria met**: ✅ Chunk 038 complete!

**Next step**: Proceed to chunk 039 for client-side encryption implementation.
