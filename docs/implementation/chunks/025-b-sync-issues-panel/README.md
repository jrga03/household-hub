# Chunk 025-b: Sync Issues Panel

## At a Glance

- **Time**: 2 hours
- **Milestone**: Advanced Offline Features (Milestone 3.5)
- **Prerequisites**: Chunk 025 (basic sync UI), Chunk 032 (conflict detection)
- **Can Skip**: Conditionally - see "When to Implement" section below

## What You're Building

Advanced sync issue management and visibility for users who want transparency:

- **Conflict Resolution Logging**: Shows what conflicts occurred automatically
- **Sync Failure Retry**: Manual retry mechanism for failed syncs
- **Issue Inspection**: Expandable view showing local/remote/resolved values
- **Issue Dismissal**: Users can acknowledge and dismiss issues
- **Persistent History**: Issues stored in IndexedDB and survive page reloads

## Why This Matters

**Transparency and Control**:

- Users see exactly what the system is doing with their data
- Understand automatic conflict resolution decisions
- Recover from sync failures manually if needed
- Build confidence in multi-device sync

**Debugging Aid**:

- Power users can diagnose sync problems
- Clear audit trail of what happened
- Details panel shows conflict field-by-field
- Essential for supporting users reporting "lost changes"

**Use Cases**:

- Multi-device editing is common
- Users report "lost changes" → inspect conflicts
- Conflict rate >5% (from analytics) → show this panel
- Debugging distributed sync issues

## When to Implement This Chunk

### ✅ Implement If:

- Multi-device household (3+ devices actively syncing)
- Users report "lost changes" or sync confusion
- Want production-ready conflict transparency
- Need debugging tools for support
- Conflict rate >1% (monitor in analytics)

### ⚠️ Can Defer If:

- Single device usage only
- MVP speed is critical priority
- Conflicts expected to be rare (<1% of syncs)
- Can add in Phase 2 after user feedback

### 🔗 Relationship to Chunk 025

**Chunk 025** (basic sync UI) provides:

- Real-time sync status awareness ("Syncing...", "Synced", "Offline")
- Ephemeral toast notifications ("Synced 3 items")
- Basic offline banner with retry

**Chunk 025-b** (this chunk) provides:

- Persistent conflict resolution history
- Field-level inspection (local vs remote values)
- Per-item retry for failed syncs
- Dismissible issue log with timestamps

**Think of it as**: Chunk 025 = Status bar, Chunk 025-b = DevTools Console

**Recommendation**: Implement both for any deployment where multiple devices will sync simultaneously.

## Key Files Created

```
src/
├── lib/
│   └── sync/
│       └── SyncIssuesManager.ts         # Issue logging class
├── stores/
│   └── syncIssuesStore.ts               # Zustand store for issues
└── components/
    ├── SyncIssuesPanel.tsx              # Main issues panel (bottom-right)
    └── SyncIssueItem.tsx                # Individual issue display
```

## Features Included

### SyncIssuesManager Class

- Logs conflict resolutions automatically
- Logs sync failures with retry capability
- Persists to IndexedDB and Zustand store
- Distinguishes conflict types:
  - `conflict-resolved`: Automatic LWW resolution
  - `sync-failed`: Network or validation error
  - `validation-error`: Data validation failure

### SyncIssuesPanel Component

- **Collapsed Badge**: Shows count ("3 Sync Issues")
- **Expanded Panel**: Lists all issues with details
- **Color-Coded Icons**: Checkmark (resolved), X (failed), Alert (validation)
- **Relative Timestamps**: "2m ago", "1h ago"
- **Filters** (future): By type, date range, entity

### SyncIssueItem Component

- **Summary Row**: Icon, type, message, timestamp
- **Details Button**: Expandable view for conflict details
- **Retry Button**: Only for retryable sync failures
- **Dismiss Button**: Acknowledge and remove from list

### Zustand Store (useSyncIssuesStore)

```typescript
interface SyncIssuesStore {
  issues: SyncIssue[];
  addIssue: (issue: SyncIssue) => void;
  removeIssue: (issueId: string) => void;
  clearAll: () => void;
}
```

## When to Use This Chunk

**Implement if**:

- User reports multi-device sync conflicts
- Want to add power-user debugging features
- Need conflict transparency for household with 3+ devices
- Analytics show >5% conflict rate

**Skip if**:

- MVP focused on single-device experience
- Conflicts expected to be rare (<1% of syncs)
- Want to reduce implementation complexity
- Can defer to Phase 2

## Relationship to Other Chunks

```
Chunk 025-b depends on:
├── Chunk 025 ✅ (basic sync UI - status badge)
├── Chunk 024 ✅ (sync processor - mutation hook)
├── Chunk 032 📌 (conflict detection - conflict info)
└── Chunk 023 ✅ (sync queue - error tracking)

Chunk 025-b feeds into:
├── Chunk 034 (realtime sync - conflict events)
└── Chunk 035 (event compaction - cleanup old issues)
```

**Note**: Chunk 032 (conflict detection) may not yet exist. This chunk can work with basic sync errors until full conflict detection is available.

---

## Implementation Overview

### Step 1: SyncIssuesManager Class (30 min)

Logging service that captures:

- Automatic conflict resolutions
- Sync failures
- Validation errors

### Step 2: Zustand Store (15 min)

Global state management for UI to subscribe to

### Step 3: SyncIssuesPanel Component (45 min)

Bottom-right expandable panel showing issue list and counts

### Step 4: SyncIssueItem Component (20 min)

Individual issue display with expandable details

### Step 5: Integrate with Sync Processor (10 min)

Hook sync processor to log conflicts and failures

---

**Ready?** → Open `instructions.md` to begin
