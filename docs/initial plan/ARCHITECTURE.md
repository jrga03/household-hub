# System Architecture

## Overview

Household Hub follows an offline-first, event-sourced architecture with real-time sync capabilities. The system prioritizes data integrity, offline functionality, and multi-device synchronization.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
├───────────────────────────┬─────────────────────────────────┤
│      React + Vite         │         Service Worker         │
│   TanStack Router/Query   │      Background Sync          │
│      Zustand Store        │        Web Push API           │
│        Dexie.js           │      Cache Strategy           │
│     TanStack Virtual      │         Workbox              │
└───────────────┬───────────┴──────────────┬──────────────────┘
                │                           │
                │      Web Workers          │
                │   ┌──────────────┐        │
                │   │ Compression  │        │
                │   │   (Brotli)   │        │
                │   └──────────────┘        │
                │                           │
┌───────────────▼───────────────────────────▼──────────────────┐
│                    CLOUDFLARE WORKERS                         │
├────────────────────────────────────────────────────────────────┤
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│   │  R2 Proxy    │  │ Push Service │  │   Backup     │      │
│   │  (Auth +     │  │  (Web Push   │  │   Retention  │      │
│   │  Signed URL) │  │   Delivery)  │  │   (Cron)     │      │
│   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│          │                  │                  │               │
│   ┌──────▼──────────────────▼──────────────────▼───────┐      │
│   │               Cloudflare Services                  │      │
│   │  ┌────────┐  ┌────────┐  ┌────────┐  ┌────────┐  │      │
│   │  │   R2   │  │  KV    │  │ Durable│  │  Cron  │  │      │
│   │  │Storage │  │ Store  │  │Objects │  │Triggers│  │      │
│   │  └────────┘  └────────┘  └────────┘  └────────┘  │      │
│   └─────────────────────────────────────────────────────┘      │
└────────────────────────────┬───────────────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────────────┐
│                         SUPABASE                               │
├───────────────────────────┬────────────────────────────────────┤
│      Core Services        │         Edge Functions             │
│   ┌──────────────┐        │    ┌──────────────────┐           │
│   │  PostgreSQL  │        │    │ Data Export API  │           │
│   │   Database   │        │    │ Backup Metadata  │           │
│   │  (with RLS)  │        │    │ Query Functions  │           │
│   └──────────────┘        │    └──────────────────┘           │
│   ┌──────────────┐        │                                   │
│   │   Auth       │        │                                   │
│   │  (JWT/OAuth) │        │                                   │
│   └──────────────┘        │                                   │
│   ┌──────────────┐        │                                   │
│   │  Realtime    │        │                                   │
│   │ (WebSockets) │        │                                   │
│   └──────────────┘        │                                   │
└────────────────────────────┴───────────────────────────────────┘
```

## Tech Stack Details

### Frontend Framework

```typescript
// Core Dependencies
{
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "typescript": "^5.6.0",
  "vite": "^5.4.0"
}
```

### State Management

```typescript
// Three-layer state architecture
{
  // 1. Local UI State
  "zustand": "^5.0.0",           // UI state, preferences

  // 2. Server State Cache
  "@tanstack/react-query": "^5.60.0",  // Server state, caching

  // 3. Persistent Local Storage
  "dexie": "^4.0.0",              // IndexedDB wrapper
  "dexie-react-hooks": "^1.1.0"   // React integration
}
```

## State Management Deep Dive

### Three-Layer Architecture Explained

The application uses a sophisticated three-layer state management approach where each layer serves a specific purpose. Understanding when and how to use each layer is critical for building performant, offline-capable features.

```
┌─────────────────────────────────────────────────────────┐
│                    UI Components                         │
└───────┬──────────────┬──────────────┬──────────────────┘
        │              │              │
        ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Zustand    │ │ React Query  │ │    Dexie     │
│  (UI State)  │ │ (Server Cache)│ │  (Persistent)│
└──────────────┘ └──────┬───────┘ └──────┬───────┘
                        │                 │
                        ▼                 ▼
                 ┌──────────────┐  ┌──────────────┐
                 │   Supabase   │  │  IndexedDB   │
                 │   (Cloud)    │  │   (Local)    │
                 └──────────────┘  └──────────────┘
```

### Layer 1: Zustand (UI State)

**Purpose**: Ephemeral UI state that doesn't need persistence.

**Use Cases**:

- Modal open/closed state
- Form validation errors
- Sidebar collapsed/expanded
- Active tab/section
- Temporary filters/sorting
- Theme preferences (dark/light mode)
- Navigation history
- Toast notifications queue

**When to Use Zustand**:

- State resets on page refresh (acceptable)
- State is UI-specific (not business data)
- Fast synchronous updates needed
- Simple state that doesn't come from server

**Example Implementation**:

```typescript
// stores/ui-store.ts
import { create } from 'zustand';

interface UIState {
  // Modal states
  isTransactionModalOpen: boolean;
  isBudgetModalOpen: boolean;

  // UI preferences
  sidebarCollapsed: boolean;
  activeView: 'list' | 'calendar' | 'grid';

  // Filters (not persisted)
  tempDateRange: [Date, Date] | null;
  tempSearchQuery: string;

  // Actions
  openTransactionModal: () => void;
  closeTransactionModal: () => void;
  toggleSidebar: () => void;
  setActiveView: (view: string) => void;
  setTempDateRange: (range: [Date, Date] | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  // Initial state
  isTransactionModalOpen: false,
  isBudgetModalOpen: false,
  sidebarCollapsed: false,
  activeView: 'list',
  tempDateRange: null,
  tempSearchQuery: '',

  // Actions
  openTransactionModal: () => set({ isTransactionModalOpen: true }),
  closeTransactionModal: () => set({ isTransactionModalOpen: false }),
  toggleSidebar: () => set((state) => ({
    sidebarCollapsed: !state.sidebarCollapsed
  })),
  setActiveView: (view) => set({ activeView: view as any }),
  setTempDateRange: (range) => set({ tempDateRange: range }),
}));

// Usage in component
function TransactionList() {
  const { activeView, setActiveView } = useUIStore();

  return (
    <div>
      <button onClick={() => setActiveView('list')}>List</button>
      <button onClick={() => setActiveView('grid')}>Grid</button>
      {activeView === 'list' ? <ListView /> : <GridView />}
    </div>
  );
}
```

### Layer 2: React Query (Server State Cache)

**Purpose**: Cache server data for fast access and automatic revalidation.

**Use Cases**:

- Transactions list from Supabase
- Account balances (derived)
- Category tree
- Budget data
- User profile
- Realtime sync status

**When to Use React Query**:

- Data comes from Supabase (server)
- Data should update across components
- Need automatic refetching on focus/reconnect
- Want optimistic updates
- Need request deduplication

**Key Concepts**:

```typescript
// 1. Query Keys - Unique identifiers for cached data
const queryKeys = {
  transactions: ["transactions"] as const,
  transactionsByAccount: (accountId: string) => ["transactions", "by-account", accountId] as const,
  transactionById: (id: string) => ["transactions", id] as const,
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
};

// 2. Default Query Configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // Consider fresh for 5 mins
      cacheTime: 10 * 60 * 1000, // Keep in cache for 10 mins
      refetchOnWindowFocus: true, // Refetch when tab regains focus
      refetchOnReconnect: true, // Refetch when internet returns
      retry: 3, // Retry failed requests 3 times
    },
  },
});
```

**Data Flow Patterns**:

**Pattern 1: Simple Query**

```typescript
// hooks/useTransactions.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useTransactions() {
  return useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('date', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Usage
function TransactionList() {
  const { data: transactions, isLoading, error } = useTransactions();

  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage error={error} />;

  return <List items={transactions} />;
}
```

**Pattern 2: Mutation with Optimistic Update**

```typescript
// hooks/useCreateTransaction.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transaction: NewTransaction) => {
      const { data, error } = await supabase
        .from('transactions')
        .insert(transaction)
        .select()
        .single();

      if (error) throw error;
      return data;
    },

    // Optimistic update - immediately update UI
    onMutate: async (newTransaction) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['transactions'] });

      // Snapshot previous value
      const previousTransactions = queryClient.getQueryData(['transactions']);

      // Optimistically update cache
      queryClient.setQueryData(['transactions'], (old: any[]) => {
        return [{ ...newTransaction, id: 'temp-id' }, ...old];
      });

      // Return context with snapshot
      return { previousTransactions };
    },

    // On error, rollback to snapshot
    onError: (err, newTransaction, context) => {
      queryClient.setQueryData(
        ['transactions'],
        context?.previousTransactions
      );
    },

    // After success/error, refetch to sync with server
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

// Usage
function CreateTransactionForm() {
  const createTransaction = useCreateTransaction();

  const handleSubmit = (data: NewTransaction) => {
    createTransaction.mutate(data, {
      onSuccess: () => {
        toast.success('Transaction created');
      },
      onError: (error) => {
        toast.error('Failed to create transaction');
      },
    });
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

**Pattern 3: Dependent Queries**

```typescript
// First query
const { data: account } = useQuery({
  queryKey: ["accounts", accountId],
  queryFn: () => fetchAccount(accountId),
});

// Second query depends on first
const { data: transactions } = useQuery({
  queryKey: ["transactions", "by-account", accountId],
  queryFn: () => fetchTransactionsByAccount(accountId),
  enabled: !!account, // Only run when account is loaded
});
```

### Layer 3: Dexie (IndexedDB - Offline Persistence)

**Purpose**: Persistent offline storage for complete offline functionality.

**Use Cases**:

- Offline transaction queue
- Complete transaction history (offline access)
- Event sourcing log
- Sync queue items
- Device metadata
- Cached snapshots

**When to Use Dexie**:

- Need offline access to data
- Building sync queue
- Storing large datasets (>5MB)
- Need to work completely offline
- Want faster initial load (hydration)

**Schema Design**:

```typescript
// lib/dexie/schema.ts
import Dexie, { Table } from "dexie";

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  account_id: string;
  category_id: string;
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SyncQueueItem {
  id: string;
  entity_type: "transaction" | "account" | "category";
  entity_id: string;
  operation: "create" | "update" | "delete";
  payload: any;
  status: "queued" | "syncing" | "completed" | "failed";
  retry_count: number;
  created_at: string;
}

export class HouseholdHubDB extends Dexie {
  transactions!: Table<Transaction>;
  accounts!: Table<any>;
  categories!: Table<any>;
  syncQueue!: Table<SyncQueueItem>;
  meta!: Table<{ key: string; value: any }>;

  constructor() {
    super("HouseholdHubDB");

    this.version(1).stores({
      transactions: "id, date, account_id, category_id, created_at",
      accounts: "id, name, visibility",
      categories: "id, parent_id",
      syncQueue: "id, status, entity_type, created_at",
      meta: "key",
    });
  }
}

export const db = new HouseholdHubDB();
```

**Dexie Operations**:

```typescript
// hooks/useOfflineTransactions.ts
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/dexie";

// Read from Dexie (reactive)
export function useOfflineTransactions() {
  return useLiveQuery(() => db.transactions.orderBy("date").reverse().limit(100).toArray());
}

// Write to Dexie
export async function addOfflineTransaction(transaction: Transaction) {
  // 1. Add to IndexedDB
  await db.transactions.add(transaction);

  // 2. Add to sync queue
  await db.syncQueue.add({
    id: nanoid(),
    entity_type: "transaction",
    entity_id: transaction.id,
    operation: "create",
    payload: transaction,
    status: "queued",
    retry_count: 0,
    created_at: new Date().toISOString(),
  });

  // 3. Trigger sync if online
  if (navigator.onLine) {
    await processSyncQueue();
  }
}

// Query with complex filters
export async function getTransactionsByDateRange(startDate: Date, endDate: Date) {
  return db.transactions
    .where("date")
    .between(startDate.toISOString(), endDate.toISOString(), true, true)
    .toArray();
}
```

### Data Flow Patterns

**Pattern 1: Online Create Flow**

```
User clicks "Add Transaction"
  ↓
1. Optimistic update in React Query cache
  ↓
2. POST to Supabase
  ↓
3. On success:
   - Store in Dexie for offline access
   - React Query automatically refetches
  ↓
4. UI updates with real data from server
```

**Pattern 2: Offline Create Flow**

```
User clicks "Add Transaction" (offline)
  ↓
1. Store immediately in Dexie
  ↓
2. Add to sync queue
  ↓
3. UI reads from Dexie (shows immediately)
  ↓
4. When online:
   - Process sync queue
   - POST to Supabase
   - Update Dexie with server ID
   - Invalidate React Query cache
```

**Pattern 3: Hybrid Read Flow**

```typescript
// hooks/useHybridTransactions.ts
export function useHybridTransactions() {
  const online = useOnlineStatus();

  // Read from Dexie (always available)
  const offlineData = useLiveQuery(() =>
    db.transactions.orderBy("date").reverse().limit(100).toArray()
  );

  // Read from React Query (when online)
  const { data: onlineData, isLoading } = useQuery({
    queryKey: ["transactions"],
    queryFn: () => fetchTransactions(),
    enabled: online,
  });

  // Merge strategies
  return {
    transactions: online ? onlineData : offlineData,
    source: online ? "server" : "local",
    isLoading,
  };
}
```

### Cache Invalidation Strategy

**When to Invalidate**:

```typescript
// 1. After mutations
const createMutation = useMutation({
  mutationFn: createTransaction,
  onSuccess: () => {
    // Invalidate all transaction queries
    queryClient.invalidateQueries({ queryKey: ['transactions'] });

    // Invalidate account balance (derived)
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
  },
});

// 2. On realtime events
supabase
  .channel('transactions')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'transactions' },
    (payload) => {
      // Invalidate specific transaction
      queryClient.invalidateQueries({
        queryKey: ['transactions', payload.new.id]
      });

      // Invalidate list
      queryClient.invalidateQueries({
        queryKey: ['transactions']
      });
    }
  )
  .subscribe();

// 3. On window focus (automatic with refetchOnWindowFocus)
// No code needed - handled by React Query

// 4. Manual refresh
function RefreshButton() {
  const queryClient = useQueryClient();

  return (
    <button onClick={() => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }}>
      Refresh
    </button>
  );
}
```

### Hydration Patterns

**Initial Load Strategy**:

```typescript
// 1. Immediately show cached data from Dexie
// 2. Fetch fresh data from Supabase in background
// 3. Merge when available

function TransactionList() {
  // Step 1: Load from Dexie (instant)
  const cachedData = useLiveQuery(() => db.transactions.toArray());

  // Step 2: Fetch from server (background)
  const { data: freshData, isFetching } = useQuery({
    queryKey: ['transactions'],
    queryFn: fetchTransactions,
    initialData: cachedData, // Use cache as initial data
  });

  // Step 3: Show cached data immediately, then fresh data
  return (
    <>
      {isFetching && <RefreshIndicator />}
      <List items={freshData || cachedData} />
    </>
  );
}
```

**Stale-While-Revalidate Pattern**:

```typescript
const { data, isStale } = useQuery({
  queryKey: ["transactions"],
  queryFn: fetchTransactions,
  staleTime: 5 * 60 * 1000, // Consider fresh for 5 minutes
  cacheTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
});

// Show stale data immediately, fetch in background
```

### When to Use Which Layer - Decision Matrix

| Scenario               | Use Zustand | Use React Query    | Use Dexie              |
| ---------------------- | ----------- | ------------------ | ---------------------- |
| Modal open/closed      | ✅          | ❌                 | ❌                     |
| Theme preference       | ✅          | ❌                 | ✅ (if persist needed) |
| Transaction list       | ❌          | ✅                 | ✅ (offline copy)      |
| Form draft (temporary) | ✅          | ❌                 | ❌                     |
| Form draft (auto-save) | ❌          | ❌                 | ✅                     |
| Account balances       | ❌          | ✅ (derived query) | ❌                     |
| Sync queue             | ❌          | ❌                 | ✅                     |
| User profile           | ❌          | ✅                 | ✅ (offline copy)      |
| Active filters         | ✅          | ❌                 | ❌                     |
| Saved searches         | ❌          | ❌                 | ✅                     |

### Performance Best Practices

1. **Keep Zustand Stores Small**: Separate UI concerns from data
2. **Use Query Keys Wisely**: Granular keys for fine-grained invalidation
3. **Limit Dexie Reads**: Don't query on every render (use useLiveQuery)
4. **Batch IndexedDB Writes**: Use `bulkAdd()` instead of multiple `add()` calls
5. **Prefetch Critical Data**: Load transactions/accounts on app init
6. **Use Suspense**: Let React handle loading states declaratively

### Common Patterns Implementation

**Pattern: Optimistic Update with Rollback**

```typescript
export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),

    onMutate: async (id) => {
      await queryClient.cancelQueries(["transactions"]);

      const previous = queryClient.getQueryData(["transactions"]);

      queryClient.setQueryData(["transactions"], (old: any[]) => old.filter((tx) => tx.id !== id));

      return { previous };
    },

    onError: (err, id, context) => {
      queryClient.setQueryData(["transactions"], context.previous);
      toast.error("Failed to delete transaction");
    },

    onSettled: () => {
      queryClient.invalidateQueries(["transactions"]);
    },
  });
}
```

**Pattern: Background Sync**

```typescript
// Sync Dexie → Supabase when online
export async function syncOfflineQueue() {
  const queueItems = await db.syncQueue.where("status").equals("queued").toArray();

  for (const item of queueItems) {
    try {
      await db.syncQueue.update(item.id, { status: "syncing" });

      // Send to Supabase
      const result = await syncToSupabase(item);

      // Update IndexedDB with server data
      await updateLocalData(item.entity_type, result);

      // Mark as completed
      await db.syncQueue.delete(item.id);

      // Invalidate React Query cache
      queryClient.invalidateQueries([item.entity_type]);
    } catch (error) {
      await db.syncQueue.update(item.id, {
        status: "failed",
        retry_count: item.retry_count + 1,
      });
    }
  }
}
```

This three-layer architecture provides:

- **Fast UI updates** (Zustand)
- **Smart caching & sync** (React Query)
- **Complete offline support** (Dexie)

By understanding when and how to use each layer, you can build features that are both performant and resilient.

### Routing & Forms

```typescript
{
  "@tanstack/react-router": "^1.60.0",
  "@tanstack/react-virtual": "^3.10.0",  // Virtual scrolling
  "react-hook-form": "^7.53.0",
  "zod": "^3.23.0",                      // Schema validation
  "@hookform/resolvers": "^3.9.0"
}
```

### PWA & Offline

```typescript
{
  "vite-plugin-pwa": "^0.21.0",
  "workbox-window": "^7.1.0",
  "@deno/brotli-wasm": "^0.3.0",        // Compression
  "@fingerprintjs/fingerprintjs": "^4.5.0"  // Device fingerprinting
}
```

### UI Components

```typescript
{
  "tailwindcss": "^3.4.0",
  "shadcn/ui": "latest",                 // Component library
  "sonner": "^1.6.0",                    // Toast notifications
  "@tanstack/react-table": "^8.20.0",
  "recharts": "^2.13.0",                 // Charts
  "lucide-react": "^0.400.0"             // Icons
}
```

## Backend Architecture

### Supabase Configuration

```javascript
// supabase/config.toml
[project];
id = "household-hub"[database];
pooler_enabled = true;
max_connections = (20)[auth];
site_url = "https://household-hub.pages.dev";
additional_redirect_urls = ["http://localhost:5173"][storage];
file_size_limit = "50MB";
```

### Database Design Principles

- **Event Sourcing**: All changes tracked as events
- **Soft Deletes**: Data never truly deleted
- **Audit Trail**: Complete history of modifications
- **Compound Indexes**: Optimized query patterns for common operations
- **Row Level Security**: User-based access control

### Supabase Edge Functions

- **export-data**: Generate Excel/CSV exports
- **backup-metadata**: Store backup info in database

## Cloudflare Workers Architecture

### Worker Services

#### 1. R2 Backup Proxy Worker

```typescript
// r2-proxy.worker.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Validate Supabase JWT
    const jwt = request.headers.get("Authorization");
    const user = await validateJWT(jwt, env);

    // Generate signed URL for R2
    const signedUrl = await env.R2_BUCKET.createSignedUrl(`backups/${user.id}/${Date.now()}.gz`, {
      expirationTtl: 3600,
    });

    return Response.json({ url: signedUrl });
  },
};
```

#### 2. Push Notification Worker

```typescript
// push.worker.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { subscription, payload } = await request.json();

    // Send Web Push notification
    await sendWebPush(subscription, payload, {
      vapidPrivateKey: env.VAPID_PRIVATE_KEY,
      vapidPublicKey: env.VAPID_PUBLIC_KEY,
    });

    return new Response("Notification sent");
  },
};
```

#### 3. Scheduled Cleanup Worker

```typescript
// cleanup.worker.ts
export default {
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    // Clean up old sync queue entries
    // Clean up old snapshots (retention policy)
    // Compact event history
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    await supabase.rpc("cleanup_old_sync_queue");
    await supabase.rpc("cleanup_old_snapshots");
  },
};
```

### Worker Configuration

```toml
# wrangler.toml
name = "household-hub-workers"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "household-hub-backups"

[[kv_namespaces]]
binding = "CACHE"
id = "cache-namespace-id"

[triggers]
crons = ["0 2 * * *"]  # Daily at 2 AM for cleanup tasks

[vars]
SUPABASE_URL = "https://your-project.supabase.co"
ENVIRONMENT = "production"
```

### Worker Benefits

- **Edge Computing**: Run closer to users globally
- **No Cold Starts**: Workers stay warm
- **Cost Effective**: 100k requests/day free
- **Auto-scaling**: Handle traffic spikes automatically
- **Security**: Credentials never exposed to client

## Data Flow

### Write Path Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT WRITES                           │
└───────────┬─────────────────────────────────────────────────┘
            │
            ├──► CRUD Operations (Transactions, Accounts, etc.)
            │    └──► Direct to Supabase (with JWT auth)
            │         └──► PostgreSQL with RLS
            │              └──► Realtime broadcast to other devices
            │
            ├──► File Uploads (Receipts, Attachments)
            │    └──► Client → Cloudflare Worker → R2 Storage
            │         └──► Worker validates JWT and generates signed URLs
            │
            ├──► Backups & Exports
            │    └──► Client → Cloudflare Worker → R2 Storage
            │         └──► Worker handles compression and retention
            │
            └──► Push Notifications
                 └──► Client → Cloudflare Worker → Web Push Service
                      └──► Worker manages VAPID keys securely
```

### 1. Online Flow

```
User Action → Zustand → TanStack Query → Supabase → PostgreSQL
                ↓                           ↓
            IndexedDB ← ← ← ← ← ← Realtime Subscription
```

### 2. Offline Flow

```
User Action → Zustand → IndexedDB (Dexie)
                ↓
          Sync Queue → Background Sync → Supabase (when online)
```

### 3. Conflict Resolution

```typescript
// Event-based conflict resolution
interface TransactionEvent {
  id: string;
  type: "CREATE" | "UPDATE" | "DELETE";
  timestamp: number;
  deviceId: string;
  userId: string;
  data: any;
  previousHash: string;
}

// Merge strategy: Last-write-wins with event replay
```

## Security Architecture

### Authentication Flow

```
Login → Supabase Auth → JWT Token → Stored in localStorage with automatic token refresh
           ↓
    Row Level Security → User-scoped queries
```

**Note**: Using localStorage instead of httpOnly cookies because this is a client-only SPA. The Supabase client handles token refresh automatically. JWT is short-lived (1 hour) with secure refresh token rotation. For Phase 2, can add Cloudflare Worker proxy for httpOnly cookie support if needed.

### Data Access Patterns

- **Joint Data**: Accessible by all authenticated users
- **Personal Data**: Scoped to user_id
- **Shared Transactions**: Via tagged_users array

### API Security

```sql
-- Example RLS Policy
CREATE POLICY "Users can view joint transactions"
ON transactions FOR SELECT
USING (
  account_type = 'joint'
  OR created_by = auth.uid()
  OR auth.uid() = ANY(tagged_users)
);
```

## Performance Optimizations

### Database

- Compound indexes on common query patterns (date, user_id, account_id)
- GIN indexes for array fields (tagged_user_ids)
- Partial indexes for active/cleared transactions
- Query result caching via TanStack Query
- Partitioning for large tables (future)

### Frontend

- React.lazy for code splitting
- Virtual scrolling for large lists
- Web Workers for heavy computations
- Brotli compression for snapshots

### Caching Strategy

```typescript
// TanStack Query caching
{
  staleTime: 5 * 60 * 1000,      // 5 minutes
  cacheTime: 10 * 60 * 1000,     // 10 minutes
  refetchOnWindowFocus: true,
  refetchOnReconnect: 'always'
}
```

## Deployment Architecture

### Infrastructure Stack

- **Frontend Hosting**: Cloudflare Pages (Global CDN)
- **Edge Functions**: Cloudflare Workers (100+ PoPs globally)
- **Object Storage**: Cloudflare R2 (S3-compatible, egress-free)
- **Cache**: Cloudflare KV (Global key-value store)
- **Database**: Supabase PostgreSQL (AWS us-east-1)
- **Realtime**: Supabase WebSockets
- **Monitoring**: Sentry (Error tracking) + CF Analytics

### CI/CD Pipeline

```yaml
# GitHub Actions workflow
- Build → Test → Deploy to Preview
- Manual approval for production
- Automatic database migrations
- Snapshot before deployment
```

## Scalability Considerations

### Current Limits (Free Tier)

- 500MB database storage
- 2GB bandwidth/month
- 50K Edge Function invocations
- 10GB R2 storage

### Growth Path

1. **Phase 1**: Single household (current)
2. **Phase 2**: Database optimization
3. **Phase 3**: Move to paid tier if needed
4. **Phase 4**: Self-hosting option

## Monitoring & Observability

### Metrics

- Transaction sync success rate
- Offline duration tracking
- Snapshot compression ratios
- API response times

### Error Handling

```typescript
// Global error boundary
class ErrorBoundary extends Component {
  logToSentry(error: Error, errorInfo: ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: errorInfo },
    });
  }
}
```

## Development Workflow

### Local Development

```bash
# Terminal 1: Database
npx supabase start

# Terminal 2: Frontend
npm run dev

# Terminal 3: Edge Functions
npx supabase functions serve
```

### Testing Strategy

- Unit tests: Vitest (with coverage targets)
- Integration: Testing Library + Vitest
- E2E: Playwright (cross-browser, mobile)
- Load: k6 for API, Playwright for UI
- Performance: Lighthouse CI
- Visual: Percy (optional)
