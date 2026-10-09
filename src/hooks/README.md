# Custom React Hooks (`/src/hooks/`)

## Purpose

The hooks directory contains **custom React hooks** for data fetching, state management, and utility functions. Hooks provide a clean abstraction layer between components and business logic, enabling consistent data access patterns across the app.

## Hook Categories

### Reads: Dexie live queries vs TanStack Query

There are no `useOffline*` hook files. Where a component needs local IndexedDB
data it calls `useLiveQuery` with `readDb` (`src/lib/dexie/readDb.ts`), e.g.
the sync-status map in `src/components/TransactionList.tsx`. Server-backed
lists (accounts, categories, transactions, debts) are TanStack Query builders
in `src/lib/supabaseQueries.ts`; their fetchers fall back to Dexie when
offline (`src/lib/offline/reads.ts`).

**Pattern:**

```typescript
const syncQueue = useLiveQuery(
  () => readDb.syncQueue.where("status").equals("queued").toArray(),
  []
);
// Re-runs by itself when IndexedDB changes; no query key, no invalidation
```

### Budgets & Analytics Hooks (TanStack Query)

- **`useBudgetActuals.ts`** - Calculate budget vs actual spending
- **`useAnalytics.ts`** (12.9KB) - Complex analytics calculations
  - Spending by category
  - Monthly trends
  - Year-over-year comparisons
  - Top spending categories

**When to Use:** For computed data and analytics derived from server queries

### Transfers Hooks

- **`useTransfers.ts`** - `transfersQueryOptions`, `useTransfers`, `useCreateTransfer`

**Pattern:** Filters transactions where `transfer_group_id IS NOT NULL`

### Sync & Offline Status Hooks

- **`useSyncProcessor.ts`** - Trigger manual sync
- **`useSyncStatus.ts`** - Monitor sync status (idle/syncing/error)
- **`useOnlineStatus.ts`** - Detect online/offline state

**Usage:**

```typescript
const { status, pendingCount } = useSyncStatus();
// status: 'idle' | 'syncing' | 'error'

const isOnline = useOnlineStatus();
// true if connected to network
```

### PWA Hooks

- **`useInstallPrompt.ts`** - Handle PWA install prompt
- **`useServiceWorker.ts`** - Service worker registration and updates
- **`useStorageQuota.ts`** - Monitor IndexedDB storage usage
- **`usePushNotifications.ts`** - Push notification subscription

**Storage Monitoring:**

```typescript
const { used, quota, percentUsed } = useStorageQuota();
// percentUsed: 0-100 (warn at 80%, alert at 95%)
```

### Utility Hooks

- **`use-mobile.ts`** - Detect mobile viewport (responsive design)
- **`useMediaQuery.ts`** - Generic media query hook
- **`useKeyboardShortcuts.ts`** - Register keyboard shortcuts

## Key Patterns

### TanStack Query Integration

Every query is an `xQueryOptions()` builder next to its fetcher, and its key
comes from `queryKeys` (`src/lib/query-keys.ts`). The hook is a thin wrapper, so
prefetch, `getQueryData` and invalidation all share one key and one data shape.
Never write an inline `useQuery({ queryKey, queryFn })` (the
`@tanstack/query/prefer-query-options` and inline-key lint rules reject it), and
never reuse a key for a different data shape (the DATA-06 bug).

**Pattern** (from `categoriesQueryOptions` in `src/lib/supabaseQueries.ts`):

```typescript
import { queryOptions, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

export function categoriesQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.categories.list(),
    queryFn: fetchCategories,
  });
}

export function useCategories() {
  return useQuery(categoriesQueryOptions());
}
```

Components that need the cached value elsewhere read it with
`queryClient.getQueryData(categoriesQueryOptions().queryKey)`.

**Benefits:**

- Automatic caching
- Background refetching
- Loading/error states
- Deduplication

### Mutation Hooks

For create/update/delete operations:

**Pattern:**

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (category) => {
      return await createOfflineCategory(category);
    },
    onSuccess: () => afterOutboxWrite(queryClient, userId, "category"),
  });
}
```

### Naming Conventions

**Prefix Rules:**

- `use*` - Query hook wrapping an `xQueryOptions()` builder, or a Dexie live query
- `useCreate*/useUpdate*/useDelete*` - Mutation hooks

**Singular vs Plural:**

- `useCategories` - Returns array
- `useTransaction` - Returns single item (requires ID param)

### Live Queries (Dexie)

Hooks that only need local data use Dexie's live queries through `readDb`
(the writable `db` is lint-restricted to `src/lib/{offline,debts,sync,dexie}`):

**Pattern:**

```typescript
import { useLiveQuery } from "dexie-react-hooks";
import { readDb } from "@/lib/dexie/readDb";

export function useQueuedSyncItems() {
  return useLiveQuery(() => readDb.syncQueue.where("status").equals("queued").toArray(), []);
}
```

**Benefits:**

- Automatically updates when IndexedDB changes
- No manual cache invalidation needed, and no TanStack key to collide with

## Common Development Tasks

### Creating a New Data Hook

**1. Determine data source:**

- IndexedDB only → `useLiveQuery` + `readDb`
- Supabase (with offline fallback) → `xQueryOptions()` builder + `use*` hook
- Computed → `use*` hook (derived from other data)

**2. Create hook file:**

**For IndexedDB:**

```typescript
// useTags.ts
import { useLiveQuery } from "dexie-react-hooks";
import { readDb } from "@/lib/dexie/readDb";

export function useTags() {
  return useLiveQuery(() => readDb.tags.toArray(), []);
}
```

**For Supabase:** add the root to `queryKeys` in `src/lib/query-keys.ts` first,
then a builder and a hook:

```typescript
import { queryOptions, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { supabase } from "@/lib/supabase";

export function tagsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.tags.list(),
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*");

      if (error) throw error;
      return data;
    },
  });
}

export function useTags() {
  return useQuery(tagsQueryOptions());
}
```

**3. Export hook:**

```typescript
// In component
import { useTags } from "@/hooks/useTags";

function MyComponent() {
  const { data: tags, isLoading } = useTags();
  // ...
}
```

### Creating a Mutation Hook

**Pattern:**

```typescript
// useCreateTag.ts (hypothetical; see useCreateCategory in src/lib/supabaseQueries.ts for a real one)
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/stores/authStore";
import { afterOutboxWrite } from "@/lib/offline/afterWrite";
import { createOfflineTag } from "@/lib/offline/tags";

export function useCreateTag() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: createOfflineTag,
    onSuccess: () => afterOutboxWrite(queryClient, userId, "category"),
    onError: (error) => {
      console.error("Failed to create tag:", error);
    },
  });
}
```

**Usage in Component:**

```typescript
const { mutate: createTag, isLoading } = useCreateTag();

const handleSubmit = (data) => {
  createTag(data, {
    onSuccess: () => {
      toast.success("Tag created!");
    },
  });
};
```

### Adding Query Filters

Filters belong in the key factory, so each filter set gets its own cache entry.
Pass them to the builder and the factory (see `transactionsInfiniteQueryOptions(filters)`
in `src/lib/supabaseQueries.ts`, keyed by `queryKeys.transactions.list(filters)`).
Give each data shape its own key function; do not reuse `transactions.list` for
anything but that infinite query. For a plain Dexie filter, use a live query:

```typescript
export function useAccountTransactions(accountId: string) {
  return useLiveQuery(
    () => readDb.transactions.where("account_id").equals(accountId).toArray(),
    [accountId]
  );
}
```

### Outbox Writes Instead of Optimistic Updates

Writes land in IndexedDB (entity + sync-queue item in one Dexie transaction)
before any network call, so there is no optimistic cache patching or rollback.
The list query overlays unsynced local rows, and `afterOutboxWrite`
invalidates the given keys now and again after the queue drains.

**Pattern:**

```typescript
export function useToggleTransactionStatus() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);

  return useMutation({
    mutationFn: async (id: string) => {
      const existing = await ensureLocalRow("transactions", id);
      if (!existing) throw new Error("Transaction not found");
      const newStatus = existing.status === "pending" ? "cleared" : "pending";
      const result = await updateOfflineTransactionsStatus([id], newStatus, requireUserId(userId));
      if (!result.success) throw new Error(result.error ?? "Failed to update status");
      return newStatus;
    },
    onSuccess: () => afterOutboxWrite(queryClient, userId, "transaction"),
  });
}
```

## Testing Hooks

### Unit Tests (Vitest + React Hooks Testing Library)

**Pattern:**

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTransfers } from "./useTransfers";

test("fetches transfers", async () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  const { result } = renderHook(() => useTransfers("hh-1"), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(3);
});
```

### Integration Tests

**Test Scenarios:**

- Query hook returns data and uses the factory key (`queryKeys.*`)
- Mutation hook calls `afterOutboxWrite` with the right entity
- Hook handles errors gracefully
- Offline: reads fall back to Dexie

## Performance Considerations

**Query Key Design:**

- Build keys only through `queryKeys` (`src/lib/query-keys.ts`); include all dependencies as factory args
- Invalidate selectively (not entire cache)

**Stale Time:**

- Default is 5 minutes
- Builders that read local Dexie and can be written outside the write events (e.g. `activeExternalDebtsQueryOptions`) use `staleTime: 0`

**Refetch Strategies:**

- `refetchOnWindowFocus`: false for stable data
- `refetchOnMount`: false if data unlikely to change

**Debouncing:**

- Use debounced values for filters (see `lib/hooks/useDebounce.ts`)

## Related Documentation

### Parent README

- [../README.md](../README.md) - Source code overview

### Related Directories

- [../components/README.md](../components/README.md) - Components that use hooks
- [../lib/README.md](../lib/README.md) - Business logic called by hooks
- [../lib/offline/README.md](../lib/offline/README.md) - Offline operations used by hooks
- [../lib/dexie/README.md](../lib/dexie/README.md) - IndexedDB accessed by offline hooks

### External Resources

- [TanStack Query](https://tanstack.com/query) - Data fetching library
- [React Hooks](https://react.dev/reference/react) - Official React docs
- [Dexie React Hooks](<https://dexie.org/docs/dexie-react-hooks/useLiveQuery()>) - Live queries

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference
