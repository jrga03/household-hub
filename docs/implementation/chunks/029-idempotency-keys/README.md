# Chunk 029: Idempotency Keys

## At a Glance

- **Time**: 1 hour
- **Milestone**: Multi-Device Sync (4 of 10)
- **Prerequisites**: Chunk 028 (transaction_events table with idempotency_key field)
- **Can Skip**: No - prevents duplicate event processing

## What You're Building

Idempotency key generation system:

- IdempotencyKeyGenerator class for deterministic keys
- Format: `${deviceId}-${entityType}-${entityId}-${lamportClock}`
- Lamport clock per-entity (not global)
- getNextLamportClock() utility
- Checksum generation for payload integrity
- Unit tests for key generation and collision prevention

## Why This Matters

Idempotency keys are **critical for preventing duplicate events**. Without them:

- Network retries create duplicate events
- Race conditions cause double-processing
- Multi-device sync creates conflicts
- Event replay corrupts state

The deterministic key format ensures the same mutation always generates the same key, making duplicates impossible.

## Before You Start

Make sure you have:

- Chunk 026 completed (device types defined - DevicePlatform required)
- Chunk 027 completed (devices table with device registration)
- Chunk 028 completed (transaction_events table exists in Supabase)
- Dexie events table added to schema (see chunk 028 or Dexie schema setup)
- DeviceManager returning device IDs
- Understanding of lamport clocks (logical timestamps)
- Development environment using localhost or HTTPS (required for Web Crypto API)

## What Happens Next

After this chunk:

- Generate unique idempotency keys for all mutations
- Lamport clocks increment per entity
- Duplicate events prevented automatically
- Ready for event generation (chunk 030)
- Foundation for conflict resolution (Phase B)

## Key Files Created

```
src/
├── lib/
│   ├── idempotency.ts           # IdempotencyKeyGenerator class
│   └── idempotency.test.ts      # Unit tests
└── types/
    └── event.ts                 # Event type definitions
```

## Features Included

### Idempotency Key Format

```
${deviceId}-${entityType}-${entityId}-${lamportClock}

Example:
"abc123xyz-transaction-tx-456-1"
"abc123xyz-transaction-tx-456-2"
"xyz789abc-transaction-tx-456-1"  // Different device
```

**Properties**:

- **Deterministic**: Same inputs → same key
- **Unique per mutation**: lamportClock increments
- **Device-scoped**: Different devices, different keys
- **Entity-scoped**: Each entity has independent clock

### Lamport Clock

Logical timestamp that increments with each event for a specific entity:

```typescript
// First event for transaction tx-123
lamportClock: 1;

// Second event for same transaction
lamportClock: 2;

// First event for different transaction tx-456
lamportClock: 1; // Independent clock
```

### Checksum Generation

SHA-256 hash of normalized payload for integrity:

```typescript
const checksum = calculateChecksum({ amount: 1000, description: "Test" });
// → "a3f5b8c2d9e1..."
```

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 227-277 (idempotency keys)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 269-276 (lamport clock)
- **Decisions**:
  - #62: Event sourcing from Phase A
  - #77: Deterministic conflict resolution
- **Architecture**: Per-entity logical timestamps

## Technical Stack

- **TypeScript**: Type-safe key generation
- **Dexie**: Query events for lamport clock
- **Web Crypto API**: SHA-256 checksums
- **Vitest**: Unit testing

## Design Patterns

### Deterministic Key Generation

```typescript
// Same inputs always produce same key
const key1 = generateKey("device-abc", "transaction", "tx-123", 1);
const key2 = generateKey("device-abc", "transaction", "tx-123", 1);
console.log(key1 === key2); // true
```

### Per-Entity Clock

```typescript
// Each entity maintains independent lamport clock
const events = {
  "tx-123": [1, 2, 3], // Lamport clocks for tx-123
  "tx-456": [1, 2], // Independent clocks for tx-456
  "account-1": [1], // Independent clocks for account-1
};
```

### Automatic Increment

```typescript
// Get next lamport clock for entity
const currentMax = 3;
const nextClock = currentMax + 1; // 4
```

## Idempotency Guarantees

**At-Least-Once Delivery**: Safe to retry operations

```typescript
// First attempt
await createEvent({ idempotency_key: "device-tx-123-1" }); // Success

// Retry (network error, user double-click, etc.)
await createEvent({ idempotency_key: "device-tx-123-1" }); // Blocked by unique constraint
```

**Event Ordering**: Lamport clock provides total order within entity

```typescript
// Events for tx-123 always ordered: 1, 2, 3, 4, ...
events.sort((a, b) => a.lamport_clock - b.lamport_clock);
```

## Performance Characteristics

- **Key generation**: <1ms (string concatenation)
- **Lamport clock query**: ~5ms (indexed on entity_id + lamport_clock)
- **Checksum calculation**: ~2ms (SHA-256 of JSON)
- **Total overhead**: ~8ms per event (acceptable)

## Testing Strategy

### Unit Tests

- Key format correct
- Same inputs → same key
- Lamport clock increments
- Checksum deterministic
- Handles edge cases (empty payload, special chars)

### Integration Tests

- Keys prevent duplicate events in database
- Lamport clocks independent per entity
- Multiple devices generate unique keys

---

**Ready?** → Open `instructions.md` to begin
