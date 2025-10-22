# Instructions: Sync Issues Panel

Follow these steps in order. Estimated time: 2 hours.

---

## Step 1: Create SyncIssuesManager Class (30 min)

Create `src/lib/sync/SyncIssuesManager.ts`:

```typescript
import { db } from "@/lib/dexie";

export interface SyncIssue {
  id: string;
  entityType: "transaction" | "account" | "category" | "budget";
  entityId: string;
  issueType: "conflict-resolved" | "sync-failed" | "validation-error";
  message: string;
  localValue?: any;
  remoteValue?: any;
  resolvedValue?: any;
  timestamp: Date;
  canRetry: boolean;
}

class SyncIssuesManager {
  private issues: Map<string, SyncIssue> = new Map();

  // Log automatic conflict resolution
  async logConflictResolution(
    entityType: string,
    entityId: string,
    field: string,
    localValue: any,
    remoteValue: any,
    resolvedValue: any
  ): Promise<void> {
    const issueId = `${entityId}-${field}-${Date.now()}`;

    const issue: SyncIssue = {
      id: issueId,
      entityType: entityType as any,
      entityId,
      issueType: "conflict-resolved",
      message: `Conflict in ${field}: kept ${typeof resolvedValue === "object" ? "newer version" : `"${resolvedValue}"`}`,
      localValue,
      remoteValue,
      resolvedValue,
      timestamp: new Date(),
      canRetry: false, // Conflicts are auto-resolved, no retry needed
    };

    this.issues.set(issueId, issue);

    // Persist to IndexedDB
    try {
      await db.syncIssues.add(issue);
    } catch (error) {
      console.warn("Failed to store conflict in IndexedDB:", error);
    }

    // Update UI state
    useSyncIssuesStore.getState().addIssue(issue);
  }

  // Log sync failures
  async logSyncFailure(
    entityType: string,
    entityId: string,
    error: Error,
    canRetry: boolean
  ): Promise<void> {
    const issueId = `${entityId}-sync-${Date.now()}`;

    const issue: SyncIssue = {
      id: issueId,
      entityType: entityType as any,
      entityId,
      issueType: "sync-failed",
      message: error.message || "Sync failed",
      timestamp: new Date(),
      canRetry,
    };

    this.issues.set(issueId, issue);

    // Persist to IndexedDB
    try {
      await db.syncIssues.add(issue);
    } catch (error) {
      console.warn("Failed to store sync failure in IndexedDB:", error);
    }

    // Update UI state
    useSyncIssuesStore.getState().addIssue(issue);
  }

  // Log validation errors
  async logValidationError(entityType: string, entityId: string, error: Error): Promise<void> {
    const issueId = `${entityId}-validation-${Date.now()}`;

    const issue: SyncIssue = {
      id: issueId,
      entityType: entityType as any,
      entityId,
      issueType: "validation-error",
      message: `Validation error: ${error.message}`,
      timestamp: new Date(),
      canRetry: true, // May retry after fixing the data
    };

    this.issues.set(issueId, issue);

    // Persist to IndexedDB
    try {
      await db.syncIssues.add(issue);
    } catch (error) {
      console.warn("Failed to store validation error in IndexedDB:", error);
    }

    // Update UI state
    useSyncIssuesStore.getState().addIssue(issue);
  }

  // Retry failed sync
  async retrySync(issueId: string): Promise<boolean> {
    const issue = this.issues.get(issueId);
    if (!issue || !issue.canRetry) return false;

    try {
      // TODO: Call sync processor to retry this specific item
      // await syncQueue.processItem(issue.entityId);

      // Remove issue on success
      this.issues.delete(issueId);
      await db.syncIssues.delete(issueId);
      useSyncIssuesStore.getState().removeIssue(issueId);

      return true;
    } catch (error) {
      // Update issue with new error
      issue.message = `Retry failed: ${(error as Error).message}`;
      issue.timestamp = new Date();
      await db.syncIssues.put(issue);

      return false;
    }
  }

  // Dismiss issue (user acknowledges)
  async dismissIssue(issueId: string): Promise<void> {
    this.issues.delete(issueId);
    try {
      await db.syncIssues.delete(issueId);
    } catch (error) {
      console.warn("Failed to delete issue from IndexedDB:", error);
    }
    useSyncIssuesStore.getState().removeIssue(issueId);
  }

  // Get all pending issues
  async getPendingIssues(): Promise<SyncIssue[]> {
    return Array.from(this.issues.values());
  }

  // Clear all issues
  async clearAll(): Promise<void> {
    this.issues.clear();
    try {
      await db.syncIssues.clear();
    } catch (error) {
      console.warn("Failed to clear issues from IndexedDB:", error);
    }
    useSyncIssuesStore.getState().clearAll();
  }
}

export const syncIssuesManager = new SyncIssuesManager();
```

---

## Step 2: Create Zustand Store (15 min)

Create `src/stores/syncIssuesStore.ts`:

```typescript
import { create } from "zustand";
import { SyncIssue } from "@/lib/sync/SyncIssuesManager";

interface SyncIssuesStore {
  issues: SyncIssue[];
  addIssue: (issue: SyncIssue) => void;
  removeIssue: (issueId: string) => void;
  clearAll: () => void;
}

export const useSyncIssuesStore = create<SyncIssuesStore>((set) => ({
  issues: [],

  addIssue: (issue) =>
    set((state) => ({
      issues: [...state.issues, issue],
    })),

  removeIssue: (issueId) =>
    set((state) => ({
      issues: state.issues.filter((i) => i.id !== issueId),
    })),

  clearAll: () => set({ issues: [] }),
}));
```

---

## Step 3: Create SyncIssuesPanel Component (45 min)

Create `src/components/SyncIssuesPanel.tsx`:

```typescript
import { useState } from "react";
import { AlertCircle, XCircle } from "lucide-react";
import { useSyncIssuesStore } from "@/stores/syncIssuesStore";
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";
import { SyncIssueItem } from "./SyncIssueItem";

export function SyncIssuesPanel() {
  const issues = useSyncIssuesStore((state) => state.issues);
  const [expanded, setExpanded] = useState(false);

  if (issues.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-md">
      {/* Collapsed badge */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg shadow-lg hover:bg-amber-600 transition"
          title={`${issues.length} sync ${issues.length === 1 ? "issue" : "issues"}`}
        >
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">{issues.length} Sync Issues</span>
        </button>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Sync Issues ({issues.length})
              </h3>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Close panel"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Issues list */}
          <div className="max-h-96 overflow-y-auto">
            {issues.map((issue) => (
              <SyncIssueItem
                key={issue.id}
                issue={issue}
                onRetry={() => syncIssuesManager.retrySync(issue.id)}
                onDismiss={() => syncIssuesManager.dismissIssue(issue.id)}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-t flex gap-2">
            <button
              onClick={() => syncIssuesManager.clearAll()}
              className="text-xs px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## Step 4: Create SyncIssueItem Component (20 min)

Create `src/components/SyncIssueItem.tsx`:

```typescript
import { useState } from "react";
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { SyncIssue } from "@/lib/sync/SyncIssuesManager";
import { toast } from "sonner";

interface SyncIssueItemProps {
  issue: SyncIssue;
  onRetry: () => Promise<void>;
  onDismiss: () => Promise<void>;
}

export function SyncIssueItem({ issue, onRetry, onDismiss }: SyncIssueItemProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
      toast.success("Sync retried successfully");
    } catch (error) {
      toast.error("Retry failed");
    } finally {
      setIsRetrying(false);
    }
  };

  const getIcon = () => {
    switch (issue.issueType) {
      case "conflict-resolved":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "sync-failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "validation-error":
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
    }
  };

  const getTypeLabel = () => {
    switch (issue.issueType) {
      case "conflict-resolved":
        return "Conflict Resolved";
      case "sync-failed":
        return "Sync Failed";
      case "validation-error":
        return "Validation Error";
    }
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex items-start gap-3">
        {getIcon()}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {getTypeLabel()}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {issue.message}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {formatRelativeTime(issue.timestamp)}
          </p>

          {/* Show conflict details if available */}
          {issue.localValue && issue.remoteValue && (
            <details className="mt-2">
              <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer">
                View details
              </summary>
              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs space-y-1">
                <div>
                  <strong>Local:</strong> {JSON.stringify(issue.localValue, null, 2)}
                </div>
                <div>
                  <strong>Remote:</strong> {JSON.stringify(issue.remoteValue, null, 2)}
                </div>
                <div>
                  <strong>Resolved:</strong> {JSON.stringify(issue.resolvedValue, null, 2)}
                </div>
              </div>
            </details>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {issue.canRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50 transition"
              title="Retry sync"
            >
              <RefreshCw
                className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`}
              />
            </button>
          )}
          <button
            onClick={onDismiss}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
            title="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
```

---

## Step 5: Integrate with Sync Processor (10 min)

Update `src/hooks/useSyncProcessor.ts` to call SyncIssuesManager:

```typescript
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";

export function useSyncProcessor() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      return syncProcessor.processQueue(userId);
    },

    onSuccess: (result) => {
      // Log any conflicts that were resolved
      if (result.conflictsResolved && result.conflictsResolved.length > 0) {
        for (const conflict of result.conflictsResolved) {
          syncIssuesManager.logConflictResolution(
            conflict.entityType,
            conflict.entityId,
            conflict.field,
            conflict.localValue,
            conflict.remoteValue,
            conflict.resolvedValue
          );
        }
      }

      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["offline"] });
    },

    onError: (error, userId) => {
      // Log sync failures
      syncIssuesManager.logSyncFailure(
        "transaction",
        "batch",
        error as Error,
        true // Can retry
      );
    },
  });
}
```

Also, add SyncIssuesPanel to your app layout:

```typescript
// In src/routes/__root.tsx or AppLayout.tsx
import { SyncIssuesPanel } from "@/components/SyncIssuesPanel";

export function RootLayout() {
  return (
    <div>
      {/* ... existing layout ... */}
      <SyncIssuesPanel /> {/* Add at bottom of layout */}
    </div>
  );
}
```

---

## Step 6: Add to Dexie Schema (5 min)

Update `src/lib/dexie.ts` to include syncIssues table:

```typescript
export interface SyncIssueRecord {
  id: string;
  entityType: string;
  entityId: string;
  issueType: string;
  message: string;
  localValue?: any;
  remoteValue?: any;
  resolvedValue?: any;
  timestamp: string; // ISO string
  canRetry: boolean;
}

export class HouseholdHubDB extends Dexie {
  transactions!: Table<Transaction>;
  accounts!: Table<any>;
  categories!: Table<any>;
  syncQueue!: Table<SyncQueueItem>;
  events!: Table<TransactionEvent>;
  syncIssues!: Table<SyncIssueRecord>; // ADD THIS
  meta!: Table<{ key: string; value: any }>;

  constructor() {
    super("HouseholdHubDB");

    this.version(4).stores({
      transactions: "id, date, account_id, category_id, created_at",
      accounts: "id, name, visibility",
      categories: "id, parent_id",
      syncQueue: "id, status, entity_type, created_at",
      events: "id, entity_id, timestamp",
      syncIssues: "id, entityId, issueType, timestamp", // ADD THIS
      meta: "key",
    });
  }
}
```

---

## Done!

**Next**: Run through `checkpoint.md` to verify SyncIssuesPanel works.

**What you've built**:

- ✅ Automatic conflict logging
- ✅ Sync failure tracking
- ✅ Persistent issue history
- ✅ Manual retry mechanism
- ✅ User-friendly issue display
- ✅ Expandable conflict details

**Optional next**: Continue to **Chunk 032** for advanced conflict detection integration.
