# Chunk 038: R2 Setup

## At a Glance

- **Time**: 1 hour
- **Milestone**: Multi-Device Sync (Backups - optional)
- **Prerequisites**: Cloudflare account, Supabase JWT configured
- **Can Skip**: Yes - but required for automated cloud backups

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

## Before You Start

Make sure you have:

- Cloudflare account (free tier sufficient)
- Wrangler CLI installed (`npm install -g wrangler`)
- Supabase project with JWT secret
- Basic understanding of Workers and R2

## What Happens Next

After this chunk:

- R2 bucket created and configured
- Worker deployed and accessible
- JWT validation working
- Signed URLs generated successfully
- Ready for encryption implementation (chunk 039)

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

- JWT validation with Supabase JWKS
- Caching of public keys in KV namespace
- Token expiry checking
- User ID extraction from claims

### R2 Operations

- Signed URL generation for uploads
- Signed URL generation for downloads
- Object listing (user-scoped)
- Object deletion (user-scoped)
- Metadata storage

### Security

- CORS headers for web app
- Rate limiting (future)
- Request logging
- User-scoped bucket paths
- No direct R2 access from client

### Monitoring

- R2 access logging to KV
- Request/response logging
- Error tracking
- Performance metrics

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

### Signed URL Pattern

```typescript
// Worker generates time-limited signed URL
const signedUrl = await R2.createMultipartUpload(key, {
  customMetadata: { userId, timestamp },
});

// Client uploads directly to R2 using signed URL
await fetch(signedUrl.uploadUrl, {
  method: "PUT",
  body: fileData,
});
```

### User-Scoped Paths

```
backups/{userId}/{year}/{month}/{filename}

Example: backups/abc123/2025/01/backup-1705345200000.gz.enc
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

- `POST /api/backup/upload` - Get signed upload URL
- `POST /api/backup/download` - Get signed download URL
- `GET /api/backup/list` - List user's backups
- `DELETE /api/backup/delete` - Delete specific backup

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

---

**Ready?** → Open `instructions.md` to begin
