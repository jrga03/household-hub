# Checkpoint: Sync UI Indicators

Run these verifications to ensure sync UI components work correctly.

---

## 1. Sync Status Badge Renders ✓

### Visual Verification

**Load app while online**:

**Expected badge appearance**:

- ✅ Badge visible in app header/toolbar
- ✅ Shows green checkmark icon (CheckCircle2)
- ✅ Text reads "Synced"
- ✅ Uses outline variant (subtle)
- ✅ Proper spacing and alignment

**Check in DevTools**:

```javascript
// Verify component renders
document.querySelector("[data-testid='sync-status']"); // Should exist

// Check computed styles
const badge = document.querySelector(".badge");
console.log(getComputedStyle(badge).display); // Should be visible
```

---

## 2. Offline State Displays Correctly ✓

### Test: Go Offline

**Step 1**: Disable network (DevTools → Network → Offline)

**Expected changes**:

- Badge turns red (destructive variant)
- Icon changes to CloudOff
- Text reads "Offline"
- Color: Red/destructive theme color

**Verify**:

```typescript
// In console
const { isOnline } = useSyncStatus();
console.log("Online status:", isOnline); // Should be false
```

**Visual check**:

- [ ] Badge color is red/destructive
- [ ] CloudOff icon visible
- [ ] Text "Offline" is readable
- [ ] Icon and text aligned properly

**Step 2**: Re-enable network (DevTools → Network → Online)

**Expected behavior**:

- Badge automatically updates to "Synced"
- Color changes to outline/success
- CheckCircle2 icon appears
- Happens within 1-2 seconds

---

## 3. Pending Items Count Shows ✓

### Test: Create Offline Items

**Step 1**: Go offline

**Step 2**: Create 3 transactions offline

```typescript
// In console or via UI
for (let i = 0; i < 3; i++) {
  await createOfflineTransaction(
    {
      date: "2024-01-15",
      description: `Test ${i}`,
      amount_cents: 100000,
      type: "expense",
      status: "pending",
      visibility: "household",
    },
    userId
  );
}
```

**Step 3**: Check sync status badge

**Expected badge state**:

- Variant: secondary (yellow/warning color)
- Icon: Loader2 with spin animation
- Text: "3 pending"
- Animation: Spinner rotates smoothly

**Verify pending count**:

```typescript
const { pendingCount } = useSyncStatus();
console.log("Pending:", pendingCount); // Should be 3
```

**Visual check**:

- [ ] Number "3" displays correctly
- [ ] Spinner animates smoothly
- [ ] Badge not truncated
- [ ] Text readable

---

## 4. Syncing State Indicator ✓

### Test: Trigger Sync While Online

**Step 1**: Have pending items (from previous test)

**Step 2**: Go online, manually trigger sync

```typescript
// Click sync button or in console
await syncProcessor.processQueue(userId);
```

**Expected badge during sync**:

- Text changes to "Syncing..."
- Loader2 icon spins
- Secondary variant (neutral color)
- Updates in real-time as items process

**Expected badge after sync**:

- Changes to "Synced"
- CheckCircle2 icon (green)
- Outline variant
- Pending count = 0

**Timing check**:

- Badge updates within 500ms of sync starting
- Badge updates within 500ms of sync completing
- No visible lag or delay

---

## 5. Offline Banner Displays ✓

### Test: Offline Banner Appearance

**Step 1**: Go offline (Network → Offline)

**Expected banner**:

- Appears at top of content area
- Red/destructive alert style
- AlertCircle icon on left
- Message: "You're offline."
- Shows pending count if items exist
- Retry button visible
- Dismiss (X) button on right

**Visual verification**:

- [ ] Banner full width
- [ ] Red background/border
- [ ] Icon and text aligned
- [ ] Buttons accessible
- [ ] Not blocking critical UI

**Check message variants**:

```typescript
// With no pending items
"You're offline.";

// With pending items
"You're offline. 3 changes will sync when online.";
```

**Step 2**: Test with pending items

Create 3 transactions offline, verify banner shows count.

---

## 6. Offline Banner Interactions ✓

### Test: Retry Button

**Setup**: Have offline items in queue

**Test**:

1. Click "Retry" button on banner
2. While offline → shows error or no change
3. Go online → clicking Retry triggers sync

**Expected behavior**:

- Button shows loading state when clicked
- Text changes to "Retrying..."
- After sync attempt, button re-enables
- Banner auto-hides if sync succeeds

**Verify**:

```typescript
const { mutate: sync, isPending } = useSyncProcessor();
console.log("Sync pending:", isPending); // True during sync
```

### Test: Dismiss Button

**Test**:

1. Click X (dismiss) button
2. Banner disappears
3. Create new offline item
4. Banner does NOT reappear (still dismissed)
5. Go online
6. Banner resets (dismissed state cleared)
7. Go offline again
8. Banner reappears

**Expected**:

- Dismiss persists for current offline session
- Resets when back online
- Smooth fade-out animation

---

## 7. Manual Sync Button Works ✓

### Visual Verification

**Check button appearance**:

- Located in header/toolbar area
- Icon: RefreshCw (refresh icon)
- Text: "Sync" or "Sync (N)" with count
- Outline button variant
- Small size appropriate for header

**States to verify**:

**State 1: No pending items**

- Button disabled
- Grayed out appearance
- Not clickable
- Tooltip: "No changes to sync" (optional)

**State 2: Has pending items, online**

- Button enabled
- Shows count: "Sync (3)"
- Clickable
- Hover state visible

**State 3: Has pending items, offline**

- Button disabled
- Shows count: "Sync (3)"
- Not clickable (network required)

**State 4: Syncing in progress**

- Button disabled
- Icon spins (animate-spin class)
- Text: "Sync (3)" or "Syncing..."

### Functional Testing

**Test click behavior**:

```typescript
// Setup: Create 3 offline transactions
// Go online
// Click sync button

// Expected:
// 1. Button becomes disabled immediately
// 2. Icon starts spinning
// 3. Sync processor runs
// 4. Toast notification appears
// 5. Button re-enables after sync
// 6. Count updates to 0
```

**Verify toast messages**:

- Success: "Synced 3 items" (green toast)
- Partial failure: "1 items failed to sync" (red toast)
- Complete failure: "Sync failed" with error message

---

## 8. Real-Time Status Updates ✓

### Test: Status Changes Propagate

**Scenario**: Multiple devices or tabs

**Test**:

1. Open app in two browser tabs
2. Tab A: Create offline transaction
3. Tab B: Should see pending count increase
4. Tab A: Trigger sync
5. Tab B: Should see syncing → synced status change

**Expected behavior**:

- Status updates propagate within 10 seconds (refetch interval)
- Both tabs show consistent state
- No stale data displayed

**Check polling**:

```typescript
// Verify refetchInterval is set
const { data, refetchInterval } = useQuery({
  queryKey: ["sync-status", "pending-count"],
  queryFn: () => getQueueCount(userId),
  refetchInterval: 10000, // 10 seconds
});

console.log("Refetch interval:", refetchInterval); // Should be 10000
```

---

## 9. Keyboard Accessibility ✓

### Test: Keyboard Navigation

**Test sequence**:

1. Tab to sync status badge
2. Badge should receive focus ring (visual outline)
3. Tab to sync button
4. Press Enter → triggers sync
5. Tab to offline banner dismiss button
6. Press Enter → dismisses banner

**Expected**:

- All interactive elements focusable
- Visible focus indicators
- Enter/Space keys trigger actions
- Tab order logical (left-to-right, top-to-bottom)

**Check focus styles**:

```css
/* Should have visible focus ring */
.sync-button:focus-visible {
  outline: 2px solid var(--ring-color);
  outline-offset: 2px;
}
```

**Test with screen reader** (optional but recommended):

- Badge announces status changes
- Button announces pending count
- Banner announces offline state

---

## 10. Accessibility Attributes ✓

### Verify ARIA Labels

**Sync Status Badge**:

```html
<div role="status" aria-live="polite" aria-label="Sync status: synced">
  <!-- Badge content -->
</div>
```

**Sync Button**:

```html
<button aria-label="Sync 3 pending changes" aria-disabled="false">Sync (3)</button>
```

**Offline Banner**:

```html
<div role="alert" aria-live="assertive">
  <p>You're offline. 3 changes will sync when online.</p>
</div>
```

**Check with aXe DevTools** (browser extension):

- Run accessibility audit
- Zero violations for sync components
- All interactive elements have accessible names
- Color contrast meets WCAG AA

---

## 11. Component Integration ✓

### Verify Layout Integration

**Check component placement**:

- Sync status badge in app header (right side)
- Sync button next to status badge
- Offline banner below header, above main content
- Components don't overlap
- Responsive on mobile (components stack properly)

**Test at different viewports**:

- Desktop (1920x1080): All components visible
- Tablet (768x1024): Components resize appropriately
- Mobile (375x667): Badge text may truncate, but readable

**Check z-index stacking**:

- Offline banner appears above content
- Banner doesn't cover critical navigation
- Toasts appear above banner

---

## 12. Performance Validation ✓

### Test: No Excessive Re-Renders

**Setup**: Install React DevTools Profiler

**Test**:

1. Start profiling
2. Trigger sync with 10 pending items
3. Stop profiling
4. Check component render counts

**Expected**:

- SyncStatus: ~3-5 renders (initial, syncing, synced)
- SyncButton: ~3-5 renders
- OfflineBanner: ~2 renders (show, hide)
- No render loops or excessive updates

**Check polling frequency**:

```typescript
// Should not refetch more than once per 10 seconds
const { dataUpdatedAt } = useQuery({
  queryKey: ["sync-status", "pending-count"],
  // ...
});

console.log("Last updated:", new Date(dataUpdatedAt));
```

---

## 13. Toast Notifications ✓

### Verify Sync Toast Messages

**Test success toast**:

1. Create 5 offline transactions
2. Go online, trigger sync
3. Wait for completion

**Expected toast**:

- Message: "Synced 5 items"
- Type: Success (green)
- Duration: 3-4 seconds
- Position: Bottom-right or top-right
- Dismissible with X button

**Test failure toast**:

1. Create transaction with invalid data
2. Try to sync

**Expected toast**:

- Message: "1 items failed to sync" or specific error
- Type: Error (red)
- Duration: 5-6 seconds (longer for errors)
- Dismissible

**Check toast system** (Sonner):

```typescript
import { toast } from "sonner";

// Success
toast.success("Synced 5 items");

// Error
toast.error("Sync failed");

// Verify toasts appear
document.querySelector(".sonner-toast"); // Should exist
```

---

## 14. Edge Case Handling ✓

### Test: Rapid Online/Offline Switching

**Test**:

1. Toggle network on/off rapidly (5 times in 10 seconds)
2. Status badge should update consistently
3. No stale states
4. No crashes or errors

**Expected**:

- Badge updates correctly each time
- Auto-sync throttled (doesn't trigger 5 times)
- No UI flicker
- Console shows throttling logs

### Test: Many Pending Items

**Test**:

1. Create 100 offline transactions
2. Check badge displays "100 pending"
3. Number not truncated
4. Badge readable

**Expected**:

- Badge expands to fit number
- Text remains readable
- No layout breaks

### Test: Long Sync Duration

**Test**:

1. Create 50 offline items
2. Throttle network to Slow 3G
3. Trigger sync
4. Monitor status during long sync

**Expected**:

- Badge shows "Syncing..." throughout
- Spinner continues animating
- No timeout errors
- Eventually completes and shows "Synced"

---

## Success Criteria

Complete this checklist:

- [ ] Sync status badge renders correctly
- [ ] Offline state (red CloudOff) displays
- [ ] Online state (green CheckCircle2) displays
- [ ] Pending count shows correct number
- [ ] Syncing state (spinner) animates
- [ ] Offline banner appears when offline
- [ ] Banner shows pending count
- [ ] Retry button functional
- [ ] Dismiss button hides banner
- [ ] Manual sync button enabled/disabled correctly
- [ ] Sync button shows pending count
- [ ] Sync button triggers sync on click
- [ ] Real-time status updates work
- [ ] Keyboard navigation functional
- [ ] Focus indicators visible
- [ ] ARIA attributes correct
- [ ] Screen reader compatible (optional)
- [ ] Toast notifications appear
- [ ] Components integrate with layout
- [ ] Responsive on mobile
- [ ] No excessive re-renders
- [ ] Edge cases handled gracefully

---

## Common Issues During Verification

### Issue: Badge not updating

**Check hook**:

```typescript
const status = useSyncStatus();
console.log(status); // Should update when network changes
```

**Fix**: Ensure useOnlineStatus hook listening to events

### Issue: Pending count wrong

**Check query**:

```typescript
const { data: count } = useQuery({
  queryKey: ["sync-status", "pending-count"],
  queryFn: () => getQueueCount(userId),
});

console.log("Queue count:", count);
```

**Fix**: Verify getQueueCount queries sync_queue correctly

### Issue: Banner doesn't dismiss

**Check state**:

```typescript
const [dismissed, setDismissed] = useState(false);
console.log("Banner dismissed:", dismissed);
```

**Fix**: Ensure onClick handler calls setDismissed(true)

---

## Next Steps

🎉 **Congratulations! Milestone 3 Complete!**

You now have:

- ✅ Offline data reads from IndexedDB
- ✅ Offline data writes with temporary IDs
- ✅ Sync queue for tracking changes
- ✅ Background sync processor
- ✅ Visual sync indicators

The app is fully functional offline!

**Next milestone options**:

1. Continue to **Milestone 4**: Sync Engine (vector clocks, conflict resolution)
2. Or deploy current MVP and iterate

**To celebrate**:

1. Clear all test data
2. Commit sync UI code
3. Take a break! ☕

---

**Estimated Time**: 30-40 minutes to verify all checkpoints
