# Chunk 025: Sync UI Indicators

## At a Glance

- **Time**: 45 minutes total
  - Implementation: 30 minutes (Steps 1-5)
  - Quick verification: 15 minutes (Critical checkpoints)
  - Full verification: 30-40 minutes (All 14 checkpoints - optional but recommended)
- **Milestone**: Offline (7 of 7) ✅ **MILESTONE COMPLETE**
- **Prerequisites**: Chunk 024 (sync processor), Chunk 023 (sync queue), Chunk 002 (auth)
- **Can Skip**: No - critical for user experience

## What You're Building

Visual indicators showing sync status to users:

- Sync status badge (syncing/synced/offline)
- Pending changes count
- Last sync timestamp
- Manual sync button
- Offline banner with retry
- Loading states during sync

## Why This Matters

Users need visibility into sync operations:

- **Transparency**: Know when data is synced
- **Confidence**: See offline changes queued
- **Control**: Manual sync when needed
- **Awareness**: Know when offline
- **Feedback**: Understand sync failures

## Key Files Created

```
src/
├── components/
│   ├── SyncStatus.tsx           # Sync status badge
│   ├── OfflineBanner.tsx        # Offline indicator
│   └── SyncButton.tsx           # Manual sync button
└── hooks/
    └── useSyncStatus.ts         # Sync status data
```

## Features Included

### Sync Status Badge

- "Syncing..." spinner
- "Synced" checkmark
- "Offline" warning icon
- Pending count: "3 pending"

### Offline Banner

- Shows when offline
- Dismissible
- Retry button
- Auto-hides when online

### Manual Sync Button

- Trigger sync on demand
- Loading state during sync
- Success/error feedback
- Disabled when syncing

### Last Sync Time

- "Synced 2 minutes ago"
- Relative timestamps
- Updates live

---

## Prerequisites Deep Dive

### Hard Dependencies (must exist before starting)

#### 1. **Chunk 024**: Sync Processor

- **File**: `src/hooks/useSyncProcessor.ts`
- **Export**: `useSyncProcessor()` - A TanStack Query mutation hook
- **Signature**: Returns `{ mutate, isPending, isError, error }`
- **Verification**:
  ```bash
  grep -r "export.*useSyncProcessor" src/hooks/
  # Should find: src/hooks/useSyncProcessor.ts
  ```

#### 2. **Chunk 023**: Sync Queue

- **File**: `src/lib/offline/syncQueue.ts`
- **Export**: `getQueueCount(userId: string): Promise<number>`
- **Purpose**: Fetches pending sync count from IndexedDB
- **Verification**:
  ```bash
  grep -r "export.*getQueueCount" src/lib/
  # Should find: src/lib/offline/syncQueue.ts
  ```

#### 3. **Chunk 002**: Auth Store

- **File**: `src/stores/authStore.ts`
- **Export**: `useAuthStore` - Zustand store
- **State**: Must have `user` property (can be null)
- **Verification**:
  ```bash
  grep -r "export.*useAuthStore" src/stores/
  # Should find: src/stores/authStore.ts
  ```

### Verification Checklist

Run these commands in your terminal to verify all prerequisites exist:

```bash
# 1. Check sync processor hook
grep -l "useSyncProcessor" src/hooks/*.ts

# 2. Check queue count function
grep -l "getQueueCount" src/lib/offline/*.ts

# 3. Check auth store
grep -l "useAuthStore" src/stores/*.ts

# 4. Try importing in dev server (if already running)
npm run dev  # Keep this running in terminal 1

# Then in terminal 2:
cd src && node -e "
  import('./hooks/useSyncProcessor.ts').then(m => console.log('✅ useSyncProcessor'))
  import('./lib/offline/syncQueue.ts').then(m => console.log('✅ getQueueCount'))
  import('./stores/authStore.ts').then(m => console.log('✅ useAuthStore'))
"
```

### What This Chunk Does NOT Include

- 🔗 **SyncIssuesPanel** - Advanced conflict logging UI
  - **Location**: Chunk 025-b (implement next)
  - **Phase**: Also Phase A - recommended for production
  - **Purpose**: Persistent conflict inspection and debugging
  - **Relationship**: Chunk 025 provides ephemeral toasts ("Synced!"), Chunk 025-b provides persistent audit trail ("Here's what conflicts occurred")
- 🚫 **Automated retries** - Handled by Chunk 024 (sync processor)
- 🚫 **Realtime sync** - Implemented in Chunk 034 (Phase B - Milestone 4)
- 🚫 **Event compaction** - Chunk 035 (Phase B - Milestone 4)

**Note**: Complete Chunk 025-b immediately after this chunk for production-ready sync transparency.

---

**Ready?** → Open `instructions.md` to begin
