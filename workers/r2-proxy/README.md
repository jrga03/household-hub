# R2 Backup Worker (Deferred)

**Status**: ⏸️ **DEFERRED** - Implementation scheduled for production deployment

---

## Overview

This Worker will provide secure R2 backup infrastructure for Household Hub, implementing:

- JWT-authenticated proxy for R2 access
- User-scoped backup paths (`backups/{userId}/...`)
- Signed URL generation for uploads/downloads
- KV caching for JWT verification
- 5 API endpoints (upload, upload-direct, download, list, delete)

---

## Current Backup Strategy

✅ **Manual CSV Export** (chunks 036-037) provides sufficient backup capability for MVP

- Export transactions, accounts, categories
- Download as CSV files
- Import CSV files with deduplication
- Works completely offline

---

## When to Implement

Implement R2 backups **after** successful Phase A deployment when:

1. ✅ Core app deployed and stable (Phase 1-6 complete)
2. ✅ Users actively testing the application
3. ✅ Ready to add automated cloud backups
4. ✅ Cloudflare account provisioned

**Recommended Timeline**: 1-2 weeks after initial deployment

---

## Implementation Guide

**Complete step-by-step instructions**:

📖 [`docs/implementation/deployment/r2-worker-deployment.md`](../../docs/implementation/deployment/r2-worker-deployment.md)

Quick links:

- [Prerequisites](../../docs/implementation/deployment/r2-worker-deployment.md#prerequisites)
- [Local Development Setup](../../docs/implementation/deployment/r2-worker-deployment.md#local-development-setup)
- [Production Deployment](../../docs/implementation/deployment/r2-worker-deployment.md#production-deployment)
- [Testing & Verification](../../docs/implementation/deployment/r2-worker-deployment.md#testing--verification)
- [Troubleshooting](../../docs/implementation/deployment/r2-worker-deployment.md#troubleshooting)

---

## Project Structure

When implemented, this directory will contain:

```
workers/r2-proxy/
├── src/
│   ├── index.ts              # Main Worker entry (routing)
│   ├── auth.ts               # JWT validation with Supabase
│   ├── handlers.ts           # 5 endpoint handlers
│   └── types.ts              # TypeScript interfaces
├── wrangler.toml             # Worker configuration
├── package.json              # Dependencies (jose, @cloudflare/workers-types)
├── tsconfig.json             # TypeScript config
└── README.md                 # This file
```

**Total files**: 7 files (~600 lines of TypeScript)

---

## Quick Start (When Ready)

```bash
# 1. Install dependencies
cd workers/r2-proxy
npm install

# 2. Create R2 bucket
npx wrangler r2 bucket create household-hub-backups-prod

# 3. Create KV namespace
npx wrangler kv:namespace create "JWT_CACHE"

# 4. Set JWT secret
npx wrangler secret put SUPABASE_JWT_SECRET

# 5. Test locally
npx wrangler dev

# 6. Deploy to production
npx wrangler deploy
```

---

## Architecture

### Upload Flow

```
Client → Worker (JWT auth) → R2 (stream upload) → Success
   ↓
IndexedDB (offline queue)
```

### Endpoints

| Endpoint                    | Method | Purpose                     |
| --------------------------- | ------ | --------------------------- |
| `/api/backup/upload`        | POST   | Get upload endpoint + key   |
| `/api/backup/upload-direct` | POST   | Upload encrypted file to R2 |
| `/api/backup/download`      | POST   | Download encrypted backup   |
| `/api/backup/list`          | GET    | List user's backups         |
| `/api/backup/delete`        | DELETE | Delete specific backup      |

---

## Security

- ✅ **JWT validation**: Supabase HS256 shared secret
- ✅ **User scoping**: All paths prefixed with `backups/{userId}/`
- ✅ **CORS**: Restricted to production domain
- ✅ **Encryption**: AES-GCM client-side (chunk 039)
- ✅ **Access logging**: 30-day retention in KV

---

## Cost

**Cloudflare Free Tier** (sufficient for most households):

- Storage: 10GB
- Class A operations: 1M/month (writes)
- Class B operations: 10M/month (reads)
- Egress: Free (no bandwidth charges)

**Typical usage**:

- Daily backup: ~5MB
- Monthly: ~150MB
- Annual: ~1.8GB
- **Cost**: $0 ✅

---

## Related Chunks

- **Chunk 038**: R2 infrastructure setup (this Worker)
- **Chunk 039**: Client-side encryption (AES-GCM with WebCrypto)
- **Chunk 040**: Backup UI (BackupManager + RestoreManager)

---

## References

- **Complete Guide**: [`docs/implementation/deployment/r2-worker-deployment.md`](../../docs/implementation/deployment/r2-worker-deployment.md)
- **Chunk 038 Instructions**: [`docs/implementation/chunks/038-r2-setup/instructions.md`](../../docs/implementation/chunks/038-r2-setup/instructions.md)
- **Troubleshooting**: [`docs/implementation/chunks/038-r2-setup/troubleshooting.md`](../../docs/implementation/chunks/038-r2-setup/troubleshooting.md)
- **Checkpoint Tests**: [`docs/implementation/chunks/038-r2-setup/checkpoint.md`](../../docs/implementation/chunks/038-r2-setup/checkpoint.md)
- **Cloudflare R2 Docs**: https://developers.cloudflare.com/r2/
- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/

---

**Questions?** Refer to the comprehensive deployment guide or chunk documentation above.
