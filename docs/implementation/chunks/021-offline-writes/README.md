# Chunk 021: Offline Writes

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Offline (3 of 7)
- **Prerequisites**: Chunk 020 (offline reads)
- **Can Skip**: No - required for offline functionality

## What You're Building

Offline-first write operations that persist immediately:

- Offline mutation functions for transactions, accounts, and categories
- Optimistic UI updates with instant feedback
- IndexedDB write operations (create, update, delete)
- Preparing data structures for sync queue
- Rollback capability for failed operations
- Testing offline CRUD operations

## Why This Matters

Offline writes enable the app to function without internet connectivity:

- **Zero latency**: Changes apply immediately
- **No loading states**: Instant UI feedback
- **Better UX**: Works on planes, trains, and poor connections
- **Data preservation**: Changes queued until online
- **Reliability**: App doesn't block on network

## Before You Start

Make sure you have:

- Chunk 019 completed (Dexie database set up)
- Chunk 020 completed (offline reads working)
- Device ID persistence functional
- Understanding of optimistic updates

## What Happens Next

After this chunk:

- Can create/update/delete transactions offline
- Can manage accounts and categories offline
- IndexedDB stores all changes immediately
- UI updates optimistically
- Ready for Chunk 022 (sync queue schema)

## Key Files Created

```
src/
├── lib/
│   └── offline/
│       ├── transactions.ts      # Offline transaction mutations
│       ├── accounts.ts          # Offline account mutations
│       ├── categories.ts        # Offline category mutations
│       └── types.ts             # Offline operation types
└── hooks/
    ├── useOfflineTransaction.ts # Transaction mutation hooks
    ├── useOfflineAccount.ts     # Account mutation hooks
    └── useOfflineCategory.ts    # Category mutation hooks
```

## Features Included

### Offline Transaction Operations

- **Create**: Add new transaction to IndexedDB
- **Update**: Modify existing transaction locally
- **Delete**: Mark transaction as deleted (soft delete)
- **Optimistic updates**: UI reflects changes immediately

### Offline Account Operations

- **Create**: Add new account offline
- **Update**: Modify account details locally
- **Deactivate**: Mark account inactive

### Offline Category Operations

- **Create**: Add new category (parent or child)
- **Update**: Modify category properties
- **Deactivate**: Mark category inactive

### Data Preparation

- Generate temporary IDs for offline-created entities
- Prepare payload for eventual sync queue
- Maintain referential integrity locally
- Handle concurrent offline edits

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 100-277 (Event Structure)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 1782-1885 (offline cache strategy)
- **Decisions**:
  - #62: Event sourcing from Phase A
  - #75: Hybrid device ID for tracking changes
- **Architecture**: Three-layer storage (optimistic Zustand → IndexedDB → Supabase)

## Technical Stack

- **Dexie.js**: IndexedDB writes with transactions
- **TanStack Query**: Mutation hooks with optimistic updates
- **Zustand**: Optimistic UI state updates
- **nanoid**: Generate temporary IDs for offline entities

## Design Patterns

### Optimistic Update Pattern

```typescript
// 1. Update UI immediately
updateUIState(optimisticData);

// 2. Write to IndexedDB
await db.transactions.add(data);

// 3. Queue for sync (chunk 023)
// Will be implemented in next chunk
```

### Offline Mutation Flow

```typescript
async function createOfflineTransaction(data: TransactionInput): Promise<Transaction> {
  // 1. Generate temporary ID (will be replaced by server ID on sync)
  const tempId = `temp-${nanoid()}`;

  // 2. Create transaction object
  const transaction: Transaction = {
    id: tempId,
    ...data,
    device_id: await getDeviceId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 3. Write to IndexedDB
  await db.transactions.add(transaction);

  // 4. Return for UI update
  return transaction;
}
```

### Rollback Strategy

```typescript
// If operation fails, rollback IndexedDB change
try {
  await db.transactions.add(newTransaction);
} catch (error) {
  // Rollback UI state
  revertUIState();
  // Show error to user
  toast.error("Failed to save transaction");
  throw error;
}
```

## Critical Concepts

**Temporary IDs**:

- Offline-created entities get temporary IDs (`temp-${nanoid()}`)
- Replaced with server IDs when synced
- All references use temporary IDs until sync completes

**Optimistic Updates**:

- UI updates before server confirmation
- Assumes success (most operations succeed)
- Rollback if operation fails

**IndexedDB Transactions**:

- Use Dexie transactions for atomic operations
- Multiple related writes succeed or fail together
- Prevents partial state corruption

**Offline Referential Integrity**:

- Transactions reference accounts/categories by ID
- Must handle temporary IDs for newly created parents
- Queue maintains reference chain for sync

---

**Ready?** → Open `instructions.md` to begin
