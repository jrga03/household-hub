# Chunk 030: Event Generation

## At a Glance

- **Time**: 1.5 hours
- **Milestone**: Multi-Device Sync (5 of 10)
- **Prerequisites**: Chunk 029 (idempotency key generation)
- **Can Skip**: No - enables event sourcing for all mutations

## What You're Building

Event generation on all CRUD operations:

- createEvent() utility for all entity types
- Hook into transaction create/update/delete
- Hook into account, category, budget mutations
- Store events in both Dexie (offline) and Supabase (cloud)
- Payload optimization (full for create, delta for update)
- Integration with idempotency keys

## Why This Matters

This chunk **brings event sourcing to life**. Every mutation now creates an immutable event, enabling:

- **Complete audit trail**: See every change ever made
- **Multi-device sync**: Events are units of synchronization
- **Conflict resolution**: Compare events to detect conflicts
- **Rollback capability**: Replay events to any point in time
- **Debugging**: Trace issues through event log

Without event generation, the infrastructure is useless. This is where it all comes together.

## Before You Start

Make sure you have:

- Chunk 029 completed (idempotency keys working)
- transaction_events table in Supabase
- Dexie events table ready
- DeviceManager and idempotencyGenerator available

## What Happens Next

After this chunk:

- All mutations generate events automatically
- Events stored locally (Dexie) and cloud (Supabase)
- Audit trail visible in Supabase dashboard
- Ready for sync processor (chunk 024)
- Foundation for conflict resolution (Phase B)
- Multi-device sync foundation complete

## Key Files Created

```
src/
└── lib/
    ├── event-generator.ts         # Event generation utilities
    └── event-generator.test.ts    # Unit tests
```

## Features Included

### Event Generation

```typescript
// On transaction create
await createTransaction({ amount: 1000 });
// → Generates event with op: 'create', payload: full record

// On transaction update
await updateTransaction("tx-123", { amount: 2000 });
// → Generates event with op: 'update', payload: { amount: 2000 } (delta only)

// On transaction delete
await deleteTransaction("tx-123");
// → Generates event with op: 'delete'
```

### Payload Optimization

- **Create**: Full record in payload
- **Update**: Only changed fields (delta)
- **Delete**: Minimal metadata

### Dual Storage

Events stored in both:

1. **Dexie** (offline, immediate)
2. **Supabase** (cloud, sync queue)

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 227-277 (event creation)
- **Decisions**: #62 (event sourcing from Phase A)

## Technical Stack

- **TypeScript**: Type-safe event generation
- **Dexie**: Local event storage
- **Supabase**: Cloud event storage
- **IdempotencyKeyGenerator**: Unique keys

## Design Patterns

### Event Creation Hook

```typescript
async function createTransaction(data: TransactionInput) {
  // 1. Validate input
  // 2. Insert into database
  const transaction = await db.transactions.add(data);

  // 3. Generate event
  await createEvent({
    entityType: "transaction",
    entityId: transaction.id,
    op: "create",
    payload: transaction,
  });

  return transaction;
}
```

### Delta Payload for Updates

```typescript
// Only include changed fields
const oldTransaction = { amount: 1000, description: "Old" };
const newTransaction = { amount: 2000, description: "Old" }; // Amount changed

const delta = { amount: 2000 }; // Only changed field
```

---

**Ready?** → Open `instructions.md` to begin
