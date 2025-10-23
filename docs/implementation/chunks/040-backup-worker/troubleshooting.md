# Troubleshooting: Backup Worker

Comprehensive troubleshooting guide for backup orchestration issues. Covers backup creation, restoration, progress tracking, and integration problems.

---

## Category Index

1. [Backup Creation Issues](#backup-creation-issues)
2. [Upload & Network Problems](#upload--network-problems)
3. [Restore Issues](#restore-issues)
4. [Progress Tracking Problems](#progress-tracking-problems)
5. [Data Integrity Issues](#data-integrity-issues)
6. [Performance Problems](#performance-problems)
7. [UI Component Issues](#ui-component-issues)
8. [R2 Worker Issues](#r2-worker-issues)
9. [Testing & Development](#testing--development)

---

## Backup Creation Issues

### Problem: "Failed to get signed URL"

**Cause**: Cloudflare Worker not responding or wrong URL configured

**Symptoms**:

- Backup fails at 50% progress
- Error toast: "Failed to get signed URL"
- Console error shows fetch failure
- Retry attempts all fail

**Diagnosis**:

```typescript
// Check Worker URL configuration
console.log("Worker URL:", import.meta.env.VITE_R2_WORKER_URL);

// Test Worker directly
const response = await fetch(`${import.meta.env.VITE_R2_WORKER_URL}/health`);
console.log("Worker status:", response.status);
```

**Solution**:

```typescript
// Verify Worker URL in .env
VITE_R2_WORKER_URL=https://household-hub-r2-proxy.YOUR_SUBDOMAIN.workers.dev

// Test Worker endpoints
curl $VITE_R2_WORKER_URL/health
curl $VITE_R2_WORKER_URL/api/backup/list \
  -H "Authorization: Bearer $TOKEN"

// If Worker is down, check Cloudflare dashboard:
// 1. Workers & Pages → household-hub-r2-proxy
// 2. Check recent errors in logs
// 3. Verify Worker is deployed
// 4. Check R2 bucket binding
```

**Prevention**:

- Add health check endpoint to Worker
- Monitor Worker uptime
- Set up Cloudflare alerts for Worker failures

---

### Problem: Backup fails at compression step

**Cause**: Large data size or CompressionStream API not available

**Symptoms**:

- Progress stops at 20%
- Error: "compression failed"
- Browser console shows compression error

**Solution**:

```typescript
// Check CompressionStream support
if (!window.CompressionStream) {
  console.error("CompressionStream not supported in this browser");
  // Fallback: Use pako library
  import("pako").then((pako) => {
    const compressed = pako.gzip(jsonString);
    // Continue with compressed data
  });
}

// For large data, monitor memory
const dataSizeBytes = JSON.stringify(data).length;
const dataSizeMB = dataSizeBytes / 1024 / 1024;

if (dataSizeMB > 50) {
  console.warn("Large backup detected:", dataSizeMB, "MB");
  toast.warning("Large backup may take several minutes");
}
```

---

### Problem: "No active session" during backup

**Cause**: User session expired while preparing backup

**Symptoms**:

- Backup fails at encryption step (30%)
- Error references session or authentication

**Solution**:

```typescript
// Refresh session before backup
async createBackup(onProgress?: (progress: number) => void): Promise<void> {
  // Check and refresh session first
  const { data: { session }, error } = await supabase.auth.refreshSession();

  if (error || !session) {
    toast.error('Session expired. Please log in again.');
    throw new Error('No active session');
  }

  // Continue with backup...
  onProgress?.(10);
  const data = await this.gatherData();
  // ...
}
```

---

### Problem: Backup succeeds but no metadata recorded

**Cause**: Supabase insert fails after R2 upload

**Symptoms**:

- Progress reaches 100%
- Success toast appears
- Backup file in R2
- No entry in snapshots table
- BackupHistory doesn't show new backup

**Diagnosis**:

```sql
-- Check recent snapshots
SELECT * FROM snapshots
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check RLS policies
SELECT * FROM pg_policies
WHERE tablename = 'snapshots';
```

**Solution**:

```typescript
// Add error handling to recordBackup
private async recordBackup(
  key: string,
  checksum: string,
  size: number,
  metadata: any
) {
  try {
    const { data, error } = await supabase.from("snapshots").insert({
      snapshot_type: "manual",
      storage_url: key,
      checksum,
      size_bytes: size,
      metadata: { ...metadata, version: "1.0.0" },
    }).select();

    if (error) {
      console.error('Failed to record backup metadata:', error);
      throw new Error(`Metadata recording failed: ${error.message}`);
    }

    console.log('Backup recorded:', data);
  } catch (error) {
    // Backup file exists in R2, but metadata failed
    // User can manually add snapshot record or retry backup
    console.error('Supabase insert failed:', error);
    throw error;
  }
}
```

---

## Upload & Network Problems

### Problem: Upload fails with 403 Forbidden

**Cause**: Signed URL expired or invalid permissions

**Symptoms**:

- Progress reaches 60-90% then fails
- Console shows 403 error
- Retry attempts also fail with 403

**Diagnosis**:

```typescript
// Check signed URL generation
const { url, key } = await this.getSignedUrl(checksum);

console.log("Signed URL:", url.substring(0, 50) + "...");
console.log("Expiry:", new Date(Date.now() + 60 * 60 * 1000)); // URLs typically expire in 1 hour

// Test URL immediately
const testResponse = await fetch(url, { method: "PUT", body: new Uint8Array(0) });
console.log("URL test:", testResponse.status);
```

**Solution**:

Reduce delay between URL generation and upload:

```typescript
async createBackup(onProgress?: (progress: number) => void): Promise<void> {
  // ... prepare data ...

  onProgress?.(50);
  const { url, key } = await this.getSignedUrl(checksum);

  onProgress?.(60);
  const uploadData = packEncryptedBackup(encrypted);

  // Upload IMMEDIATELY after getting signed URL
  await this.uploadToR2(url, uploadData, (p) => onProgress?.(60 + p * 0.3));

  // If upload takes too long, signed URL may expire
  // Consider requesting longer expiry from Worker
}
```

**Prevention**:

- Request signed URLs with longer expiry (2-4 hours)
- Implement upload timeout (abort if >10 minutes)
- Show warning if backup preparation takes >30 minutes

---

### Problem: Upload timeout or network error

**Cause**: Slow network, large file, or unstable connection

**Symptoms**:

- Upload step takes very long (>5 minutes)
- Eventually times out
- Retry logic exhausted

**Solution**:

Implement chunked upload with resumable support:

```typescript
private async uploadToR2(
  url: string,
  data: Uint8Array,
  onProgress?: (p: number) => void
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10 * 60 * 1000); // 10 min timeout

  try {
    const response = await fetch(url, {
      method: "PUT",
      body: data,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': data.length.toString()
      }
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    onProgress?.(1);
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      throw new Error('Upload timed out after 10 minutes');
    }
    throw error;
  }
}
```

---

### Problem: Retry logic not working

**Cause**: Retry utility misconfigured or errors not retryable

**Symptoms**:

- Backup fails immediately without retries
- Console shows only 1 attempt
- "Retry attempt" logs not appearing

**Diagnosis**:

```typescript
// Test retry logic in isolation
import { withRetry } from "./retry-utils";

const testOperation = () => {
  console.log("Attempting operation...");
  throw new Error("Test error");
};

await withRetry(testOperation, {
  maxRetries: 3,
  onRetry: (error, attempt) => {
    console.log(`Retry ${attempt}:`, error.message);
  },
});
```

**Solution**:

Ensure retry logic is correctly applied:

```typescript
// In BackupManager.createBackup

// Use retry for signed URL (network operation)
const { url, key } = await withRetry(() => this.getSignedUrl(checksum), {
  maxRetries: 3,
  baseDelay: 1000,
  onRetry: (error, attempt) => {
    console.log(`Retry getting signed URL (${attempt}/3):`, error.message);
    toast.info(`Retrying... (${attempt}/3)`);
  },
});

// Use retry for upload (network operation)
await withRetry(() => this.uploadToR2(url, uploadData, progressCallback), {
  maxRetries: 3,
  baseDelay: 2000,
  onRetry: (error, attempt) => {
    console.log(`Retry upload (${attempt}/3):`, error.message);
    toast.info(`Upload retry ${attempt}/3...`);
  },
});

// DON'T use retry for local operations (encrypt, compress)
// They're deterministic and will fail the same way each time
```

---

## Restore Issues

### Problem: "Checksum mismatch" on restore

**Cause**: Data corrupted during download or storage

**Symptoms**:

- Restore fails at 70% progress
- Error: "Checksum mismatch - backup corrupted"
- Data not restored

**Diagnosis**:

```typescript
// Verify checksum calculation
const snapshot = await this.getSnapshot(snapshotId);
console.log('Expected checksum:', snapshot.checksum);

const encryptedData = await this.download(...);
const actualChecksum = await this.generateChecksum(encryptedData);
console.log('Actual checksum:', actualChecksum);
console.log('Match:', snapshot.checksum === actualChecksum);
```

**Solution**:

Implement checksum retry with redownload:

```typescript
async restoreFromBackup(
  snapshotId: string,
  onProgress?: (progress: number) => void
): Promise<void> {
  const snapshot = await this.getSnapshot(snapshotId);

  let attempts = 0;
  let encryptedData: Uint8Array;

  while (attempts < 3) {
    encryptedData = await this.download(snapshot.storage_url, onProgress);
    const checksum = await this.generateChecksum(encryptedData);

    if (checksum === snapshot.checksum) {
      break; // Success!
    }

    attempts++;
    if (attempts < 3) {
      console.warn(`Checksum mismatch, retrying download (${attempts}/3)...`);
      toast.info('Download corrupted, retrying...');
      await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
    } else {
      throw new Error('Checksum mismatch after 3 attempts - backup corrupted');
    }
  }

  // Continue with decryption...
}
```

---

### Problem: Restore clears data but fails partway

**Cause**: Database transaction not atomic, error during restore

**Symptoms**:

- Restore starts (data cleared)
- Error occurs mid-restore
- App has partial/missing data
- User data lost!

**Prevention**:

Use Dexie transactions properly:

```typescript
private async restoreData(data: any): Promise<void> {
  const db = await getDexieDb();

  await db.transaction('rw', [db.transactions, db.accounts, db.categories, db.budgets], async () => {
    // All operations in ONE transaction
    // If any fail, ALL rollback

    // 1. Clear existing data
    await db.accounts.clear();
    await db.categories.clear();
    await db.transactions.clear();
    if (db.budgets) await db.budgets.clear();

    // 2. Restore new data
    await db.accounts.bulkPut(data.accounts);
    await db.categories.bulkPut(data.categories);
    await db.transactions.bulkPut(data.transactions);
    if (data.budgets) await db.budgets.bulkPut(data.budgets);

    console.log('Data restored successfully');
  });
}
```

**Recovery if data lost**:

```typescript
// If restore failed and data is gone:
// 1. DO NOT panic-restore another backup
// 2. Check if backup still exists in R2
// 3. Manually re-attempt restore
// 4. If all backups fail, check Supabase cloud truth

// Emergency: restore from Supabase
async function emergencyRestoreFromSupabase() {
  const { data: transactions } = await supabase.from("transactions").select("*");
  const { data: accounts } = await supabase.from("accounts").select("*");
  const { data: categories } = await supabase.from("categories").select("*");

  const db = await getDexieDb();
  await db.transaction("rw", [db.transactions, db.accounts, db.categories], async () => {
    await db.transactions.bulkPut(transactions);
    await db.accounts.bulkPut(accounts);
    await db.categories.bulkPut(categories);
  });

  toast.success("Emergency restore from cloud completed");
}
```

---

### Problem: Restore succeeds but data looks wrong

**Cause**: Wrong backup selected, or data from different time

**Symptoms**:

- Restore completes successfully
- Transaction counts don't match expectations
- Some recent data missing
- Older data present

**This is expected behavior** - restore returns app to backup snapshot time.

**Solution**: Verify backup timestamp before restoring:

```typescript
// Show clear warning with backup details
const handleRestore = async (snapshot: Snapshot) => {
  const backupDate = new Date(snapshot.created_at);
  const dataLoss = Date.now() - backupDate.getTime();
  const hoursLoss = Math.floor(dataLoss / (1000 * 60 * 60));

  const message = `
This backup is from ${formatDistanceToNow(backupDate, { addSuffix: true })}.

Any changes made in the last ${hoursLoss} hours will be lost.

Are you sure you want to restore?
  `.trim();

  const confirmed = window.confirm(message);

  if (confirmed) {
    await restoreManager.restoreFromBackup(snapshot.id);
  }
};
```

---

## Progress Tracking Problems

### Problem: Progress bar jumps backward

**Cause**: Progress updates out of order or overlapping operations

**Symptoms**:

- Progress goes 60% → 70% → 65% → 90%
- Confusing UX

**Solution**:

Ensure monotonic progress:

```typescript
export class BackupManager {
  private currentProgress = 0;

  private updateProgress(progress: number, callback?: (p: number) => void) {
    if (progress > this.currentProgress) {
      this.currentProgress = progress;
      callback?.(progress);
    }
  }

  async createBackup(onProgress?: (progress: number) => void): Promise<void> {
    this.currentProgress = 0;

    this.updateProgress(10, onProgress);
    const data = await this.gatherData();

    this.updateProgress(20, onProgress);
    const compressed = await this.compress(data);

    // ... always use updateProgress instead of calling onProgress directly
  }
}
```

---

### Problem: Progress stuck at certain percentage

**Cause**: Operation hanging, no timeout, or missing progress callback

**Symptoms**:

- Progress stops at 60% (upload step)
- No error, no completion
- Button stays disabled

**Diagnosis**:

```typescript
// Add logging to each step
async createBackup(onProgress?: (progress: number) => void): Promise<void> {
  try {
    console.log('[Backup] Starting...');

    onProgress?.(10);
    console.log('[Backup] Gathering data...');
    const data = await this.gatherData();

    onProgress?.(20);
    console.log('[Backup] Compressing...');
    const compressed = await this.compress(data);

    onProgress?.(30);
    console.log('[Backup] Encrypting...');
    const encrypted = await this.encryption.encryptBackup(compressed);

    onProgress?.(60);
    console.log('[Backup] Uploading...');
    await this.uploadToR2(url, uploadData, (p) => {
      console.log('[Backup] Upload progress:', p);
      onProgress?.(60 + p * 0.3);
    });

    console.log('[Backup] Complete!');
  } catch (error) {
    console.error('[Backup] Failed:', error);
    throw error;
  }
}
```

**Solution**: Add timeout to operations:

```typescript
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// Use in backup
const data = await withTimeout(this.gatherData(), 30000, "Data gathering");
const encrypted = await withTimeout(this.encryption.encryptBackup(compressed), 60000, "Encryption");
```

---

## Data Integrity Issues

### Problem: "Incompatible backup version" error

**Cause**: Backup was created with different app version

**Symptoms**:

- Restore fails at 82% progress
- Error: "Incompatible backup version: X.X.X"
- No data is modified

**Diagnosis**:

```javascript
// Check backup version
const { data: snapshot } = await supabase
  .from("snapshots")
  .select("*")
  .eq("id", snapshotId)
  .single();

console.log("Backup version:", snapshot.metadata?.version);
console.log("Current app version:", "1.0.0");
```

**Solution**:

Option A: Update version compatibility check to allow minor versions:

```typescript
private isCompatibleVersion(backupVersion: string): boolean {
  const [backupMajor, backupMinor] = backupVersion.split(".").map(Number);
  const [currentMajor, currentMinor] = "1.0.0".split(".").map(Number);

  // Allow same major version, any minor/patch
  return backupMajor === currentMajor && backupMinor <= currentMinor;
}
```

Option B: Implement schema migration (see below)

---

### Problem: Restored data missing some fields

**Cause**: Schema mismatch between backup version and current app version

**Symptoms**:

- Restore succeeds
- Some fields are undefined or null
- App errors due to missing properties

**Solution**:

Implement schema migration in RestoreManager:

```typescript
private async restoreData(data: any): Promise<void> {
  const backupVersion = data.metadata?.version || '1.0.0';
  const currentVersion = '1.0.0'; // From app constant

  if (backupVersion !== currentVersion) {
    console.warn('Schema version mismatch:', backupVersion, '→', currentVersion);

    // Apply migrations if needed
    data = await this.migrateData(data, backupVersion, currentVersion);
  }

  // Restore migrated data
  const db = await getDexieDb();
  await db.transaction('rw', [...], async () => {
    // ... restore logic ...
  });
}

private async migrateData(data: any, from: string, to: string): Promise<any> {
  console.log(`Migrating data from ${from} to ${to}`);

  // Example: Add new fields introduced in v1.1.0
  if (from === '1.0.0' && to === '1.1.0') {
    data.transactions.forEach(txn => {
      if (!txn.tagged_user_ids) {
        txn.tagged_user_ids = [];
      }
    });
  }

  return data;
}
```

---

### Problem: Restore completes but syncQueue missing

**Cause**: syncQueue not included in backup or restore

**Symptoms**:

- Restore succeeds
- All transactions restored
- syncQueue table empty
- Offline changes lost

**Diagnosis**:

```javascript
// Check if syncQueue was backed up
const { data: snapshot } = await supabase
  .from("snapshots")
  .select("metadata")
  .eq("id", snapshotId)
  .single();

// Download and inspect backup
// Look for syncQueue property in data

const db = await getDexieDb();
const queueItems = await db.syncQueue.count();
console.log("SyncQueue items after restore:", queueItems);
```

**Solution**:

Ensure BackupManager includes syncQueue:

```typescript
// In backup-manager.ts gatherData method
private async gatherData() {
  const db = await getDexieDb();
  return {
    transactions: await db.transactions.toArray(),
    accounts: await db.accounts.toArray(),
    categories: await db.categories.toArray(),
    budgets: (await db.budgets?.toArray()) || [],
    syncQueue: await db.syncQueue.toArray(), // MUST be included
  };
}
```

And RestoreManager restores it:

```typescript
// In restore-manager.ts restoreData method
if (db.syncQueue && data.syncQueue) {
  await db.syncQueue.bulkPut(data.syncQueue);
}
```

**Recovery**:

If syncQueue was lost:

1. All offline changes are lost
2. Must manually re-enter any unsynced transactions
3. Create new backup with complete implementation

---

### Problem: Rollback fails after restore failure

**Cause**: Supabase cloud truth also corrupted or network unavailable

**Symptoms**:

- Restore fails
- Rollback attempt also fails
- Critical error toast appears
- App data partially deleted

**Diagnosis**:

```javascript
// Check if Supabase is accessible
const { data, error } = await supabase.from("transactions").select("count");
console.log("Supabase accessible:", !error);
console.log("Transaction count in cloud:", data?.[0]?.count);
```

**Solution**:

Manual recovery:

```typescript
// Emergency: Clear and force full re-sync
const db = await getDexieDb();

// Clear all local data
await db.transactions.clear();
await db.accounts.clear();
await db.categories.clear();

// Force refresh from cloud
window.location.reload();

// Or implement manual sync pull
async function manualSyncPull() {
  const { data: transactions } = await supabase.from("transactions").select("*");
  const { data: accounts } = await supabase.from("accounts").select("*");
  const { data: categories } = await supabase.from("categories").select("*");

  const db = await getDexieDb();
  await db.transactions.bulkPut(transactions);
  await db.accounts.bulkPut(accounts);
  await db.categories.bulkPut(categories);

  toast.success("Manual sync completed");
}

await manualSyncPull();
```

**Prevention**:

1. Always create backup before risky operations
2. Test restores with small test backups first
3. Keep multiple backup versions (don't overwrite)
4. Maintain Supabase as canonical source of truth

---

### Problem: "TODO: Trigger syncEngine.fullSync()" in console

**Cause**: Sync trigger not yet implemented (chunk dependency)

**Symptoms**:

- Restore completes successfully
- Data in IndexedDB
- Data NOT in Supabase
- Console shows TODO message

**Solution**:

This is **expected behavior** in Phase B before sync engine integration.

**Temporary workaround**:

Manually trigger sync after restore:

```typescript
// In restore-manager.ts (temporary)
onProgress?.(95);

// Trigger manual sync to Supabase
await this.manualSyncToCloud(data);

onProgress?.(100);

// Helper method
private async manualSyncToCloud(data: any): Promise<void> {
  // Simple push to Supabase (not production-ready)
  const { error: txnError } = await supabase
    .from("transactions")
    .upsert(data.transactions);

  const { error: accError } = await supabase
    .from("accounts")
    .upsert(data.accounts);

  const { error: catError } = await supabase
    .from("categories")
    .upsert(data.categories);

  if (txnError || accError || catError) {
    console.error("Manual sync failed:", { txnError, accError, catError });
    throw new Error("Failed to sync restored data to cloud");
  }
}
```

**Proper Solution (Phase C)**:

Import and use sync engine:

```typescript
import { syncEngine } from "@/lib/sync-engine";

// In RestoreManager
onProgress?.(95);
await syncEngine.fullSync();
onProgress?.(100);
```

---

## Performance Problems

### Problem: Backup very slow (>30 seconds for normal data)

**Cause**: Large dataset, slow compression, or inefficient data gathering

**Symptoms**:

- Backup takes >30 seconds for 1,000 transactions
- Progress crawls during compression or encryption steps
- Browser becomes unresponsive

**Diagnosis**:

```typescript
// Profile each step
console.time("gather");
const data = await this.gatherData();
console.timeEnd("gather");

console.time("compress");
const compressed = await this.compress(data);
console.timeEnd("compress");

console.time("encrypt");
const encrypted = await this.encryption.encryptBackup(compressed);
console.timeEnd("encrypt");

console.log("Data size:", JSON.stringify(data).length / 1024, "KB");
console.log("Compressed size:", compressed.length / 1024, "KB");
```

**Solution**: Optimize data gathering:

```typescript
private async gatherData() {
  const db = await getDexieDb();

  // Fetch in parallel
  const [transactions, accounts, categories, budgets] = await Promise.all([
    db.transactions.toArray(),
    db.accounts.toArray(),
    db.categories.toArray(),
    db.budgets?.toArray() || Promise.resolve([])
  ]);

  return { transactions, accounts, categories, budgets };
}
```

---

## UI Component Issues

### Problem: BackupHistory doesn't update after backup

**Cause**: TanStack Query cache not invalidated

**Solution**:

```typescript
// In BackupButton component
const handleBackup = async () => {
  const queryClient = useQueryClient();

  try {
    const manager = new BackupManager();
    await manager.createBackup(setProgress);

    toast.success("Backup completed successfully");

    // Invalidate and refetch backups
    queryClient.invalidateQueries({ queryKey: ["backups"] });
  } catch (error) {
    toast.error("Backup failed");
  }
};
```

---

## R2 Worker Issues

### Problem: Worker returns 500 error

**Cause**: R2 bucket binding issue or Worker code error

**Check Worker logs** in Cloudflare dashboard

---

## Prevention Best Practices

1. **Test with realistic data sizes**
2. **Verify Worker URL before deployment**
3. **Monitor R2 storage quota**
4. **Keep backup retention policy** (auto-delete old backups)
5. **Regular restore tests** (verify backups are restorable)
6. **Monitor backup success rate**
7. **Set up alerts for backup failures**
8. **Document restore procedures**

---

**Emergency Recovery**:

```bash
# If all backups fail, restore from Supabase cloud truth
# See "Emergency restore from Supabase" section above

# If IndexedDB corrupted, clear and re-sync
localStorage.clear();
indexedDB.deleteDatabase('household-hub');
window.location.reload();
```
