# Sync Fallback Strategies

## Overview

Comprehensive fallback strategies for sync functionality, particularly addressing iOS Safari limitations and ensuring reliable data synchronization across all platforms.

## Platform Limitations

### iOS Safari (Primary Concern)

**Background Sync API:**

- ❌ Not supported in iOS Safari
- ❌ Limited support even in iOS PWA mode
- ⚠️ Service Worker lifecycle restricted

**Push Notifications:**

- ✅ Supported in iOS 16.4+ (PWA only)
- ⚠️ Requires app installation to home screen
- ⚠️ User must explicitly grant permission
- ❌ No background push processing

**Service Workers:**

- ✅ Basic support available
- ⚠️ Aggressive suspension after 30 seconds
- ❌ No background fetch
- ❌ No periodic background sync

### Android/Desktop Chrome

- ✅ Full Background Sync API support
- ✅ Push notifications work in browser
- ✅ Service Worker background processing
- ✅ Periodic background sync available

## Fallback Implementation Strategy

### 1. Progressive Enhancement Approach

```typescript
class SyncStrategyManager {
  private strategies: SyncStrategy[] = [];

  async initialize() {
    // Try strategies in order of preference
    this.strategies = [
      new BackgroundSyncStrategy(), // Best: Native API
      new ServiceWorkerStrategy(), // Good: SW-based
      new VisibilityStrategy(), // OK: Page visibility
      new IntervalStrategy(), // Fallback: Timer
      new ManualStrategy(), // Last resort: Manual
    ];

    // Use first available strategy
    for (const strategy of this.strategies) {
      if (await strategy.isAvailable()) {
        return strategy.activate();
      }
    }
  }
}
```

### 2. Visibility-Based Sync (Primary iOS Fallback)

```typescript
class VisibilityBasedSync {
  private lastSync: Date | null = null;
  private syncThreshold = 5 * 60 * 1000; // 5 minutes

  initialize() {
    // Sync when app becomes visible
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) {
        this.attemptSync("visibility-change");
      }
    });

    // Sync when window gains focus
    window.addEventListener("focus", () => {
      this.attemptSync("window-focus");
    });

    // Sync when coming online
    window.addEventListener("online", () => {
      this.attemptSync("network-online");
    });

    // Sync on app resume (iOS specific)
    window.addEventListener("resume", () => {
      this.attemptSync("app-resume");
    });
  }

  private async attemptSync(trigger: string) {
    const now = new Date();

    // Throttle syncs
    if (this.lastSync) {
      const timeSinceSync = now.getTime() - this.lastSync.getTime();
      if (timeSinceSync < this.syncThreshold) {
        console.log(`Sync throttled (${trigger}): ${timeSinceSync}ms since last sync`);
        return;
      }
    }

    console.log(`Triggering sync from: ${trigger}`);
    await this.performSync();
    this.lastSync = now;
  }
}
```

### 3. Periodic Timer Fallback

```typescript
class PeriodicSyncFallback {
  private timer: number | null = null;
  private interval = 5 * 60 * 1000; // 5 minutes
  private maxRetries = 3;

  start() {
    // Only run timer when app is visible
    if (!document.hidden && navigator.onLine) {
      this.timer = window.setInterval(() => {
        this.syncWithRetry();
      }, this.interval);
    }

    // Stop timer when hidden
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      } else if (!document.hidden && !this.timer) {
        this.start(); // Restart when visible
      }
    });
  }

  private async syncWithRetry(retries = 0): Promise<void> {
    try {
      await this.performSync();
    } catch (error) {
      if (retries < this.maxRetries) {
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        setTimeout(() => this.syncWithRetry(retries + 1), delay);
      }
    }
  }
}
```

### 4. Manual Sync UI

```typescript
interface SyncStatus {
  state: 'idle' | 'syncing' | 'success' | 'error';
  lastSync: Date | null;
  pendingChanges: number;
  errorMessage?: string;
}

class ManualSyncUI {
  private status: SyncStatus = {
    state: 'idle',
    lastSync: null,
    pendingChanges: 0
  };

  renderSyncButton(): HTMLElement {
    return (
      <div className="sync-status">
        {this.status.pendingChanges > 0 && (
          <span className="pending-badge">
            {this.status.pendingChanges} pending
          </span>
        )}

        <button
          onClick={this.manualSync}
          disabled={this.status.state === 'syncing'}
          className={`sync-button ${this.status.state}`}
        >
          {this.status.state === 'syncing' ? (
            <Spinner />
          ) : (
            <SyncIcon />
          )}
        </button>

        {this.status.lastSync && (
          <span className="last-sync">
            Last sync: {formatRelativeTime(this.status.lastSync)}
          </span>
        )}

        {this.status.errorMessage && (
          <span className="sync-error">
            {this.status.errorMessage}
          </span>
        )}
      </div>
    );
  }
}
```

## iOS PWA Installation Flow

### Detection and Prompting

```typescript
class PWAInstallManager {
  private isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  private isInStandaloneMode = window.matchMedia("(display-mode: standalone)").matches;

  async checkInstallation() {
    if (this.isIOS && !this.isInStandaloneMode) {
      // Show iOS-specific install instructions
      this.showIOSInstallPrompt();
    }
  }

  private showIOSInstallPrompt() {
    const prompt = `
      <div class="ios-install-prompt">
        <h3>Install for Better Experience</h3>
        <p>For background sync and notifications:</p>
        <ol>
          <li>Tap the Share button <ShareIcon /></li>
          <li>Select "Add to Home Screen"</li>
          <li>Tap "Add"</li>
        </ol>
        <p>This enables:</p>
        <ul>
          <li>Push notifications</li>
          <li>Offline access</li>
          <li>Better performance</li>
        </ul>
        <button onclick="dismissPrompt()">Maybe Later</button>
      </div>
    `;

    // Show only once per session
    if (!sessionStorage.getItem("iosInstallPromptShown")) {
      this.displayPrompt(prompt);
      sessionStorage.setItem("iosInstallPromptShown", "true");
    }
  }
}
```

## Conflict Resolution During Sync

### Optimistic Updates with Rollback

```typescript
class OptimisticSync {
  private pendingOperations: Map<string, Operation> = new Map();

  async executeWithOptimism(operation: Operation) {
    const rollbackState = this.captureState();
    const operationId = this.generateId();

    try {
      // Apply optimistically
      this.applyLocally(operation);
      this.pendingOperations.set(operationId, operation);

      // Sync to server
      const result = await this.syncToServer(operation);

      // Verify and reconcile
      if (result.conflict) {
        await this.resolveConflict(operation, result);
      }

      this.pendingOperations.delete(operationId);
    } catch (error) {
      // Rollback on failure
      this.rollbackTo(rollbackState);
      this.pendingOperations.delete(operationId);
      throw error;
    }
  }
}
```

## Network Detection and Adaptation

```typescript
class NetworkAwareSync {
  private connectionType: "fast" | "slow" | "offline" = "fast";

  initialize() {
    // Monitor connection
    this.detectConnectionSpeed();

    // Adapt sync strategy based on connection
    navigator.connection?.addEventListener("change", () => {
      this.adaptStrategy();
    });
  }

  private async detectConnectionSpeed() {
    if (!navigator.onLine) {
      this.connectionType = "offline";
      return;
    }

    // Measure latency
    const start = performance.now();
    try {
      await fetch("/api/ping", { method: "HEAD" });
      const latency = performance.now() - start;

      this.connectionType = latency < 100 ? "fast" : "slow";
    } catch {
      this.connectionType = "offline";
    }
  }

  private adaptStrategy() {
    switch (this.connectionType) {
      case "fast":
        // Full sync with all data
        this.syncBatchSize = 100;
        this.syncInterval = 30000; // 30 seconds
        break;

      case "slow":
        // Reduced sync frequency
        this.syncBatchSize = 20;
        this.syncInterval = 300000; // 5 minutes
        break;

      case "offline":
        // Queue all changes locally
        this.syncBatchSize = 0;
        this.queueForLaterSync();
        break;
    }
  }
}
```

## Testing Strategy

### 1. iOS Safari Testing

```bash
# Test checklist for iOS
- [ ] Install as PWA
- [ ] Test sync on app resume
- [ ] Test sync on visibility change
- [ ] Test manual sync button
- [ ] Test with airplane mode
- [ ] Test with low power mode
- [ ] Test background behavior (expect limitations)
```

### 2. Network Condition Testing

```typescript
// Simulate network conditions
class NetworkSimulator {
  simulateOffline() {
    window.dispatchEvent(new Event("offline"));
  }

  simulateOnline() {
    window.dispatchEvent(new Event("online"));
  }

  simulateSlowNetwork() {
    // Add artificial delay to all fetch requests
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return originalFetch(...args);
    };
  }
}
```

## Performance Considerations

### 1. Sync Queue Optimization

```typescript
class SyncQueueOptimizer {
  private queue: SyncOperation[] = [];
  private maxQueueSize = 1000;

  async optimizeQueue() {
    // Combine similar operations
    this.queue = this.combineOperations(this.queue);

    // Remove obsolete operations
    this.queue = this.removeObsolete(this.queue);

    // Prioritize critical operations
    this.queue.sort((a, b) => b.priority - a.priority);

    // Trim if over limit
    if (this.queue.length > this.maxQueueSize) {
      await this.compactQueue();
    }
  }

  private combineOperations(ops: SyncOperation[]): SyncOperation[] {
    // Combine multiple updates to same entity
    const grouped = new Map<string, SyncOperation[]>();

    ops.forEach((op) => {
      const key = `${op.entityType}-${op.entityId}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(op);
    });

    // Keep only latest for each entity
    return Array.from(grouped.values()).map((ops) =>
      ops.reduce((latest, op) => (op.timestamp > latest.timestamp ? op : latest))
    );
  }
}
```

## Monitoring and Analytics

```typescript
class SyncMonitor {
  private metrics = {
    syncAttempts: 0,
    syncSuccesses: 0,
    syncFailures: 0,
    averageSyncTime: 0,
    lastSyncStrategy: "",
    offlineTime: 0,
  };

  trackSync(strategy: string, success: boolean, duration: number) {
    this.metrics.syncAttempts++;
    if (success) {
      this.metrics.syncSuccesses++;
    } else {
      this.metrics.syncFailures++;
    }

    // Update average
    this.metrics.averageSyncTime =
      (this.metrics.averageSyncTime * (this.metrics.syncAttempts - 1) + duration) /
      this.metrics.syncAttempts;

    this.metrics.lastSyncStrategy = strategy;

    // Send to analytics
    this.reportMetrics();
  }

  private reportMetrics() {
    // Log locally for debugging
    console.table(this.metrics);

    // Send to analytics service
    if (window.analytics) {
      window.analytics.track("sync_metrics", this.metrics);
    }
  }
}
```

## Summary

The fallback strategy ensures reliable sync across all platforms by:

1. **Progressive Enhancement**: Using best available method for each platform
2. **Multiple Triggers**: Visibility, focus, online, and timer-based syncs
3. **Manual Control**: Always providing user-initiated sync option
4. **iOS Optimization**: Special handling for Safari limitations
5. **Network Adaptation**: Adjusting strategy based on connection quality
6. **Conflict Resolution**: Handling concurrent edits gracefully
7. **Performance**: Optimizing sync queue and batch sizes
8. **Monitoring**: Tracking sync performance and reliability

This multi-layered approach ensures data consistency regardless of platform limitations.
