# Chunk 034: Sync Realtime

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Multi-Device Sync (9 of 10)
- **Prerequisites**: Chunks 024-033 (complete sync infrastructure)
- **Can Skip**: No - enables automatic multi-device sync

## What You're Building

Supabase realtime subscriptions for automatic sync:

- Realtime channel subscriptions (transactions, accounts, categories, budgets)
- Change handlers for INSERT/UPDATE/DELETE
- Device filtering to prevent infinite loops
- Integration with conflict resolution
- Update local IndexedDB on remote changes
- UI state updates on sync
- Connection status indicator with global placement
- Subscription lifecycle management

## Why This Matters

Realtime sync is the **magic of Phase B**. It enables:

- **Instant propagation**: Changes appear on all devices within seconds
- **No manual sync**: Automatic background synchronization
- **Conflict resolution**: Automatically resolves concurrent edits
- **User delight**: Seamless multi-device experience
- **Reliability**: Handles connection drops gracefully

## Prerequisites Verification

### Required Chunks (024-033)

Before starting, verify these chunks are complete:

- [ ] **Chunk 024** (Sync Processor): `src/lib/sync/processor.ts` exists and can apply changes
- [ ] **Chunk 026** (Device ID): `deviceManager.getDeviceId()` returns stable ID
- [ ] **Chunk 028** (Events Schema): `transaction_events` table exists in Supabase
- [ ] **Chunk 029** (Idempotency Keys): Event generation includes idempotency keys
- [ ] **Chunk 031** (Vector Clocks): Per-entity vector clocks implemented
- [ ] **Chunk 032** (Conflict Detection): Conflicts logged to IndexedDB
- [ ] **Chunk 033** (Conflict Resolution): `resolveConflict()` function working

### Supabase Configuration

- [ ] **Realtime enabled** in Supabase project settings (Dashboard → Settings → API → Realtime)
- [ ] **Tables enabled for replication**:
  - `transactions` - enabled ✓
  - `accounts` - enabled ✓
  - `categories` - enabled ✓
  - `budgets` - enabled ✓
- [ ] **RLS SELECT policies exist** for all realtime tables (realtime requires SELECT permission)
- [ ] **Test user can SELECT** from all tables (verify with SQL query)

### Quick Verification Tests

Run these in your browser console to verify readiness:

```typescript
// 1. Device ID is stable
const deviceId = await deviceManager.getDeviceId();
console.log("Device ID:", deviceId); // Should be consistent across refreshes

// 2. Sync processor exists
console.log("Sync processor:", typeof syncProcessor.processItem); // Should be "function"

// 3. Conflict resolution works
const mockLocal = { lamportClock: 5, deviceId: "device-a" };
const mockRemote = { lamportClock: 3, deviceId: "device-b" };
const resolved = conflictResolver.determineWinner(mockLocal, mockRemote);
console.log("Winner:", resolved); // Should be mockLocal (higher lamport)
```

## Key Files Created

```
src/
├── lib/
│   ├── realtime-sync.ts            # Realtime subscription manager
│   ├── realtime-sync.test.ts       # Unit tests
│   └── subscription-manager.ts     # Multi-subscription state handler
├── components/
│   └── ui/
│       └── SyncIndicator.tsx       # Connection status (global header)
└── hooks/
    └── useRealtimeSync.ts          # React hook for subscriptions
```

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 1032-1123 (realtime subscriptions)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 279-363 (per-entity conflict resolution)
- **Supabase Docs**: [Realtime Subscriptions](https://supabase.com/docs/guides/realtime)
- **Related Decisions**:
  - #77: Deterministic conflict resolution
  - #86: Phase B uses record-level LWW

## Technical Stack

- **Supabase Realtime**: PostgreSQL change data capture (CDC)
- **Channels**: Subscribe to table-level changes
- **TypeScript**: Type-safe event handlers
- **React**: Integration with component lifecycle
- **Zustand**: Subscription state management

## Design Patterns

### Subscription Pattern with Device Filtering

```typescript
// CRITICAL: Filter out own device changes to prevent infinite loops
// Reference: SYNC-ENGINE.md line 1048
const deviceId = await deviceManager.getDeviceId();

supabase
  .channel("transactions")
  .on(
    "postgres_changes",
    {
      event: "*", // INSERT, UPDATE, DELETE
      schema: "public",
      table: "transactions",
      // IMPORTANT: Filter out changes from this device
      filter: `device_id=neq.${deviceId}`,
    },
    handleChange
  )
  .subscribe();
```

**Why filtering matters**:

- Without filter: Device A creates transaction → triggers realtime event → Device A processes own change → infinite loop
- With filter: Device A creates transaction → other devices get notified → Device A ignores (already has it)

### Event Handler Pattern

```typescript
private handleChange = async (payload: RealtimePayload) => {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  // Route to appropriate handler
  switch (eventType) {
    case "INSERT":
      await this.handleInsert(newRecord);
      break;
    case "UPDATE":
      await this.handleUpdate(newRecord, oldRecord);
      break;
    case "DELETE":
      await this.handleDelete(oldRecord);
      break;
  }

  // Update UI state after processing
  this.notifyUIUpdate(eventType, newRecord || oldRecord);
};
```

### Conflict Resolution Integration

```typescript
// During UPDATE, check for conflicts with local data
private async handleUpdate(newRecord: any, oldRecord: any) {
  const localRecord = await db.transactions.get(newRecord.id);

  if (localRecord && localRecord.updated_at !== newRecord.updated_at) {
    // Fetch events for conflict detection
    const localEvent = await this.getLocalEvent(newRecord.id);
    const remoteEvent = this.convertToEvent(newRecord);

    const detection = detectConflict(localEvent, remoteEvent);

    if (detection.hasConflict) {
      // Resolve and apply winner (from chunk 033)
      const resolution = await resolveConflict(localEvent, remoteEvent);
      await applyWinner(resolution.winner);

      // Log for transparency
      await logConflictResolution(resolution);
    } else {
      // No conflict, apply directly
      await db.transactions.put(newRecord);
    }
  } else {
    // No local version, apply directly
    await db.transactions.put(newRecord);
  }

  // Invalidate React Query cache
  queryClient.invalidateQueries({ queryKey: ["transactions"] });
}
```

### Multi-Table Subscription Manager

```typescript
// Reference: SYNC-ENGINE.md lines 128-135
class SubscriptionManager {
  private subscriptions: Map<string, RealtimeChannel> = new Map();

  async subscribeAll() {
    const deviceId = await deviceManager.getDeviceId();

    const tables = ["transactions", "accounts", "categories", "budgets"];

    await Promise.all(tables.map((table) => this.subscribeToTable(table, deviceId)));
  }

  private async subscribeToTable(table: string, deviceId: string) {
    const channel = supabase
      .channel(table)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `device_id=neq.${deviceId}`,
        },
        (payload) => this.handleTableChange(table, payload)
      )
      .subscribe();

    this.subscriptions.set(table, channel);
  }

  async cleanup() {
    // IMPORTANT: Always cleanup on logout/unmount to prevent memory leaks
    for (const [table, channel] of this.subscriptions) {
      await supabase.removeChannel(channel);
    }
    this.subscriptions.clear();
  }
}

// Usage in React
const subscriptionManager = new SubscriptionManager();

// On app mount
useEffect(() => {
  subscriptionManager.subscribeAll();

  return () => {
    // Cleanup on unmount
    subscriptionManager.cleanup();
  };
}, []);
```

## How Realtime Sync Works

### 1. Supabase CDC (Change Data Capture)

```
PostgreSQL → Logical Replication → Realtime Server → WebSocket → Client
```

**Process**:

- PostgreSQL emits WAL (Write-Ahead Log) entries
- Supabase Realtime server captures changes
- WebSocket pushes changes to subscribed clients
- **Latency**: Typically 100-500ms

### 2. Client-Side Flow

```
Remote Change → Realtime Handler → Device Filter → Conflict Detection → Resolution → IndexedDB Update → UI Refresh
```

### 3. Event Ordering Guarantees

**Important**: Realtime may deliver events out of order due to network conditions.

**Solution**: Vector clocks handle ordering automatically:

- Events include lamport clocks for total ordering
- Conflict resolver uses clocks to determine causality
- Out-of-order events are correctly resolved

## Performance Characteristics

- **Latency**: 100-500ms for changes to propagate
- **Throughput**: Handles 100+ changes/second
- **Memory**: ~50KB per active subscription
- **Bandwidth**: ~1KB per change event
- **Backpressure**: Events debounced at 100ms to prevent UI thrashing

### Backpressure Handling

```typescript
// Debounce high-frequency updates to prevent UI lag
private debouncedUIUpdate = debounce((eventType: string, record: any) => {
  queryClient.invalidateQueries({ queryKey: ["transactions"] });
}, 100);

private handleChange = async (payload: RealtimePayload) => {
  // Process immediately (IndexedDB update)
  await this.processChange(payload);

  // Debounce UI updates
  this.debouncedUIUpdate(payload.eventType, payload.new || payload.old);
};
```

## Connection Management

### Reconnection Strategy

```typescript
// Automatic reconnection on connection drop
subscription.on("system", {}, (status) => {
  if (status === "SUBSCRIBED") {
    console.log("Connected");
    useSyncStore.getState().setConnectionStatus("connected");
  } else if (status === "CHANNEL_ERROR") {
    console.log("Reconnecting...");
    useSyncStore.getState().setConnectionStatus("reconnecting");
    // Supabase handles reconnection automatically with exponential backoff
  } else if (status === "TIMED_OUT") {
    console.error("Connection timed out");
    useSyncStore.getState().setConnectionStatus("disconnected");
    // Trigger manual sync to catch up
    await syncQueue.processAll();
  }
});
```

### Offline Detection

```typescript
// Track online/offline status
window.addEventListener("online", async () => {
  useSyncStore.getState().setNetworkStatus("online");

  // Trigger manual sync to catch up on missed changes
  await syncQueue.processAll();

  // Re-subscribe if connection was dropped
  await subscriptionManager.subscribeAll();
});

window.addEventListener("offline", () => {
  useSyncStore.getState().setNetworkStatus("offline");
  // Queue changes locally (existing offline functionality)
});
```

### Error Handling

```typescript
class RealtimeErrorHandler {
  async handleError(error: Error, context: string) {
    // 1. Subscription permission errors
    if (error.message.includes("permission denied")) {
      console.error("RLS policy blocking realtime. Check SELECT policies.");
      toast.error("Real-time sync disabled. Check permissions.");
      return;
    }

    // 2. Rate limiting (Supabase free tier: 200 concurrent connections)
    if (error.message.includes("rate limit")) {
      console.warn("Rate limited. Falling back to polling.");
      this.fallbackToPolling();
      return;
    }

    // 3. Token expiration
    if (error.message.includes("JWT expired")) {
      console.log("Token expired. Refreshing session...");
      await supabase.auth.refreshSession();
      await subscriptionManager.subscribeAll();
      return;
    }

    // 4. Unknown errors
    console.error("Realtime error:", error, context);
    Sentry.captureException(error, { contexts: { realtime: { context } } });
  }

  private fallbackToPolling() {
    // Poll every 30 seconds instead of realtime
    setInterval(async () => {
      const lastSync = await db.meta.get("lastSync");
      const changes = await this.fetchChangesSince(lastSync?.value);
      await this.applyChanges(changes);
    }, 30000);
  }
}
```

## Common Scenarios

### Scenario 1: Instant Sync

```
Device A: User creates transaction → Supabase
Device B: Receives realtime event (filtered, not own device) → Updates IndexedDB → UI refreshes
Time: ~200ms
```

### Scenario 2: Offline Edit + Sync

```
Device A: Offline, creates transaction → Saved to IndexedDB + sync_queue
Device A: Comes online → sync_queue processes → Uploads to Supabase
Device B: Receives realtime event → No conflict (Device A was first)
```

### Scenario 3: Concurrent Edits

```
Device A: Edits transaction amount to ₱1,000 (lamport 5)
Device B: Edits same transaction to ₱2,000 (lamport 3)

Both devices sync to Supabase → Supabase arbitrarily picks one
Device A receives B's change → Detects conflict → Resolves (A wins, higher lamport)
Device B receives A's change → Detects conflict → Resolves (A wins, higher lamport)

Result: Both devices converge to ₱1,000
```

## RLS (Row-Level Security) Considerations

Realtime subscriptions respect RLS policies:

```sql
-- Must allow SELECT for realtime to work
-- Reference: SYNC-ENGINE.md lines 209-219
CREATE POLICY "Users can view household transactions"
ON transactions FOR SELECT
USING (household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));

-- Realtime uses SELECT permissions
-- INSERT/UPDATE/DELETE permissions handled by mutation RPC calls
```

**Verification**: Test that realtime works for different users:

```typescript
// As User A
const { data } = await supabase.from("transactions").select("*");
console.log("Can SELECT:", data.length > 0); // Should be true

// If false, realtime won't work - fix RLS policies first
```

## Browser Compatibility

- **Chrome/Edge**: Full support ✅
- **Firefox**: Full support ✅
- **Safari**: Full support ✅
- **iOS Safari**: WebSocket support with caveats ⚠️

### iOS Safari Fallback Strategy

**Issues**:

- Background tabs pause WebSocket connections
- App loses realtime when backgrounded
- Manual sync required on app focus

**Solution** (Reference: SYNC-ENGINE.md lines 554-564):

```typescript
// Sync on visibility change (user returns to app)
document.addEventListener("visibilitychange", async () => {
  if (!document.hidden) {
    console.log("App visible, syncing...");

    // Trigger manual sync to catch up
    await syncQueue.processAll();

    // Re-establish realtime if needed
    const isConnected = subscriptionManager.isConnected();
    if (!isConnected) {
      await subscriptionManager.subscribeAll();
    }
  }
});

// Sync on window focus (iOS)
window.addEventListener("focus", async () => {
  console.log("Window focused, syncing...");
  await syncQueue.processAll();
});

// Periodic sync for iOS (every 5 minutes while app open)
if (isIOS()) {
  setInterval(
    async () => {
      if (!document.hidden && navigator.onLine) {
        await syncQueue.processAll();
      }
    },
    5 * 60 * 1000
  );
}
```

## Connection Status UI

### SyncIndicator Component Location

Place in **global app header** for visibility across all pages:

```tsx
// src/App.tsx or src/layouts/MainLayout.tsx
function App() {
  return (
    <div>
      <header className="fixed top-0 right-0 p-4">
        <SyncIndicator /> {/* Always visible */}
      </header>
      <main>{/* Routes */}</main>
    </div>
  );
}
```

### SyncIndicator Implementation

```tsx
// src/components/ui/SyncIndicator.tsx
export function SyncIndicator() {
  const { status, pendingCount } = useSyncStore();

  const icons = {
    connected: <Wifi className="w-4 h-4 text-green-500" />,
    disconnected: <WifiOff className="w-4 h-4 text-red-500" />,
    reconnecting: <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />,
  };

  return (
    <div className="flex items-center gap-2 text-sm">
      {icons[status]}
      {pendingCount > 0 && <span className="text-gray-600">{pendingCount} pending</span>}
    </div>
  );
}
```

## Testing Strategy

### Manual Testing

#### Basic 2-Tab Testing

1. Open app in 2 browser tabs (same browser, same user)
2. Create transaction in tab 1
3. Verify appears in tab 2 within 2 seconds
4. Edit in tab 2, verify updates in tab 1

#### Multi-Device Testing

1. Open app on desktop Chrome + mobile Safari
2. Create transaction on desktop
3. Verify appears on mobile within 2 seconds
4. Test offline: Turn off WiFi on mobile, edit, turn back on
5. Verify sync resolves correctly

#### Connection Recovery Testing

1. Open app in browser
2. Open DevTools → Network → Throttling → Offline
3. Create transaction (should queue locally)
4. Go back online
5. Verify transaction syncs within 5 seconds

#### RLS Permission Testing

1. Create 2 test users (User A, User B)
2. Login as User A, create transaction
3. Login as User B in another tab
4. Verify User B sees transaction (household data shared)
5. Create personal account, verify User A doesn't see it

### Automated Testing

#### Unit Tests (Vitest)

```typescript
describe("RealtimeSync", () => {
  it("filters out own device changes", () => {
    const deviceId = "device-abc";
    const filter = buildFilter(deviceId);
    expect(filter).toBe("device_id=neq.device-abc");
  });

  it("handles INSERT events", async () => {
    const payload = { eventType: "INSERT", new: mockTransaction };
    await realtimeSync.handleChange(payload);

    const stored = await db.transactions.get(mockTransaction.id);
    expect(stored).toBeDefined();
  });

  it("detects conflicts on UPDATE", async () => {
    await db.transactions.add(localVersion);

    const payload = { eventType: "UPDATE", new: remoteVersion };
    await realtimeSync.handleChange(payload);

    // Should trigger conflict resolution
    expect(conflictResolver.resolve).toHaveBeenCalled();
  });
});
```

#### Integration Tests

```typescript
describe("Realtime Integration", () => {
  it("syncs across devices", async () => {
    // Simulate Device A creating transaction
    await deviceA.createTransaction(mockTx);

    // Wait for realtime propagation
    await waitFor(
      () => {
        const synced = deviceB.getTransaction(mockTx.id);
        expect(synced).toBeDefined();
      },
      { timeout: 3000 }
    );
  });
});
```

#### E2E Tests (Playwright)

```typescript
test("multi-device sync", async ({ browser }) => {
  // Create 2 browser contexts (simulate 2 devices)
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();

  const pageA = await deviceA.newPage();
  const pageB = await deviceB.newPage();

  // Both login as same user
  await loginAs(pageA, "test@example.com");
  await loginAs(pageB, "test@example.com");

  // Device A creates transaction
  await pageA.click('[data-testid="add-transaction"]');
  await pageA.fill('[name="amount"]', "1500");
  await pageA.click('[data-testid="save"]');

  // Verify appears on Device B within 3 seconds
  await expect(pageB.locator('[data-testid="transaction-item"]').first()).toBeVisible({
    timeout: 3000,
  });
});
```

### Subscription Cleanup Testing

```typescript
test("no memory leaks on unmount", async () => {
  const initialChannels = supabase.getChannels().length;

  const { unmount } = render(<App />);

  // Wait for subscriptions to establish
  await waitFor(() => {
    expect(supabase.getChannels().length).toBeGreaterThan(initialChannels);
  });

  // Unmount component
  unmount();

  // Verify all channels cleaned up
  await waitFor(() => {
    expect(supabase.getChannels().length).toBe(initialChannels);
  });
});
```

## Troubleshooting

### Realtime Not Working

**Check**:

1. Realtime enabled in Supabase project settings
2. Tables added to replication (Database → Replication)
3. RLS SELECT policies exist for authenticated users
4. User is authenticated (check `supabase.auth.getSession()`)
5. Browser console shows `SUBSCRIBED` status

### Infinite Loops

**Symptom**: Creating a transaction triggers infinite updates

**Cause**: Missing device filter in subscription

**Fix**: Ensure `filter: device_id=neq.${deviceId}` is present

### Events Not Arriving

**Check**:

1. Network tab shows WebSocket connection (Status 101)
2. Try manually inserting row in Supabase dashboard
3. Check browser console for errors
4. Verify other device can trigger event (not just your device)

---

**Ready?** → Open `instructions.md` to begin
