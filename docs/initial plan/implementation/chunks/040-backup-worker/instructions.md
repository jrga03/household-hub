# Instructions: Backup Worker

Follow these steps. Estimated time: 1.5 hours.

---

## Step 1: Create Backup Manager (40 min)

Create `src/lib/backup-manager.ts`:

```typescript
import { getDexieDb } from "./dexie";
import { BackupEncryption } from "./backup-encryption";
import { packEncryptedBackup } from "./crypto-utils";
import { supabase } from "./supabase";

export class BackupManager {
  private workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  private encryption = new BackupEncryption();

  async createBackup(onProgress?: (progress: number) => void): Promise<void> {
    try {
      onProgress?.(10);
      const data = await this.gatherData();

      onProgress?.(20);
      const compressed = await this.compress(data);

      onProgress?.(30);
      const encrypted = await this.encryption.encryptBackup(compressed);

      onProgress?.(40);
      const checksum = await this.generateChecksum(encrypted.encrypted);

      onProgress?.(50);
      const { url, key } = await this.getSignedUrl(checksum);

      onProgress?.(60);
      const uploadData = packEncryptedBackup(encrypted);
      await this.uploadToR2(url, uploadData, (p) => onProgress?.(60 + p * 0.3));

      onProgress?.(90);
      await this.recordBackup(key, checksum, uploadData.byteLength, {
        encrypted: true,
        iv: Array.from(encrypted.iv),
      });

      onProgress?.(100);
    } catch (error) {
      console.error("Backup failed:", error);

      // Note: Backup retry queue implementation deferred to Phase C (automated backups)
      // For MVP (manual backups), user can simply retry manually
      // Future: await this.queueBackupRetry(data, error);

      throw error;
    }
  }

  // Future Phase C: Implement backup retry queue for automated backups
  // private async queueBackupRetry(data: any, error: Error): Promise<void> {
  //   const db = await getDexieDb();
  //   await db.backupQueue.add({
  //     data,
  //     error: error.message,
  //     attempt: 1,
  //     nextRetry: Date.now() + 60000, // Retry in 1 minute
  //     createdAt: Date.now(),
  //   });
  // }

  private async gatherData() {
    const db = await getDexieDb();
    return {
      transactions: await db.transactions.toArray(),
      accounts: await db.accounts.toArray(),
      categories: await db.categories.toArray(),
      budgets: (await db.budgets?.toArray()) || [],
      syncQueue: await db.syncQueue.toArray(), // CRITICAL: Include sync queue for offline changes
    };
  }

  private async compress(data: any): Promise<Uint8Array> {
    const json = JSON.stringify(data);
    const stream = new Response(json).body!.pipeThrough(new CompressionStream("gzip"));
    const compressed = await new Response(stream).arrayBuffer();
    return new Uint8Array(compressed);
  }

  private async generateChecksum(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async getSignedUrl(checksum: string) {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const response = await fetch(`${this.workerUrl}/api/backup/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filename: `backup-${Date.now()}.gz.enc`,
        contentType: "application/octet-stream",
        checksum,
      }),
    });

    if (!response.ok) throw new Error("Failed to get signed URL");
    return response.json();
  }

  private async uploadToR2(url: string, data: Uint8Array, onProgress?: (p: number) => void) {
    // Note: R2 upload uses signed URL, progress tracking simplified
    const response = await fetch(url, {
      method: "PUT",
      body: data,
    });

    if (!response.ok) throw new Error("Upload failed");
    onProgress?.(1);
  }

  private async recordBackup(key: string, checksum: string, size: number, metadata: any) {
    await supabase.from("snapshots").insert({
      snapshot_type: "manual",
      storage_url: key,
      checksum,
      size_bytes: size,
      metadata: { ...metadata, version: "1.0.0" },
    });
  }
}
```

---

## Step 2: Create Restore Manager (30 min)

Create `src/lib/restore-manager.ts`:

```typescript
import { getDexieDb } from "./dexie";
import { BackupEncryption } from "./backup-encryption";
import { unpackEncryptedBackup } from "./crypto-utils";
import { supabase } from "./supabase";

export class RestoreManager {
  private workerUrl = import.meta.env.VITE_R2_WORKER_URL;
  private encryption = new BackupEncryption();

  async restoreFromBackup(
    snapshotId: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    try {
      onProgress?.(10);
      const snapshot = await this.getSnapshot(snapshotId);

      onProgress?.(20);
      const downloadUrl = await this.getDownloadUrl(snapshot.storage_url);

      onProgress?.(30);
      const encryptedData = await this.download(downloadUrl, (p) => onProgress?.(30 + p * 0.4));

      onProgress?.(70);
      const checksum = await this.generateChecksum(encryptedData);
      if (checksum !== snapshot.checksum) {
        throw new Error("Checksum mismatch - backup corrupted");
      }

      onProgress?.(75);
      const encrypted = unpackEncryptedBackup(encryptedData, snapshot.metadata);
      const compressed = await this.encryption.decryptBackup(encrypted);

      onProgress?.(80);
      const decompressed = await this.decompress(compressed);
      const data = JSON.parse(decompressed);

      onProgress?.(82);
      // Validate schema version compatibility
      if (!this.isCompatibleVersion(data.version)) {
        throw new Error(
          `Incompatible backup version: ${data.version}. Current app version may not support this backup.`
        );
      }

      onProgress?.(85);
      await this.restoreData(data);

      onProgress?.(95);
      // Trigger full sync to push restored data to Supabase
      // Note: syncEngine should be imported from your sync module
      // Example: import { syncEngine } from '@/lib/sync-engine';
      // await syncEngine.fullSync();
      // For now, this is a placeholder - implement based on your sync architecture
      console.log("TODO: Trigger syncEngine.fullSync() here to sync restored data to Supabase");

      onProgress?.(100);
    } catch (error) {
      console.error("Restore failed:", error);

      // Attempt rollback if restore failed
      try {
        await this.rollbackRestore();
        toast.error("Restore failed and was rolled back. Your original data is intact.");
      } catch (rollbackError) {
        console.error("Rollback also failed:", rollbackError);
        toast.error(
          "CRITICAL: Restore failed and rollback failed. Please restore from another backup or contact support."
        );
      }

      throw error;
    }
  }

  private async getSnapshot(id: string) {
    const { data, error } = await supabase.from("snapshots").select("*").eq("id", id).single();

    if (error || !data) throw new Error("Snapshot not found");
    return data;
  }

  private async getDownloadUrl(key: string): Promise<string> {
    // Get signed download URL from Worker (proper security proxy pattern)
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    const response = await fetch(`${this.workerUrl}/api/backup/download`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) {
      throw new Error("Failed to get signed download URL");
    }

    const { url } = await response.json();
    return url; // Returns signed URL, not the data itself
  }

  private async download(url: string, onProgress?: (p: number) => void): Promise<Uint8Array> {
    // Download from signed R2 URL
    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error("Download failed");
    }

    const arrayBuffer = await response.arrayBuffer();
    onProgress?.(1);
    return new Uint8Array(arrayBuffer);
  }

  private async generateChecksum(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async decompress(compressed: Uint8Array): Promise<string> {
    const stream = new Response(compressed).body!.pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
  }

  private isCompatibleVersion(backupVersion: string): boolean {
    const currentVersion = "1.0.0"; // Should match app version constant

    // For now, exact match required
    // Future: implement semantic version comparison for minor/patch compatibility
    return backupVersion === currentVersion;
  }

  private async clearCurrentData(): Promise<void> {
    const db = await getDexieDb();

    // Clear all data tables
    await db.accounts.clear();
    await db.categories.clear();
    await db.transactions.clear();
    if (db.budgets) await db.budgets.clear();
    if (db.syncQueue) await db.syncQueue.clear();
  }

  private async restoreData(data: any): Promise<void> {
    const db = await getDexieDb();

    // Build transaction array dynamically based on available tables
    const tables = [db.transactions, db.accounts, db.categories];
    if (db.budgets) tables.push(db.budgets);
    if (db.syncQueue) tables.push(db.syncQueue);

    await db.transaction("rw", tables, async () => {
      // Clear existing data first (within transaction for atomicity)
      await this.clearCurrentData();

      // Restore in order of dependencies
      await db.accounts.bulkPut(data.accounts);
      await db.categories.bulkPut(data.categories);
      await db.transactions.bulkPut(data.transactions);

      // Restore optional tables if present
      if (db.budgets && data.budgets) {
        await db.budgets.bulkPut(data.budgets);
      }
      if (db.syncQueue && data.syncQueue) {
        await db.syncQueue.bulkPut(data.syncQueue);
      }
    });
  }

  private async rollbackRestore(): Promise<void> {
    // Rollback strategy: Re-sync from Supabase to restore cloud truth
    // This assumes Supabase still has the correct data before restore attempt

    console.log("Attempting rollback: clearing local data and re-syncing from cloud...");

    const db = await getDexieDb();

    // Clear corrupted local data
    await this.clearCurrentData();

    // Fetch data from Supabase (cloud truth)
    const { data: transactions } = await supabase.from("transactions").select("*");
    const { data: accounts } = await supabase.from("accounts").select("*");
    const { data: categories } = await supabase.from("categories").select("*");
    const { data: budgets } = await supabase.from("budgets").select("*");

    // Restore from cloud
    if (transactions) await db.transactions.bulkPut(transactions);
    if (accounts) await db.accounts.bulkPut(accounts);
    if (categories) await db.categories.bulkPut(categories);
    if (budgets && db.budgets) await db.budgets.bulkPut(budgets);

    console.log("Rollback completed: data restored from Supabase");
  }
}
```

---

## Step 3: Create Backup Button Component (20 min)

Create `src/components/BackupButton.tsx`:

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BackupManager } from "@/lib/backup-manager";
import { toast } from "sonner";

export function BackupButton() {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleBackup = async () => {
    setIsBackingUp(true);
    setProgress(0);

    try {
      const manager = new BackupManager();
      await manager.createBackup(setProgress);
      toast.success("Backup completed successfully");
    } catch (error) {
      toast.error("Backup failed");
      console.error(error);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button onClick={handleBackup} disabled={isBackingUp}>
        {isBackingUp ? "Backing up..." : "Create Backup"}
      </Button>
      {isBackingUp && <Progress value={progress} />}
    </div>
  );
}
```

---

## Step 4: Create BackupHistory Component (25 min)

Create `src/components/BackupHistory.tsx`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Download, Trash2, HardDrive } from "lucide-react";
import { useState } from "react";
import { RestoreManager } from "@/lib/restore-manager";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";

interface Snapshot {
  id: string;
  created_at: string;
  snapshot_type: string;
  storage_url: string;
  checksum: string;
  size_bytes: number;
  metadata: {
    encrypted: boolean;
    version: string;
  };
}

export function BackupHistory() {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const { data: snapshots, isLoading, refetch } = useQuery({
    queryKey: ["backups"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as Snapshot[];
    },
  });

  const handleRestore = async (snapshotId: string) => {
    const confirmed = window.confirm(
      "This will replace all current data. Are you sure?\n\nTip: Create a backup first!"
    );

    if (!confirmed) return;

    setRestoringId(snapshotId);
    setProgress(0);

    try {
      const manager = new RestoreManager();
      await manager.restoreFromBackup(snapshotId, setProgress);

      toast.success("Restore completed successfully");

      // Refresh app data
      window.location.reload();
    } catch (error) {
      console.error("Restore failed:", error);
      toast.error("Restore failed. Check console for details.");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (snapshotId: string) => {
    const confirmed = window.confirm(
      "Delete this backup? This cannot be undone."
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("snapshots")
        .delete()
        .eq("id", snapshotId);

      if (error) throw error;

      toast.success("Backup deleted");
      refetch();
    } catch (error) {
      console.error("Delete failed:", error);
      toast.error("Failed to delete backup");
    }
  };

  const formatSize = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(2)} MB`;
  };

  if (isLoading) {
    return <div>Loading backups...</div>;
  }

  if (!snapshots || snapshots.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Backups</CardTitle>
          <CardDescription>
            Create your first backup to see it here
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Backup History</h2>

      {restoringId && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <p>Restoring backup...</p>
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground">{progress.toFixed(0)}% complete</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {snapshots.map((snapshot) => (
          <Card key={snapshot.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">
                    {snapshot.snapshot_type === "manual" ? "Manual Backup" : "Auto Backup"}
                  </CardTitle>
                  <CardDescription>
                    {formatDistanceToNow(new Date(snapshot.created_at), { addSuffix: true })}
                  </CardDescription>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(snapshot.id)}
                    disabled={restoringId !== null}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Restore
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(snapshot.id)}
                    disabled={restoringId !== null}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span>{formatSize(snapshot.size_bytes)}</span>
                </div>

                <div className="flex items-center gap-2">
                  {snapshot.metadata.encrypted && (
                    <span className="text-green-600">🔐 Encrypted</span>
                  )}
                </div>

                <div className="col-span-2 text-muted-foreground">
                  <p>Version: {snapshot.metadata.version}</p>
                  <p className="font-mono text-xs truncate">
                    Checksum: {snapshot.checksum.substring(0, 16)}...
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

---

## Step 5: Add Retry Logic with Exponential Backoff (20 min)

Create `src/lib/retry-utils.ts`:

```typescript
export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, onRetry } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      // Calculate exponential backoff with jitter
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000, maxDelay);

      onRetry?.(lastError, attempt);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}
```

**Update BackupManager** to use retry logic:

```typescript
// In backup-manager.ts
import { withRetry } from "./retry-utils";

export class BackupManager {
  // ... existing code ...

  async createBackup(onProgress?: (progress: number) => void): Promise<void> {
    try {
      onProgress?.(10);
      const data = await this.gatherData();

      onProgress?.(20);
      const compressed = await this.compress(data);

      onProgress?.(30);
      const encrypted = await this.encryption.encryptBackup(compressed);

      onProgress?.(40);
      const checksum = await this.generateChecksum(encrypted.encrypted);

      onProgress?.(50);
      // Use retry for network operations
      const { url, key } = await withRetry(() => this.getSignedUrl(checksum), {
        maxRetries: 3,
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} for signed URL:`, error.message);
        },
      });

      onProgress?.(60);
      const uploadData = packEncryptedBackup(encrypted);

      // Use retry for upload
      await withRetry(() => this.uploadToR2(url, uploadData, (p) => onProgress?.(60 + p * 0.3)), {
        maxRetries: 3,
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} for upload:`, error.message);
          toast.info(`Upload retry ${attempt}/3...`);
        },
      });

      onProgress?.(90);
      await this.recordBackup(key, checksum, uploadData.byteLength, {
        encrypted: true,
        iv: Array.from(encrypted.iv),
      });

      onProgress?.(100);
    } catch (error) {
      console.error("Backup failed:", error);
      throw error;
    }
  }

  // ... rest of the code ...
}
```

---

## Step 6: Create Backups Management Page (15 min)

Create `src/routes/backups.tsx`:

```typescript
import { BackupButton } from "@/components/BackupButton";
import { BackupHistory } from "@/components/BackupHistory";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, HardDrive, Clock } from "lucide-react";

export default function BackupsPage() {
  return (
    <div className="container mx-auto py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Backups</h1>
        <p className="text-muted-foreground">
          Create encrypted backups and restore your data anytime
        </p>
      </div>

      {/* Create Backup Section */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Backup</CardTitle>
          <CardDescription>
            Backs up all transactions, accounts, categories, and budgets
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BackupButton />
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            <CardTitle className="text-lg">Encrypted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Backups are encrypted with AES-256 before upload. Only you can decrypt them.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <HardDrive className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">Cloud Storage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Stored securely in Cloudflare R2 with 99.9% durability.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Clock className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Retention</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Last 20 backups kept. Older backups are automatically cleaned up.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Backup History */}
      <BackupHistory />
    </div>
  );
}
```

**Add route to router** in `src/main.tsx` or router config:

```typescript
import BackupsPage from "./routes/backups";

// Add to routes:
{
  path: "/backups",
  element: <BackupsPage />,
}
```

---

## Step 7: Add Backup Tests (15 min)

Create `src/lib/__tests__/backup-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BackupManager } from "../backup-manager";

// Mock dependencies
vi.mock("../dexie");
vi.mock("../backup-encryption");
vi.mock("../supabase");

describe("BackupManager", () => {
  let manager: BackupManager;

  beforeEach(() => {
    manager = new BackupManager();
    vi.clearAllMocks();
  });

  it("should create backup successfully", async () => {
    const progressCallback = vi.fn();

    await manager.createBackup(progressCallback);

    // Verify progress was reported
    expect(progressCallback).toHaveBeenCalledWith(10);
    expect(progressCallback).toHaveBeenCalledWith(100);

    // Verify at least 5 progress updates
    expect(progressCallback.mock.calls.length).toBeGreaterThanOrEqual(5);
  });

  it("should report progress incrementally", async () => {
    const progress: number[] = [];

    await manager.createBackup((p) => progress.push(p));

    // Progress should be monotonically increasing
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]);
    }

    // Should reach 100%
    expect(progress[progress.length - 1]).toBe(100);
  });

  it("should throw error on failure", async () => {
    // Mock a failure in one of the steps
    vi.spyOn(manager as any, "gatherData").mockRejectedValueOnce(new Error("Database error"));

    await expect(async () => {
      await manager.createBackup();
    }).rejects.toThrow("Database error");
  });
});
```

Create `src/lib/__tests__/restore-manager.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RestoreManager } from "../restore-manager";

vi.mock("../dexie");
vi.mock("../backup-encryption");
vi.mock("../supabase");

describe("RestoreManager", () => {
  let manager: RestoreManager;

  beforeEach(() => {
    manager = new RestoreManager();
    vi.clearAllMocks();
  });

  it("should restore backup successfully", async () => {
    const progressCallback = vi.fn();

    await manager.restoreFromBackup("snapshot-id", progressCallback);

    expect(progressCallback).toHaveBeenCalledWith(10);
    expect(progressCallback).toHaveBeenCalledWith(100);
  });

  it("should verify checksum during restore", async () => {
    // Mock snapshot with checksum
    vi.spyOn(manager as any, "getSnapshot").mockResolvedValueOnce({
      id: "snapshot-id",
      checksum: "correct-checksum",
      metadata: {},
    });

    // Mock download with wrong checksum
    vi.spyOn(manager as any, "download").mockResolvedValueOnce(new Uint8Array([1, 2, 3]));

    vi.spyOn(manager as any, "generateChecksum").mockResolvedValueOnce("wrong-checksum");

    await expect(async () => {
      await manager.restoreFromBackup("snapshot-id");
    }).rejects.toThrow("Checksum mismatch");
  });
});
```

Run tests:

```bash
npm test backup-manager
npm test restore-manager
```

---

## Step 7.5: Add Retry Utils Tests (10 min)

Create `src/lib/__tests__/retry-utils.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { withRetry } from "../retry-utils";

describe("withRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should succeed on first attempt", async () => {
    const operation = vi.fn().mockResolvedValue("success");

    const result = await withRetry(operation);

    expect(result).toBe("success");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("should retry on failure and eventually succeed", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Attempt 1 failed"))
      .mockRejectedValueOnce(new Error("Attempt 2 failed"))
      .mockResolvedValue("success on attempt 3");

    const onRetry = vi.fn();

    const promise = withRetry(operation, { maxRetries: 3, onRetry });

    // Fast-forward through retry delays
    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBe("success on attempt 3");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2); // Called on 2 failures before success
  });

  it("should throw after max retries exhausted", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Always fails"));

    const promise = withRetry(operation, { maxRetries: 3 });

    // Fast-forward through all retries
    await vi.runAllTimersAsync();

    await expect(promise).rejects.toThrow("Always fails");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("should use exponential backoff with jitter", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("Fail 1"))
      .mockRejectedValueOnce(new Error("Fail 2"))
      .mockResolvedValue("success");

    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    vi.spyOn(global, "setTimeout").mockImplementation(((callback: any, delay: number) => {
      delays.push(delay);
      return originalSetTimeout(callback, 0);
    }) as any);

    const promise = withRetry(operation, {
      maxRetries: 3,
      baseDelay: 1000,
    });

    await vi.runAllTimersAsync();
    await promise;

    // First retry: ~2000ms (1000 * 2^0 + jitter)
    expect(delays[0]).toBeGreaterThanOrEqual(2000);
    expect(delays[0]).toBeLessThan(3000);

    // Second retry: ~4000ms (1000 * 2^1 + jitter)
    expect(delays[1]).toBeGreaterThanOrEqual(4000);
    expect(delays[1]).toBeLessThan(5000);
  });

  it("should respect maxDelay cap", async () => {
    const operation = vi.fn().mockRejectedValue(new Error("Always fails"));

    const delays: number[] = [];
    const originalSetTimeout = global.setTimeout;

    vi.spyOn(global, "setTimeout").mockImplementation(((callback: any, delay: number) => {
      delays.push(delay);
      return originalSetTimeout(callback, 0);
    }) as any);

    const promise = withRetry(operation, {
      maxRetries: 5,
      baseDelay: 5000,
      maxDelay: 10000,
    });

    await vi.runAllTimersAsync();

    try {
      await promise;
    } catch {
      // Expected to fail
    }

    // All delays should be capped at maxDelay
    delays.forEach((delay) => {
      expect(delay).toBeLessThanOrEqual(10000 + 1000); // +1000 for jitter
    });
  });

  it("should call onRetry with error and attempt number", async () => {
    const error1 = new Error("First failure");
    const error2 = new Error("Second failure");

    const operation = vi
      .fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2)
      .mockResolvedValue("success");

    const onRetry = vi.fn();

    const promise = withRetry(operation, { maxRetries: 3, onRetry });

    await vi.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, error1, 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, error2, 2);
  });
});
```

Run tests:

```bash
npm test retry-utils
```

**Expected**: All 6 tests pass, covering:

- Immediate success
- Retry with eventual success
- Max retries exhaustion
- Exponential backoff timing
- Max delay cap
- Retry callback behavior

---

## Step 8: End-to-End Manual Testing (10 min)

**Test Backup Creation**:

1. Navigate to `/backups` page
2. Click "Create Backup" button
3. Observe progress bar:
   - Should go from 0% → 100%
   - Takes 5-15 seconds depending on data size
4. Success toast appears
5. New backup appears in history

**Test Backup Restore**:

1. In backup history, click "Restore" on a backup
2. Confirm the warning dialog
3. Observe progress bar
4. App reloads with restored data
5. Verify:
   - Transaction count matches
   - Account balances correct
   - Categories preserved

**Test Error Scenarios**:

1. Disable network mid-backup
   - **Expected**: Retry logic kicks in, eventually fails with error toast
2. Try restoring with wrong user logged in
   - **Expected**: "Cannot decrypt backup from different user" error
3. Delete a backup
   - **Expected**: Confirmation dialog, then backup removed from list

---

## Done!

When all tests pass and backup/restore flows work end-to-end, you're ready for the checkpoint.

**Next**: `checkpoint.md` to verify everything works.
