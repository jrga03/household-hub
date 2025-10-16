# Chunk 020: Offline Reads

## At a Glance

- **Time**: 2 hours
- **Milestone**: Offline (2 of 7)
- **Prerequisites**: Chunk 019 (Dexie setup)
- **Can Skip**: No - required for offline functionality

## What You're Building

Offline-first read pattern with automatic fallback:

- Read-from-IndexedDB-first query pattern
- TanStack Query integration with Dexie
- Online/offline detection and visual indicators
- Cache Supabase responses in IndexedDB
- Sync status UI (last synced, pending changes count)
- Offline banner with retry button

## Why This Matters

Offline-first reads ensure the app remains usable without internet:

- **Instant loads**: No network latency
- **Resilient**: Works during connectivity issues
- **Better UX**: No loading spinners for cached data
- **Progressive enhancement**: Sync in background when online

## Before You Start

Make sure you have:

- Chunk 019 completed (Dexie database set up)
- TanStack Query configured
- Device ID persistence working
- Basic understanding of offline-first patterns

## What Happens Next

After this chunk:

- App reads from IndexedDB first (fast)
- Supabase data cached in background
- Offline banner appears when disconnected
- Sync status visible to user
- Ready for Chunk 021 (offline writes)

## Key Files Created

```
src/
├── hooks/
│   ├── useOfflineTransactions.ts    # Read transactions offline-first
│   ├── useOfflineAccounts.ts        # Read accounts offline-first
│   ├── useOfflineCategories.ts      # Read categories offline-first
│   └── useOnlineStatus.ts           # Online/offline detection
├── components/
│   ├── OfflineBanner.tsx            # Visual offline indicator
│   └── SyncStatus.tsx               # Last sync time + pending count
└── lib/
    └── offline/
        └── cacheManager.ts          # Cache Supabase → IndexedDB
```

## Features Included

### Read-from-Dexie-First Pattern

```typescript
// Priority order:
// 1. Return IndexedDB data immediately (instant)
// 2. Fetch from Supabase in background (if online)
// 3. Update IndexedDB cache with fresh data
// 4. TanStack Query notifies components of update
```

### Online/Offline Detection

- Navigator online/offline events
- Periodic connectivity check (ping Supabase)
- Visual banner when offline
- Automatic retry when reconnected

### Cache Management

- Store Supabase responses in IndexedDB
- Timestamp for staleness checking
- Clear cache on sign out
- Prune old data (90 days retention)

### Sync Status Display

- Last successful sync timestamp
- Pending changes count (syncQueue)
- Manual sync button
- Visual loading state during sync

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 544-741 (offline reads)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 1782-1885 (cache strategy)
- **Decisions**: #64 (indexes over materialized views), #68 (online detection)
- **Architecture**: Three-layer read pattern (IndexedDB → TanStack Query → Supabase)

## Technical Stack

- **Dexie.js**: IndexedDB wrapper for local storage
- **TanStack Query**: Server state with cache management
- **Navigator API**: Online/offline events
- **React Hooks**: Custom hooks for offline-first reads

## Design Patterns

### Offline-First Query Pattern

```typescript
const useOfflineTransactions = () => {
  return useQuery({
    queryKey: ["transactions", "offline"],
    queryFn: async () => {
      // 1. Read from IndexedDB (fast)
      const local = await db.transactions.toArray();

      // 2. Return immediately
      return local;
    },
    // 3. Never stale (IndexedDB is truth when offline)
    staleTime: Infinity,
    // 4. Refetch when online
    refetchOnMount: "always",
    refetchOnReconnect: true,
  });
};
```

### Background Sync Pattern

```typescript
// Separate query for background sync
const useSyncTransactions = () => {
  const isOnline = useOnlineStatus();

  return useQuery({
    queryKey: ["transactions", "sync"],
    queryFn: async () => {
      // Fetch from Supabase
      const { data } = await supabase.from("transactions").select("*");

      // Cache in IndexedDB
      await db.transactions.bulkPut(data);

      // Update last sync timestamp
      await db.meta.put({
        key: "lastSync",
        value: new Date().toISOString(),
      });

      return data;
    },
    enabled: isOnline, // Only run when online
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
```

### Cache Manager

```typescript
export class CacheManager {
  // Cache Supabase response in IndexedDB
  async cache<T>(table: string, data: T[]): Promise<void> {
    await db.table(table).bulkPut(data);
  }

  // Get cached data
  async get<T>(table: string): Promise<T[]> {
    return await db.table(table).toArray();
  }

  // Clear all cached data
  async clearAll(): Promise<void> {
    await db.transactions.clear();
    await db.accounts.clear();
    await db.categories.clear();
  }
}
```

## Critical Concepts

**Read-from-IndexedDB-First**:

- IndexedDB is the source of truth for UI
- Supabase updates happen in background
- User always sees data instantly

**TanStack Query Integration**:

- Query key distinguishes offline vs sync queries
- `staleTime: Infinity` prevents unnecessary refetches
- `refetchOnReconnect: true` syncs when back online

**Online/Offline Detection**:

- Listen to `window.addEventListener('online')` and `window.addEventListener('offline')`
- Periodic health check (ping Supabase every 30s)
- Visual indicator (banner or icon)

**Cache Staleness**:

- Store `lastSync` timestamp in meta table
- Show "Last synced X minutes ago" to user
- Warn if > 24 hours since last sync

---

**Ready?** → Open `INSTRUCTIONS.md` to begin
