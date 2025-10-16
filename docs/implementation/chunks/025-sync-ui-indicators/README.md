# Chunk 025: Sync UI Indicators

## At a Glance

- **Time**: 45 minutes
- **Milestone**: Offline (7 of 7) ✅ **MILESTONE COMPLETE**
- **Prerequisites**: Chunk 024 (sync processor)
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

**Ready?** → Open `instructions.md` to begin
