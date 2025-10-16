# Chunk 034: Sync Realtime

## At a Glance

- **Time**: 1 hour
- **Milestone**: Multi-Device Sync (9 of 10)
- **Prerequisites**: Chunk 033 (conflict resolution working)
- **Can Skip**: No - enables automatic multi-device sync

## What You're Building

Supabase realtime subscriptions for automatic sync:

- Realtime channel subscriptions (transactions, accounts, categories)
- Change handlers for INSERT/UPDATE/DELETE
- Integration with conflict resolution
- Update local IndexedDB on remote changes
- UI state updates on sync
- Connection status indicator

## Why This Matters

Realtime sync is the **magic of Phase B**. It enables:

- **Instant propagation**: Changes appear on all devices within seconds
- **No manual sync**: Automatic background synchronization
- **Conflict resolution**: Automatically resolves concurrent edits
- **User delight**: Seamless multi-device experience
- **Reliability**: Handles connection drops gracefully

## Key Files Created

```
src/
├── lib/
│   ├── realtime-sync.ts         # Realtime subscription manager
│   └── realtime-sync.test.ts    # Unit tests
└── components/
    └── SyncIndicator.tsx         # Connection status UI
```

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 669-759 (realtime subscriptions)
- **Supabase Docs**: Realtime subscriptions

## Technical Stack

- **Supabase Realtime**: PostgreSQL change data capture (CDC)
- **Channels**: Subscribe to table-level changes
- **TypeScript**: Type-safe event handlers
- **React**: Integration with component lifecycle

## Design Patterns

### Subscription Pattern

```typescript
// Subscribe to all changes on transactions table
supabase
  .channel("transactions")
  .on(
    "postgres_changes",
    {
      event: "*", // INSERT, UPDATE, DELETE
      schema: "public",
      table: "transactions",
    },
    handleChange
  )
  .subscribe();
```

### Event Handler Pattern

```typescript
private handleChange = async (payload: RealtimePayload) => {
  const { eventType, new: newRecord, old: oldRecord } = payload;

  // Route to appropriate handler
  switch (eventType) {
    case "INSERT": await this.handleInsert(newRecord); break;
    case "UPDATE": await this.handleUpdate(newRecord, oldRecord); break;
    case "DELETE": await this.handleDelete(oldRecord); break;
  }
};
```

### Conflict Resolution Integration

```typescript
// During UPDATE, check for conflicts
if (localRecord && localRecord.updated_at !== newRecord.updated_at) {
  const detection = detectConflict(localEvent, remoteEvent);

  if (detection.hasConflict) {
    // Resolve and apply winner
    const resolution = await resolveConflict(localEvent, remoteEvent);
    await applyWinner(resolution.winner);
  }
}
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
Remote Change → Realtime Handler → Conflict Detection → Resolution → IndexedDB Update → UI Refresh
```

### 3. Multi-Table Subscriptions

```typescript
// Subscribe to multiple tables
await Promise.all([
  subscribeToTransactions(),
  subscribeToAccounts(),
  subscribeToCategories(),
  subscribeToBudgets(),
]);
```

## Performance Characteristics

- **Latency**: 100-500ms for changes to propagate
- **Throughput**: Handles 100+ changes/second
- **Memory**: ~50KB per active subscription
- **Bandwidth**: ~1KB per change event

## Connection Management

### Reconnection Strategy

```typescript
// Automatic reconnection on connection drop
subscription.on("system", {}, (status) => {
  if (status === "SUBSCRIBED") {
    console.log("Connected");
  } else if (status === "CHANNEL_ERROR") {
    console.log("Reconnecting...");
    // Supabase handles reconnection automatically
  }
});
```

### Offline Detection

```typescript
// Track online/offline status
window.addEventListener("online", () => {
  setStatus("online");
  // Trigger manual sync to catch up
  await syncQueue.processAll();
});

window.addEventListener("offline", () => {
  setStatus("offline");
  // Queue changes locally
});
```

## Common Scenarios

### Scenario 1: Instant Sync

```
Device A: User creates transaction → Supabase
Device B: Receives realtime event → Updates IndexedDB → UI refreshes
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
CREATE POLICY "Users can view household transactions"
ON transactions FOR SELECT
USING (household_id IN (SELECT household_id FROM profiles WHERE id = auth.uid()));

-- Realtime uses SELECT permissions
-- INSERT/UPDATE/DELETE permissions handled by mutation RPC calls
```

## Browser Compatibility

- **Chrome/Edge**: Full support ✅
- **Firefox**: Full support ✅
- **Safari**: Full support ✅
- **iOS Safari**: WebSocket support with caveats ⚠️
  - Background tabs may pause connections
  - Requires manual sync on app focus

## Testing Strategy

### Manual Testing

1. Open app in 2 browser tabs
2. Create transaction in tab 1
3. Verify appears in tab 2 within 2 seconds
4. Edit in tab 2, verify updates in tab 1

### Automated Testing

- **Unit tests**: Mock Supabase realtime events
- **Integration tests**: Use test database with CDC
- **E2E tests**: Playwright with multiple browser contexts

---

**Ready?** → Open `instructions.md` to begin
