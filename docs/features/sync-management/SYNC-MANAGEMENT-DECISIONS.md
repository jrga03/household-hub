# Sync Management - Design Decisions

## Decision Log

### Decision 1: Implement Per-Transaction Sync Badges

**Status:** ✅ Accepted

**Date:** 2024-11-22

**Problem:**

In an offline-first app, users create/edit transactions that may not immediately sync to the server. Without visual indication, users can't distinguish between:

- Safely synced data (persisted to cloud)
- Pending changes (only in IndexedDB)
- Failed syncs (stuck in queue)

This lack of visibility causes anxiety ("Did my transaction save?") and prevents users from taking corrective action on failed syncs.

**Decision:**

Add a `SyncBadge` component to each transaction row showing one of four states:

- **Synced** (green check): Safely persisted to Supabase
- **Pending** (amber clock): Queued in sync_queue, waiting to sync
- **Syncing** (blue loader): Currently being sent to server
- **Failed** (red alert): Sync failed, manual retry available

```typescript
<TableCell>
  <div className="flex items-center gap-2">
    <span>{transaction.description}</span>
    <SyncBadge status="synced" size="xs" />
  </div>
</TableCell>
```

**Alternatives Considered:**

1. **No visual indicator (status quo)**
   - Pros: Simpler UI, no additional components
   - Cons: Users have no visibility, causes confusion and anxiety
   - Verdict: Unacceptable for offline-first app

2. **Global status only (no per-item status)**
   - Pros: Less visual clutter
   - Cons: Users can't see which specific transactions are pending
   - Use case: User edits 3 transactions, 1 fails - how do they know which one?
   - Verdict: Insufficient granularity

3. **Status column in table**
   - Pros: More space for detailed status text
   - Cons: Takes up valuable table width, especially on mobile
   - Mobile impact: Forces horizontal scrolling or hiding other columns
   - Verdict: Too expensive for screen real estate

4. **Color-code entire row**
   - Pros: Very noticeable
   - Cons: Accessibility issues (color-blind users), visual noise
   - Example: Green row for synced, yellow for pending - overwhelming with many items
   - Verdict: Fails accessibility standards

**Rationale:**

- **Visibility:** Per-item badges provide immediate status at a glance
- **Actionable:** Failed badges can be clicked to retry (future enhancement)
- **Minimal:** Small icon doesn't crowd UI, works on mobile
- **Accessible:** Icon + tooltip + ARIA label (not color-only)
- **Standard pattern:** Similar to email clients (sent, sending, failed), Google Docs (saved, saving)

**Trade-offs:**

**Pros:**

- Users have complete visibility into sync state
- Reduces support requests ("where's my data?")
- Enables proactive problem-solving (user sees failed sync, retries)
- Builds trust (users see system is working)

**Cons:**

- Slight visual clutter in transaction list
- Must query sync_queue to determine status (performance consideration)
- Additional component to maintain

**Consequences:**

**Positive:**

- Users feel more confident in offline-first experience
- Easier to debug sync issues (user can screenshot failed items)
- Sets foundation for click-to-retry feature

**Negative:**

- Must ensure badge updates are performant (use query cache)
- Need to handle edge cases (transaction exists but no queue item = synced)

**Risks:**

- **Medium risk:** Performance impact on large transaction lists
- **Mitigation:** Use memoization, virtual scrolling (TanStack Virtual)
- **Mitigation:** Batch status queries by transaction IDs

**Performance Considerations:**

For 1000 transactions:

- Query sync_queue for all transaction IDs (single query with IN clause)
- Map results to create status lookup (O(n))
- Render badges with memoized components
- Target: < 100ms for full list

**Related Decisions:**

- Decision 2: Global sync status (complements per-item badges)
- Decision 4: Sync queue viewer (provides detail view)

---

### Decision 2: Add Global Sync Status Indicator in Header

**Status:** ✅ Accepted

**Date:** 2024-11-22

**Problem:**

Per-transaction badges show item-level status, but users need a quick way to understand overall sync health without scrolling through transaction list. Questions like:

- "Am I online or offline?"
- "How many items are pending?"
- "Is anything currently syncing?"
- "When was my last successful sync?"

...cannot be answered without inspecting individual items.

**Decision:**

Add `GlobalSyncStatus` component to app header with three variants:

- **Compact:** Icon + badge (mobile)
- **Default:** Icon + label + badge (desktop)
- **Detailed:** Full card with sublabel (settings page)

Component shows five states:

- **Offline:** Gray CloudOff icon, shows pending count
- **Syncing:** Blue Cloud with spinner, shows item count
- **Failed:** Red AlertCircle, "Tap to retry"
- **Pending:** Amber Cloud, shows item count
- **Synced:** Green Cloud, "All synced" or "Updated X ago"

Clicking opens SyncQueueViewer for detailed management.

**Alternatives Considered:**

1. **Status bar at top (like GitHub)**
   - Pros: Very prominent, hard to miss
   - Cons: Takes up permanent screen real estate, annoying when all synced
   - Mobile impact: Reduces content area by 48px constantly
   - Verdict: Too intrusive for normal operation

2. **Bottom toast notification**
   - Pros: Non-blocking, familiar pattern
   - Cons: Temporary (disappears), users miss status changes
   - Use case: User wonders if synced, but toast already dismissed
   - Verdict: Insufficient for persistent state

3. **Settings page only**
   - Pros: Doesn't clutter main UI
   - Cons: Hidden, users don't know to look for it
   - Discovery: How do users find sync status?
   - Verdict: Too hidden, defeats purpose

4. **Dropdown menu in header**
   - Pros: Keeps header clean
   - Cons: Requires extra click, status not visible at glance
   - UX: Users want instant awareness, not hunt-and-click
   - Verdict: Too many interactions

**Rationale:**

- **Ubiquitous:** Header is visible on every page
- **Non-intrusive:** Small component, doesn't dominate UI
- **Clickable:** Opens detailed view on demand
- **Informative:** Shows state + count + last sync time
- **Responsive:** Adapts to mobile (compact) vs desktop (default)

**Trade-offs:**

**Pros:**

- Always accessible without navigation
- Quick understanding of sync health
- No permanent space wasted (compact on mobile)
- Clickable for details (progressive disclosure)

**Cons:**

- Adds to header complexity
- Must poll for status updates (query refetch)
- Requires careful design to not overwhelm

**Consequences:**

**Positive:**

- Users have ambient awareness of sync state
- Reduces cognitive load (don't need to remember to check)
- Clickable detail view encourages exploration

**Negative:**

- Must ensure status updates are real-time (<1s latency)
- Need to handle edge cases (e.g., syncing but no pending count)

**Risks:**

- **Low risk:** Well-established UI pattern (Dropbox, Google Drive use similar)
- **Mitigation:** User testing to validate icon/label clarity

**Implementation Details:**

```typescript
// useSyncStatus hook provides data
const { isOnline, pendingCount, isSyncing, lastSyncTime } = useSyncStatus();

// Status determination logic
if (!isOnline) return { icon: CloudOff, label: "Offline" };
if (isSyncing) return { icon: Loader2, label: "Syncing" };
if (hasFailed) return { icon: AlertCircle, label: "Sync failed" };
if (pendingCount > 0) return { icon: Cloud, label: "Pending sync" };
return { icon: Cloud, label: "All synced" };
```

**Related Decisions:**

- Decision 1: Per-transaction badges (complementary granularity)
- Decision 3: Offline banner (handles network state changes)
- Decision 4: Sync queue viewer (detail view)

---

### Decision 3: Show Offline Banner on Network Disconnect

**Status:** ✅ Accepted

**Date:** 2024-11-22

**Problem:**

Users may not notice when their device loses network connectivity. They continue creating/editing transactions, expecting them to sync immediately, but instead items queue up. Without notification:

- User wonders why data isn't appearing on other devices
- User may panic ("Is my data lost?")
- User doesn't understand why pending count keeps growing

**Decision:**

Implement `OfflineBanner` component that:

1. **Detects offline:** Listens to `window` offline/online events + `navigator.onLine`
2. **Shows banner:** Amber banner slides down: "You're offline. Changes will sync when you reconnect."
3. **Celebrates reconnection:** Green banner: "You're back online!" with confetti
4. **Auto-dismisses:** Reconnection banner disappears after 3 seconds

```typescript
<OfflineBanner />
// Renders at top of layout, slides in/out based on network state
```

**Alternatives Considered:**

1. **Toast notification only**
   - Pros: Less intrusive, familiar pattern
   - Cons: Temporary, users miss it if not looking
   - Duration: 3-5 seconds - easy to miss
   - Verdict: Insufficient for state that may persist hours

2. **Modal dialog**
   - Pros: Impossible to miss
   - Cons: Blocks UI, requires dismissal, annoying
   - UX: User can't work until they dismiss - bad for offline-first
   - Verdict: Too disruptive

3. **Subtle icon change only (no banner)**
   - Pros: Minimal UI change
   - Cons: Passive, users may not notice
   - Discovery: Requires users to look at status icon
   - Verdict: Too subtle for important state change

4. **System notification (Web Notification API)**
   - Pros: OS-level, visible even if app in background
   - Cons: Requires permission, may not be granted, can't guarantee visibility
   - Permission: Many users deny notifications
   - Verdict: Can't rely on it as primary indicator

**Rationale:**

- **Proactive:** Banner appears automatically, no user action needed
- **Persistent:** Stays until online (unlike toast) or user dismisses
- **Celebratory:** Reconnection feels positive, not just absence of problem
- **Non-blocking:** User can still interact with app under banner
- **Clear:** Explains implication ("changes will sync when you reconnect")

**Trade-offs:**

**Pros:**

- Users immediately aware of offline state
- Reduces anxiety (explicitly states data will sync later)
- Celebration builds positive association with reconnection
- Can be dismissed if annoying

**Cons:**

- Takes up screen space (48px) while offline
- Could be annoying on flaky networks (frequent on/off)
- Requires careful animation to not be jarring

**Consequences:**

**Positive:**

- Users understand app behavior in offline mode
- Reduces support tickets ("data not saving")
- Celebration creates moment of delight

**Negative:**

- Must handle false positives (brief network blips)
- Animation must be smooth to not annoy users

**Risks:**

- **Medium risk:** Flaky network causes banner to flicker
- **Mitigation:** Debounce offline/online events (500ms delay)
- **Mitigation:** Only show reconnection banner if offline > 5 seconds

**Implementation:**

```typescript
const [isOnline, setIsOnline] = useState(navigator.onLine);
const [showReconnectBanner, setShowReconnectBanner] = useState(false);

useEffect(() => {
  const handleOnline = () => {
    setIsOnline(true);
    // Only celebrate if was offline for meaningful duration
    if (!isOnline) {
      setShowReconnectBanner(true);
      setTimeout(() => setShowReconnectBanner(false), 3000);
    }
  };

  const handleOffline = () => {
    setIsOnline(false);
  };

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}, [isOnline]);
```

**Celebration Design:**

- Green background (success color)
- "You're back online!" with party emoji
- Optional: Confetti animation (using canvas-confetti library)
- Auto-dismiss after 3 seconds (user doesn't need to close)

**Related Decisions:**

- Decision 2: Global sync status (shows persistent offline state)
- Decision 4: Sync queue viewer (where to see pending items)

---

### Decision 4: Create Comprehensive Sync Queue Viewer

**Status:** ✅ Accepted

**Date:** 2024-11-22

**Problem:**

GlobalSyncStatus shows count of pending items, but users need to:

- See which specific items are pending
- Understand why items failed (error messages)
- Retry failed items manually
- Discard problematic items that can't sync

Without detailed view, users are blind to queue contents and can't take corrective action.

**Decision:**

Implement `SyncQueueViewer` component as side sheet/drawer:

- **Opens:** When user clicks GlobalSyncStatus indicator
- **Groups items:** By entity type (Transactions, Accounts, Categories)
- **Shows details:** Operation (Create/Update/Delete), entity ID, status, retry count, error message
- **Actions:** Retry individual failed items, retry all failed, discard item, refresh
- **Auto-refresh:** Query refetches every 10 seconds

```typescript
<SyncQueueViewer open={showQueue} onOpenChange={setShowQueue} />
```

**Alternatives Considered:**

1. **Separate route/page**
   - Pros: More space, can add filters/search
   - Cons: Requires navigation away from current context
   - Use case: User sees "5 pending" in header, has to navigate to /sync to see details
   - Verdict: Too much friction for quick check

2. **Modal dialog**
   - Pros: Focused, no navigation
   - Cons: Blocks underlying UI, can't reference transaction while viewing queue
   - UX: User can't cross-reference queue with transaction list
   - Verdict: Too blocking

3. **Expandable section in settings**
   - Pros: Consolidated with other settings
   - Cons: Hidden, requires navigating to settings
   - Discovery: Users don't know to look in settings
   - Verdict: Too hidden for important operational status

4. **Bottom sheet (mobile-first)**
   - Pros: Native mobile pattern, thumb-friendly
   - Cons: Doesn't work as well on desktop
   - Consistency: Different patterns for mobile vs desktop
   - Verdict: Side sheet is more consistent cross-platform

**Rationale:**

- **Contextual:** Opens from GlobalSyncStatus, clear relationship
- **Non-blocking:** Sheet allows viewing underlying content
- **Comprehensive:** Shows all data needed (status, errors, counts)
- **Actionable:** Retry and discard buttons for each item
- **Real-time:** Auto-refreshes every 10 seconds
- **Organized:** Grouping by entity type aids scanning

**Trade-offs:**

**Pros:**

- Complete visibility into sync queue
- Users can diagnose and fix sync problems themselves
- Non-disruptive (side panel doesn't block)
- Works well on mobile (sheet is responsive)

**Cons:**

- Complex component (lots of state and logic)
- Must handle 100+ items gracefully (performance)
- Requires careful error message UX (actionable, not technical)

**Consequences:**

**Positive:**

- Users feel empowered (can see and fix problems)
- Reduces support burden (users self-serve)
- Provides observability into sync system

**Negative:**

- Must maintain complex component
- Need to handle edge cases (empty states, loading, errors)
- Requires ongoing iteration based on user feedback

**Risks:**

- **Medium risk:** Performance with large queues (100+ items)
- **Mitigation:** Virtual scrolling for item list
- **Mitigation:** Paginate if > 100 items
- **Mitigation:** Optimize query (only fetch necessary fields)

**UX Patterns:**

**Empty state (all synced):**

```
┌─────────────────────────────┐
│       ✅                     │
│   All caught up!            │
│   All your changes have     │
│   been synced to the cloud  │
└─────────────────────────────┘
```

**Loading state:**

```
┌─────────────────────────────┐
│       🔄                     │
│   Loading sync queue...     │
└─────────────────────────────┘
```

**Failed items:**

```
┌─────────────────────────────┐
│ ⚠ Update  transaction       │
│ ID: abc123...               │
│ Retry 3 / 5                 │
│ Error: Network timeout      │
│ Nov 22, 14:30      [↻][🗑]  │
└─────────────────────────────┘
```

**Batch actions:**

```
┌─────────────────────────────┐
│ [↻ Retry All Failed (3)]    │
│ [🔄 Refresh]                 │
└─────────────────────────────┘
```

**Related Decisions:**

- Decision 5: Manual retry operations
- Decision 6: Discard operation with confirmation

---

### Decision 5: Implement Manual Retry Operations

**Status:** ✅ Accepted

**Date:** 2024-11-22

**Problem:**

When sync items fail (network error, validation error, server timeout), they enter "failed" state with exponential backoff. Max retries default to 5. After max retries exhausted, item is stuck forever unless:

1. User waits for system to eventually retry (undefined timeline)
2. User manually triggers retry

Without manual retry, users can't resolve sync problems on their timeline.

**Decision:**

Implement three manual retry operations:

1. **Retry single item:** Reset specific failed item to "queued" status with retry_count = 0
2. **Retry all failed:** Batch reset all failed items for user
3. **Trigger sync processor:** Force immediate sync attempt (don't wait for interval)

```typescript
// Single item
const retryMutation = useRetrySyncItem();
retryMutation.mutate(itemId);

// All failed
const retryAllMutation = useRetryAllFailed();
retryAllMutation.mutate();
```

**Alternatives Considered:**

1. **Automatic retry only (no manual)**
   - Pros: Simpler, no UI needed
   - Cons: Users can't control timing, frustrating when they want immediate fix
   - Use case: User fixes WiFi, wants to sync NOW, not in 5 minutes
   - Verdict: Insufficient user control

2. **Increase max_retries instead of reset**
   - Pros: Preserves retry history
   - Cons: Eventually hits new max, temporary solution
   - Example: Increase from 5 to 10, still fails, now what?
   - Verdict: Kicks the can, doesn't solve root issue

3. **Delete and recreate item**
   - Pros: Fresh start
   - Cons: Loses original timestamp, complicates event sourcing
   - Audit trail: Deleting event is problematic for history
   - Verdict: Violates event sourcing principles

4. **Manual intervention in database**
   - Pros: Maximum control
   - Cons: Requires database access, not user-friendly
   - Accessibility: Not available to end users
   - Verdict: Not feasible for self-service

**Rationale:**

- **User control:** Gives users agency to resolve problems
- **Immediate:** No waiting for exponential backoff cycle
- **Fresh attempts:** Resetting retry_count gives max attempts again
- **Auditable:** Preserves original event, just resets status
- **Safe:** RLS ensures users can only retry their own items

**Trade-offs:**

**Pros:**

- Users can fix sync issues immediately
- Reduces frustration ("I know I'm online now, why won't it sync?")
- Empowers users to self-serve
- Simple implementation (UPDATE query)

**Cons:**

- Users could spam retry (rate limiting consideration)
- Might retry items that will fail again (same error)
- Requires explaining retry count reset to users

**Consequences:**

**Positive:**

- Faster problem resolution
- Better user experience (control)
- Fewer support tickets

**Negative:**

- Must handle retry spamming (implement debounce)
- Need clear error messages (so users know why retry failed again)

**Risks:**

- **Low risk:** Spamming retries could overload sync processor
- **Mitigation:** Debounce retry button (1 second cooldown)
- **Mitigation:** Rate limit retries (max 10 per minute per user)

**Implementation:**

**Server-side (Supabase RPC):**

```sql
CREATE OR REPLACE FUNCTION retry_sync_item(item_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sync_queue
  SET
    status = 'queued',
    retry_count = 0,
    error_message = NULL,
    updated_at = NOW()
  WHERE id = item_id
    AND user_id = auth.uid(); -- RLS check

  -- Trigger sync processor (via pg_notify)
  PERFORM pg_notify('sync_trigger', auth.uid()::text);
END;
$$;
```

**Client-side:**

```typescript
export function useRetrySyncItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (itemId: string) => retrySyncQueueItem(itemId, user.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-queue"] });
      toast.success("Retry initiated - syncing now...");
    },
    onError: () => {
      toast.error("Failed to retry item");
    },
  });
}
```

**Related Decisions:**

- Decision 6: Discard operation (alternative to retry)
- Decision 4: Sync queue viewer (UI for retry)

---

### Decision 6: Add Discard Operation with Confirmation

**Status:** ✅ Accepted

**Date:** 2024-11-22

**Problem:**

Some sync items may be permanently stuck due to:

- Invalid data that can't be corrected
- Conflict that user chooses to abandon
- Mistake that user wants to cancel

Without discard option, these items clutter sync queue forever, and user can't clean them up.

**Decision:**

Implement discard operation that:

1. **Requires confirmation:** Modal: "Discard this change? This action cannot be undone."
2. **Deletes from queue:** Permanently removes item from sync_queue table
3. **Preserves IndexedDB:** Local data unaffected (only queue item deleted)
4. **Shows warning:** User understands data won't sync to server

```typescript
const handleDiscard = () => {
  if (confirm("Discard this change? This action cannot be undone.")) {
    discardMutation.mutate(itemId);
  }
};
```

**Alternatives Considered:**

1. **No discard (keep forever)**
   - Pros: No data loss, preserves all events
   - Cons: Queue becomes cluttered, confusing for users
   - Use case: User has 20 failed items, 19 are mistakes - can't clean up
   - Verdict: Frustrating, poor UX

2. **Archive instead of delete**
   - Pros: Reversible, maintains audit trail
   - Cons: More complex (need archive table), archive still shows somewhere
   - Query impact: Filters become more complex (exclude archived)
   - Verdict: Over-engineered for MVP

3. **Auto-discard after X days**
   - Pros: Automatic cleanup
   - Cons: User doesn't control timing, might discard wanted items
   - Safety: What if user wants to keep trying?
   - Verdict: Too aggressive, removes user control

4. **Hide instead of delete**
   - Pros: Reversible
   - Cons: Still in database, complicates queries, where to unhide?
   - UI complexity: Need "show hidden items" toggle
   - Verdict: Adds too much complexity

**Rationale:**

- **User control:** Only user decides when to discard
- **Confirmation:** Prevents accidental deletion (modal + explicit text)
- **Clean queue:** Removes clutter for better queue readability
- **Simple:** Straightforward DELETE operation
- **Safe:** RLS ensures users only discard their items

**Trade-offs:**

**Pros:**

- Clean queue (no stuck items forever)
- User empowerment (control over queue)
- Simple implementation (single DELETE)
- Clear consequence (explicit warning)

**Cons:**

- Permanent data loss (can't undo)
- User might discard something important accidentally
- Loses audit trail for that change attempt

**Consequences:**

**Positive:**

- Users can maintain clean sync queue
- Reduces anxiety about stuck items
- Allows recovering from mistakes (user created wrong transaction, queued, wants to abandon)

**Negative:**

- Must ensure confirmation is clear and prominent
- Need to educate users on implications
- Lost ability to debug why item failed (deleted from queue)

**Risks:**

- **Medium risk:** User accidentally discards important change
- **Mitigation:** Strong confirmation dialog with clear warning
- **Mitigation:** Recommend retry first, discard as last resort
- **Mitigation:** Consider adding "Undo" within 5 seconds (future enhancement)

**Confirmation UX:**

```typescript
// Native confirm dialog (simple, works everywhere)
if (window.confirm("Discard this change? This action cannot be undone.")) {
  discardMutation.mutate(itemId);
}
```

**Future enhancement: Custom dialog**

```
┌─────────────────────────────────────┐
│ ⚠ Discard Change?                   │
├─────────────────────────────────────┤
│ This will permanently remove this   │
│ change from the sync queue. The     │
│ change will NOT sync to the server. │
│                                     │
│ This action cannot be undone.       │
│                                     │
│ [Cancel]    [Discard Change]        │
└─────────────────────────────────────┘
```

**Related Decisions:**

- Decision 5: Manual retry (alternative to discard)
- Decision 4: Sync queue viewer (UI for discard)

---

## Common Patterns Established

### Pattern 1: Sync Status Determination

```typescript
function determineSyncStatus(transaction: Transaction, queueItem?: SyncQueueItem): SyncStatus {
  if (!queueItem) return "synced"; // Not in queue = already synced

  if (queueItem.status === "failed") return "failed";
  if (queueItem.status === "syncing") return "syncing";
  if (queueItem.status === "queued") return "pending";

  return "synced"; // Default
}
```

### Pattern 2: Safe Confirmation for Destructive Actions

```typescript
// Always confirm before permanent deletion
const handleDiscard = () => {
  const confirmed = window.confirm("Discard this change? This action cannot be undone.");

  if (confirmed) {
    mutation.mutate(itemId);
  }
};
```

### Pattern 3: Optimistic UI Updates with Rollback

```typescript
useMutation({
  mutationFn: retrySyncItem,
  onMutate: async (itemId) => {
    // Cancel queries
    await queryClient.cancelQueries({ queryKey: ["sync-queue"] });

    // Snapshot previous state
    const previous = queryClient.getQueryData(["sync-queue"]);

    // Optimistic update (show as queued immediately)
    queryClient.setQueryData(["sync-queue"], (old) =>
      old.map((item) => (item.id === itemId ? { ...item, status: "queued", retry_count: 0 } : item))
    );

    return { previous };
  },
  onError: (err, vars, context) => {
    // Rollback on error
    queryClient.setQueryData(["sync-queue"], context.previous);
  },
});
```

### Pattern 4: Auto-Refresh with Configurable Interval

```typescript
useQuery({
  queryKey: ["sync-queue", "pending"],
  queryFn: getPendingQueueItems,
  refetchInterval: 10000, // 10 seconds
  enabled: open && !!user?.id, // Only refetch when viewer is open
});
```

## Migration Strategy

### Phase 1: Visual Indicators ✅

- SyncBadge component
- GlobalSyncStatus component
- OfflineBanner component

### Phase 2: Queue Management ✅

- SyncQueueViewer component
- Manual retry operations
- Discard operation

### Phase 3: Future Enhancements 🔜

- Click-to-retry on SyncBadge
- Conflict resolution UI in queue viewer
- Export queue as CSV for debugging
- Sync analytics dashboard

## Lessons Learned

### What Worked Well

1. **Progressive disclosure:** Summary → Detail works well (header status → queue viewer)
2. **Confirmation dialogs:** Users appreciate safety net for destructive actions
3. **Real-time updates:** 10-second auto-refresh feels responsive without being excessive
4. **Celebration UX:** Reconnection banner creates positive moment

### What We'd Do Differently

1. **Earlier implementation:** Should have built sync visibility from day 1
2. **More granular states:** Could add "validating" state between queued and syncing
3. **Better error messages:** Need more actionable error text (future iteration)

### Common Pitfalls

1. **Forgetting RLS:** Always filter sync_queue by user_id (security)
2. **Status logic:** Handle missing queue items (means synced, not error)
3. **Performance:** Don't fetch queue for every transaction (batch queries)
4. **Offline detection:** window events + navigator.onLine can have false positives

## Further Reading

- [Offline-First Design](https://www.smashingmagazine.com/2016/03/offline-first-approach-to-mobile-app-development/)
- [Sync UX Patterns](https://developers.google.com/web/fundamentals/instant-and-offline/offline-ux)
- [Error Message Best Practices](https://www.nngroup.com/articles/error-message-guidelines/)
- [Confirmation Dialog Design](https://www.nngroup.com/articles/confirmation-dialog/)

**Related Documentation:**

- [SYNC-MANAGEMENT.md](SYNC-MANAGEMENT.md) - Feature overview
- [sync-management-implementation.md](sync-management-implementation.md) - Implementation guide
- [/docs/initial plan/SYNC-ENGINE.md](../../initial%20plan/SYNC-ENGINE.md) - Core sync architecture
