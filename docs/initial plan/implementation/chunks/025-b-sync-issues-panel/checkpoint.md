# Checkpoint: Sync Issues Panel

Run these verifications to ensure SyncIssuesPanel works correctly.

---

## Prerequisites Check ⚠️ DO THIS FIRST

Before testing, verify dependencies:

```bash
# 1. Check sync issues manager exists
grep -l "SyncIssuesManager" src/lib/sync/*.ts

# 2. Check store exists
grep -l "useSyncIssuesStore" src/stores/*.ts

# 3. Check components exist
grep -l "SyncIssuesPanel" src/components/*.tsx
```

**If any command shows no results**, complete implementation steps first.

---

## 1. SyncIssuesPanel Renders ✓

### Initial State (No Issues)

**Expected**: Panel should NOT be visible when there are no issues.

**Test**:

```bash
npm run dev
# Open app in browser
# Check: NO amber badge should appear in bottom-right corner
```

**Visual verification**:

- [ ] Bottom-right corner is clean (no badge)
- [ ] No console errors
- [ ] App layout unchanged

### With Issues (Collapsed)

**Expected**: Amber badge appears showing issue count.

**Test** (in browser console):

```typescript
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";
import { useSyncIssuesStore } from "@/stores/syncIssuesStore";

// Simulate a conflict
await syncIssuesManager.logConflictResolution(
  "transaction",
  "tx-123",
  "amount_cents",
  10000,
  15000,
  15000
);

// Check store
console.log(useSyncIssuesStore.getState().issues);
// Should show 1 issue
```

**Visual verification**:

- [ ] Amber badge appears in bottom-right
- [ ] Badge shows "1 Sync Issues"
- [ ] Badge background is amber/yellow
- [ ] AlertCircle icon visible
- [ ] Badge is clickable

### Expanded Panel

**Test**: Click the badge to expand.

**Expected**:

- Panel expands in bottom-right corner
- Header shows "Sync Issues (1)"
- Issue item displays
- Close button (X) in header

**Visual verification**:

- [ ] Panel appears with shadow and border
- [ ] Panel background white/dark
- [ ] Header has amber background
- [ ] Close button functional
- [ ] Panel scrollable if many issues

---

## 2. Conflict Resolution Logging ✓

### Test: Log Conflict

```typescript
// In browser console
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";
import { useSyncIssuesStore } from "@/stores/syncIssuesStore";

// Log a conflict
await syncIssuesManager.logConflictResolution(
  "transaction",
  "tx-456",
  "description",
  "Old description",
  "New description",
  "New description" // Resolved to remote value
);

// Verify store updated
const issues = useSyncIssuesStore.getState().issues;
console.log(issues.length); // Should be 2 (from previous test)
console.log(issues[1].issueType); // Should be "conflict-resolved"
```

**Verify**:

- [ ] Issue appears in panel
- [ ] Type shows "Conflict Resolved"
- [ ] Message shows field name
- [ ] Green checkmark icon
- [ ] Timestamp shows "Just now"

### Expandable Details

**Test**: Click "View details" in conflict issue.

**Expected**: Shows comparison of local/remote/resolved values.

**Code in issue item**:

```json
{
  "Local": "Old description",
  "Remote": "New description",
  "Resolved": "New description"
}
```

**Visual verification**:

- [ ] Details section opens
- [ ] Shows all three values clearly
- [ ] Formatted as code/JSON
- [ ] Can click again to collapse

---

## 3. Sync Failure Logging ✓

### Test: Log Sync Failure

```typescript
// In browser console
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";

// Log a sync failure
const error = new Error("Network timeout after 30s");
await syncIssuesManager.logSyncFailure(
  "transaction",
  "tx-789",
  error,
  true // Retryable
);

// Check badge count
console.log(useSyncIssuesStore.getState().issues.length);
// Should be 3
```

**Verify**:

- [ ] Badge count increases to "3 Sync Issues"
- [ ] New issue appears in panel
- [ ] Type shows "Sync Failed"
- [ ] Red X icon
- [ ] Message shows error text

### Retry Button

**Expected**: Red X icon issue shows "Retry" button.

**Test**: Click retry button.

**Visual verification**:

- [ ] Button appears below X icon
- [ ] Icon shows RefreshCw
- [ ] Button has hover state
- [ ] Icon doesn't spin yet (no mutation in progress)

---

## 4. Validation Error Logging ✓

### Test: Log Validation Error

```typescript
// In browser console
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";

const error = new Error("Amount must be positive");
await syncIssuesManager.logValidationError("transaction", "tx-bad", error);

// Check count
console.log(useSyncIssuesStore.getState().issues.length);
// Should be 4
```

**Verify**:

- [ ] Badge count increases to "4 Sync Issues"
- [ ] New issue appears in panel
- [ ] Type shows "Validation Error"
- [ ] Alert/warning icon (orange)
- [ ] Message shows validation error

---

## 5. Issue Dismissal ✓

### Dismiss Single Issue

**Test**: Click X button on any issue.

**Expected**: Issue disappears from list.

**Visual verification**:

- [ ] Issue removes from panel immediately
- [ ] Badge count decreases
- [ ] Panel scrolls to show remaining issues
- [ ] No console errors

### Dismiss All

**Test**: Click "Clear All" button at bottom of panel.

**Expected**: All issues disappear.

**Visual verification**:

- [ ] All issues removed
- [ ] Panel shows empty state (optional - can also collapse)
- [ ] Badge disappears (no issues)
- [ ] Confirm no localStorage issues

---

## 6. Persistence ✓

### IndexedDB Storage

**Test**: Create issue, close panel, reopen browser tab.

```typescript
// Step 1: Log an issue
await syncIssuesManager.logConflictResolution(...);

// Step 2: Check IndexedDB
const stored = await db.syncIssues.toArray();
console.log(stored.length); // Should be 1+

// Step 3: Refresh page
window.location.reload();

// Step 4: After reload, issue should still appear in badge
// Badge count should show >=1
```

**Visual verification**:

- [ ] Issue persists after page reload
- [ ] Badge appears immediately
- [ ] Issue shows in panel when expanded
- [ ] Timestamp unchanged

### LocalStorage Integration (if used)

**Test**: Check localStorage after logging issue.

```typescript
// In console
localStorage.getItem("syncIssuesLastUpdate");
// Should contain timestamp or data
```

---

## 7. Panel Interactions ✓

### Collapse/Expand

**Test**:

1. Click badge to expand
2. Click X button to collapse
3. Click badge again to expand

**Verify**:

- [ ] Smooth transitions
- [ ] Panel appears/disappears correctly
- [ ] Badge always visible (even when expanded)
- [ ] Can click badge to toggle

### Responsive Design

**Test at different screen sizes**:

- Desktop (1920x1080)
- Tablet (768x1024)
- Mobile (375x667)

**Verify**:

- [ ] Panel always visible in corner
- [ ] Doesn't cover critical UI
- [ ] Scrollable on small screens
- [ ] Touch-friendly buttons on mobile

### Multiple Issues

**Test**: Create 10+ issues.

```typescript
for (let i = 0; i < 10; i++) {
  await syncIssuesManager.logConflictResolution(
    "transaction",
    `tx-${i}`,
    "amount_cents",
    1000 + i * 100,
    2000 + i * 100,
    2000 + i * 100
  );
}
```

**Verify**:

- [ ] Badge shows "10 Sync Issues"
- [ ] Panel scrollable
- [ ] All issues visible when scrolled
- [ ] No performance degradation
- [ ] Max height works correctly

---

## 8. Accessibility ✓

### Keyboard Navigation

**Test**:

1. Tab to badge button
2. Press Enter to expand
3. Tab to issue items
4. Tab to action buttons (Retry, Dismiss)
5. Press Enter to activate

**Verify**:

- [ ] All interactive elements focusable
- [ ] Visible focus indicators
- [ ] Tab order logical
- [ ] Can operate without mouse

### ARIA Labels

**Test in DevTools**:

```javascript
// Check badge
document.querySelector("button[title*='sync issue']").getAttribute("aria-label");
// Should have descriptive label

// Check panel
document.querySelector("[role='dialog']");
// Should have role and label
```

**Verify**:

- [ ] Badge has descriptive title
- [ ] Buttons have labels
- [ ] Status announced to screen readers
- [ ] No missing aria-labels

### Color Contrast

**Test with axe DevTools browser extension**:

```bash
npm run test:a11y -- --selector "[data-testid*='sync-issue']"
```

**Verify**:

- [ ] All text meets WCAG AA contrast
- [ ] Icons sufficient size (4x4 minimum)
- [ ] No text color issues
- [ ] Passes accessibility audit

---

## 9. Error Handling ✓

### Missing Dexie Table

**Test**: Try logging issue when `syncIssues` table not in schema.

**Expected**: Should not crash, warning logged.

**Verify**:

- [ ] Issue appears in UI (memory store works)
- [ ] Console warning shown
- [ ] No red errors in console
- [ ] App continues functioning

### Zustand Store Errors

**Test**: Force a store error (monkey patch for testing).

**Expected**: Graceful fallback.

**Verify**:

- [ ] Issues still display via component state
- [ ] No app crash
- [ ] Error logged to console

---

## 10. Integration with Sync Processor ✓

### Conflict Detection Integration

**Test**: When sync processor completes, conflicts logged automatically.

**Prerequisites**: Need Chunk 032 (conflict detection) output.

```typescript
// In sync processor onSuccess:
if (result.conflictsResolved) {
  for (const conflict of result.conflictsResolved) {
    await syncIssuesManager.logConflictResolution(...);
  }
}
```

**Verify**:

- [ ] Issues appear after sync completes
- [ ] Correct conflict details shown
- [ ] Badge updates with count
- [ ] No manual logging needed

### Sync Failure Integration

**Test**: When sync fails, failure logged.

```typescript
// In sync processor onError:
await syncIssuesManager.logSyncFailure(entityType, entityId, error, true);
```

**Verify**:

- [ ] Sync failure issue appears
- [ ] Retry button available
- [ ] Error message shows
- [ ] User can retry manually

---

## Success Criteria

Complete this checklist:

- [ ] Panel renders correctly (collapsed and expanded)
- [ ] Conflicts logged and displayed
- [ ] Sync failures logged and displayed
- [ ] Validation errors logged and displayed
- [ ] Issues can be dismissed individually
- [ ] "Clear All" clears all issues
- [ ] Issues persist in IndexedDB
- [ ] Panel responsive on all screen sizes
- [ ] Keyboard navigation works
- [ ] ARIA labels correct
- [ ] No accessibility violations
- [ ] Error handling graceful
- [ ] Integrates with sync processor
- [ ] Badge count accurate
- [ ] Timestamps display correctly
- [ ] Retry functionality works

---

## Common Issues During Verification

### Issue: Badge doesn't appear

**Solution**: Check `useSyncIssuesStore` has issues in state

```typescript
useSyncIssuesStore.getState().issues;
```

### Issue: Panel won't expand

**Solution**: Verify onClick handler exists on badge button

```typescript
// In SyncIssuesPanel
<button onClick={() => setExpanded(true)}>...</button>
```

### Issue: Issues don't persist after reload

**Solution**: Verify `db.syncIssues` table added to Dexie schema

```typescript
// In src/lib/dexie.ts
this.version(4).stores({
  syncIssues: "id, entityId, issueType, timestamp",
});
```

### Issue: Dismiss button doesn't work

**Solution**: Check `onDismiss` handler calls `syncIssuesManager.dismissIssue()`

```typescript
// In SyncIssueItem
onClick={async () => {
  await onDismiss();
}}
```

---

## Next Steps

🎉 **SyncIssuesPanel Complete!**

You now have:

- ✅ Conflict logging and display
- ✅ Sync failure tracking
- ✅ Manual retry mechanism
- ✅ Persistent issue history

**Optional next steps**:

1. **Chunk 032**: Conflict detection (feeds into SyncIssuesPanel)
2. **Chunk 034**: Realtime sync (updates issues in real-time)
3. **Chunk 035**: Event compaction (cleanup old issues)

---

**Estimated Time**: 20-30 minutes to verify all checkpoints
