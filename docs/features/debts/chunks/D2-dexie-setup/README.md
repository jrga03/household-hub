# Chunk D2: Dexie Schema & Offline Setup

## At a Glance

- **Time**: 1 hour
- **Prerequisites**: D1 (Database Schema) complete
- **Can Skip**: No - required for offline functionality
- **Depends On**: Existing Dexie setup with transactions, accounts, categories tables

## What You're Building

IndexedDB schema for offline-first debt tracking:

- **3 new Dexie tables**: `debts`, `internalDebts`, `debtPayments`
- **Schema version migration**: Explicit version increment with upgrade function
- **TypeScript interfaces**: Complete type definitions for all debt entities
- **Lamport clock initialization**: Persistent counter in meta table
- **Migration testing**: Verify on clean database and with existing data
- **Type safety**: Branded types for cents, device IDs, and entity references

## Why This Matters

Dexie is the **offline persistence layer**:

- **Local-first**: All debt operations work without internet
- **Sync queue**: Changes queued automatically for background sync
- **Query performance**: Indexes optimize payment history and debt listings
- **Type safety**: TypeScript interfaces prevent runtime errors
- **Migration safety**: Explicit versioning prevents infinite version loops

This chunk enables the offline-first architecture for debt tracking.

## Before You Start

Verify these prerequisites:

- [ ] **Chunk D1 complete** - Database schema deployed to Supabase
- [ ] **Dexie configured** - `src/lib/dexie/db.ts` exists with existing tables
- [ ] **Current schema version known** - Check `db.verno` in existing code
- [ ] **TypeScript configured** - Can import types from `src/types/`
- [ ] **Meta table exists** - Used for lamport clock storage

**How to verify**:

```typescript
import { db } from "@/lib/dexie/db";
console.log("Current version:", db.verno);
console.log("Has meta table:", db.meta !== undefined);
```

## What Happens Next

After this chunk:

- Debt data persists locally in IndexedDB
- Offline debt creation/editing works
- Balance calculations available offline
- TypeScript provides type safety
- Ready for Chunk D3 (Balance Calculation & Status Logic)

## Key Files Created/Modified

```
src/
├── lib/
│   └── dexie/
│       └── db.ts                    # MODIFIED: Add debt tables to schema
├── types/
│   ├── debt.ts                      # NEW: Debt type definitions
│   └── index.ts                     # MODIFIED: Export debt types
└── __tests__/
    └── dexie-migration.test.ts      # NEW: Migration tests
```

## Features Included

### Dexie Table Definitions

**debts**:

- Indexes: `id`, `household_id`, `status`, `created_at`
- No balance field (derived from payments)
- Compound index: `household_id + status + updated_at`

**internalDebts**:

- Indexes: `id`, `household_id`, `from_type`, `from_id`, `to_type`, `to_id`, `status`
- Display name caching: `from_display_name`, `to_display_name`
- Entity type filtering: Efficient queries by type

**debtPayments**:

- Indexes: `id`, `debt_id`, `internal_debt_id`, `transaction_id`, `payment_date`, `is_reversal`
- Compound indexes for payment history queries
- Reversal filtering support

### TypeScript Interfaces

**Core Types**:

- `Debt` - External debt structure
- `InternalDebt` - Household borrowing structure
- `DebtPayment` - Immutable payment record
- `DebtWithBalance` - Computed type with derived balance

**Helper Types**:

- `DebtStatus` - Union type for status values
- `EntityType` - Union type for internal debt entities
- `AmountCents` - Branded type for currency safety

### Migration Strategy

**Explicit Version Number**:

```typescript
// CRITICAL: Hardcode version - do NOT calculate dynamically
const DEBT_MIGRATION_VERSION = 4; // Set based on current schema
```

**Why**: Using `db.verno + 1` creates infinite versions on re-runs. Always check current version and set next integer explicitly.

**Upgrade Function**:

- Initialize lamport_clock if missing
- Log migration progress
- Validate existing data (if any)
- No data transformation needed (clean schema)

## Related Documentation

- **Dexie Schema**: `debt-implementation.md` lines 76-104 (schema definition)
- **TypeScript Interfaces**: `debt-implementation.md` lines 106-171 (type definitions)
- **Migration Strategy**: `debt-implementation.md` lines 2221-2299 (version handling)
- **Decisions**:
  - #1: Derived balances (DEBT-DECISIONS.md lines 9-37)
  - #18: Idempotency persistence (DEBT-DECISIONS.md lines 666-707)
- **Original Pattern**: Chunk 019 (Dexie setup) for migration patterns
- **Currency Types**: `src/lib/currency.ts` for AmountCents pattern

## Technical Stack

- **Dexie.js 4.x**: IndexedDB wrapper
- **TypeScript 5.x**: Type safety
- **Vitest**: Migration testing
- **IndexedDB**: Browser storage API

## Design Patterns

### Explicit Version Migration Pattern

```typescript
// ❌ WRONG: Dynamic versioning (creates infinite versions)
db.version(db.verno + 1).stores({ ... });

// ✅ CORRECT: Explicit versioning
const DEBT_MIGRATION_VERSION = 4;  // Hardcoded based on current schema
db.version(DEBT_MIGRATION_VERSION).stores({ ... });
```

**Why**: `db.verno` reflects the highest version defined, not the database's current version. Using it in calculations causes version numbers to increment on every code execution.

### Compound Index Pattern

```typescript
// Optimize common query: "Get active debts by household, sorted by date"
{
  debts: "id, household_id, status, created_at, [household_id+status+updated_at]";
}
```

**Why**: Compound index `[household_id+status+updated_at]` enables efficient filtered sorting without full table scan.

### Branded Type Pattern

```typescript
// Prevent mixing raw numbers with currency amounts
type AmountCents = number & { __brand: "AmountCents" };

function formatPHP(cents: AmountCents): string {
  return `₱${(cents / 100).toFixed(2)}`;
}

// Type error: number not assignable to AmountCents
const amount: AmountCents = 1500; // ❌

// Correct: Explicit cast
const amount = 1500 as AmountCents; // ✅
```

**Why**: Prevents accidentally using unvalidated numbers as currency amounts.

### Lamport Clock Persistence Pattern

```typescript
// Initialize counter in meta table
async function getNextLamportClock(): Promise<number> {
  const meta = await db.meta.get("lamport_clock");
  const next = (meta?.value || 0) + 1;
  await db.meta.put({ key: "lamport_clock", value: next });
  return next;
}
```

**Why**: Survives browser refreshes, prevents idempotency key collisions.

## Critical Concepts

**No Balance Field**: The Dexie schema intentionally **excludes** `current_balance_cents` from debt tables. Balance is always calculated from payment history at read time. This is non-negotiable for data integrity.

**Soft References**: Internal debt `from_id`/`to_id` fields are UUIDs without foreign key constraints in Dexie. References can become stale if entities are deleted. This is acceptable - display names preserve context.

**Meta Table**: The `meta` table stores key-value pairs including:

- `lamport_clock`: Monotonic counter for idempotency keys
- `device_id`: Current device identifier
- Future: sync metadata, settings, etc.

**Version Safety**: Always check the current schema version before defining the next migration:

```bash
# In browser console or test file
import { db } from '@/lib/dexie/db';
console.log('Current version:', db.verno);  // e.g., 3
// Then set DEBT_MIGRATION_VERSION = 4 in code
```

**Index Selection**: Indexes mirror database indexes from D1 to maintain query performance parity between online (Supabase) and offline (Dexie) modes.

## IndexedDB Storage Characteristics

**Storage Limits**:

- Chrome/Edge: 60% of available disk space
- Firefox: 50% of available disk space
- Safari: 1GB cap (iOS stricter)

**Quota Monitoring**:

```typescript
const estimate = await navigator.storage.estimate();
const percentUsed = (estimate.usage / estimate.quota) * 100;
// Warn at 80%, prune at 95%
```

**Table Size Estimates** (for 1000 debts):

- `debts`: ~100KB (100 bytes per record)
- `internalDebts`: ~150KB (150 bytes with display names)
- `debtPayments`: ~500KB (500 bytes with reversals)
- **Total**: ~750KB for typical household usage

## Performance Considerations

**Query Optimization**:

- Compound indexes enable range queries + sorting in single operation
- Partial indexes (WHERE clauses) not supported in Dexie - use `.filter()` instead
- Payment history queries optimized with `debt_id + payment_date` compound index

**Memory Usage**:

- Dexie loads entire result sets into memory
- Limit large queries with `.limit()` and pagination
- Use `.count()` for existence checks instead of `.toArray().length`

**Migration Speed**:

- New tables: <10ms (empty initialization)
- Existing data validation: ~1ms per 1000 records
- Lamport clock init: <1ms (single key-value write)

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
