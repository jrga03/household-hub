# Troubleshooting: Sync Issues Panel

Common issues and solutions when implementing SyncIssuesPanel.

---

## Component Rendering Issues

### Problem: SyncIssuesPanel doesn't appear at all

**Symptoms**:

- No amber badge in bottom-right corner
- No errors in console
- Panel not visible even after logging issues

**Cause 1**: Component not imported in layout

**Solution**:
Check your root layout file:

```typescript
// In src/routes/__root.tsx or AppLayout.tsx
import { SyncIssuesPanel } from "@/components/SyncIssuesPanel";

export function RootLayout() {
  return (
    <>
      {/* Other components */}
      <SyncIssuesPanel /> {/* Must be included */}
    </>
  );
}
```

**Cause 2**: Zustand store not initialized

**Solution**:
Verify store exports correctly:

```typescript
// In src/stores/syncIssuesStore.ts
export const useSyncIssuesStore = create<SyncIssuesStore>((set) => ({
  issues: [],
  // ... rest of store
}));

// In component, can access:
const issues = useSyncIssuesStore((state) => state.issues);
console.log(issues); // Should be array, even if empty
```

**Cause 3**: CSS/Tailwind not applied

**Solution**:
Check Tailwind classes in SyncIssuesPanel:

```typescript
// Should have:
className = "fixed bottom-4 right-4 max-w-md";
className = "bg-white dark:bg-gray-800";

// If classes not applying, check:
// 1. Tailwind config includes src/components
// 2. Build process running correctly
// 3. No conflicting CSS overrides
```

Test with inline styles temporarily:

```typescript
<div style={{
  position: 'fixed',
  bottom: '16px',
  right: '16px'
}}>
```

---

### Problem: Badge visible but panel won't expand

**Symptoms**:

- Amber badge appears with issue count
- Clicking badge does nothing
- No console errors
- Panel stays collapsed

**Cause 1**: onClick handler not wired

**Solution**:
Verify button has onClick:

```typescript
// CORRECT
<button
  onClick={() => setExpanded(true)}
  className="..."
>
  <AlertCircle /> Sync Issues
</button>

// INCORRECT (missing onClick)
<button className="...">
  <AlertCircle /> Sync Issues
</button>
```

**Cause 2**: setExpanded state not working

**Solution**:
Check useState is imported:

```typescript
import { useState } from "react"; // REQUIRED

export function SyncIssuesPanel() {
  const [expanded, setExpanded] = useState(false);

  console.log("Expanded:", expanded); // Debug

  // ...
}
```

**Cause 3**: Conditional rendering preventing panel

**Solution**:
Check early return logic:

```typescript
// WRONG - returns null when expanded
if (!expanded) return null;

// CORRECT - only hides when no issues
if (issues.length === 0) return null;

// Then both states can show
if (!expanded) {
  return <button>Badge only</button>;
} else {
  return <div>Full panel</div>;
}
```

---

## State Management Issues

### Problem: Issues not appearing when logged

**Symptoms**:

- Manual logging works: `syncIssuesManager.logConflictResolution(...)`
- Badge count doesn't update
- Issues don't appear in panel
- No console errors

**Cause 1**: Store not updated

**Solution**:
Verify `logConflictResolution` calls store:

```typescript
// In SyncIssuesManager.logConflictResolution()
useSyncIssuesStore.getState().addIssue(issue); // MUST CALL THIS

// Check import:
import { useSyncIssuesStore } from "@/stores/syncIssuesStore";
```

Debug directly:

```typescript
// In console
import { useSyncIssuesStore } from "@/stores/syncIssuesStore";
useSyncIssuesStore.getState().addIssue({
  id: "test-1",
  entityType: "transaction",
  entityId: "tx-1",
  issueType: "conflict-resolved",
  message: "Test issue",
  timestamp: new Date(),
  canRetry: false,
});

// Check if issue appears
console.log(useSyncIssuesStore.getState().issues);
```

**Cause 2**: Store reference stale

**Solution**:
Make sure using `getState()`:

```typescript
// WRONG
const store = useSyncIssuesStore;
store.addIssue(...); // Won't work

// CORRECT
useSyncIssuesStore.getState().addIssue(...);

// OR in component
const addIssue = useSyncIssuesStore((state) => state.addIssue);
addIssue(...);
```

**Cause 3**: Multiple store instances

**Solution**:
Ensure single export:

```typescript
// src/stores/syncIssuesStore.ts
export const useSyncIssuesStore = create<SyncIssuesStore>(...);

// Don't export multiple instances:
// export const store1 = create(...);
// export const store2 = create(...); // WRONG - separate stores
```

---

### Problem: Issues disappear after page reload

**Symptoms**:

- Issues appear and work fine
- After page reload, issues gone
- Badge disappears
- Zustand store resets (expected)

**Cause 1**: Not loading from IndexedDB on startup

**Solution**:
Add initialization hook:

```typescript
// In src/lib/sync/SyncIssuesManager.ts
async loadFromStorage() {
  try {
    const stored = await db.syncIssues.toArray();
    for (const issue of stored) {
      this.issues.set(issue.id, issue);
      useSyncIssuesStore.getState().addIssue(issue);
    }
  } catch (error) {
    console.warn("Failed to load sync issues:", error);
  }
}

// Call on app startup:
// In App.tsx or routes/__root.tsx useEffect
useEffect(() => {
  syncIssuesManager.loadFromStorage();
}, []);
```

**Cause 2**: IndexedDB table not in schema

**Solution**:
Verify Dexie schema includes syncIssues:

```typescript
// In src/lib/dexie.ts
export class HouseholdHubDB extends Dexie {
  transactions!: Table<Transaction>;
  syncIssues!: Table<SyncIssueRecord>; // MUST EXIST

  constructor() {
    super("HouseholdHubDB");

    this.version(4).stores({
      // ... other tables
      syncIssues: "id, entityId, issueType, timestamp", // ADD THIS
    });
  }
}
```

Check if table exists:

```typescript
// In console
const tables = db.tables;
console.log(tables.map((t) => t.name));
// Should include "syncIssues"
```

---

## Persistence Issues

### Problem: IndexedDB errors

**Symptoms**:

- Console errors when adding to IndexedDB
- Issues log to UI but not persisting
- Warnings in console

**Common errors**:

```
QuotaExceededError: Storage quota exceeded
InvalidStateError: The database is closed
NotFoundError: Table not found
```

**Solution for QuotaExceededError**:
Storage quota exceeded, need to clear old data:

```typescript
// In SyncIssuesManager.logConflictResolution()
try {
  await db.syncIssues.add(issue);
} catch (error) {
  if (error.name === "QuotaExceededError") {
    // Delete issues older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    await db.syncIssues.where("timestamp").below(thirtyDaysAgo.toISOString()).delete();

    // Retry add
    await db.syncIssues.add(issue);
  }
}
```

**Solution for InvalidStateError**:
Database not properly initialized:

```typescript
// Ensure db is opened:
import { db } from "@/lib/dexie";
await db.open(); // Should auto-open but can be explicit

// Or check in component:
useEffect(() => {
  const checkDB = async () => {
    try {
      const count = await db.syncIssues.count();
      console.log("DB ready, issues:", count);
    } catch (error) {
      console.error("DB not ready:", error);
    }
  };
  checkDB();
}, []);
```

**Solution for NotFoundError**:
Table not in schema, see "Persistence Issues" above.

---

## UI/UX Issues

### Problem: Panel overlaps critical UI

**Symptoms**:

- Fixed position panel covers buttons
- Can't access underlying elements
- Z-index issues

**Solution**:
Check z-index and positioning:

```typescript
// In SyncIssuesPanel
<div className="fixed bottom-4 right-4 max-w-md z-50"> {/* Add z-50 */}
```

Or add modal backdrop if needed:

```typescript
// For centered modal instead of fixed corner
<div className="fixed inset-0 bg-black/50 z-40" onClick={() => setExpanded(false)} />
<div className="fixed bottom-1/4 left-1/2 transform -translate-x-1/2 z-50 ...">
```

### Problem: Scrolling not working in panel

**Symptoms**:

- Many issues but can't scroll
- Panel shows only first few issues
- Rest of issues hidden

**Solution**:
Ensure scrollable container:

```typescript
// CORRECT - scrollable div
<div className="max-h-96 overflow-y-auto">
  {issues.map(issue => (
    <SyncIssueItem key={issue.id} {...props} />
  ))}
</div>

// WRONG - no overflow
<div className="max-h-96">
```

### Problem: Timestamps display wrong

**Symptoms**:

- Shows "NaN days ago"
- Timestamps not updating
- Invalid dates

**Solution**:
Check date formatting:

```typescript
// In SyncIssueItem.tsx
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Debug:
  console.log("Date:", date);
  console.log("Now:", now);
  console.log("DiffMs:", diffMs);

  const diffMins = Math.floor(diffMs / 60000);

  // ...
}

// Ensure issues have proper Date object:
// NOT string:
issue.timestamp = new Date(); // CORRECT
issue.timestamp = new Date().toISOString(); // WRONG in memory store

// When loading from IndexedDB (stored as string):
const issue: SyncIssue = {
  ...dbRecord,
  timestamp: new Date(dbRecord.timestamp), // Convert back to Date
};
```

---

## Integration Issues

### Problem: Issues not logged from sync processor

**Symptoms**:

- Sync completes successfully
- No issues appear in panel
- Manual logging works fine
- No console errors

**Cause**: onSuccess handler not calling SyncIssuesManager

**Solution**:
Verify sync processor integration:

```typescript
// In useSyncProcessor.ts
export function useSyncProcessor() {
  return useMutation({
    // ...
    onSuccess: (result) => {
      // MUST call this:
      if (result.conflictsResolved?.length > 0) {
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

      if (result.failed?.length > 0) {
        for (const failure of result.failed) {
          syncIssuesManager.logSyncFailure(
            failure.entityType,
            failure.entityId,
            new Error(failure.error),
            true
          );
        }
      }
    },
  });
}
```

---

## Performance Issues

### Problem: Panel sluggish with many issues

**Symptoms**:

- Lag when expanding panel
- Slow scrolling with 50+ issues
- High CPU usage

**Solution 1**: Virtualize long lists

```typescript
// Use React Virtual for large issue lists
import { useVirtualizer } from "@tanstack/react-virtual";

// In SyncIssuesPanel issues list:
const virtualizer = useVirtualizer({
  count: issues.length,
  getScrollElement: () => scrollElementRef.current,
  estimateSize: () => 80, // Estimate height per issue
});

// Then render only visible items
virtualizer.getVirtualItems().map(virtualItem => (
  <SyncIssueItem
    key={issues[virtualItem.index].id}
    issue={issues[virtualItem.index]}
    // ...
  />
));
```

**Solution 2**: Paginate issues

```typescript
// Show only last 20 issues by default
const recentIssues = issues.slice(-20);

// Add "Load more" button
if (issues.length > 20) {
  <button onClick={() => setShowAll(true)}>
    Load {issues.length - 20} older issues
  </button>
}
```

**Solution 3**: Memoize components

```typescript
import { memo } from "react";

export const SyncIssueItem = memo(({ issue, onRetry, onDismiss }: Props) => {
  // Component won't re-render unless props change
  return (/* ... */);
});
```

---

## Accessibility Issues

### Problem: Screen reader doesn't announce issues

**Symptoms**:

- Visual updates but no audio announcements
- Screen reader silent when issue added
- Users on assistive tech miss issues

**Solution**:
Add ARIA live region:

```typescript
// In SyncIssuesPanel
export function SyncIssuesPanel() {
  const issues = useSyncIssuesStore((state) => state.issues);

  return (
    <>
      {/* Hidden live region for announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {issues.length > 0 && (
          <>
            {issues.length} sync {issues.length === 1 ? "issue" : "issues"}
            {/* List issues for screen reader */}
            {issues.map(issue => (
              <div key={issue.id}>{issue.message}</div>
            ))}
          </>
        )}
      </div>

      {/* Normal UI... */}
    </>
  );
}
```

### Problem: Focus trap in expanded panel

**Symptoms**:

- Tab key doesn't escape panel
- Keyboard navigation broken
- Can't reach content behind panel

**Solution**:
Implement focus management:

```typescript
import { useEffect, useRef } from "react";

export function SyncIssuesPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (expanded && panelRef.current) {
      // Focus first focusable element in panel
      const focusable = panelRef.current.querySelector(
        "button, [href], input, select, textarea, [tabindex]"
      ) as HTMLElement;
      focusable?.focus();
    }
  }, [expanded]);

  // Allow escape to close
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && expanded) {
        setExpanded(false);
      }
    };

    if (expanded) {
      window.addEventListener("keydown", handleEscape);
      return () => window.removeEventListener("keydown", handleEscape);
    }
  }, [expanded]);

  return (
    <div ref={panelRef}>
      {/* Panel content */}
    </div>
  );
}
```

---

## Prevention Tips

1. **Log early and often**: Test logging during development
2. **Use DevTools**: React DevTools to inspect store state
3. **Check IndexedDB**: DevTools → Application → IndexedDB to verify persistence
4. **Test keyboard nav**: Tab through panel regularly
5. **Screen reader testing**: Use macOS VoiceOver or NVDA
6. **Performance profile**: DevTools Profiler to check re-renders
7. **Console clean**: Should have no warnings or errors during normal use

---

## Quick Debugging Checklist

```typescript
// Quick diagnostics in browser console

// 1. Check component renders
document.querySelector(".fixed.bottom-4"); // Badge present?

// 2. Check store state
import { useSyncIssuesStore } from "@/stores/syncIssuesStore";
useSyncIssuesStore.getState().issues; // Any issues in store?

// 3. Check manager
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";
const issues = await syncIssuesManager.getPendingIssues(); // Any issues?

// 4. Check persistence
const stored = await db.syncIssues.toArray(); // Data in DB?

// 5. Add test issue
await syncIssuesManager.logConflictResolution("transaction", "tx-1", "amount", 100, 200, 200);
useSyncIssuesStore.getState().issues; // Should have issue now
```

---

## Getting Help

If stuck:

1. Check this troubleshooting guide first
2. Use DevTools to inspect state
3. Add `console.log` at each step
4. Check prerequisites are complete
5. Review checkpoint.md verification steps
6. Ask in project issues/discussions

---

**Remember**: Sync UI is critical for user trust. Take time to get it working smoothly!
