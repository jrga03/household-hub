# Sync Engine Architecture

## Overview

The sync engine enables seamless offline-first functionality with automatic conflict resolution, ensuring data consistency across multiple devices and users.

## Table of Contents

### Core Architecture

- [Implementation Phases](#implementation-phases) - Phase A (MVP), B (Enhanced), C (Advanced)
- [Core Concepts](#core-concepts) - Event sourcing, three-layer storage
- [Event Structure](#1-event-structure) - Event schema, idempotency keys, vector clocks
- [Sync State Machine](#2-sync-state-machine) - Queue states and transitions
- [Idempotency Key Generation](#3-idempotency-key-generation) - Deterministic key creation

### Conflict Resolution

- [Per-Entity Conflict Resolution](#4-per-entity-conflict-resolution) - Vector clock comparison
- [Conflict Resolution Matrix](#4a-conflict-resolution-matrix-explicit-rules) - Field-level merge rules
- [Background Sync Fallbacks](#4b-background-sync-fallbacks-ios-support) - iOS Safari strategies

### Data Management

- [Offline Detection & Recovery](#5-offline-detection--recovery) - Network monitoring
- [Realtime Subscriptions](#5-realtime-subscriptions) - Supabase realtime integration
- [Device Identification](#6-device-identification-hybrid-approach) - Hybrid fingerprinting
- [Event Compaction Strategy](#7-event-compaction-strategy) - Preventing unbounded growth
- [Data Integrity](#8-data-integrity) - Checksums and verification

### Operations

- [Service Worker](#7-service-worker) - Background sync implementation
- [Performance Optimization](#8-performance-optimization) - Batching, delta sync, compression
- [Sync States](#sync-states) - State enum and status tracking
- [Error Handling](#error-handling) - Retries and recovery

### Observability & Maintenance

- [Observability & Debugging](#observability--debugging) - Correlation IDs, metrics
- [Sync Metrics Collection](#sync-metrics-collection) - Performance tracking
- [Dexie Schema Versioning](#dexie-schema-versioning--migrations) - Migration strategy
- [Browser Storage Quota Management](#browser-storage-quota-management) - Quota monitoring

### Testing & Best Practices

- [Testing](#testing) - Sync engine tests
- [Monitoring](#monitoring) - Health status tracking
- [Best Practices](#best-practices) - 10 key principles

---

### Implementation Phases

**Phase A (MVP - Simple Event Sourcing)**

- Event-based architecture from the start (no migration later)
- Simple Last-Write-Wins (LWW) conflict resolution
- Basic idempotency with deterministic keys
- Manual sync fallbacks for iOS Safari

**Phase B (Enhanced Sync)**

- Add vector clocks for better conflict detection
- Implement device-specific conflict tracking
- Advanced compaction strategies

**Phase C (Advanced Features)**

- Field-level merge strategies
- Conflict resolution UI (if needed)
- Custom merge functions per entity type

## Core Concepts

### Event Sourcing

Every change is stored as an immutable event, enabling:

- Complete audit trail
- Time-travel debugging
- Conflict-free replication
- Rollback capability

### Three-Layer Storage

```
┌─────────────────────────────────────┐
│         Zustand (UI State)          │ ← Immediate UI updates
├─────────────────────────────────────┤
│      IndexedDB (Persistent)         │ ← Offline storage
├─────────────────────────────────────┤
│     Supabase (Cloud Source)         │ ← Source of truth
└─────────────────────────────────────┘
```

## Implementation

### 1. Event Structure

```typescript
interface TransactionEvent {
  id: string;
  entityType: "transaction" | "account" | "category" | "budget";
  entityId: string; // The specific entity this event applies to
  op: "create" | "update" | "delete";
  payload: any; // Changed fields only for updates
  timestamp: number;
  actorUserId: string;
  deviceId: string; // From browser fingerprinting

  // Idempotency to prevent duplicate processing
  idempotencyKey: string; // Deterministic: ${deviceId}-${entityType}-${entityId}-${lamportClock}
  eventVersion: number; // Schema version for forward compatibility

  // Per-entity vector clock for conflict resolution
  lamportClock: number; // Increments per entity
  vectorClock: VectorClock; // Scoped to this specific entity

  // For integrity
  checksum: string;
}

// Each entity maintains its own vector clock
interface VectorClock {
  [deviceId: string]: number; // Clock value per device for THIS entity
}
```

### 2. Sync State Machine

```typescript
// Sync states follow a clear progression
type SyncState =
  | "draft" // Local change not yet queued
  | "queued" // Added to sync queue
  | "syncing" // Currently being sent to server
  | "acked" // Server acknowledged receipt
  | "confirmed" // Confirmed by other devices
  | "failed"; // Sync failed after retries

interface SyncQueueItem {
  id: string;
  entityType: "transaction" | "category" | "account" | "budget";
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: any;
  deviceId: string; // Browser fingerprint
  state: SyncState;
  timestamp: number;
  retries: number;
  maxRetries: 3;
  errorMessage?: string;
  lamportClock: number;
  vectorClock: VectorClock;
}

class SyncQueue {
  private db: Dexie;
  private queue: Table<SyncQueueItem>;

  async add(item: Omit<QueueItem, "id" | "retries" | "status">): Promise<void> {
    await this.queue.add({
      ...item,
      id: nanoid(),
      retries: 0,
      status: "pending",
    });

    // Trigger immediate sync if online
    if (navigator.onLine) {
      this.process();
    }
  }

  async process(): Promise<void> {
    const pending = await this.queue.where("status").equals("pending").toArray();

    for (const item of pending) {
      await this.processItem(item);
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    try {
      // Mark as processing
      await this.queue.update(item.id, { status: "processing" });

      // Attempt sync
      await this.syncToSupabase(item);

      // Mark as completed
      await this.queue.update(item.id, { status: "completed" });

      // Clean up after success
      await this.queue.delete(item.id);
    } catch (error) {
      await this.handleSyncError(item, error);
    }
  }

  private async handleSyncError(item: QueueItem, error: Error): Promise<void> {
    const retries = item.retries + 1;

    if (retries >= item.maxRetries) {
      await this.queue.update(item.id, {
        status: "failed",
        error: error.message,
      });

      // Notify user of sync failure
      this.notifyFailure(item);
    } else {
      await this.queue.update(item.id, {
        status: "pending",
        retries,
        error: error.message,
      });

      // Exponential backoff
      setTimeout(() => this.processItem(item), Math.pow(2, retries) * 1000);
    }
  }
}
```

### 3. Idempotency Key Generation

```typescript
class IdempotencyKeyGenerator {
  // Generate deterministic keys to prevent duplicate event processing

  generateKey(
    deviceId: string,
    entityType: string,
    entityId: string,
    lamportClock: number
  ): string {
    // Deterministic format ensures same event generates same key
    return `${deviceId}-${entityType}-${entityId}-${lamportClock}`;
  }

  async createEvent(
    entityType: string,
    entityId: string,
    operation: "create" | "update" | "delete",
    payload: any
  ): Promise<TransactionEvent> {
    const deviceId = await deviceManager.getDeviceId();
    const lamportClock = await this.getNextLamportClock(entityId);

    return {
      id: nanoid(),
      entityType,
      entityId,
      op: operation,
      payload,
      timestamp: Date.now(),
      actorUserId: await this.getCurrentUserId(),
      deviceId,
      idempotencyKey: this.generateKey(deviceId, entityType, entityId, lamportClock),
      eventVersion: 1,
      lamportClock,
      vectorClock: await this.updateVectorClock(entityId, deviceId),
      checksum: await this.calculateChecksum(payload),
    };
  }

  private async getNextLamportClock(entityId: string): Promise<number> {
    // Get highest lamport clock for this entity and increment
    const events = await db.events.where("entityId").equals(entityId).toArray();

    const maxClock = events.reduce((max, e) => Math.max(max, e.lamportClock), 0);
    return maxClock + 1;
  }
}
```

### 4. Per-Entity Conflict Resolution

```typescript
class ConflictResolver {
  // Each entity has its own vector clock for independent conflict resolution

  resolveEntityConflict(
    entityId: string,
    localEvent: TransactionEvent,
    remoteEvent: TransactionEvent
  ): TransactionEvent {
    // Vector clocks are scoped to this specific entity
    const comparison = this.compareVectorClocks(localEvent.vectorClock, remoteEvent.vectorClock);

    switch (comparison) {
      case "concurrent":
        // Conflict detected - use field-level last-write-wins
        return this.fieldLevelMerge(localEvent, remoteEvent);

      case "local-ahead":
        return localEvent;

      case "remote-ahead":
        return remoteEvent;

      case "equal":
        return localEvent; // They're the same
    }
  }

  private fieldLevelMerge(local: TransactionEvent, remote: TransactionEvent): TransactionEvent {
    // For concurrent updates, merge at field level
    const merged = { ...remote.payload };

    // Use lamport clock + deviceId for deterministic ordering
    const localOrder = `${local.lamportClock}-${local.deviceId}`;
    const remoteOrder = `${remote.lamportClock}-${remote.deviceId}`;

    if (localOrder > remoteOrder) {
      // Local wins for conflicting fields
      Object.assign(merged, local.payload);
    }

    return {
      ...local,
      payload: merged,
      vectorClock: this.mergeVectorClocks(local.vectorClock, remote.vectorClock),
    };
  }

  private mergeVectorClocks(v1: VectorClock, v2: VectorClock): VectorClock {
    const merged: VectorClock = {};
    const devices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

    for (const device of devices) {
      merged[device] = Math.max(v1[device] || 0, v2[device] || 0);
    }

    return merged;
  }

  private compareVectorClocks(
    v1: VectorClock,
    v2: VectorClock
  ): "concurrent" | "local-ahead" | "remote-ahead" | "equal" {
    const devices = new Set([...Object.keys(v1), ...Object.keys(v2)]);

    let v1Ahead = false;
    let v2Ahead = false;

    for (const device of devices) {
      const t1 = v1[device] || 0;
      const t2 = v2[device] || 0;

      if (t1 > t2) v1Ahead = true;
      if (t2 > t1) v2Ahead = true;
    }

    if (v1Ahead && v2Ahead) return "concurrent";
    if (v1Ahead) return "local-ahead";
    if (v2Ahead) return "remote-ahead";
    return "equal";
  }
}
```

### 4a. Conflict Resolution Matrix (Explicit Rules)

Based on Decision #78, here's the deterministic conflict resolution strategy for each entity type:

```typescript
interface ConflictResolutionRules {
  transactions: {
    // Field-level merge strategy
    amount_cents: "last-write-wins";
    description: "last-write-wins";
    category_id: "last-write-wins";
    status: "cleared-wins"; // 'cleared' always beats 'pending'
    notes: "concatenate"; // Merge both versions
    deleted: "delete-wins"; // DELETE always wins over UPDATE
  };

  accounts: {
    name: "last-write-wins";
    color: "last-write-wins";
    initial_balance_cents: "last-write-wins";
    is_active: "false-wins"; // Deactivation wins
  };

  categories: {
    name: "last-write-wins";
    color: "last-write-wins";
    parent_id: "last-write-wins";
    is_active: "false-wins";
  };

  budgets: {
    amount_cents: "last-write-wins"; // Simple reference value
  };
}

class ConflictResolutionEngine {
  resolveConflict(
    entityType: string,
    field: string,
    localValue: any,
    remoteValue: any,
    localTimestamp: number,
    remoteTimestamp: number
  ): any {
    const rules = this.getResolutionRules(entityType, field);

    switch (rules) {
      case "last-write-wins":
        // Server timestamp is canonical
        return remoteTimestamp > localTimestamp ? remoteValue : localValue;

      case "cleared-wins":
        // Special case for transaction status
        if (localValue === "cleared" || remoteValue === "cleared") {
          return "cleared";
        }
        return remoteTimestamp > localTimestamp ? remoteValue : localValue;

      case "false-wins":
        // For deactivation scenarios
        if (localValue === false || remoteValue === false) {
          return false;
        }
        return remoteTimestamp > localTimestamp ? remoteValue : localValue;

      case "delete-wins":
        // DELETE operations always take precedence
        if (localValue === "DELETED" || remoteValue === "DELETED") {
          return "DELETED";
        }
        return remoteTimestamp > localTimestamp ? remoteValue : localValue;

      case "concatenate":
        // Merge text fields (e.g., notes)
        if (localValue === remoteValue) return localValue;
        if (!localValue) return remoteValue;
        if (!remoteValue) return localValue;
        return `${localValue}\n---\n${remoteValue}`;

      default:
        // Default to LWW
        return remoteTimestamp > localTimestamp ? remoteValue : localValue;
    }
  }

  private getResolutionRules(entityType: string, field: string): string {
    const rules = {
      transactions: {
        amount_cents: "last-write-wins",
        description: "last-write-wins",
        category_id: "last-write-wins",
        status: "cleared-wins",
        notes: "concatenate",
        deleted: "delete-wins",
      },
      accounts: {
        name: "last-write-wins",
        color: "last-write-wins",
        initial_balance_cents: "last-write-wins",
        is_active: "false-wins",
      },
      categories: {
        name: "last-write-wins",
        color: "last-write-wins",
        parent_id: "last-write-wins",
        is_active: "false-wins",
      },
      budgets: {
        amount_cents: "last-write-wins",
      },
    };

    return rules[entityType]?.[field] || "last-write-wins";
  }

  // Log conflicts for optional review
  async logConflict(
    entityType: string,
    entityId: string,
    field: string,
    localValue: any,
    remoteValue: any,
    resolvedValue: any
  ): Promise<void> {
    console.log("Conflict resolved:", {
      entityType,
      entityId,
      field,
      local: localValue,
      remote: remoteValue,
      resolved: resolvedValue,
      resolution: localValue === resolvedValue ? "local-won" : "remote-won",
    });

    // Optionally store in a conflicts table for user review
    await db.conflicts.add({
      entityType,
      entityId,
      field,
      localValue,
      remoteValue,
      resolvedValue,
      resolvedAt: new Date(),
    });
  }
}
```

### 4b. Background Sync Fallbacks (iOS Support)

```typescript
class BackgroundSyncManager {
  private syncRegistration: ServiceWorkerRegistration | null = null;
  private fallbackTimer: number | null = null;

  async initialize(): Promise<void> {
    // Try to use Background Sync API where available
    if ("serviceWorker" in navigator && "sync" in ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        this.syncRegistration = registration;

        // Register for background sync
        await this.registerBackgroundSync();
      } catch (error) {
        console.warn("Background Sync not available, using fallbacks", error);
        this.initializeFallbacks();
      }
    } else {
      // Background Sync not supported (iOS Safari)
      this.initializeFallbacks();
    }
  }

  private async registerBackgroundSync(): Promise<void> {
    if (!this.syncRegistration) return;

    try {
      await (this.syncRegistration as any).sync.register("data-sync");
      console.log("Background sync registered");
    } catch (error) {
      console.warn("Background sync registration failed", error);
      this.initializeFallbacks();
    }
  }

  private initializeFallbacks(): void {
    // Fallback 1: Sync on visibility change
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.triggerSync("visibility-change");
      }
    });

    // Fallback 2: Sync on focus
    window.addEventListener("focus", () => {
      this.triggerSync("window-focus");
    });

    // Fallback 3: Sync on online event
    window.addEventListener("online", () => {
      this.triggerSync("network-online");
    });

    // Fallback 4: Periodic sync while app is open
    this.startPeriodicSync();
  }

  private startPeriodicSync(): void {
    // Sync every 5 minutes while app is open
    this.fallbackTimer = window.setInterval(
      () => {
        if (navigator.onLine && !document.hidden) {
          this.triggerSync("periodic-timer");
        }
      },
      5 * 60 * 1000
    );
  }

  private async triggerSync(trigger: string): Promise<void> {
    console.log(`Triggering sync from: ${trigger}`);

    // Check if there are pending changes
    const pendingCount = await this.getPendingChangesCount();
    if (pendingCount === 0) return;

    // Update sync status UI
    this.updateSyncStatus("syncing", pendingCount);

    try {
      await syncQueue.process();
      this.updateSyncStatus("success", 0);
    } catch (error) {
      this.updateSyncStatus("error", pendingCount);
    }
  }

  private updateSyncStatus(status: "idle" | "syncing" | "success" | "error", count: number): void {
    // Update UI to show sync status
    useSyncStore.getState().updateStatus({
      status,
      pendingCount: count,
      lastSync: status === "success" ? new Date() : undefined,
    });
  }

  private async getPendingChangesCount(): Promise<number> {
    return await db.syncQueue.where("status").equals("queued").count();
  }

  cleanup(): void {
    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
    }
  }
}

// Initialize on app start
const backgroundSyncManager = new BackgroundSyncManager();
```

### 4c. Sync Issues UI (Phase A MVP)

When automatic conflict resolution occurs or sync errors happen, users need visibility. This UI provides transparency and manual control when needed.

```typescript
// src/components/SyncStatusPanel.tsx
import { AlertCircle, CheckCircle, RefreshCw, XCircle } from 'lucide-react';

interface SyncIssue {
  id: string;
  entityType: 'transaction' | 'account' | 'category' | 'budget';
  entityId: string;
  issueType: 'conflict-resolved' | 'sync-failed' | 'validation-error';
  message: string;
  localValue?: any;
  remoteValue?: any;
  resolvedValue?: any;
  timestamp: Date;
  canRetry: boolean;
}

class SyncIssuesManager {
  private issues: Map<string, SyncIssue> = new Map();

  // Store conflict resolution for user review
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
      issueType: 'conflict-resolved',
      message: `Conflict in ${field}: automatically resolved to ${resolvedValue}`,
      localValue,
      remoteValue,
      resolvedValue,
      timestamp: new Date(),
      canRetry: false
    };

    this.issues.set(issueId, issue);

    // Persist to IndexedDB for review
    await db.syncIssues.add(issue);

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
      issueType: 'sync-failed',
      message: error.message,
      timestamp: new Date(),
      canRetry
    };

    this.issues.set(issueId, issue);
    await db.syncIssues.add(issue);
    useSyncIssuesStore.getState().addIssue(issue);
  }

  // Retry failed sync
  async retrySync(issueId: string): Promise<boolean> {
    const issue = this.issues.get(issueId);
    if (!issue || !issue.canRetry) return false;

    try {
      // Retry the sync operation
      await syncQueue.processItem(issue.entityId);

      // Remove issue on success
      this.issues.delete(issueId);
      await db.syncIssues.delete(issueId);
      useSyncIssuesStore.getState().removeIssue(issueId);

      return true;
    } catch (error) {
      // Update issue with new error
      issue.message = `Retry failed: ${error.message}`;
      issue.timestamp = new Date();
      await db.syncIssues.put(issue);

      return false;
    }
  }

  // Dismiss issue (user acknowledges)
  async dismissIssue(issueId: string): Promise<void> {
    this.issues.delete(issueId);
    await db.syncIssues.delete(issueId);
    useSyncIssuesStore.getState().removeIssue(issueId);
  }

  // Get all pending issues
  async getPendingIssues(): Promise<SyncIssue[]> {
    return Array.from(this.issues.values());
  }
}

export const syncIssuesManager = new SyncIssuesManager();

// React component for sync issues panel
export function SyncIssuesPanel() {
  const issues = useSyncIssuesStore(state => state.issues);
  const [expanded, setExpanded] = useState(false);

  if (issues.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 max-w-md">
      {/* Collapsed badge */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg shadow-lg hover:bg-amber-600 transition"
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
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Issues list */}
          <div className="max-h-96 overflow-y-auto">
            {issues.map(issue => (
              <SyncIssueItem
                key={issue.id}
                issue={issue}
                onRetry={() => syncIssuesManager.retrySync(issue.id)}
                onDismiss={() => syncIssuesManager.dismissIssue(issue.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Individual issue item component
function SyncIssueItem({
  issue,
  onRetry,
  onDismiss
}: {
  issue: SyncIssue;
  onRetry: () => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
      toast.success('Sync retried successfully');
    } catch (error) {
      toast.error('Retry failed');
    } finally {
      setIsRetrying(false);
    }
  };

  const getIcon = () => {
    switch (issue.issueType) {
      case 'conflict-resolved':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'sync-failed':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'validation-error':
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex items-start gap-3">
        {getIcon()}

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {issue.entityType.charAt(0).toUpperCase() + issue.entityType.slice(1)}
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
              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs">
                <div><strong>Local:</strong> {JSON.stringify(issue.localValue)}</div>
                <div className="mt-1"><strong>Remote:</strong> {JSON.stringify(issue.remoteValue)}</div>
                <div className="mt-1"><strong>Resolved:</strong> {JSON.stringify(issue.resolvedValue)}</div>
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
              className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50"
              title="Retry sync"
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            onClick={onDismiss}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            title="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Zustand store for sync issues
interface SyncIssuesStore {
  issues: SyncIssue[];
  addIssue: (issue: SyncIssue) => void;
  removeIssue: (issueId: string) => void;
  clearAll: () => void;
}

export const useSyncIssuesStore = create<SyncIssuesStore>((set) => ({
  issues: [],
  addIssue: (issue) => set((state) => ({
    issues: [...state.issues, issue]
  })),
  removeIssue: (issueId) => set((state) => ({
    issues: state.issues.filter(i => i.id !== issueId)
  })),
  clearAll: () => set({ issues: [] })
}));

// Helper function
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
```

**Key Features**:

1. **Conflict Logging**: All automatic resolutions are logged for transparency
2. **Retry Mechanism**: Failed syncs can be manually retried
3. **Dismissal**: Users can acknowledge and dismiss issues
4. **Details View**: Expandable conflict details show local/remote/resolved values
5. **Persistent Storage**: Issues stored in IndexedDB survive page reloads
6. **Real-time Updates**: Zustand store provides reactive UI updates

**Related**:

- [DATABASE.md](./DATABASE.md) - Event retention policy
- [DECISIONS.md](./DECISIONS.md) - Decision #77 (conflict resolution matrix)
- [RLS-POLICIES.md](./RLS-POLICIES.md) - Edge case testing

### 5. Offline Detection & Recovery

```typescript
class OfflineManager {
  private isOnline = navigator.onLine;
  private offlineSince?: Date;
  private syncQueue: SyncQueue;

  constructor() {
    this.setupEventListeners();
    this.startHeartbeat();
  }

  private setupEventListeners(): void {
    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
  }

  private startHeartbeat(): void {
    // Verify connectivity every 30 seconds
    setInterval(async () => {
      try {
        const response = await fetch("/api/ping", {
          method: "HEAD",
          cache: "no-cache",
        });

        if (!this.isOnline && response.ok) {
          this.handleOnline();
        }
      } catch {
        if (this.isOnline) {
          this.handleOffline();
        }
      }
    }, 30000);
  }

  private handleOnline = async (): Promise<void> => {
    this.isOnline = true;
    const offlineDuration = this.offlineSince ? Date.now() - this.offlineSince.getTime() : 0;

    console.log(`Back online after ${offlineDuration}ms`);

    // Process sync queue
    await this.syncQueue.process();

    // Pull latest changes
    await this.pullRemoteChanges();

    // Update UI
    this.notifyOnline();

    this.offlineSince = undefined;
  };

  private handleOffline = (): void => {
    this.isOnline = false;
    this.offlineSince = new Date();

    console.log("Gone offline");

    // Update UI
    this.notifyOffline();
  };

  private async pullRemoteChanges(): Promise<void> {
    // Get last sync timestamp
    const lastSync = await this.getLastSyncTime();

    // Fetch changes since last sync
    const changes = await supabase
      .from("transactions")
      .select("*")
      .gt("updated_at", lastSync)
      .order("updated_at");

    // Apply changes locally
    await this.applyRemoteChanges(changes.data);

    // Update last sync time
    await this.setLastSyncTime(new Date());
  }
}
```

### 5. Realtime Subscriptions

```typescript
class RealtimeSync {
  private subscription?: RealtimeChannel;

  async initialize(): Promise<void> {
    // Subscribe to changes
    this.subscription = supabase
      .channel('transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `account_type=eq.joint,created_by=neq.${userId}`
        },
        this.handleRealtimeChange
      )
      .subscribe();
  }

  private handleRealtimeChange = async (payload: any): Promise<void> {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    switch (eventType) {
      case 'INSERT':
        await this.handleInsert(newRecord);
        break;

      case 'UPDATE':
        await this.handleUpdate(newRecord, oldRecord);
        break;

      case 'DELETE':
        await this.handleDelete(oldRecord);
        break;
    }

    // Update UI
    this.notifyChange(eventType, newRecord || oldRecord);
  };

  private async handleInsert(record: Transaction): Promise<void> {
    // Add to local database
    await db.transactions.add(record);

    // Update UI state
    useTransactionStore.getState().addTransaction(record);
  }

  private async handleUpdate(
    newRecord: Transaction,
    oldRecord: Transaction
  ): Promise<void> {
    // Check for conflicts
    const localRecord = await db.transactions.get(newRecord.id);

    if (localRecord && localRecord.updatedAt > oldRecord.updatedAt) {
      // Local changes exist - resolve conflict
      const resolved = conflictResolver.resolve(localRecord, newRecord);
      await db.transactions.put(resolved);

      // Notify user of conflict resolution
      if (resolved.id !== localRecord.id) {
        this.notifyConflictResolved(localRecord, newRecord, resolved);
      }
    } else {
      // No conflict - apply update
      await db.transactions.put(newRecord);
    }

    // Update UI state
    useTransactionStore.getState().updateTransaction(newRecord);
  }

  private async handleDelete(record: Transaction): Promise<void> {
    // Remove from local database
    await db.transactions.delete(record.id);

    // Update UI state
    useTransactionStore.getState().removeTransaction(record.id);
  }

  async cleanup(): Promise<void> {
    if (this.subscription) {
      await supabase.removeChannel(this.subscription);
    }
  }
}
```

### 6. Device Identification (Hybrid Approach)

```typescript
import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { db } from "./dexie"; // Dexie database instance

class DeviceManager {
  private deviceId: string | null = null;
  private fpPromise: Promise<any> | null = null;

  async getDeviceId(): Promise<string> {
    // Return cached if available
    if (this.deviceId) return this.deviceId;

    // Try 1: Check IndexedDB (survives normal browser sessions)
    try {
      const stored = await db.meta.get("deviceId");
      if (stored?.value) {
        this.deviceId = stored.value;
        // Also update localStorage for redundancy
        localStorage.setItem("deviceId", this.deviceId);
        return this.deviceId;
      }
    } catch (error) {
      console.warn("IndexedDB device ID lookup failed:", error);
    }

    // Try 2: Check localStorage (backup storage)
    const localStorageId = localStorage.getItem("deviceId");
    if (localStorageId) {
      this.deviceId = localStorageId;
      // Store in IndexedDB for next time
      await this.storeDeviceId(this.deviceId);
      return this.deviceId;
    }

    // Try 3: Use FingerprintJS (survives cache clearing)
    try {
      if (!this.fpPromise) {
        this.fpPromise = FingerprintJS.load();
      }
      const fp = await this.fpPromise;
      const result = await fp.get();

      // Use visitor ID as device identifier
      this.deviceId = result.visitorId;

      // Store in both places for redundancy
      await this.storeDeviceId(this.deviceId);

      console.log("Device ID generated from fingerprint:", this.deviceId);
      return this.deviceId;
    } catch (error) {
      console.error("Fingerprinting failed, generating UUID:", error);

      // Final fallback: Generate new UUID
      this.deviceId = this.generateUUID();
      await this.storeDeviceId(this.deviceId);
      return this.deviceId;
    }
  }

  private async storeDeviceId(deviceId: string): Promise<void> {
    // Store in both IndexedDB and localStorage for redundancy
    try {
      await db.meta.put({ key: "deviceId", value: deviceId });
    } catch (error) {
      console.warn("Failed to store device ID in IndexedDB:", error);
    }

    localStorage.setItem("deviceId", deviceId);

    // Update user profile with device ID
    await this.updateUserDevice();
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private async updateUserDevice(): Promise<void> {
    // Register device in devices table (Decision #82 - devices promoted to MVP)
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return;

      // Check if device already exists
      const { data: existing } = await supabase
        .from("devices")
        .select("id")
        .eq("id", this.deviceId)
        .single();

      if (!existing) {
        // Register new device
        await supabase.from("devices").insert({
          id: this.deviceId,
          user_id: user.user.id,
          household_id: "00000000-0000-0000-0000-000000000001", // Default household
          name: this.detectDeviceName(), // e.g., "Chrome on macOS"
          platform: this.detectPlatform(), // e.g., "pwa-ios", "web"
          fingerprint: this.deviceId, // Store for continuity
          is_active: true,
        });

        console.log("Device registered:", this.deviceId);
      } else {
        // Update last_seen timestamp
        await supabase
          .from("devices")
          .update({ last_seen: new Date().toISOString() })
          .eq("id", this.deviceId);
      }
    } catch (error) {
      console.warn("Failed to register device:", error);
    }
  }

  private detectDeviceName(): string {
    const ua = navigator.userAgent;
    const browser = this.detectBrowser(ua);
    const os = this.detectOS(ua);
    return `${browser} on ${os}`;
  }

  private detectPlatform(): string {
    // Check if PWA
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) {
      if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return "pwa-ios";
      if (/Android/.test(navigator.userAgent)) return "pwa-android";
      return "pwa-desktop";
    }
    return "web";
  }

  private detectBrowser(ua: string): string {
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Edge")) return "Edge";
    return "Unknown Browser";
  }

  private detectOS(ua: string): string {
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
    return "Unknown OS";
  }

  // Method to handle device ID migration/merge if needed
  async mergeDeviceHistory(oldDeviceId: string, newDeviceId: string): Promise<void> {
    // This can be used to merge vector clocks if device ID changes
    console.log(`Merging device history from ${oldDeviceId} to ${newDeviceId}`);

    // Update all events with old device ID to new one
    // This maintains vector clock continuity
    await supabase
      .from("transaction_events")
      .update({ device_id: newDeviceId })
      .eq("device_id", oldDeviceId);
  }
}

// Singleton instance
export const deviceManager = new DeviceManager();

// Note: This hybrid approach ensures device ID persistence even when:
// - Browser cache is cleared on close
// - localStorage is cleared
// - Cookies are deleted
// The fingerprint fallback provides continuity for the specific use case
// where privacy is not a concern (private household app).
```

### 7. Event Compaction Strategy

```typescript
class EventCompactor {
  // Compact events to prevent unbounded growth

  async compactEventsForEntity(entityId: string, entityType: string): Promise<void> {
    // Get all events for this entity
    const events = await supabase
      .from("transaction_events")
      .select("*")
      .eq("entity_id", entityId)
      .eq("entity_type", entityType)
      .order("lamport_clock", { ascending: true });

    if (events.data.length < 100) {
      // Don't compact if under threshold
      return;
    }

    // Create snapshot of current state
    const snapshot = await this.createSnapshot(entityId, entityType, events.data);

    // Start transaction
    const { error: txError } = await supabase.rpc("begin_transaction");
    if (txError) throw txError;

    try {
      // Insert snapshot event
      await supabase.from("transaction_events").insert({
        entity_id: entityId,
        entity_type: entityType,
        op: "snapshot",
        payload: snapshot,
        lamport_clock: snapshot.lamport_clock,
        vector_clock: snapshot.vector_clock,
        device_id: await deviceManager.getDeviceId(),
        actor_user_id: (await supabase.auth.getUser()).data.user?.id,
      });

      // Delete old events (keep last 10 for safety)
      const eventsToDelete = events.data.slice(0, -10);
      await supabase
        .from("transaction_events")
        .delete()
        .in(
          "id",
          eventsToDelete.map((e) => e.id)
        );

      // Commit transaction
      await supabase.rpc("commit_transaction");
    } catch (error) {
      // Rollback on error
      await supabase.rpc("rollback_transaction");
      throw error;
    }
  }

  private async createSnapshot(
    entityId: string,
    entityType: string,
    events: TransactionEvent[]
  ): Promise<any> {
    // Replay events to build current state
    let state: any = {};
    let maxLamport = 0;
    const vectorClock: VectorClock = {};
    const deviceLastSeen: Record<string, number> = {};

    for (const event of events) {
      // Apply event to state
      switch (event.op) {
        case "create":
          state = event.payload;
          break;
        case "update":
          Object.assign(state, event.payload);
          break;
        case "delete":
          state = { deleted: true, deletedAt: event.timestamp };
          break;
      }

      // Update clocks
      maxLamport = Math.max(maxLamport, event.lamport_clock);

      // Merge vector clocks and track device activity
      for (const [device, clock] of Object.entries(event.vector_clock)) {
        vectorClock[device] = Math.max(vectorClock[device] || 0, clock);
        deviceLastSeen[device] = event.timestamp;
      }
    }

    // Compact vector clocks - remove devices inactive > 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const compactedVectorClock = await this.compactVectorClock(
      vectorClock,
      deviceLastSeen,
      thirtyDaysAgo
    );

    return {
      ...state,
      lamport_clock: maxLamport,
      vector_clock: compactedVectorClock,
      snapshot_timestamp: new Date().toISOString(),
    };
  }

  private async compactVectorClock(
    vectorClock: VectorClock,
    deviceLastSeen: Record<string, number>,
    cutoffTime: number
  ): Promise<VectorClock> {
    const compacted: VectorClock = {};
    let historicalMax = 0;

    for (const [device, clock] of Object.entries(vectorClock)) {
      const lastSeen = deviceLastSeen[device] || 0;

      if (lastSeen > cutoffTime) {
        // Keep active device entries
        compacted[device] = clock;
      } else {
        // Compact inactive devices into historical counter
        historicalMax = Math.max(historicalMax, clock);
      }
    }

    // Add historical counter if any devices were compacted
    if (historicalMax > 0) {
      compacted["_historical"] = historicalMax;
    }

    return compacted;
  }

  // Schedule periodic compaction
  async scheduleCompaction(): Promise<void> {
    // Run every 24 hours
    setInterval(
      async () => {
        try {
          // Get entities with many events
          const entities = await supabase
            .from("transaction_events")
            .select("entity_id, entity_type, count")
            .group("entity_id, entity_type")
            .having("count", "gte", 100);

          for (const entity of entities.data) {
            await this.compactEventsForEntity(entity.entity_id, entity.entity_type);
          }
        } catch (error) {
          console.error("Compaction failed:", error);
        }
      },
      24 * 60 * 60 * 1000
    );
  }
}
```

### 8. Data Integrity

```typescript
class DataIntegrity {
  // Generate checksum for data verification
  generateChecksum(data: any): string {
    const normalized = this.normalize(data);
    return sha256(JSON.stringify(normalized));
  }

  // Normalize data for consistent hashing
  private normalize(data: any): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.normalize(item)).sort();
    }

    if (typeof data === "object" && data !== null) {
      const sorted: any = {};
      Object.keys(data)
        .sort()
        .forEach((key) => {
          if (key !== "updatedAt" && key !== "createdAt") {
            sorted[key] = this.normalize(data[key]);
          }
        });
      return sorted;
    }

    return data;
  }

  // Verify data integrity
  async verifyIntegrity(): Promise<IntegrityReport> {
    const local = await db.transactions.toArray();
    const remote = await this.fetchAllRemote();

    const issues: IntegrityIssue[] = [];

    for (const localTx of local) {
      const remoteTx = remote.find((r) => r.id === localTx.id);

      if (!remoteTx) {
        issues.push({
          type: "missing-remote",
          transaction: localTx,
        });
        continue;
      }

      const localChecksum = this.generateChecksum(localTx);
      const remoteChecksum = this.generateChecksum(remoteTx);

      if (localChecksum !== remoteChecksum) {
        issues.push({
          type: "checksum-mismatch",
          local: localTx,
          remote: remoteTx,
        });
      }
    }

    // Check for remote transactions not in local
    for (const remoteTx of remote) {
      const localTx = local.find((l) => l.id === remoteTx.id);
      if (!localTx) {
        issues.push({
          type: "missing-local",
          transaction: remoteTx,
        });
      }
    }

    return {
      timestamp: new Date(),
      totalLocal: local.length,
      totalRemote: remote.length,
      issues,
      isValid: issues.length === 0,
    };
  }

  // Repair integrity issues
  async repairIntegrity(report: IntegrityReport): Promise<void> {
    for (const issue of report.issues) {
      switch (issue.type) {
        case "missing-remote":
          // Push local to remote
          await this.pushToRemote(issue.transaction);
          break;

        case "missing-local":
          // Pull from remote
          await this.pullFromRemote(issue.transaction);
          break;

        case "checksum-mismatch":
          // Resolve conflict
          const resolved = conflictResolver.resolve(issue.local, issue.remote);
          await this.syncBoth(resolved);
          break;
      }
    }
  }
}
```

### 7. Service Worker

```javascript
// sw.js - Service Worker for background sync
self.addEventListener("sync", async (event) => {
  if (event.tag === "sync-transactions") {
    event.waitUntil(syncTransactions());
  }
});

async function syncTransactions() {
  try {
    // Open IndexedDB
    const db = await openDB();

    // Get pending items
    const pending = await db.transaction("syncQueue").objectStore("syncQueue").getAll();

    // Process each item
    for (const item of pending) {
      await syncItem(item);
    }

    // Notify success
    self.registration.showNotification("Sync Complete", {
      body: `${pending.length} items synced successfully`,
      icon: "/icon-192.png",
    });
  } catch (error) {
    console.error("Background sync failed:", error);

    // Retry later
    self.registration.sync.register("sync-transactions");
  }
}

// Periodic background sync
self.addEventListener("periodicsync", (event) => {
  if (event.tag === "hourly-sync") {
    event.waitUntil(performHourlySync());
  }
});
```

### 8. Performance Optimization

```typescript
class SyncOptimizer {
  // Batch operations for efficiency
  async batchSync(items: QueueItem[]): Promise<void> {
    const batches = this.createBatches(items, 50); // 50 items per batch

    for (const batch of batches) {
      await Promise.all(batch.map((item) => this.syncItem(item)));

      // Small delay between batches
      await this.delay(100);
    }
  }

  // Delta sync for large datasets
  async deltaSync(since: Date): Promise<void> {
    // Only sync changes since last sync
    const changes = await supabase
      .from("transactions")
      .select("id, updated_at, checksum")
      .gt("updated_at", since.toISOString());

    const localChecksums = await this.getLocalChecksums();

    for (const change of changes.data) {
      const localChecksum = localChecksums[change.id];

      if (localChecksum !== change.checksum) {
        // Fetch full record only if changed
        const fullRecord = await this.fetchFullRecord(change.id);
        await this.applyChange(fullRecord);
      }
    }
  }

  // Compression for snapshot storage
  async compressSnapshot(data: any): Promise<Uint8Array> {
    const json = JSON.stringify(data);
    const encoded = new TextEncoder().encode(json);

    // Use Brotli compression via Web Worker
    return new Promise((resolve) => {
      const worker = new Worker("/workers/compression.worker.js");
      worker.postMessage({ type: "compress", data: encoded });
      worker.onmessage = (e) => {
        resolve(e.data);
        worker.terminate();
      };
    });
  }

  // Incremental snapshots
  async createIncrementalSnapshot(
    baseSnapshot: Snapshot,
    currentState: any
  ): Promise<IncrementalSnapshot> {
    const diff = this.calculateDiff(baseSnapshot.data, currentState);

    return {
      baseSnapshotId: baseSnapshot.id,
      timestamp: new Date(),
      diff,
      compressed: await this.compressSnapshot(diff),
    };
  }
}
```

## Sync States

```typescript
enum SyncState {
  IDLE = "idle",
  SYNCING = "syncing",
  OFFLINE = "offline",
  ERROR = "error",
  CONFLICT = "conflict",
}

interface SyncStatus {
  state: SyncState;
  lastSync?: Date;
  pendingChanges: number;
  errors: SyncError[];
  progress?: {
    current: number;
    total: number;
  };
}
```

## Error Handling

```typescript
class SyncErrorHandler {
  private errors: Map<string, SyncError> = new Map();

  handleError(error: Error, context: any): void {
    const syncError: SyncError = {
      id: nanoid(),
      timestamp: new Date(),
      message: error.message,
      stack: error.stack,
      context,
      retryable: this.isRetryable(error),
    };

    this.errors.set(syncError.id, syncError);

    if (syncError.retryable) {
      this.scheduleRetry(syncError);
    } else {
      this.notifyUser(syncError);
    }
  }

  private isRetryable(error: Error): boolean {
    // Network errors are retryable
    if (error.message.includes("network")) return true;
    if (error.message.includes("timeout")) return true;

    // Rate limits are retryable
    if (error.message.includes("429")) return true;

    // Database errors might not be retryable
    if (error.message.includes("constraint")) return false;
    if (error.message.includes("validation")) return false;

    return true;
  }
}
```

## Testing

```typescript
// Sync engine tests
describe("SyncEngine", () => {
  it("should handle offline creation", async () => {
    // Go offline
    mockOffline();

    // Create transaction
    const tx = await createTransaction(mockData);

    // Verify in IndexedDB
    const local = await db.transactions.get(tx.id);
    expect(local).toBeDefined();

    // Verify in sync queue
    const queued = await db.syncQueue.get(tx.id);
    expect(queued.status).toBe("pending");

    // Go online
    mockOnline();

    // Wait for sync
    await waitForSync();

    // Verify synced to Supabase
    const remote = await supabase.from("transactions").select().eq("id", tx.id).single();

    expect(remote.data).toBeDefined();
  });

  it("should resolve conflicts correctly", async () => {
    // Create conflicting changes
    const local = createTransaction({ amount: 100 });
    const remote = createTransaction({ amount: 200 });

    // Resolve
    const resolved = conflictResolver.resolve(local, remote);

    // Verify last-write-wins
    expect(resolved.amount).toBe(200);
  });
});
```

## Monitoring

```typescript
class SyncMonitor {
  private metrics: SyncMetrics = {
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    conflictsResolved: 0,
    averageSyncTime: 0,
    dataTransferred: 0,
  };

  recordSync(duration: number, success: boolean, bytes: number): void {
    this.metrics.totalSyncs++;

    if (success) {
      this.metrics.successfulSyncs++;
    } else {
      this.metrics.failedSyncs++;
    }

    this.metrics.averageSyncTime =
      (this.metrics.averageSyncTime * (this.metrics.totalSyncs - 1) + duration) /
      this.metrics.totalSyncs;

    this.metrics.dataTransferred += bytes;

    // Send to analytics
    this.sendMetrics();
  }

  getHealthStatus(): "healthy" | "degraded" | "failing" {
    const successRate = this.metrics.successfulSyncs / this.metrics.totalSyncs;

    if (successRate > 0.95) return "healthy";
    if (successRate > 0.8) return "degraded";
    return "failing";
  }
}
```

## Best Practices

1. **Always use transactions** for multi-step operations
2. **Implement idempotency** for all sync operations
3. **Use exponential backoff** for retries
4. **Compress large payloads** before syncing
5. **Batch operations** when possible
6. **Monitor sync health** continuously
7. **Test offline scenarios** thoroughly
8. **Handle edge cases** gracefully
9. **Provide user feedback** for sync status
10. **Log everything** for debugging

## Observability & Debugging

### Correlation IDs for Distributed Debugging

```typescript
class SyncLogger {
  private correlationId: string;

  constructor() {
    // Generate correlation ID for this session
    this.correlationId = this.generateCorrelationId();
  }

  private generateCorrelationId(): string {
    const deviceId = deviceManager.getDeviceId();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `${deviceId}-${timestamp}-${random}`;
  }

  log(level: "debug" | "info" | "warn" | "error", message: string, context: any): void {
    const logEntry = {
      correlationId: this.correlationId,
      deviceId: deviceManager.getDeviceId(),
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };

    // Console log in development
    if (process.env.NODE_ENV === "development") {
      console.log("[Sync]", logEntry);
    }

    // Send to Sentry in production
    if (level === "error" && window.Sentry) {
      window.Sentry.captureException(new Error(message), {
        contexts: { sync: logEntry },
      });
    }

    // Store locally for debugging
    this.storeLocalLog(logEntry);
  }

  private async storeLocalLog(entry: any): Promise<void> {
    // Keep last 1000 logs in IndexedDB
    await db.logs.add(entry);
    const count = await db.logs.count();
    if (count > 1000) {
      const oldestLogs = await db.logs
        .orderBy("timestamp")
        .limit(count - 1000)
        .toArray();
      await db.logs.bulkDelete(oldestLogs.map((l) => l.id));
    }
  }
}
```

### Sync Metrics Collection

```typescript
interface SyncMetrics {
  syncQueueLength: number;
  timeToConsistency: number; // ms from change to all devices synced
  conflictRate: number; // conflicts per 100 syncs
  retryCount: number;
  failureRate: number;
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
}

class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();

  recordMetric(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    const values = this.metrics.get(name)!;
    values.push(value);

    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
  }

  getMetrics(): SyncMetrics {
    const queueLength = this.getLatestValue("queue_length");
    const consistency = this.getAverage("time_to_consistency");
    const conflicts = (this.getSum("conflicts") / Math.max(1, this.getSum("syncs"))) * 100;
    const retries = this.getSum("retries");
    const failures = (this.getSum("failures") / Math.max(1, this.getSum("attempts"))) * 100;
    const latencies = this.metrics.get("sync_latency") || [];

    return {
      syncQueueLength: queueLength,
      timeToConsistency: consistency,
      conflictRate: conflicts,
      retryCount: retries,
      failureRate: failures,
      averageLatency: this.getAverage("sync_latency"),
      p95Latency: this.getPercentile(latencies, 95),
      p99Latency: this.getPercentile(latencies, 99),
    };
  }

  private getPercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }
}
```

## Dexie Schema Versioning & Migrations

### Schema Version Management

IndexedDB schema changes require careful versioning to avoid data loss when users update the app.

```typescript
// src/lib/dexie/schema.ts
import Dexie, { Table } from "dexie";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  account_id?: string;
  category_id?: string;
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  created_by_user_id: string;
  tagged_user_ids: string[]; // Added in v3
  transfer_group_id?: string;
  notes?: string;
  device_id: string;
  created_at: string;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: any;
  device_id: string;
  status: "queued" | "syncing" | "completed" | "failed";
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface TransactionEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  op: "create" | "update" | "delete";
  payload: any;
  lamport_clock: number;
  vector_clock: any;
  device_id: string;
  timestamp: string;
}

export class HouseholdHubDB extends Dexie {
  transactions!: Table<Transaction>;
  accounts!: Table<any>;
  categories!: Table<any>;
  syncQueue!: Table<SyncQueueItem>;
  events!: Table<TransactionEvent>;
  meta!: Table<{ key: string; value: any }>;
  logs!: Table<any>;

  constructor() {
    super("HouseholdHubDB");

    // Version 1: Initial schema
    this.version(1).stores({
      transactions: "id, date, account_id, category_id, status, type, created_at",
      accounts: "id, name, visibility",
      categories: "id, parent_id, name",
      syncQueue: "id, status, entity_type, entity_id, created_at",
      events: "id, entity_id, lamport_clock, timestamp",
      meta: "key",
    });

    // Version 2: Added device_id index to events for better sync performance
    this.version(2)
      .stores({
        events: "id, entity_id, lamport_clock, timestamp, device_id",
      })
      .upgrade((tx) => {
        // Migration logic for version 1 → 2
        return tx
          .table("events")
          .toCollection()
          .modify((event) => {
            if (!event.device_id) {
              event.device_id = "unknown";
            }
          });
      });

    // Version 3: Added tagged_user_ids support for @mentions
    this.version(3)
      .stores({
        transactions:
          "id, date, account_id, category_id, status, type, created_at, *tagged_user_ids",
      })
      .upgrade(async (tx) => {
        // Migration logic for version 2 → 3
        return tx
          .table("transactions")
          .toCollection()
          .modify((txn) => {
            if (!txn.tagged_user_ids) {
              txn.tagged_user_ids = [];
            }
          });
      });

    // Version 4: Added logs table for debugging
    this.version(4).stores({
      logs: "id, timestamp, level, device_id",
    });

    // Future versions...
    // this.version(5).stores({ ... });
  }
}

// Export singleton instance
export const db = new HouseholdHubDB();
```

### Migration Testing Strategy

```typescript
// tests/dexie/migrations.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Dexie from "dexie";
import { HouseholdHubDB } from "@/lib/dexie/schema";

describe("Dexie Migrations", () => {
  let testDb: HouseholdHubDB;

  beforeEach(async () => {
    // Create a test instance with a unique name
    testDb = new HouseholdHubDB();
    testDb.name = `test-db-${Date.now()}`;
  });

  afterEach(async () => {
    // Cleanup
    await testDb.delete();
    await testDb.close();
  });

  it("migrates from v1 to v3 without data loss", async () => {
    // Simulate v1 database
    const v1db = new Dexie("test-v1-migration");
    v1db.version(1).stores({
      transactions: "id, date, amount_cents",
    });

    await v1db.open();

    // Add test data in v1 format
    await v1db.table("transactions").add({
      id: "test-1",
      date: "2024-01-01",
      amount_cents: 10000,
      type: "expense",
      description: "Test transaction",
    });

    await v1db.close();

    // Reopen with v3 schema (should auto-migrate)
    const v3db = new HouseholdHubDB();
    v3db.name = "test-v1-migration";
    await v3db.open();

    const migrated = await v3db.transactions.get("test-1");

    // Verify data preserved
    expect(migrated).toBeDefined();
    expect(migrated!.id).toBe("test-1");
    expect(migrated!.amount_cents).toBe(10000);

    // Verify new field added with default value
    expect(migrated!.tagged_user_ids).toEqual([]);

    await v3db.delete();
    await v3db.close();
  });

  it("handles device_id migration correctly", async () => {
    // Create v1 database
    const v1db = new Dexie("test-device-migration");
    v1db.version(1).stores({
      events: "id, entity_id",
    });

    await v1db.open();

    // Add event without device_id
    await v1db.table("events").add({
      id: "event-1",
      entity_id: "tx-1",
      lamport_clock: 1,
      timestamp: new Date().toISOString(),
    });

    await v1db.close();

    // Reopen with v2 schema
    const v2db = new HouseholdHubDB();
    v2db.name = "test-device-migration";
    v2db
      .version(2)
      .stores({
        events: "id, entity_id, lamport_clock, timestamp, device_id",
      })
      .upgrade((tx) => {
        return tx
          .table("events")
          .toCollection()
          .modify((event) => {
            if (!event.device_id) {
              event.device_id = "unknown";
            }
          });
      });

    await v2db.open();

    const event = await v2db.events.get("event-1");
    expect(event?.device_id).toBe("unknown");

    await v2db.delete();
    await v2db.close();
  });

  it("preserves indexes during migration", async () => {
    await testDb.open();

    // Add test data
    await testDb.transactions.bulkAdd([
      {
        id: "tx-1",
        date: "2024-01-01",
        amount_cents: 1000,
        type: "expense",
        description: "Test 1",
        tagged_user_ids: ["user-1"],
        status: "cleared",
        visibility: "household",
        created_by_user_id: "user-1",
        device_id: "device-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: "tx-2",
        date: "2024-01-02",
        amount_cents: 2000,
        type: "income",
        description: "Test 2",
        tagged_user_ids: ["user-1", "user-2"],
        status: "pending",
        visibility: "personal",
        created_by_user_id: "user-2",
        device_id: "device-2",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    // Test that array index works (tagged_user_ids)
    const taggedTx = await testDb.transactions.where("tagged_user_ids").equals("user-2").toArray();

    expect(taggedTx).toHaveLength(1);
    expect(taggedTx[0].id).toBe("tx-2");

    // Test other indexes still work
    const expenseTx = await testDb.transactions.where("type").equals("expense").toArray();

    expect(expenseTx).toHaveLength(1);
    expect(expenseTx[0].id).toBe("tx-1");
  });
});
```

### Migration Guidelines

**1. Never Remove Fields**

- Only add new fields or modify indexes
- Mark deprecated fields but don't delete them
- Maintain backward compatibility

**2. Always Provide Upgrade Function**

```typescript
this.version(N)
  .stores({
    // new schema
  })
  .upgrade((tx) => {
    // migration logic
    return tx
      .table("tableName")
      .toCollection()
      .modify((record) => {
        // add default values for new fields
        record.newField = defaultValue;
      });
  });
```

**3. Test Migrations with Production Data**

```typescript
// Create test with realistic data volumes
it("migrates 10k transactions efficiently", async () => {
  const startTime = Date.now();

  // ... migration logic ...

  const duration = Date.now() - startTime;
  expect(duration).toBeLessThan(5000); // Should complete in <5s
});
```

**4. Version Bump Strategy**

- Bump version for any schema change
- Document breaking changes in migration notes
- Keep migration code forever (users may skip versions)

**5. Rollback Safety**

```typescript
// Always check if migration can be safely rolled back
this.version(N)
  .stores({
    // new schema
  })
  .upgrade(async (tx) => {
    try {
      // Migration logic
      await doMigration(tx);
    } catch (error) {
      console.error("Migration failed:", error);
      // Don't throw - allow app to continue with old data
      // User can manually trigger sync to recover
    }
  });
```

### Migration Checklist

Before deploying a schema change:

- [ ] Version number incremented
- [ ] Upgrade function provided
- [ ] Default values for new fields
- [ ] Migration tested with v1 data
- [ ] Migration tested with large datasets (10k+ records)
- [ ] Performance measured (<5s for typical dataset)
- [ ] Rollback strategy documented
- [ ] User-facing migration notes written

## Browser Storage Quota Management

### Storage Monitor

```typescript
class StorageManager {
  private quotaWarningThreshold = 0.8; // 80%
  private quotaCriticalThreshold = 0.95; // 95%

  async checkStorageQuota(): Promise<StorageStatus> {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { available: true, percentage: 0, action: "none" };
    }

    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const percentage = quota > 0 ? usage / quota : 0;

    let action: "none" | "warn" | "prune" | "critical" = "none";

    if (percentage >= this.quotaCriticalThreshold) {
      action = "critical";
      await this.handleCriticalStorage();
    } else if (percentage >= this.quotaWarningThreshold) {
      action = "warn";
      this.showStorageWarning(percentage);
    }

    return {
      available: percentage < this.quotaCriticalThreshold,
      percentage,
      usage,
      quota,
      action,
    };
  }

  private async handleCriticalStorage(): Promise<void> {
    console.warn("Critical storage threshold reached, pruning old data");

    // Step 1: Clear old logs
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    await db.logs.where("timestamp").below(threeMonthsAgo.toISOString()).delete();

    // Step 2: Compact events
    const eventCount = await db.events.count();
    if (eventCount > 10000) {
      // Keep only last 10000 events
      const toDelete = await db.events
        .orderBy("timestamp")
        .limit(eventCount - 10000)
        .toArray();
      await db.events.bulkDelete(toDelete.map((e) => e.id));
    }

    // Step 3: Clear old cached data
    await this.clearOldCache();

    // Step 4: If still critical, prompt user
    const newStatus = await this.checkStorageQuota();
    if (newStatus.percentage >= this.quotaCriticalThreshold) {
      this.promptManualExport();
    }
  }

  private async clearOldCache(): Promise<void> {
    // Clear service worker caches older than 7 days
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      for (const name of cacheNames) {
        if (name.includes("timestamp-")) {
          const timestamp = parseInt(name.split("-")[1]);
          if (timestamp < oneWeekAgo) {
            await caches.delete(name);
          }
        }
      }
    }
  }

  private showStorageWarning(percentage: number): void {
    const percentUsed = Math.round(percentage * 100);
    console.warn(`Storage usage at ${percentUsed}%. Consider exporting old data.`);

    // Show toast notification
    toast.warning(`Storage ${percentUsed}% full. Export old data to free space.`);
  }

  private promptManualExport(): void {
    // Show modal prompting user to export data
    toast.error("Storage full! Export your data to continue.", {
      action: {
        label: "Export Now",
        onClick: () => (window.location.href = "/export"),
      },
      duration: Infinity, // Don't auto-dismiss
    });
  }

  // Monitor storage periodically
  startMonitoring(): void {
    // Check every 5 minutes
    setInterval(
      () => {
        this.checkStorageQuota();
      },
      5 * 60 * 1000
    );

    // Also check before major operations
    window.addEventListener("beforeunload", () => {
      this.checkStorageQuota();
    });
  }
}

interface StorageStatus {
  available: boolean;
  percentage: number;
  usage?: number;
  quota?: number;
  action: "none" | "warn" | "prune" | "critical";
}
```

### Graceful Write Failure Handling

```typescript
class OfflineStorage {
  async safeWrite(store: string, data: any): Promise<boolean> {
    try {
      // Try to write to IndexedDB
      await db.table(store).add(data);
      return true;
    } catch (error) {
      if (error.name === "QuotaExceededError") {
        // Handle quota exceeded
        console.error("Storage quota exceeded");

        // Try to free up space
        await storageManager.handleCriticalStorage();

        // Retry once
        try {
          await db.table(store).add(data);
          return true;
        } catch (retryError) {
          // Fall back to essential data only mode
          this.enterEssentialMode();
          return false;
        }
      }

      throw error;
    }
  }

  private enterEssentialMode(): void {
    // Store only critical data
    console.warn("Entering essential data mode due to storage constraints");

    // Disable non-essential features
    localStorage.setItem("essentialMode", "true");

    // Notify user
    toast.error("Storage full. Only essential data is being saved.", {
      action: {
        label: "Manage Storage",
        onClick: () => (window.location.href = "/settings/storage"),
      },
    });
  }
}
```
