# Custom React Hooks (`/src/hooks/`)

## Purpose

The hooks directory contains **custom React hooks** for data fetching, state management, and utility functions. Hooks provide a clean abstraction layer between components and business logic, enabling consistent data access patterns across the app.

## Hook Categories

### Offline Data Hooks (IndexedDB)

**Naming Pattern:** `useOffline*` - Reads from local IndexedDB (Dexie)

- **`useOfflineTransactions.ts`** - Fetch transactions from IndexedDB
- **`useOfflineTransaction.ts`** - Fetch single transaction from IndexedDB
- **`useOfflineAccounts.ts`** - Fetch accounts from IndexedDB
- **`useOfflineAccount.ts`** - Fetch single account from IndexedDB
- **`useOfflineCategories.ts`** - Fetch categories from IndexedDB
- **`useOfflineCategory.ts`** - Fetch single category from IndexedDB

**When to Use:** Always prefer offline hooks for reading data (offline-first pattern)

**Pattern:**

```typescript
const { data: transactions, isLoading, error } = useOfflineTransactions();
// Reads from IndexedDB, returns instantly (even offline)
```

### Budgets & Analytics Hooks (TanStack Query)

- **`useBudgets.ts`** - Fetch budgets from Supabase
- **`useBudgetActuals.ts`** - Calculate budget vs actual spending
- **`useAnalytics.ts`** (12.9KB) - Complex analytics calculations
  - Spending by category
  - Monthly trends
  - Year-over-year comparisons
  - Top spending categories

**When to Use:** For computed data and analytics that don't live in IndexedDB

### Transfers Hooks

- **`useTransfers.ts`** - Fetch and manage transfer transactions

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

Most hooks use TanStack Query for caching and state management:

**Pattern:**

```typescript
import { useQuery } from "@tanstack/react-query";

export function useOfflineTransactions() {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: async () => {
      // Fetch from IndexedDB
      return await db.transactions.toArray();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

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

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction) => {
      return await createOfflineTransaction(transaction);
    },
    onSuccess: () => {
      // Invalidate cache to trigger refetch
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
```

### Naming Conventions

**Prefix Rules:**

- `useOffline*` - Reads from IndexedDB
- `use*` (no prefix) - Reads from Supabase or computed data
- `useCreate*/useUpdate*/useDelete*` - Mutation hooks

**Singularvs Plural:**

- `useOfflineTransactions` - Returns array
- `useOfflineTransaction` - Returns single item (requires ID param)

### Live Queries (Dexie)

Offline hooks can use Dexie's live queries for reactive data:

**Pattern:**

```typescript
import { useLiveQuery } from "dexie-react-hooks";

export function useOfflineTransactions() {
  const transactions = useLiveQuery(() => db.transactions.toArray(), []);

  return { data: transactions, isLoading: !transactions };
}
```

**Benefits:**

- Automatically updates when IndexedDB changes
- No manual cache invalidation needed

## Common Development Tasks

### Creating a New Data Hook

**1. Determine data source:**

- IndexedDB → `useOffline*` hook
- Supabase → `use*` hook (TanStack Query)
- Computed → `use*` hook (derived from other data)

**2. Create hook file:**

**For IndexedDB:**

```typescript
// useOfflineTags.ts
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/dexie/db";

export function useOfflineTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      return await db.tags.toArray();
    },
  });
}
```

**For Supabase:**

```typescript
// useTags.ts
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useTags() {
  return useQuery({
    queryKey: ["tags", "remote"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("*");

      if (error) throw error;
      return data;
    },
  });
}
```

**3. Export hook:**

```typescript
// In component
import { useOfflineTags } from "@/hooks/useOfflineTags";

function MyComponent() {
  const { data: tags, isLoading } = useOfflineTags();
  // ...
}
```

### Creating a Mutation Hook

**Pattern:**

```typescript
// useCreateTag.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createOfflineTag } from "@/lib/offline/tags";

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createOfflineTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
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

**Pattern:**

```typescript
export function useOfflineTransactions(filters?: {
  accountId?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ["transactions", filters],
    queryFn: async () => {
      let query = db.transactions;

      if (filters?.accountId) {
        query = query.where("account_id").equals(filters.accountId);
      }

      if (filters?.startDate && filters?.endDate) {
        query = query.where("date").between(filters.startDate, filters.endDate);
      }

      return await query.toArray();
    },
  });
}
```

### Optimistic Updates

For instant UI feedback:

**Pattern:**

```typescript
export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateOfflineTransaction,
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["transactions"] });

      // Snapshot previous value
      const previous = queryClient.getQueryData(["transactions"]);

      // Optimistically update cache
      queryClient.setQueryData(["transactions"], (old: Transaction[]) =>
        old.map((t) => (t.id === variables.id ? { ...t, ...variables.changes } : t))
      );

      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(["transactions"], context.previous);
    },
  });
}
```

## Testing Hooks

### Unit Tests (Vitest + React Hooks Testing Library)

**Pattern:**

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useOfflineTransactions } from "./useOfflineTransactions";

test("fetches transactions", async () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  const { result } = renderHook(() => useOfflineTransactions(), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(3);
});
```

### Integration Tests

**Test Scenarios:**

- Hook fetches data from IndexedDB
- Hook updates cache on mutation
- Hook handles errors gracefully
- Optimistic updates work correctly

## Performance Considerations

**Query Key Design:**

- Include all dependencies in query key
- Invalidate selectively (not entire cache)

**Stale Time:**

- Offline hooks: Long stale time (5-10 mins) - data rarely changes
- Remote hooks: Short stale time (30s-1min) - data may change remotely

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
