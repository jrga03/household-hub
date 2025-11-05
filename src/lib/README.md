# Core Business Logic (`/src/lib/`)

## Purpose

The `lib/` directory contains **all core business logic, utilities, and database operations** for Household Hub. This is the heart of the application, implementing event sourcing, offline-first sync, conflict resolution, currency handling, and data persistence. Code here is framework-agnostic and extensively unit tested.

## Architecture Role

```
┌─────────────────────────────────────────────────┐
│  UI Layer (components/ + routes/)              │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  Data Access Layer (hooks/ + stores/)          │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  ╔═════════════════════════════════════════╗   │
│  ║  BUSINESS LOGIC LAYER (lib/)           ║   │
│  ║  • Event sourcing & sync engine        ║   │
│  ║  • Conflict resolution                 ║   │
│  ║  • Offline operations                  ║   │
│  ║  • Currency & validation               ║   │
│  ║  • Import/export                       ║   │
│  ╚═════════════════════════════════════════╝   │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│  Storage Layer (IndexedDB ←→ Supabase)        │
└─────────────────────────────────────────────────┘
```

## Contents Overview

The `lib/` directory contains **47 files** organized into several functional areas:

### Currency & Financial Operations

- **`currency.ts`** (10.5KB) - PHP currency utilities
  - `formatPHP(cents)` - Format integer cents as ₱1,500.50
  - `parsePHP(input)` - Parse user input to integer cents
  - `validateAmount(cents)` - Validate amount range
- **`currency.test.ts`** - Comprehensive currency tests
- **`currency.examples.ts`** - Usage examples
- **`currency.md`** ✅ - Complete currency documentation

### Entity Operations (CRUD)

Basic create/update operations for Supabase entities:

- **`accounts.ts`** - Account CRUD operations
- **`categories.ts`** - Category CRUD operations
- **`transactions.ts`** - Transaction CRUD operations
- **`budgets.ts`** - Budget CRUD operations

These modules provide simple wrappers around `supabaseQueries.ts` for common operations.

### Event Sourcing System

Event sourcing implementation with immutable audit log:

- **`event-generator.ts`** (14.1KB) - Generate transaction events
  - Creates immutable events for all entity changes
  - Generates idempotency keys: `${deviceId}-${entityType}-${entityId}-${lamportClock}`
  - Tracks lamport clocks per entity
  - Phase A: Simple structure, Phase B: Vector clocks
- **`event-generator.test.ts`** - Event generation tests
- **`event-compactor.ts`** (18.9KB) - Event log compaction
  - Compacts events when >100 events OR monthly
  - Merges consecutive updates into snapshots
  - Maintains audit trail with compacted events
  - Runs daily at 3 AM (see `App.tsx:82`)
- **`event-compactor.test.ts`** - Compaction logic tests

### Conflict Resolution

Field-level conflict detection and resolution (Phase B):

- **`conflict-detector.ts`** (9.1KB) - Detect conflicts using vector clocks
  - Compares entity vector clocks to detect concurrent edits
  - Per-entity vector clock scoping
  - Detects: concurrent updates, delete-update conflicts
- **`conflict-detector.test.ts`** - Detection logic tests
- **`conflict-resolver.ts`** (11.6KB) - Resolve conflicts with deterministic rules
  - Field-level Last-Write-Wins (server timestamps)
  - DELETE always wins over UPDATE
  - Lamport clock + deviceId tie-breaking
  - Generates merged entities
- **`conflict-resolver.test.ts`** - Resolution logic tests
- **`conflict-resolution-rules.md`** ✅ - Conflict resolution rules documentation

### Sync Engine

Core sync functionality for multi-device synchronization:

- **[`sync/`](./sync/)** - Sync engine implementation (9 files)
  - `processor.ts` - Main sync processor (state machine)
  - `autoSync.ts` - Automatic sync manager
  - `idempotency.ts` - Idempotency key handling
  - `idMapping.ts` - Temporary ID → Server UUID mapping
  - `lamportClock.ts` - Lamport logical clocks
  - `vectorClock.ts` - Vector clock implementation
  - `retry.ts` - Retry logic with exponential backoff
  - `SyncIssuesManager.ts` - Conflict/issue tracking

See [sync/README.md](./sync/) for detailed sync architecture.

### Offline Operations

Offline-first data operations and sync queue:

- **[`offline/`](./offline/)** - Offline operations (9 files)
  - `syncQueue.ts` (13.5KB) - Sync queue management (excellent inline docs!)
  - `transactions.ts` (15.2KB) - Offline transaction CRUD
  - `accounts.ts` (9.8KB) - Offline account CRUD
  - `categories.ts` (9.7KB) - Offline category CRUD
  - `cacheManager.ts` - Cache management
  - `types.ts` - Offline type definitions
  - `syncQueue.test.README.md` ✅ - Test setup guide

See [offline/README.md](./offline/) for offline architecture details.

### Database Layer (Dexie.js)

IndexedDB database setup and device management:

- **[`dexie/`](./dexie/)** - Dexie.js database layer (2 files)
  - `db.ts` (16.7KB) - Dexie schema with version migrations (excellent inline docs!)
  - `deviceManager.ts` (18.7KB) - Device ID with hybrid fallback strategy

See [dexie/README.md](./dexie/) for database schema and device identification.

### Realtime & Background Sync

- **`realtime-sync.ts`** (28.1KB) - Supabase Realtime subscriptions
  - Listens to remote changes from other devices
  - Applies remote changes to local IndexedDB
  - Handles reconnection and error recovery
- **`background-sync.ts`** - Background sync registration
  - Multi-strategy: Background Sync API + fallbacks
  - iOS Safari support (visibility change, focus events)
  - Consolidates network event handling

### Import/Export

CSV and JSON import/export functionality:

- **`csv-exporter.ts`** (10KB) - Export transactions to CSV
  - Generates RFC 4180 compliant CSV
  - Includes all transaction fields
  - Formatted dates and currency
- **`csv-exporter.test.ts`** - Export logic tests
- **`csv-importer.ts`** (11.3KB) - Import transactions from CSV
  - Flexible column mapping
  - Duplicate detection
  - Validation and error reporting
- **`csv-importer.test.ts`** - Import logic tests
- **`duplicate-detector.ts`** - Transaction deduplication

### Validation

- **[`validations/`](./validations/)** - Zod validation schemas
  - `transaction.ts` - Transaction form validation

### Supabase Integration

- **`supabase.ts`** - Supabase client initialization
- **`supabaseQueries.ts`** (44.2KB) - **MASSIVE** query collection
  - All database queries for accounts, categories, transactions, budgets
  - Uses Supabase JS client
  - RLS policies enforced at database level
- **`sentry.ts`** - Sentry error tracking integration

### Utilities

- **[`utils/`](./utils/)** - Utility functions
  - `filters.ts` - Filter utilities
- **`utils.ts`** - General utilities (cn function for Tailwind)
- **`index.ts`** - Library exports
- **`validateColor.ts`** - Color validation for categories
- **`vector-clock.ts`** (15.8KB) - Vector clock operations
- **`vector-clock.test.ts`** - Vector clock tests
- **`vector-clock-debug.ts`** - Vector clock debugging utilities
- **`idempotency.ts`** - Root-level idempotency utilities
- **`device-registration.ts`** (7KB) - Device registration logic
- **`device.ts`** - Device utilities

### Testing

- **[`__tests__/`](./__tests__/)** - Integration tests
  - `accountBalance.test.ts` - Account balance calculations
- **[`hooks/`](./hooks/)** - Utility hooks
  - `useDebounce.ts` - Debounce hook

## Key Modules Deep Dive

### 1. Event Generator (`event-generator.ts`)

**Purpose:** Creates immutable events for all entity mutations.

**Core Functions:**

```typescript
// Generate create event
const event = generateCreateEvent(
  entityType: 'transaction' | 'account' | 'category' | 'budget',
  entityId: string,
  payload: any,
  userId: string,
  deviceId: string
);

// Generate update event
const event = generateUpdateEvent(
  entityType,
  entityId,
  changes: Partial<Entity>, // Only changed fields
  userId,
  deviceId
);

// Generate delete event
const event = generateDeleteEvent(entityType, entityId, userId, deviceId);
```

**Idempotency Keys:** Format is `${deviceId}-${entityType}-${entityId}-${lamportClock}`, ensuring exactly-once processing even with network retries.

**See:** `event-generator.ts:1-50` for complete documentation.

### 2. Sync Processor (`sync/processor.ts`)

**Purpose:** Processes sync queue to push local changes to Supabase.

**State Machine:**

```
draft → queued → syncing → acked → confirmed
              ↓ (on error)
            failed (with retry + exponential backoff)
```

**Core Function:**

```typescript
// Process all queued items for user
await syncProcessor.processQueue(userId: string);
```

**Retry Strategy:**

- Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s (max)
- Max 10 retries before marking as failed
- Permanent failures (validation errors) don't retry

**See:** [sync/README.md](./sync/) and `sync/processor.ts:1-44` for architecture.

### 3. Offline Sync Queue (`offline/syncQueue.ts`)

**Purpose:** Manages queue of pending changes for offline-first operations.

**Core Functions:**

```typescript
// Add to sync queue (write to IndexedDB + queue)
await addToSyncQueue(
  operation: 'create' | 'update' | 'delete',
  entityType: string,
  entityId: string,
  payload: any,
  userId: string
);

// Get all queued items
const items = await getSyncQueue(userId: string, deviceId: string);

// Update queue item status
await updateSyncQueueStatus(id: string, status: SyncStatus);

// Remove from queue (after confirmation)
await removeFromSyncQueue(id: string);
```

**See:** `offline/syncQueue.ts:1-29` for excellent inline documentation.

### 4. Dexie Database (`dexie/db.ts`)

**Purpose:** IndexedDB schema with version migrations.

**Tables:**

- `accounts` - Account entities
- `categories` - Category entities
- `transactions` - Transaction entities
- `budgets` - Budget entities
- `events` - Event sourcing log
- `syncQueue` - Pending sync operations
- `meta` - Metadata (device ID, etc.)

**Schema Versioning:**

```typescript
// Upgrade pattern
this.version(2)
  .stores({
    transactions: "++id, account_id, category_id, date, [account_id+date]",
  })
  .upgrade((tx) => {
    // Migration logic
  });
```

**See:** `dexie/db.ts:1-17` for schema documentation.

### 5. Currency Utilities (`currency.ts`)

**Purpose:** PHP currency formatting and parsing (CRITICAL for correctness).

**Core Functions:**

```typescript
// Format cents to display string
formatPHP(150050); // "₱1,500.50"

// Parse input to cents
parsePHP("1,500.50"); // 150050
parsePHP("1500.50"); // 150050 (commas optional)
parsePHP(1500.5); // 150050 (accepts numbers)

// Validate amount
validateAmount(150050); // true
validateAmount(-100); // false (negative not allowed)
validateAmount(100000000000); // false (exceeds max)
```

**Amount Storage Rules:**

- Always store as integer cents (BIGINT in database)
- Always positive (use `type` field: 'income' | 'expense')
- Range: 0 to 999,999,999 cents (₱0.00 to ₱9,999,999.99)

**See:** `currency.md` for complete specification.

## Testing Strategy

### Unit Tests

All complex logic is unit tested with Vitest:

```bash
npm test                       # Run all tests
npm test -- currency           # Test specific file
npm test -- lib/sync           # Test directory
npm test -- --coverage         # With coverage
```

**Test Files:** Colocated with source (e.g., `currency.test.ts` next to `currency.ts`)

**Test Patterns:**

- Currency: Formatting, parsing, validation edge cases
- Events: Idempotency key generation, payload structure
- Conflict resolution: Vector clock comparison, field-level merging
- Sync: State transitions, retry logic, error handling
- Offline: IndexedDB operations, queue management

### Integration Tests

Located in `__tests__/` directory for cross-module tests.

### E2E Tests

Sync and offline scenarios tested in `/tests/e2e/`:

- Offline transaction creation + sync
- Multi-device conflict scenarios
- Background sync behavior

## Common Development Tasks

### Adding a New Entity Type

1. **Create entity CRUD module** (e.g., `tags.ts`)
2. **Add Supabase queries** to `supabaseQueries.ts`
3. **Add offline operations** in `offline/tags.ts`
4. **Update event generator** to support `entityType: 'tag'`
5. **Add Dexie table** in `dexie/db.ts` with version bump
6. **Create TypeScript types** in `../types/tags.ts`

### Adding a New Sync Rule

1. **Define rule** in `conflict-resolution-rules.md`
2. **Implement detection** in `conflict-detector.ts`
3. **Implement resolution** in `conflict-resolver.ts`
4. **Add tests** for detection and resolution
5. **Update** `sync/processor.ts` to apply rule

### Adding a Currency Feature

1. **Add function** to `currency.ts`
2. **Add tests** to `currency.test.ts`
3. **Add example** to `currency.examples.ts`
4. **Document** in `currency.md`

### Debugging Sync Issues

1. **Check sync queue:** Open DevTools → Application → IndexedDB → `householdHubDB` → `syncQueue`
2. **Check console logs:** Sync processor logs all state transitions
3. **Check Sentry:** Error tracking for sync failures
4. **Use SyncIndicator:** Visual indicator in UI (top-right)
5. **Read sync status:** `useSyncStatus()` hook provides current state

## Module Dependencies

```
currency.ts (standalone)
  ↓
[Entity CRUD modules] → supabaseQueries.ts → supabase.ts
  ↓
event-generator.ts ← idempotency.ts, vector-clock.ts
  ↓
offline/ modules → dexie/db.ts, sync/idempotency.ts
  ↓
sync/processor.ts → sync/retry.ts, sync/idMapping.ts, event-generator.ts
  ↓
realtime-sync.ts → supabaseQueries.ts, offline/ modules
  ↓
[Used by hooks/ and components/]
```

## Code Quality Standards

### Rules

- ✅ **No `any` types** - Use proper TypeScript types (enforced by ESLint)
- ✅ **Unit tests required** - All complex logic must have tests
- ✅ **Inline documentation** - Complex functions need JSDoc comments (see `syncQueue.ts:1-29` as example)
- ✅ **Pure functions preferred** - Easier to test and reason about
- ✅ **Error handling** - Always handle errors, log to Sentry
- ✅ **Immutability** - Use `readonly` for event sourcing

### Excellent Documentation Examples

These files demonstrate ideal inline documentation:

- `dexie/db.ts:1-17` - Schema overview with architecture links
- `offline/syncQueue.ts:1-29` - State machine explanation
- `sync/processor.ts:1-44` - Sync architecture overview
- `currency.ts:1-30` - Function purpose and usage

**Use these as templates for other modules.**

## Performance Considerations

- **Currency operations:** Highly optimized (benchmark tested)
- **Sync processor:** Batch operations, exponential backoff
- **Event compaction:** Runs off-peak (3 AM daily)
- **IndexedDB:** Compound indexes for queries (see `dexie/db.ts`)
- **Realtime subscriptions:** Throttled to prevent overwhelming UI

## Related Documentation

### Comprehensive Guides

- [/docs/initial plan/SYNC-ENGINE.md](../../docs/initial%20plan/SYNC-ENGINE.md) - Complete sync architecture (79KB!)
- [/docs/initial plan/DATABASE.md](../../docs/initial%20plan/DATABASE.md) - Database schema and queries (47KB!)
- [/docs/initial plan/DECISIONS.md](../../docs/initial%20plan/DECISIONS.md) - Architectural decisions (42.7KB!)

### Implementation Guides

- [/docs/initial plan/implementation/chunks/](../../docs/initial%20plan/implementation/chunks/) - Step-by-step chunks

### Subdirectory READMEs

- [sync/README.md](./sync/) - Sync engine architecture
- [offline/README.md](./offline/) - Offline operations
- [dexie/README.md](./dexie/) - Database layer
- [types/README.md](./types/) - Type definitions
- [utils/README.md](./utils/) - Utility functions
- [validations/README.md](./validations/) - Validation schemas

### Other Source Directories

- [../components/README.md](../components/) - UI components
- [../hooks/README.md](../hooks/) - Custom hooks that use lib modules
- [../stores/README.md](../stores/) - State management
- [../README.md](../) - Source code overview

## Further Reading

- [Dexie.js Documentation](https://dexie.org) - IndexedDB wrapper
- [Supabase JS Client](https://supabase.com/docs/reference/javascript) - Database queries
- [Vector Clocks Explained](https://en.wikipedia.org/wiki/Vector_clock) - Distributed systems
- [Event Sourcing Pattern](https://martinfowler.com/eaaDev/EventSourcing.html) - Martin Fowler
- [Idempotency in Distributed Systems](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) - AWS
