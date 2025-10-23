# Chunk 038: R2 Setup

## At a Glance

- **Time**: 1 hour
- **Milestone**: Phase B - Multi-Device Sync (Backup Infrastructure)
- **Prerequisites**: Chunks 002, 019, 036 complete; Cloudflare account; Supabase JWT secret
- **Phase Context**: Phase B only (not MVP). Decision #83: Encryption required before automated cloud backups
- **Can Skip**: Yes - if staying in Phase A (MVP uses manual export from chunk 036)

## What You're Building

Cloudflare R2 bucket and Worker infrastructure for secure backups:

- R2 bucket creation and configuration
- Cloudflare Worker deployment (auth proxy)
- JWT validation with Supabase
- Signed URL generation for uploads/downloads
- CORS and security headers
- R2 access logging
- Rate limiting middleware

## Why This Matters

R2 provides **cost-effective cloud backups**. The Worker acts as a secure proxy:

- **No credentials in client**: Worker validates JWT and generates signed URLs
- **User-scoped access**: Users can only access their own backups
- **Cost optimized**: R2 has no egress fees (unlike S3)
- **Fast**: Cloudflare's global network
- **Secure**: JWT validation prevents unauthorized access

Per Decision #83, this is Phase B (automated backups after encryption is implemented).

## Prerequisites

Before starting, verify these are complete:

### Required Chunks

- [ ] **Chunk 002** (Auth Flow): Supabase Auth working
  - Verify: Can log in and `await supabase.auth.getSession()` returns valid session
  - Test in browser console: Session has `access_token` property
  - Needed for: JWT validation in Worker (Step 7)

- [ ] **Chunk 019** (Dexie Setup): IndexedDB schema configured
  - Verify: `import { db } from '@/lib/dexie'` works
  - Tables exist: `db.transactions`, `db.accounts`, `db.categories`, `db.budgets`
  - Needed for: Future backup data gathering (chunk 040)

- [ ] **Chunk 036** (CSV Export): Manual export baseline working
  - Verify: Can export transactions to CSV successfully
  - Confirms: Data serialization and manual backup already functional
  - Needed for: Understanding this is Phase B enhancement (not MVP requirement)

### External Prerequisites

- [ ] **Cloudflare Account**: Free tier account created
  - Verify: Can access https://dash.cloudflare.com
  - Sign up: https://dash.cloudflare.com/sign-up (free, no credit card required)
  - Needed for: R2 bucket creation and Workers deployment

- [ ] **Supabase JWT Secret**: Available from dashboard
  - Location: [Your Project] → Settings → API → Project Settings
  - Copy: JWT Secret (NOT the anon key!)
  - Verify: Should be a long base64-encoded string
  - Needed for: Worker JWT validation (Step 5)

- [ ] **Node.js 18+**: For Wrangler CLI
  - Verify: `node --version` shows v18 or higher
  - Install: https://nodejs.org if needed

### Phase Context

**This is Phase B** (not MVP). Per **Decision #83**:

- **Phase A (MVP)**: Manual CSV export only (chunk 036) ✅
- **Phase B**: Automated cloud backups with encryption
  - Chunk 038: R2 infrastructure setup (this chunk)
  - Chunk 039: Client-side encryption (next)
  - Chunk 040: Backup orchestration (final)

**Why this order**: Encryption (chunk 039) MUST be implemented before automated backups to prevent unencrypted financial data in cloud storage.

**Can skip this chunk?** Yes, if staying in Phase A (MVP). Manual export via chunk 036 provides sufficient backup capability for initial release.

### How to Verify

Run these commands to check readiness:

```bash
# 1. Check Node.js version
node --version  # Should be v18+

# 2. Check if already logged into Cloudflare
npx wrangler whoami 2>/dev/null || echo "✓ Ready to install Wrangler"

# 3. Check Supabase running locally (dev mode)
curl http://localhost:54321/auth/v1/health 2>/dev/null && echo "✓ Supabase local" || echo "Using cloud Supabase"

# 4. Verify auth chunk working (in browser console after login)
# await supabase.auth.getSession()
# Should return: { data: { session: { access_token: "..." } } }
```

If all checks pass, proceed to `instructions.md`.

## What Happens Next

After this chunk:

- ✅ **R2 infrastructure ready**: Bucket created, Worker deployed and accessible
- ✅ **Authentication working**: JWT validation securing all Worker endpoints
- ✅ **User-scoped access**: Worker enforces path isolation (`backups/{userId}/...`)
- ⏭️ **Next: Chunk 039** - Client-side encryption with WebCrypto API (AES-GCM, auth-derived keys)
- ⏭️ **Then: Chunk 040** - Backup orchestration (BackupManager, RestoreManager, UI)

### Why This Order Matters

Per **Decision #83**, encryption MUST be implemented (chunk 039) before client integration (chunk 040) to prevent unencrypted financial data in cloud storage.

**Current state after this chunk**:

- Worker is deployed and tested ✅
- Client integration deferred to chunk 040 🔒
- For now: Infrastructure validation only

**Immediate next step**: Proceed to chunk 039 to implement encryption layer before any backup uploads.

## Key Files Created

```
workers/
├── r2-proxy/
│   ├── src/
│   │   ├── index.ts              # Main Worker entry
│   │   ├── auth.ts               # JWT validation
│   │   ├── handlers.ts           # Route handlers
│   │   └── types.ts              # TypeScript types
│   ├── wrangler.toml             # Worker configuration
│   ├── package.json              # Dependencies
│   └── tsconfig.json             # TypeScript config
```

## Features Included

### Authentication

- JWT validation with Supabase (HS256 shared secret)
- Token expiry checking
- User ID extraction from claims (`sub` field)
- Authorization header parsing

### R2 Operations

- Upload URL generation (presigned)
- Download functionality (streaming)
- Object listing (user-scoped)
- Object deletion (user-scoped)
- Metadata storage (userId, timestamp, checksum)

### Security

- CORS headers for web app origin
- Request logging (all attempts)
- User-scoped bucket paths (`backups/{userId}/...`)
- No direct R2 access from client (Worker proxy pattern)
- Path validation (prevent cross-user access)

### Monitoring

- R2 access logging to KV (30-day retention)
- Request/response logging to console
- Error tracking with stack traces
- Status code tracking

## Future Enhancements (Not in This Chunk)

These features are mentioned in reference docs but deferred to later phases:

- **Rate limiting**: Durable Objects-based throttling (Phase C)
- **JWKS caching**: RS256 public key caching (if needed)
- **Retention policies**: Cron-based cleanup (separate chunk)
- **Advanced monitoring**: Cloudflare Analytics dashboard (Phase C)
- **Performance metrics**: Detailed latency tracking (Phase C)

## Related Documentation

- **Original**: `docs/initial plan/R2-BACKUP.md` lines 1-290 (R2 architecture)
- **Original**: `docs/initial plan/IMPLEMENTATION-PLAN.md` lines 347-383 (R2 integration)
- **Decisions**:
  - #83: Phase B backups (after encryption)
  - #84: Data retention policies
- **External**: [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)

## Technical Stack

- **Cloudflare Workers**: Serverless edge functions
- **Cloudflare R2**: Object storage (S3-compatible API)
- **Cloudflare KV**: Key-value storage for caching
- **Wrangler**: CLI for Worker deployment
- **Jose**: JWT verification library
- **TypeScript**: Type-safe Worker code

## Design Patterns

### Auth Proxy Pattern

```
Client → Worker (JWT validation) → R2 (signed URL) → Client (direct upload)
```

Worker never sees file content, only generates access credentials.

### Upload Strategy Pattern (Phase B)

```typescript
// Step 1: Client requests upload endpoint
const { url, key } = await fetch("/api/backup/upload", {
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    filename: "backup.gz",
    contentType: "application/gzip",
    checksum: sha256Hash,
  }),
}).then((r) => r.json());

// Step 2: Client uploads encrypted file to Worker
await fetch(url, {
  // url = /api/backup/upload-direct
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "x-backup-key": key,
    "Content-Type": "application/gzip",
  },
  body: encryptedBackupData,
});

// Step 3: Worker streams to R2 (no client involvement)
// await env.BACKUPS.put(key, request.body);
```

**Phase C Optimization**: Replace Worker proxy with multipart direct upload for files >100MB

### User-Scoped Paths

```
backups/{userId}/{year}/{month}/{filename}

Example: backups/abc123/2025/01/backup-1705345200000.gz.enc
```

## R2 Backup Flow (Complete Architecture)

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

**Key Security Points:**

- ✅ JWT verified before ANY operation
- ✅ Encrypted data never decrypted in Worker
- ✅ User cannot access other users' paths
- ✅ Upload endpoint URLs expire in 1 hour

### Download/Restore Flow

```
Client → Worker (GET /api/backup/download + JWT)
         ↓ (validates JWT, userId)
Worker → R2 (fetch object if path matches userId)
         ↓
Worker → Client (stream encrypted backup)
         ↓
Client → Decrypt → Decompress → Restore to IndexedDB
```

## Security Considerations

### JWT Validation

- Verify signature with Supabase JWKS
- Check expiry timestamp
- Validate issuer and audience
- Extract user ID from `sub` claim

### Access Control

- All paths prefixed with user ID
- Worker enforces user-scoped operations
- No cross-user access possible
- Signed URLs expire after 1 hour

### Rate Limiting

- Optional: Limit requests per user
- Prevent abuse
- Cloudflare Workers can use Durable Objects for distributed rate limiting

## R2 vs S3

| Feature        | R2               | S3           |
| -------------- | ---------------- | ------------ |
| Egress fees    | Free             | Expensive    |
| API            | S3-compatible    | S3           |
| Locations      | Global           | Regional     |
| Cost (storage) | $0.015/GB        | $0.023/GB    |
| Best for       | Public downloads | Private data |

## Bucket Organization

```
backups/
├── {userId1}/
│   ├── 2025/
│   │   ├── 01/
│   │   │   ├── backup-1705345200000.gz.enc
│   │   │   └── backup-1705431600000.gz.enc
│   │   └── 02/
│   │       └── backup-1707936000000.gz.enc
│   └── metadata/
│       └── latest.json
└── {userId2}/
    └── ...
```

## Worker Routes

- `POST /api/backup/upload` - Get upload endpoint and key
- `POST /api/backup/upload-direct` - Upload encrypted file (Worker → R2)
- `POST /api/backup/download` - Download encrypted backup
- `GET /api/backup/list` - List user's backups
- `DELETE /api/backup/delete` - Delete specific backup

## Error Handling Scenarios

### Scenario 1: JWT Expired During Upload

**Problem**: User started upload, JWT expired mid-request

**Error**: `401 Unauthorized`

**Solution**:

```typescript
// Client retry logic with token refresh
if (response.status === 401) {
  await supabase.auth.refreshSession();
  // Retry upload with new token
}
```

### Scenario 2: Network Failure Mid-Upload

**Problem**: Connection lost while streaming to R2

**Error**: Network timeout or connection reset

**Solution**: Worker uses streaming with automatic retry

```typescript
// Worker handles streaming failures gracefully
try {
  await env.BACKUPS.put(key, request.body);
} catch (error) {
  // R2 automatically handles partial uploads
  return new Response("Upload failed, retry", { status: 503 });
}
```

**Client Action**: Implement exponential backoff (chunk 040)

### Scenario 3: Bucket Quota Exceeded

**Problem**: Free tier 10GB limit reached

**Error**: `507 Insufficient Storage` (from R2)

**Solution**:

1. Worker catches R2 error
2. Returns clear error message
3. Client alerts user to run retention cleanup
4. User deletes old backups or upgrades plan

### Scenario 4: Corrupted Upload (Checksum Mismatch)

**Problem**: File corrupted during transfer

**Detection**: Client verifies checksum after download

**Solution**:

```typescript
// Always verify checksum (chunk 040)
const downloadedChecksum = await generateChecksum(data);
if (downloadedChecksum !== metadata.checksum) {
  throw new Error("Corruption detected");
  // Retry from different backup or restore point
}
```

### Scenario 5: Cross-User Access Attempt

**Problem**: Malicious user tries accessing another user's backup

**Detection**: Worker validates path matches userId

**Response**:

```typescript
if (!key.startsWith(`backups/${userId}/`)) {
  await logR2Access({
    userId,
    path: key,
    granted: false,
    statusCode: 403,
    error: "Unauthorized path access attempt",
  });
  return new Response("Forbidden", { status: 403 });
}
```

**Logged**: All access attempts logged to KV for security audit

## Performance Characteristics

- **Cold start**: <50ms (Workers are fast!)
- **JWT verification**: ~10ms (with caching)
- **Signed URL generation**: ~20ms
- **Total latency**: <100ms for upload URL

## Cost Estimation

Free tier includes:

- **Storage**: 10GB
- **Class A operations**: 1M/month (writes, lists)
- **Class B operations**: 10M/month (reads)

Typical household:

- **Daily backup**: ~5MB compressed
- **Monthly storage**: ~150MB
- **Annual storage**: ~1.8GB
- **Cost**: $0 (within free tier)

## Performance Considerations

### Worker Performance

**Cold Start**: <50ms (Workers are exceptionally fast)
**Warm Execution**: <10ms for JWT verification (with KV caching)
**Upload Streaming**: No memory overhead (streams directly to R2)

**Optimization Tips**:

```typescript
// ❌ Bad: Load entire file into memory
const data = await request.arrayBuffer();
await env.BACKUPS.put(key, data);

// ✅ Good: Stream directly
await env.BACKUPS.put(key, request.body); // Streaming!
```

### R2 Upload Performance

| File Size | Expected Time (avg connection) |
| --------- | ------------------------------ |
| 1 MB      | ~2 seconds                     |
| 10 MB     | ~15 seconds                    |
| 50 MB     | ~1.5 minutes                   |
| 100 MB    | ~3 minutes                     |

**Factors**:

- User's upload speed (typically 5-10 Mbps residential)
- Cloudflare edge location (global CDN)
- Compression ratio (gzip reduces 70-90%)

### Bandwidth Considerations

**Worker Bandwidth**: Free tier includes 10GB/month egress

**Typical usage**:

- Daily backup: 5MB compressed × 30 days = 150MB/month
- Well within free tier ✅

**If hitting limits**:

- Implement incremental backups (Phase C)
- Use delta compression
- Adjust backup frequency

### Concurrent Uploads

**Limit**: 6 simultaneous connections per browser (HTTP/1.1)

**Recommendation**: Queue backups client-side

```typescript
// Backup queue manager (chunk 040)
const queue = new BackupQueue({ concurrency: 1 });
await queue.add(backupTask);
```

### Memory Management

**Worker Memory**: 128MB limit per request

**For large uploads** (>100MB):

- Use streaming (no memory buffering) ✅
- Multipart upload (Phase C optimization)
- Client-side chunking

**Current approach**: Streaming upload = minimal memory usage

## Accessibility

While this chunk focuses on backend infrastructure, accessibility considerations for client UI (chunk 040):

### Upload Progress

- **Screen reader announcements**: Progress updates via `aria-live` regions
- **Keyboard navigation**: Focus management during upload
- **Error alerts**: Errors announced immediately to assistive tech

### Backup Management UI

- **Table navigation**: Arrow key support for backup list
- **Action buttons**: Clear labels ("Delete backup from Jan 15, 2025")
- **Status indicators**: High contrast for success/error states

### Implementation Checklist (Chunk 040)

- [ ] Upload button has descriptive `aria-label`
- [ ] Progress bar has `aria-valuenow`/`valuemin`/`valuemax`
- [ ] Error messages linked to controls (`aria-describedby`)
- [ ] Keyboard trap prevented during modal uploads
- [ ] Focus returned after completion

**Testing**: Run `axe-core` on backup UI components

---

**Ready?** → Open `instructions.md` to begin
