# Sync Management & Status Visibility

## Overview

Comprehensive sync status visibility and management system for Household Hub's offline-first architecture. Provides users with real-time visibility into sync queue status, manual sync controls, and clear offline/online indicators. Built on top of the event sourcing sync engine with TanStack Query integration.

**Status:** ✅ Implemented (Phase A - Days 1-7)

**Implementation Date:** November 2024

**Related Features:** Offline-first transactions, Event sourcing, Sync engine

## User Stories

**As a user, I want to see which transactions are syncing** so that I know which changes haven't reached the server yet.

**As a user, I want to see when I'm offline** so that I understand why syncs aren't happening immediately.

**As a user, I want to retry failed syncs manually** so that I can resolve sync issues without waiting for automatic retry.

**As a user, I want to see all pending sync items** so that I can understand what's waiting to sync and take action if needed.

**As a user, I want a celebration when I come back online** so that I feel reassured my data will sync.

**As a developer, I want consistent sync status indicators** so that users have a uniform experience across the app.

## Requirements

### Functional Requirements

- **FR1:** Display sync status badge on individual transactions (synced, pending, syncing, failed)
- **FR2:** Show global sync status in app header with online/offline indicator
- **FR3:** Display number of pending sync items in header
- **FR4:** Show offline banner when network is disconnected
- **FR5:** Celebrate reconnection with temporary success banner
- **FR6:** Provide detailed sync queue viewer with all pending items
- **FR7:** Allow manual retry of individual failed sync items
- **FR8:** Allow batch retry of all failed sync items
- **FR9:** Allow discarding problematic sync items (with confirmation)
- **FR10:** Auto-refresh sync queue every 10 seconds

### Non-Functional Requirements

- **NFR1:** Sync status updates must appear within 100ms of state change
- **NFR2:** Queue viewer must handle 100+ pending items smoothly
- **NFR3:** All sync indicators must have proper ARIA labels
- **NFR4:** Offline detection must be < 1 second latency
- **NFR5:** No performance impact on transaction list rendering

## Use Cases

### Use Case 1: View Sync Status of Individual Transaction

**Actor:** User

**Preconditions:**

- User is on transactions page
- Transactions exist (synced, pending, or failed)

**Main Flow:**

1. User views transaction list
2. Each transaction shows sync badge
3. Badge displays one of four states: synced (green check), pending (amber clock), syncing (blue loader), failed (red alert)
4. User hovers over badge
5. Tooltip shows detailed status text

**Postconditions:**

- User understands which transactions are safe (synced) vs pending

**Visual Indicators:**

- **Synced:** Green check mark - "Changes saved to cloud"
- **Pending:** Amber clock - "Waiting to sync"
- **Syncing:** Blue spinning loader - "Syncing to cloud..."
- **Failed:** Red alert circle - "Sync failed - tap to retry"

### Use Case 2: Monitor Global Sync Status

**Actor:** User

**Preconditions:**

- User is viewing any page in the app
- App header is visible

**Main Flow:**

1. User glances at header sync indicator
2. Sees one of: "All synced" (green), "Pending sync" (amber), "Syncing" (blue spinner), "Offline" (gray), "Sync failed" (red)
3. Badge shows count of pending items
4. User clicks indicator
5. Sync Queue Viewer opens as side sheet

**Postconditions:**

- User has awareness of overall sync health

**Status Configurations:**

- **Offline:** Gray CloudOff icon, "X pending" or "All changes saved locally"
- **Syncing:** Blue spinning Cloud, "X items"
- **Failed:** Red AlertCircle, "Tap to retry"
- **Pending:** Amber Cloud, "X items"
- **Synced:** Green Cloud, "Updated X ago" or "Up to date"

### Use Case 3: Handle Network Disconnection

**Actor:** User

**Preconditions:**

- User is online
- User is actively using the app

**Main Flow:**

1. Network disconnects (WiFi off, airplane mode, etc.)
2. Within 1 second, amber offline banner slides down from top
3. Banner reads "You're offline. Changes will sync when you reconnect."
4. GlobalSyncStatus shows "Offline" with pending count
5. User continues working (all features work offline)

**Postconditions:**

- User is aware of offline state
- User can continue using app without interruption

### Use Case 4: Celebrate Reconnection

**Actor:** User

**Preconditions:**

- User was offline
- User reconnects to network

**Main Flow:**

1. Network reconnects
2. Offline banner changes to green "You're back online!"
3. Confetti animation (optional) plays
4. Banner auto-dismisses after 3 seconds
5. Sync processor automatically starts
6. GlobalSyncStatus shows "Syncing" then "All synced"

**Postconditions:**

- User feels reassured connection is restored
- Sync begins automatically

### Use Case 5: View and Manage Sync Queue

**Actor:** User

**Preconditions:**

- User has pending or failed sync items
- User clicks GlobalSyncStatus indicator

**Main Flow:**

1. SyncQueueViewer sheet opens from right
2. Items are grouped by entity type (Transactions, Accounts, Categories)
3. Each group shows count badge
4. Each item shows: operation (Create/Update/Delete), entity type, ID snippet, status icon, retry count, error message (if failed)
5. Failed items show "Retry" button
6. All items show "Discard" button
7. Queue auto-refreshes every 10 seconds

**Postconditions:**

- User has full visibility into sync queue
- User can take action on failed items

### Use Case 6: Retry Failed Sync Item

**Actor:** User

**Preconditions:**

- Sync queue has failed items
- User has SyncQueueViewer open

**Main Flow:**

1. User sees failed item with red border
2. Error message displayed: "Network error" or "Validation failed"
3. Retry count shown: "Retry 3 / 5"
4. User clicks retry button (spinning refresh icon)
5. Item status changes to "queued"
6. Retry count resets to 0
7. Sync processor picks up item
8. Item syncs or fails again
9. Toast notification shows result

**Postconditions:**

- Item is retried with fresh retry count
- User gets immediate feedback

**Edge Cases:**

- Network still offline: Retry queues item, syncs when online
- Validation error persists: Item fails again, user must fix data

### Use Case 7: Retry All Failed Items

**Actor:** User

**Preconditions:**

- Multiple failed sync items exist
- User has SyncQueueViewer open

**Main Flow:**

1. User sees "Retry All Failed (X)" button at bottom of sheet
2. User clicks button
3. All failed items reset to "queued" status
4. Retry counts reset to 0
5. Toast shows "Retrying X items..."
6. Sync processor processes all items
7. Queue updates as items succeed/fail
8. Final toast shows result count

**Postconditions:**

- All failed items get fresh retry attempt
- User doesn't need to retry individually

### Use Case 8: Discard Problematic Sync Item

**Actor:** User

**Preconditions:**

- User has sync item that cannot be resolved
- User has SyncQueueViewer open

**Main Flow:**

1. User clicks "Discard" button (trash icon) on item
2. Confirmation dialog: "Discard this change? This action cannot be undone."
3. User confirms
4. Item deleted from sync_queue table
5. Item removed from queue viewer
6. Toast shows "Item discarded"
7. Queue count updates

**Postconditions:**

- Item permanently removed from queue
- Local IndexedDB data may still exist (not affected)

**WARNING:** This is destructive - the queued change will never sync to server.

**Valid use cases:**

- Item is stuck and blocking queue
- User realizes change was a mistake
- Conflict cannot be resolved (user chooses to abandon)

## Data Model

### Component Architecture

**SyncBadge:**

```typescript
interface SyncBadgeProps {
  status: "synced" | "pending" | "syncing" | "failed";
  size?: "xs" | "sm" | "md";
  className?: string;
}
```

**GlobalSyncStatus:**

```typescript
interface GlobalSyncStatusProps {
  variant?: "default" | "compact" | "detailed";
  className?: string;
}
```

**OfflineBanner:**

```typescript
// No props - self-contained component
// Uses navigator.onLine and custom online/offline events
```

**SyncQueueViewer:**

```typescript
interface SyncQueueViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface QueueItemCardProps {
  item: SyncQueueItem;
}
```

### Hook Signatures

```typescript
// Get current sync status
function useSyncStatus(): {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncTime: Date | null;
};

// Manual sync operations
function useRetrySyncItem(): UseMutationResult<SyncQueueOperationResult, Error, string>;
function useRetryAllFailed(): UseMutationResult<SyncQueueOperationResult, Error, void>;
function useDiscardSyncItem(): UseMutationResult<SyncQueueOperationResult, Error, string>;
```

### Sync Queue Item Structure

```typescript
interface SyncQueueItem {
  id: string;
  user_id: string;
  device_id: string;
  entity_type: "transaction" | "account" | "category" | "budget";
  entity_id: string;
  operation: {
    op: "create" | "update" | "delete";
    payload: any;
  };
  status: "queued" | "syncing" | "completed" | "failed";
  retry_count: number;
  max_retries: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
```

## Integration

### Dependencies

**Required packages:**

- `@tanstack/react-query@5.x` - Sync status queries
- `lucide-react` - Icons (Cloud, CloudOff, AlertCircle, etc.)
- `date-fns` - Timestamp formatting
- `sonner` - Toast notifications
- `@/components/ui/sheet` - Drawer/side panel
- `@/components/ui/badge` - Count badges
- `@/components/ui/button` - Action buttons
- `@/components/ui/tooltip` - Status tooltips

**Core files:**

- `/src/components/sync/SyncBadge.tsx`
- `/src/components/sync/GlobalSyncStatus.tsx`
- `/src/components/sync/OfflineBanner.tsx`
- `/src/components/sync/SyncQueueViewer.tsx`
- `/src/hooks/useSyncStatus.ts`
- `/src/hooks/useSyncQueueOperations.ts`
- `/src/lib/offline/syncQueue.ts`
- `/src/lib/offline/syncQueueOperations.ts`

### System Impact

**Positive impacts:**

- Users have full visibility into sync state
- Manual sync control reduces frustration
- Clear offline indicators prevent confusion
- Reduced support requests about "data not saving"

**Integration points:**

- AppLayout: GlobalSyncStatus in header, OfflineBanner at top
- TransactionList: SyncBadge on each transaction row
- Sync processor: Updates sync_queue status in real-time
- Auth store: Provides user_id for RLS filtering

**Performance:**

- Minimal impact: ~3KB gzipped for all components
- Query refetch interval: 10 seconds (configurable)
- No blocking renders (all queries use suspense fallbacks)

## Out of Scope

**Deferred to Phase B:**

- Conflict resolution UI (showing conflicting versions side-by-side)
- Detailed sync history/log viewer
- Sync analytics dashboard (success rate, avg sync time)
- Push notifications for sync failures
- Automatic conflict resolution preferences

**Not Implemented:**

- Sync queue priority/ordering control
- Bulk discard operations (security concern)
- Export sync queue as CSV
- Sync queue search/filtering
- Per-entity-type sync toggles

## Success Metrics

**Visibility:**

- ✅ 100% of users see sync status for each transaction
- ✅ Sync status updates appear within 100ms
- ✅ Offline banner shows within 1 second of disconnect

**User Control:**

- ✅ Users can retry failed syncs with single click
- ✅ Users can view all pending syncs in one place
- ✅ Batch retry processes 50+ items smoothly

**Reliability:**

- ✅ Queue viewer handles 100+ items without lag
- ✅ Auto-refresh doesn't cause UI jank
- ✅ No false positive offline detections

**User Experience:**

- ✅ Celebration banner on reconnection feels rewarding
- ✅ Error messages are actionable (not just "sync failed")
- ✅ Confirmation required before destructive actions

## Implementation Highlights

### 1. SyncBadge Component

**Visual Design:**

```
[✓] Synced      - Green check mark, subtle
[🕐] Pending     - Amber clock, noticeable
[⟳] Syncing     - Blue spinning loader, animated
[⚠] Failed      - Red alert, prominent
```

**Tooltip Text:**

- Synced: "Changes saved to cloud"
- Pending: "Waiting to sync"
- Syncing: "Syncing to cloud..."
- Failed: "Sync failed - tap to retry"

**Sizes:**

- `xs`: 10px icon (for dense lists)
- `sm`: 12px icon (default)
- `md`: 16px icon (for emphasis)

### 2. GlobalSyncStatus Variants

**Compact (Mobile Header):**

```
[icon] [badge:count]
```

- Just icon with count badge
- Click to open queue viewer
- Tooltip shows status details

**Default (Desktop Header):**

```
[icon] Status Label [badge:count]
```

- Icon + label + badge
- More descriptive
- Click to open queue viewer

**Detailed (Settings Page):**

```
+------------------------------+
| [icon]  Status Label         |
|         Sublabel info        |
|                 [badge:count]|
+------------------------------+
```

- Card layout with full details
- Last sync time
- Click to open queue viewer

### 3. OfflineBanner States

**Offline:**

```
🔶 You're offline. Changes will sync when you reconnect. [X]
```

- Amber background
- Stays visible until dismissed or online
- Dismissible with X button

**Back Online:**

```
✅ You're back online! 🎉
```

- Green background
- Auto-dismisses after 3 seconds
- Celebratory tone

**Slide Animation:**

- Slides down from top (0 → 48px)
- 200ms ease-out
- Pushes content down (no overlap)

### 4. SyncQueueViewer Layout

```
┌─────────────────────────────┐
│ Sync Queue              [X] │
│ 5 items waiting to sync     │
├─────────────────────────────┤
│ Transactions (3)       │
│ ┌─────────────────────────┐ │
│ │ ⚠ Update  transaction   │ │
│ │ ID: abc123...           │ │
│ │ Retry 2/5               │ │
│ │ Error: Network timeout  │ │
│ │ Nov 22, 14:30      [↻][🗑]│ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 🕐 Create  transaction   │ │
│ │ ID: def456...           │ │
│ │ Nov 22, 14:32      [🗑]  │ │
│ └─────────────────────────┘ │
│                             │
│ Accounts (2)           │
│ ...                         │
├─────────────────────────────┤
│ [Retry All Failed (2)]      │
│ [Refresh]                   │
└─────────────────────────────┘
```

**Features:**

- Grouped by entity type
- Color-coded status (red for failed)
- Truncated IDs (first 20 chars)
- Retry count with max
- Error messages
- Timestamps
- Action buttons (retry, discard)

### 5. Manual Retry Flow

**Client-Side:**

1. User clicks retry button
2. Call `useRetrySyncItem().mutate(itemId)`
3. Mutation sends to server
4. Optimistic UI update (show "Syncing...")
5. On success: invalidate queries, show toast
6. On error: show error toast

**Server-Side (Supabase):**

1. Update `sync_queue` row:
   - `status`: "failed" → "queued"
   - `retry_count`: reset to 0
   - `error_message`: null
   - `updated_at`: NOW()
2. RLS check ensures user owns item
3. Trigger sync processor
4. Return success/error

**Result:**

- Item gets fresh retry attempts (max_retries from 0)
- Sync processor picks it up on next cycle (< 30 seconds)
- User sees immediate feedback

## Testing

### Unit Tests

**SyncBadge:**

```typescript
describe("SyncBadge", () => {
  it("shows green check for synced status", () => {
    render(<SyncBadge status="synced" />);
    expect(screen.getByRole("img")).toHaveClass("text-green-600");
  });

  it("shows tooltip on hover", async () => {
    render(<SyncBadge status="pending" />);
    userEvent.hover(screen.getByRole("img"));
    await waitFor(() => {
      expect(screen.getByText("Waiting to sync")).toBeVisible();
    });
  });
});
```

**useSyncStatus:**

```typescript
describe("useSyncStatus", () => {
  it("returns correct pending count", async () => {
    const { result } = renderHook(() => useSyncStatus());
    await waitFor(() => {
      expect(result.current.pendingCount).toBe(3);
    });
  });

  it("updates isOnline when network changes", async () => {
    const { result } = renderHook(() => useSyncStatus());

    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => {
      expect(result.current.isOnline).toBe(false);
    });
  });
});
```

### Integration Tests

**Sync Queue Viewer:**

```typescript
test("retry failed item updates queue", async () => {
  render(<SyncQueueViewer open={true} onOpenChange={vi.fn()} />);

  const retryButton = await screen.findByTitle("Retry now");
  fireEvent.click(retryButton);

  await waitFor(() => {
    expect(screen.getByText("Retry initiated - syncing now...")).toBeVisible();
  });
});
```

### E2E Tests

**Offline scenario:**

```typescript
test("shows offline banner when network disconnects", async ({ page }) => {
  await page.goto("/transactions");

  // Simulate offline
  await page.context().setOffline(true);

  // Should show banner within 1 second
  await expect(
    page.locator('text="You\'re offline. Changes will sync when you reconnect."')
  ).toBeVisible({ timeout: 1000 });

  // GlobalSyncStatus should show offline
  await expect(page.locator('text="Offline"')).toBeVisible();
});

test("celebrates reconnection", async ({ page }) => {
  await page.goto("/transactions");

  // Go offline
  await page.context().setOffline(true);
  await expect(page.locator('text="You\'re offline"')).toBeVisible();

  // Reconnect
  await page.context().setOffline(false);

  // Should show celebration
  await expect(page.locator('text="You\'re back online!"')).toBeVisible({
    timeout: 1000,
  });

  // Should auto-dismiss after 3 seconds
  await expect(page.locator('text="You\'re back online!"')).not.toBeVisible({
    timeout: 4000,
  });
});
```

## Accessibility

### ARIA Labels

**SyncBadge:**

```typescript
<div role="img" aria-label="Sync status: Synced - Changes saved to cloud">
  <Check className="h-3 w-3" aria-hidden="true" />
</div>
```

**GlobalSyncStatus:**

```typescript
<button aria-label="Sync status: All synced. Click to view sync queue">
  <Cloud className="h-4 w-4" aria-hidden="true" />
  <span>All synced</span>
</button>
```

**SyncQueueViewer:**

```typescript
<Sheet>
  <SheetContent aria-labelledby="sync-queue-title">
    <SheetTitle id="sync-queue-title">Sync Queue</SheetTitle>
    <SheetDescription>5 items waiting to sync</SheetDescription>
  </SheetContent>
</Sheet>
```

### Keyboard Navigation

- **GlobalSyncStatus:** Tab to focus, Enter/Space to open queue
- **Retry buttons:** Tab to focus, Enter to retry
- **Discard buttons:** Tab to focus, Enter to confirm
- **Close queue:** Escape key

### Screen Reader Support

- Status changes announced via live regions
- Button states (disabled, busy) communicated
- Error messages associated with form controls
- Descriptive labels for all interactive elements

## Further Reading

- [Offline First Design Patterns](https://offlinefirst.org/)
- [Progressive Web App Sync](https://web.dev/offline-cookbook/)
- [TanStack Query Sync Patterns](https://tanstack.com/query/latest/docs/react/guides/mutations)
- [IndexedDB Transaction Patterns](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)

**Related Documentation:**

- [SYNC-MANAGEMENT-DECISIONS.md](SYNC-MANAGEMENT-DECISIONS.md) - Design decisions
- [sync-management-implementation.md](sync-management-implementation.md) - Implementation guide
- [/docs/initial plan/SYNC-ENGINE.md](../../initial%20plan/SYNC-ENGINE.md) - Core sync architecture
- [REACT-19-ENHANCEMENTS.md](../react-19-enhancements/REACT-19-ENHANCEMENTS.md) - Related UX improvements
