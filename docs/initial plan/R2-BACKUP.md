# Cloudflare R2 Backup Architecture

## Overview

Cloudflare R2 provides cost-effective object storage for automated backups, snapshots, and data retention. The architecture uses a Cloudflare Worker as a secure proxy to generate signed URLs, preventing direct credential exposure in the client.

**⚠️ Important Phase Distinction (Decision #83)**:

- **Phase A (MVP)**: Manual export/import only (CSV/JSON downloads)
- **Phase B**: Automated R2 backups with client-side encryption
- **Rationale**: Encryption should be implemented before storing financial data in cloud backups

This document describes the **Phase B** implementation. For Phase A, see [MIGRATION.md](./MIGRATION.md) for manual export functionality.

## Architecture Flow

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐      ┌─────────┐
│   Client    │─────▶│  CF Worker   │─────▶│  Supabase    │      │   R2    │
│   (PWA)     │◀─────│  (Auth Proxy)│      │   (Verify)   │      │ Storage │
└─────────────┘      └──────────────┘      └──────────────┘      └─────────┘
      │                     │                                           ▲
      │                     └──────── Signed URL ──────────────────────┤
      │                                                                 │
      └────────────────── Upload with Signed URL ──────────────────────┘
```

## Components

### 1. Cloudflare Worker (Auth Proxy)

```typescript
// wrangler.toml
name = "household-hub-r2-proxy"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "BACKUPS"
bucket_name = "household-hub-backups"

[[kv_namespaces]]
binding = "JWT_CACHE"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"

[vars]
SUPABASE_URL = "https://your-project.supabase.co"
# Store JWT secret as a secret: wrangler secret put SUPABASE_JWT_SECRET
```

```typescript
// src/index.ts
import { importSPKI, jwtVerify } from "jose";

export interface Env {
  BACKUPS: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_JWT_SECRET: string; // Changed from ANON_KEY
  JWT_CACHE: KVNamespace; // For caching JWKS
}

// Cache for parsed public keys
let cachedKeys: any = null;
let cacheExpiry = 0;

async function getPublicKeys(env: Env): Promise<any> {
  const now = Date.now();

  // Check cache first
  if (cachedKeys && cacheExpiry > now) {
    return cachedKeys;
  }

  // Try KV cache
  const cached = await env.JWT_CACHE.get("jwks", "json");
  if (cached && cached.expiry > now) {
    cachedKeys = cached.keys;
    cacheExpiry = cached.expiry;
    return cachedKeys;
  }

  // Fetch fresh JWKS
  const jwksUrl = `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
  const response = await fetch(jwksUrl);
  const jwks = await response.json();

  // Cache for 24 hours
  const expiry = now + 24 * 60 * 60 * 1000;
  await env.JWT_CACHE.put(
    "jwks",
    JSON.stringify({
      keys: jwks.keys,
      expiry,
    })
  );

  cachedKeys = jwks.keys;
  cacheExpiry = expiry;
  return jwks.keys;
}

async function verifyJWT(jwt: string, env: Env): Promise<any> {
  try {
    // For HS256 (shared secret) - typical Supabase setup
    if (env.SUPABASE_JWT_SECRET) {
      const secret = new TextEncoder().encode(env.SUPABASE_JWT_SECRET);
      const { payload } = await jwtVerify(jwt, secret, {
        issuer: `${env.SUPABASE_URL}/auth/v1`,
        audience: "authenticated",
      });
      return payload;
    }

    // For RS256 (public key) - more secure setup
    const keys = await getPublicKeys(env);
    for (const key of keys) {
      try {
        const publicKey = await importSPKI(key.x5c[0], key.alg);
        const { payload } = await jwtVerify(jwt, publicKey, {
          issuer: `${env.SUPABASE_URL}/auth/v1`,
          audience: "authenticated",
        });
        return payload;
      } catch {
        // Try next key
        continue;
      }
    }

    throw new Error("No valid key found");
  } catch (error) {
    console.error("JWT verification failed:", error);
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Extract JWT from Authorization header
      const authHeader = request.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response("Unauthorized", { status: 401 });
      }

      const jwt = authHeader.substring(7);

      // Verify JWT properly
      const payload = await verifyJWT(jwt, env);

      if (!payload || !payload.sub) {
        return new Response("Invalid token", { status: 401 });
      }

      const userId = payload.sub;

      // Route handling with access logging (SECURITY.md requirement)
      let response: Response;
      let accessGranted = true;

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
          response = new Response("Not found", { status: 404 });
          accessGranted = false;
      }

      // Log all R2 access attempts (successful and failed)
      await logR2Access({
        userId,
        path: url.pathname,
        method: request.method,
        granted: accessGranted && response.ok,
        statusCode: response.status,
        timestamp: new Date().toISOString(),
        ip: request.headers.get("cf-connecting-ip"),
        userAgent: request.headers.get("user-agent"),
      });

      return response;
    } catch (error) {
      console.error("Worker error:", error);

      // Log error
      await logR2Access({
        userId: payload?.sub || "unknown",
        path: url.pathname,
        method: request.method,
        granted: false,
        statusCode: 500,
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      return new Response("Internal error", { status: 500 });
    }
  },
};

// Access logging function
async function logR2Access(log: R2AccessLog): Promise<void> {
  // Store logs in KV for analysis (or send to external service)
  try {
    const logKey = `r2-access:${log.timestamp}:${log.userId}`;
    await env.JWT_CACHE.put(logKey, JSON.stringify(log), {
      expirationTtl: 60 * 60 * 24 * 30, // Keep logs for 30 days
    });

    // Also log to console for CloudFlare dashboard
    console.log("[R2 Access]", JSON.stringify(log));
  } catch (error) {
    console.error("Failed to log R2 access:", error);
  }
}

interface R2AccessLog {
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

async function handleUploadRequest(request: Request, env: Env, userId: string): Promise<Response> {
  const { filename, contentType, checksum } = await request.json();

  // Generate object key
  const date = new Date();
  const key = `backups/${userId}/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}/${filename}`;

  // Generate signed upload URL (valid for 1 hour)
  const signedUrl = await env.BACKUPS.createMultipartUpload(key, {
    customMetadata: {
      userId,
      checksum,
      timestamp: date.toISOString(),
    },
  });

  return new Response(
    JSON.stringify({
      url: signedUrl.uploadUrl,
      key,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }),
    {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    }
  );
}
```

### 2. Client-Side Backup Manager

```typescript
class BackupManager {
  private worker_url = "https://r2-proxy.your-domain.workers.dev";

  async createBackup(): Promise<void> {
    try {
      // 1. Gather data from IndexedDB
      const data = await this.gatherData();

      // 2. Create snapshot with metadata
      const snapshot = {
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        data,
        metadata: {
          transactionCount: data.transactions.length,
          accountCount: data.accounts.length,
          categoryCount: data.categories.length,
          deviceId: await deviceManager.getDeviceId(),
          appVersion: APP_VERSION,
        },
      };

      // 3. Compress data
      const compressed = await this.compress(snapshot);

      // 4. Encrypt compressed data (Phase B)
      const encryption = new BackupEncryption();
      const encrypted = await encryption.encryptBackup(compressed);

      // 5. Generate checksum of encrypted data
      const checksum = await this.generateChecksum(encrypted.encrypted);

      // 6. Get signed URL from Worker
      const { url, key } = await this.getSignedUrl(checksum);

      // 7. Upload encrypted backup to R2
      const uploadData = this.packEncryptedBackup(encrypted);
      await this.uploadToR2(url, uploadData);

      // 8. Record backup metadata in Supabase
      await this.recordBackup(key, checksum, uploadData.byteLength, {
        encrypted: true,
        iv: Array.from(encrypted.iv),
        algorithm: encrypted.algorithm,
      });

      // 8. Show success notification
      toast.success("Backup completed successfully");
    } catch (error) {
      console.error("Backup failed:", error);
      toast.error("Backup failed. Will retry later.");

      // Queue for retry
      await this.queueBackupRetry();
    }
  }

  private async gatherData(): Promise<BackupData> {
    const db = await getDexieDb();

    return {
      transactions: await db.transactions.toArray(),
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      budgets: await db.budgets.toArray(),
      syncQueue: await db.syncQueue.toArray(),
    };
  }

  private async compress(data: any): Promise<Uint8Array> {
    const json = JSON.stringify(data);
    const encoder = new TextEncoder();
    const encoded = encoder.encode(json);

    // Use CompressionStream API (Brotli)
    const stream = new Response(encoded).body.pipeThrough(new CompressionStream("gzip"));

    const compressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressed);
  }

  private async generateChecksum(data: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  private async getSignedUrl(checksum: string): Promise<SignedUrlResponse> {
    const token = await supabase.auth.getSession();

    const response = await fetch(`${this.worker_url}/api/backup/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.data.session?.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: `backup-${Date.now()}.gz`,
        contentType: "application/gzip",
        checksum,
      }),
    });

    if (!response.ok) {
      throw new Error("Failed to get signed URL");
    }

    return response.json();
  }

  private async uploadToR2(url: string, data: Uint8Array): Promise<void> {
    const response = await fetch(url, {
      method: "PUT",
      body: data,
      headers: {
        "Content-Type": "application/gzip",
      },
    });

    if (!response.ok) {
      throw new Error("Upload failed");
    }
  }

  private async recordBackup(key: string, checksum: string, sizeBytes: number): Promise<void> {
    await supabase.from("snapshots").insert({
      snapshot_type: "manual",
      storage_url: key,
      checksum,
      size_bytes: sizeBytes,
      metadata: {
        version: "1.0.0",
        compressed: true,
        encryption: "none",
      },
    });
  }
}
```

### 3. Retention Policy Implementation

```typescript
// Cloudflare Worker Cron Trigger
// wrangler.toml
[triggers];
crons = ["0 2 * * *"]; // Daily at 2 AM

// Retention policy handler
async function handleRetentionPolicy(env: Env): Promise<void> {
  const policies = [
    { type: "daily", retainDays: 30, keepOne: true },
    { type: "weekly", retainDays: 90, keepOne: true },
    { type: "monthly", retainDays: 365, keepOne: true },
  ];

  for (const policy of policies) {
    await applyRetentionPolicy(env, policy);
  }
}

async function applyRetentionPolicy(env: Env, policy: RetentionPolicy): Promise<void> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - policy.retainDays);

  // List objects with prefix
  const objects = await env.BACKUPS.list({
    prefix: `backups/`,
    limit: 1000,
  });

  // Group by user and date
  const grouped = groupBackupsByUserAndDate(objects.objects);

  for (const [userId, backups] of grouped) {
    // Sort by date
    backups.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());

    // Apply retention
    for (const backup of backups) {
      if (backup.uploaded < cutoffDate) {
        // Keep at least one backup per period if specified
        if (policy.keepOne && isOnlyBackupInPeriod(backup, backups, policy.type)) {
          continue;
        }

        // Delete old backup
        await env.BACKUPS.delete(backup.key);

        // Log deletion
        console.log(`Deleted old backup: ${backup.key}`);
      }
    }
  }
}
```

### 4. Restore Functionality

```typescript
class RestoreManager {
  async listAvailableBackups(): Promise<Backup[]> {
    // Get list from Supabase (metadata)
    const { data: snapshots } = await supabase
      .from("snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    return snapshots || [];
  }

  async restoreFromBackup(snapshotId: string): Promise<void> {
    try {
      // 1. Get snapshot metadata
      const { data: snapshot } = await supabase
        .from("snapshots")
        .select("*")
        .eq("id", snapshotId)
        .single();

      if (!snapshot) {
        throw new Error("Snapshot not found");
      }

      // 2. Get signed download URL
      const downloadUrl = await this.getSignedDownloadUrl(snapshot.storage_url);

      // 3. Download encrypted backup
      const encryptedData = await this.downloadBackup(downloadUrl);

      // 4. Verify checksum
      const checksum = await this.generateChecksum(encryptedData);
      if (checksum !== snapshot.checksum) {
        throw new Error("Checksum mismatch - backup may be corrupted");
      }

      // 5. Decrypt if encrypted (Phase B)
      let compressed: Uint8Array;
      if (snapshot.metadata?.encrypted) {
        const encryption = new BackupEncryption();
        const encrypted = this.unpackEncryptedBackup(encryptedData, snapshot.metadata);
        compressed = await encryption.decryptBackup(encrypted);
      } else {
        compressed = encryptedData;
      }

      // 6. Decompress
      const decompressed = await this.decompress(compressed);

      // 6. Parse data
      const data = JSON.parse(decompressed);

      // 7. Validate schema version
      if (!this.isCompatibleVersion(data.version)) {
        throw new Error("Incompatible backup version");
      }

      // 8. Clear current data
      await this.clearCurrentData();

      // 9. Restore data to IndexedDB
      await this.restoreData(data.data);

      // 10. Trigger sync to push to Supabase
      await syncEngine.fullSync();

      toast.success("Restore completed successfully");
    } catch (error) {
      console.error("Restore failed:", error);
      toast.error("Restore failed: " + error.message);

      // Attempt rollback
      await this.rollbackRestore();
    }
  }

  private async decompress(compressed: Uint8Array): Promise<string> {
    const stream = new Response(compressed).body.pipeThrough(new DecompressionStream("gzip"));

    const decompressed = await new Response(stream).text();
    return decompressed;
  }

  private async restoreData(data: BackupData): Promise<void> {
    const db = await getDexieDb();

    await db.transaction(
      "rw",
      db.transactions,
      db.accounts,
      db.categories,
      db.budgets,
      async () => {
        // Restore in order of dependencies
        await db.accounts.bulkPut(data.accounts);
        await db.categories.bulkPut(data.categories);
        await db.transactions.bulkPut(data.transactions);
        await db.budgets.bulkPut(data.budgets);
      }
    );
  }
}
```

## Security Considerations

### 1. Authentication Flow

- Client sends Supabase JWT to Worker
- Worker validates JWT with Supabase
- Worker generates time-limited signed URL
- Client uploads directly to R2

### 2. Access Control

- Each user can only access their own backups
- Backup paths include user ID for isolation
- Worker enforces user-scoped operations

### 3. Data Integrity

- SHA-256 checksums for all backups
- Checksum verification on restore
- Metadata includes version info

### 4. Client-Side Encryption

#### Phase B Implementation (Auth-Derived Keys)

```typescript
class BackupEncryption {
  private encryptionKey: CryptoKey | null = null;

  async deriveKeyFromAuth(): Promise<CryptoKey> {
    // Get current session JWT
    const session = await supabase.auth.getSession();
    if (!session?.data?.session) {
      throw new Error("No active session");
    }

    // Use JWT claims as key material
    const keyMaterial = new TextEncoder().encode(
      session.data.session.access_token + session.data.session.user.id
    );

    // Derive key using PBKDF2
    const baseKey = await crypto.subtle.importKey("raw", keyMaterial, "PBKDF2", false, [
      "deriveBits",
      "deriveKey",
    ]);

    // Generate salt from user ID (deterministic)
    const salt = new TextEncoder().encode(session.data.session.user.id);

    // Derive encryption key
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 100000,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async encryptBackup(data: Uint8Array): Promise<EncryptedBackup> {
    if (!this.encryptionKey) {
      this.encryptionKey = await this.deriveKeyFromAuth();
    }

    // Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      data
    );

    return {
      encrypted: new Uint8Array(encrypted),
      iv,
      algorithm: "AES-GCM",
      keyDerivation: "auth-derived-pbkdf2",
    };
  }

  async decryptBackup(encrypted: EncryptedBackup): Promise<Uint8Array> {
    if (!this.encryptionKey) {
      this.encryptionKey = await this.deriveKeyFromAuth();
    }

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encrypted.iv },
      this.encryptionKey,
      encrypted.encrypted
    );

    return new Uint8Array(decrypted);
  }
}
```

#### Phase C Enhancement (Optional User Passphrase)

- Additional passphrase-based encryption layer
- Key escrow for account recovery
- Multi-factor key derivation
- Zero-knowledge architecture

## Cost Optimization

### 1. Storage Tiers

- **Hot Storage**: Last 30 days of backups
- **Cool Storage**: 31-90 days (future R2 feature)
- **Archive**: 91-365 days (future R2 feature)

### 2. Compression

- Gzip compression reduces size by 70-90%
- Brotli option for better compression (10-20% improvement)
- Incremental backups for large datasets (Phase 2)

### 3. Deduplication (Future)

- Content-addressed storage
- Chunk-level deduplication
- Delta backups for efficiency

## Monitoring & Alerts

### 1. Backup Health

```typescript
interface BackupHealth {
  lastBackup: Date;
  backupSize: number;
  backupCount: number;
  oldestBackup: Date;
  failureCount: number;
  nextScheduled: Date;
}
```

### 2. Worker Analytics

- Request count and latency
- Error rates and types
- Bandwidth usage
- Storage consumption

### 3. Alerts

- Backup failures (3 consecutive)
- Storage quota warnings (80% full)
- Retention policy execution failures
- Checksum mismatches on restore

## Implementation Checklist

### Phase A (MVP)

- [ ] Deploy basic Worker for signed URLs
- [ ] Implement manual backup trigger
- [ ] Add checksum generation/verification
- [ ] Create simple restore UI
- [ ] Test backup/restore flow

### Phase B

- [ ] Add Cloudflare Cron for retention
- [ ] Implement automated daily backups
- [ ] Add compression optimization
- [ ] Implement auth-derived encryption
- [ ] Create backup management UI
- [ ] Add progress indicators

### Phase C

- [ ] Implement incremental backups
- [ ] Add optional user passphrase encryption
- [ ] Create backup analytics dashboard
- [ ] Add multi-region replication
- [ ] Implement point-in-time recovery

## Error Handling

### Common Errors and Solutions

1. **Upload Timeout**
   - Retry with exponential backoff
   - Use multipart upload for large files
   - Show progress to user

2. **Checksum Mismatch**
   - Retry download/upload
   - Alert user of corruption
   - Fallback to previous backup

3. **Storage Quota Exceeded**
   - Trigger aggressive retention
   - Alert user to upgrade
   - Prevent new backups

4. **Worker Rate Limiting**
   - Implement client-side throttling
   - Use queue for requests
   - Show rate limit status

## Testing Strategy

### Unit Tests

- Compression/decompression
- Checksum generation
- Data gathering logic
- Retention policy calculations

### Integration Tests

- Worker authentication flow
- R2 upload/download
- Supabase metadata sync
- End-to-end backup/restore

### Load Tests

- Concurrent backup requests
- Large backup files (100MB+)
- Retention policy on 10k+ objects
- Restore under load

## Future Enhancements

1. **Intelligent Backups**
   - ML-based backup scheduling
   - Predictive retention policies
   - Anomaly detection

2. **Advanced Features**
   - Cross-region replication
   - Immutable backups
   - Compliance modes (WORM)
   - Backup sharing between users

3. **Performance**
   - Edge caching for downloads
   - Parallel multipart uploads
   - Streaming compression
   - Background backup workers
