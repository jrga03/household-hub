# Instructions: Sync Processor

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Create Retry Logic (10 min)

Create `src/lib/sync/retry.ts`:

```typescript
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // cap at this value
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
};

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateRetryDelay(
  retryCount: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  // Exponential: 2^n * base
  const exponential = Math.pow(2, retryCount) * config.baseDelay;

  // Cap at maxDelay
  const capped = Math.min(exponential, config.maxDelay);

  // Add jitter (0-1s)
  const jitter = Math.random() * 1000;

  return capped + jitter;
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

---

## Step 2: Create ID Mapping Manager (10 min)

Create `src/lib/sync/idMapping.ts`:

```typescript
/**
 * Manages temporary ID → server ID mappings during sync
 */
class IDMappingManager {
  private mappings = new Map<string, string>();

  /**
   * Add mapping from temp ID to server ID
   */
  add(tempId: string, serverId: string): void {
    this.mappings.set(tempId, serverId);
  }

  /**
   * Get server ID for temp ID (returns original if not mapped)
   */
  get(id: string): string {
    return this.mappings.get(id) || id;
  }

  /**
   * Replace all temp IDs in an object
   */
  replaceIds<T extends Record<string, any>>(obj: T): T {
    const replaced = { ...obj };

    for (const [key, value] of Object.entries(replaced)) {
      if (typeof value === "string" && value.startsWith("temp-")) {
        replaced[key] = this.get(value);
      }
    }

    return replaced;
  }

  /**
   * Clear all mappings (call after sync session)
   */
  clear(): void {
    this.mappings.clear();
  }

  /**
   * Get all mappings (for debugging)
   */
  getAll(): Map<string, string> {
    return new Map(this.mappings);
  }
}

export const idMapping = new IDMappingManager();
```

---

## Step 3: Create Queue Helper Functions (5 min)

Create `src/lib/offline/syncQueue.ts`:

```typescript
import { supabase } from "@/lib/supabase";
import type { SyncQueueItem } from "@/types/sync";

/**
 * Get all pending sync queue items for a user
 */
export async function getPendingQueueItems(userId: string): Promise<SyncQueueItem[]> {
  const { data, error } = await supabase
    .from("sync_queue")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch pending queue items:", error);
    throw error;
  }

  return data || [];
}
```

---

## Step 4: Create Sync Processor (30 min)

Create `src/lib/sync/processor.ts`:

```typescript
import { supabase } from "@/lib/supabase";
import { deviceManager } from "@/lib/dexie/deviceManager";
import { getPendingQueueItems } from "@/lib/offline/syncQueue";
import { calculateRetryDelay, sleep } from "./retry";
import { idMapping } from "./idMapping";
import type { SyncQueueItem } from "@/types/sync";

export class SyncProcessor {
  private isProcessing = false;
  private readonly MAX_RETRIES = 3;

  /**
   * Process all pending queue items
   */
  async processQueue(userId: string): Promise<{ synced: number; failed: number }> {
    if (this.isProcessing) {
      console.log("Sync already in progress");
      return { synced: 0, failed: 0 };
    }

    this.isProcessing = true;
    let synced = 0;
    let failed = 0;

    try {
      const items = await getPendingQueueItems(userId);
      console.log(`Processing ${items.length} queue items`);

      for (const item of items) {
        const result = await this.processItem(item);
        if (result.success) {
          synced++;
        } else {
          failed++;
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { synced, failed };
  }

  /**
   * Process a single queue item
   */
  async processItem(item: SyncQueueItem): Promise<{ success: boolean; error?: string }> {
    try {
      // Update status to syncing
      await this.updateQueueStatus(item.id, "syncing");

      // Replace temporary IDs in payload
      const payload = idMapping.replaceIds(item.operation.payload);

      // Execute operation
      let result;
      switch (item.operation.op) {
        case "create":
          result = await this.syncCreate(item.entity_type, payload);
          break;
        case "update":
          result = await this.syncUpdate(item.entity_type, item.entity_id, payload);
          break;
        case "delete":
          result = await this.syncDelete(item.entity_type, item.entity_id);
          break;
        default:
          throw new Error(`Unknown operation: ${item.operation.op}`);
      }

      // Store ID mapping if created new entity
      if (item.operation.op === "create" && result.serverId) {
        idMapping.add(item.entity_id, result.serverId);
      }

      // Mark completed
      await this.updateQueueStatus(item.id, "completed", null, new Date().toISOString());
      return { success: true };
    } catch (error) {
      console.error(`Failed to process queue item ${item.id}:`, error);
      return await this.handleError(item, error);
    }
  }

  private async syncCreate(entityType: string, payload: any): Promise<{ serverId?: string }> {
    const { data, error } = await supabase
      .from(this.getTableName(entityType))
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;
    return { serverId: data.id };
  }

  private async syncUpdate(entityType: string, entityId: string, payload: any) {
    const { error } = await supabase
      .from(this.getTableName(entityType))
      .update(payload)
      .eq("id", entityId);

    if (error) throw error;
    return {};
  }

  private async syncDelete(entityType: string, entityId: string) {
    const { error } = await supabase
      .from(this.getTableName(entityType))
      .delete()
      .eq("id", entityId);

    if (error) throw error;
    return {};
  }

  private async handleError(
    item: SyncQueueItem,
    error: any
  ): Promise<{ success: boolean; error: string }> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check if error is non-retryable (validation/constraint errors)
    const nonRetryableErrors = [
      "violates check constraint",
      "violates foreign key constraint",
      "violates unique constraint",
      "invalid input syntax",
      "value too long",
      "invalid type",
    ];

    const isNonRetryable = nonRetryableErrors.some((msg) =>
      errorMessage.toLowerCase().includes(msg)
    );

    if (isNonRetryable) {
      console.log("Non-retryable error - failing immediately:", errorMessage);
      await this.updateQueueStatus(item.id, "failed", errorMessage);
      return { success: false, error: errorMessage };
    }

    const retryCount = item.retry_count + 1;

    if (retryCount >= this.MAX_RETRIES) {
      // Max retries reached - mark as failed
      await this.updateQueueStatus(item.id, "failed", errorMessage);
      return { success: false, error: `Max retries reached: ${errorMessage}` };
    }

    // Retry with exponential backoff
    const delay = calculateRetryDelay(retryCount);
    console.log(`Retry ${retryCount}/${this.MAX_RETRIES} in ${delay}ms`);

    await sleep(delay);

    // Update retry count and status
    await supabase
      .from("sync_queue")
      .update({
        status: "queued",
        retry_count: retryCount,
        error_message: errorMessage,
      })
      .eq("id", item.id);

    return { success: false, error: errorMessage };
  }

  private async updateQueueStatus(
    id: string,
    status: string,
    errorMessage?: string | null,
    syncedAt?: string
  ): Promise<void> {
    await supabase
      .from("sync_queue")
      .update({
        status,
        error_message: errorMessage,
        synced_at: syncedAt,
      })
      .eq("id", id);
  }

  private getTableName(entityType: string): string {
    const tableMap: Record<string, string> = {
      transaction: "transactions",
      account: "accounts",
      category: "categories",
      budget: "budgets",
    };
    return tableMap[entityType] || entityType;
  }
}

export const syncProcessor = new SyncProcessor();
```

---

## Step 5: Create React Hook (10 min)

Create `src/hooks/useSyncProcessor.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { syncProcessor } from "@/lib/sync/processor";

export function useSyncProcessor() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      return syncProcessor.processQueue(user.id);
    },
    onSuccess: (result) => {
      if (result.synced > 0) {
        toast.success(`Synced ${result.synced} items`);
        // Invalidate all offline queries
        queryClient.invalidateQueries({ queryKey: ["offline"] });
      }
      if (result.failed > 0) {
        toast.error(`${result.failed} items failed to sync`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    },
  });
}
```

---

## Step 6: Add Auto-Sync Triggers (10 min)

Create `src/lib/sync/autoSync.ts`:

```typescript
import { syncProcessor } from "./processor";

export class AutoSyncManager {
  private intervalId?: number;
  private userId?: string;

  start(userId: string): void {
    this.userId = userId;
    this.setupEventListeners();
    this.startPeriodicSync();
  }

  stop(): void {
    this.cleanup();
  }

  private setupEventListeners(): void {
    // Trigger on online
    window.addEventListener("online", this.handleOnline);

    // Trigger on visibility change
    document.addEventListener("visibilitychange", this.handleVisibilityChange);

    // Trigger on focus
    window.addEventListener("focus", this.handleFocus);
  }

  private handleOnline = async () => {
    console.log("Online - triggering sync");
    await this.triggerSync();
  };

  private handleVisibilityChange = async () => {
    if (!document.hidden) {
      console.log("Visible - triggering sync");
      await this.triggerSync();
    }
  };

  private handleFocus = async () => {
    console.log("Focused - triggering sync");
    await this.triggerSync();
  };

  private startPeriodicSync(): void {
    // Sync every 5 minutes
    this.intervalId = window.setInterval(
      () => {
        if (navigator.onLine && !document.hidden) {
          this.triggerSync();
        }
      },
      5 * 60 * 1000
    );
  }

  private async triggerSync(): Promise<void> {
    if (!this.userId) return;

    try {
      await syncProcessor.processQueue(this.userId);
    } catch (error) {
      console.error("Auto-sync failed:", error);
    }
  }

  private cleanup(): void {
    window.removeEventListener("online", this.handleOnline);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener("focus", this.handleFocus);

    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }
}

export const autoSyncManager = new AutoSyncManager();
```

---

## Step 7: Integrate Auto-Sync into App (5 min)

Add auto-sync initialization to your main App component:

```typescript
// In App.tsx or src/routes/__root.tsx (depending on TanStack Router setup)
import { autoSyncManager } from "@/lib/sync/autoSync";
import { useAuthStore } from "@/stores/authStore";
import { useEffect } from "react";

export function App() {
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (user?.id) {
      console.log("Starting auto-sync for user:", user.id);
      autoSyncManager.start(user.id);

      return () => {
        console.log("Stopping auto-sync");
        autoSyncManager.stop();
      };
    }
  }, [user]);

  return <>{/* your app content */}</>;
}
```

**Verification**:

1. Log in to the app
2. Check console for "Starting auto-sync for user: [userId]"
3. Create an offline transaction
4. Observe auto-sync triggering on visibility/focus/online events

---

## Done!

**Next**: Run through `checkpoint.md` to verify sync works.
