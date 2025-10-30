# Troubleshooting: Offline Reads

---

## Problem: Online status always shows true even when offline

**Cause**: Navigator.onLine doesn't always reflect actual connectivity

**Solution**: Add periodic health check ping to Supabase:

```typescript
// Check every 30 seconds
setInterval(async () => {
  try {
    const { error } = await supabase.from("profiles").select("id").limit(1).single();

    setIsOnline(!error);
  } catch {
    setIsOnline(false);
  }
}, 30000);
```

---

## Problem: IndexedDB returns empty array

**Cause**: Data not cached yet, or cache cleared

**Solution**:

1. Check if initial sync ran:

   ```javascript
   const lastSync = await db.meta.get("lastSync");
   console.log("Last sync:", lastSync);
   ```

2. Manually trigger sync:

   ```javascript
   import { cacheManager } from "@/lib/offline/cacheManager";

   const { data } = await supabase.from("transactions").select("*");
   await cacheManager.cacheTransactions(data);
   ```

---

## Problem: Background sync never runs

**Cause**: `enabled: isOnline` not working or TanStack Query disabled

**Solution**: Check query is enabled:

```typescript
const syncQuery = useQuery({
  queryKey: ["transactions", "sync"],
  queryFn: fetchFromSupabase,
  enabled: isOnline, // Must be true to run
});

console.log("Is online:", isOnline);
console.log("Query enabled:", syncQuery.isEnabled);
```

---

## Problem: Stale data shown even when online

**Cause**: IndexedDB not updating after background sync

**Solution**: Ensure cache update + refetch:

```typescript
// After caching, invalidate offline query
await cacheManager.cacheTransactions(freshData);
offlineQuery.refetch(); // Trigger re-render
```

---

## Problem: "Too many re-renders" error

**Cause**: Refetch loop between offline and sync queries

**Solution**: Separate query keys and use proper staleTime:

```typescript
// Offline query: never refetch
const offlineQuery = useQuery({
  queryKey: ["transactions", "offline"], // Unique key
  queryFn: () => db.transactions.toArray(),
  staleTime: Infinity, // Never auto-refetch
  refetchOnMount: false,
});

// Sync query: controlled refetch
const syncQuery = useQuery({
  queryKey: ["transactions", "sync"], // Different key
  queryFn: fetchFromSupabase,
  staleTime: 5 * 60 * 1000, // Only refetch after 5 min
});
```

---

## Problem: Offline banner flickers on/off

**Cause**: Rapid online/offline event firing

**Solution**: Debounce state changes:

```typescript
const [isOnline, setIsOnline] = useState(navigator.onLine);
const timeoutRef = useRef<NodeJS.Timeout | null>(null);

const handleOffline = () => {
  // Wait 2 seconds before showing offline
  timeoutRef.current = setTimeout(() => {
    setIsOnline(false);
  }, 2000);
};

const handleOnline = () => {
  // Cancel pending offline
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
  }
  setIsOnline(true);
};
```

---

## Problem: Last sync time not updating

**Cause**: Meta table not being updated after sync

**Solution**: Verify updateLastSync is called:

```typescript
async cacheTransactions(data: LocalTransaction[]): Promise<void> {
  await db.transactions.bulkPut(data);

  // CRITICAL: Update timestamp
  await db.meta.put({
    key: 'lastSync',
    value: new Date().toISOString(),
  });
}
```

---

## Problem: Sync status shows "Never synced" incorrectly

**Cause**: Query not reactive to meta table changes

**Solution**: Use shorter refetch interval:

```typescript
const { data: lastSync } = useQuery({
  queryKey: ["lastSync"],
  queryFn: () => cacheManager.getLastSync(),
  refetchInterval: 10000, // Check every 10 seconds
});
```

---

## Problem: High memory usage with large datasets

**Cause**: TanStack Query caching all data in memory

**Solution**: Limit query cache size:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      cacheTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // Garbage collect after 10 min
    },
  },
});
```

---

## Problem: IndexedDB quota exceeded

**Cause**: Too much cached data

**Solution**: Implement data pruning:

```typescript
async pruneOldData(): Promise<void> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Delete old transactions
  await db.transactions
    .where('date')
    .below(ninetyDaysAgo.toISOString().split('T')[0])
    .delete();
}
```

---

## Quick Fixes

```javascript
// Force sync now
await queryClient.invalidateQueries({ queryKey: ["transactions", "sync"] });

// Clear all cache and re-sync
await cacheManager.clearAll();
window.location.reload();

// Check storage usage
if (navigator.storage && navigator.storage.estimate) {
  const estimate = await navigator.storage.estimate();
  console.log("Usage:", ((estimate.usage / estimate.quota) * 100).toFixed(2) + "%");
}

// Reset last sync
await db.meta.delete("lastSync");
```

---

## Performance Issues

If offline reads are slow (> 100ms):

1. **Check index usage**:

   ```typescript
   // Verify indexes defined in Dexie schema
   this.version(1).stores({
     transactions: "id, date, account_id, category_id, status, type",
   });
   ```

2. **Limit query results**:

   ```typescript
   // Don't load all transactions at once
   await db.transactions
     .orderBy("date")
     .reverse()
     .limit(100) // First 100 only
     .toArray();
   ```

3. **Use TanStack Virtual** for large lists to prevent rendering bottlenecks
