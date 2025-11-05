# Database Layer (`/src/lib/dexie/`)

## Purpose

The Dexie module provides the **IndexedDB database layer** for offline-first storage and implements **hybrid device identification** for multi-device sync. It defines the local database schema, handles schema migrations, and manages device ID persistence across sessions.

## Contents

- **`db.ts`** (16.7KB) - Dexie database schema and version migrations
  - Defines IndexedDB tables for all entities
  - Version migrations with `.upgrade()` functions
  - Compound indexes for query optimization
  - **Lines 1-17 have excellent inline documentation** ⭐

- **`deviceManager.ts`** (18.7KB) - Hybrid device identification
  - 4-tier fallback strategy for device ID
  - Memory caching for performance
  - Dual storage (IndexedDB + localStorage) for redundancy
  - Automatic Supabase device registration
  - Platform/browser detection
  - **Lines 1-21 have excellent inline documentation** ⭐

- **`__tests__/`** - Unit tests for database operations

## Architecture Role

```
┌───────────────────────────────────────────────────┐
│  Application Layer (components, hooks)           │
└────────────────────┬──────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────┐
│  Business Logic (lib/)                           │
│  - offline operations                             │
│  - sync processor                                 │
│  - event generator                                │
└────────────────────┬──────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────┐
│  ╔════════════════════════════════════════════╗  │
│  ║  DATABASE LAYER (dexie/)                  ║  │
│  ║  • Schema definition (db.ts)              ║  │
│  ║  • Version migrations                     ║  │
│  ║  • Device identification (deviceManager)  ║  │
│  ╚════════════════════════════════════════════╝  │
└────────────────────┬──────────────────────────────┘
                     │
┌────────────────────▼──────────────────────────────┐
│  IndexedDB (Browser Storage)                     │
│  ↕                                                │
│  Supabase (Cloud Database)                       │
└───────────────────────────────────────────────────┘
```

## Dexie.js Overview

**What is Dexie.js?**

- Promise-based wrapper around IndexedDB API
- Simplifies schema definition and queries
- Provides live queries (reactive data)
- Handles schema versioning automatically
- TypeScript-friendly with typed tables

**Why Dexie?**

- IndexedDB's native API is verbose and callback-based
- Dexie provides modern async/await interface
- Built-in support for migrations
- Better error handling
- Active maintenance and community

**Official Docs:** https://dexie.org

## Database Schema (`db.ts`)

### Tables

The database includes the following tables:

1. **`accounts`** - Financial accounts (bank, cash, credit cards)
   - Primary key: `id`
   - Indexes: `household_id`, `created_at`

2. **`categories`** - Transaction categories (two-level hierarchy)
   - Primary key: `id`
   - Indexes: `household_id`, `parent_id`

3. **`transactions`** - Transaction records (income/expense)
   - Primary key: `id`
   - Indexes: `account_id`, `category_id`, `date`, `[account_id+date]` (compound)
   - GIN index on `tagged_user_ids` array

4. **`budgets`** - Monthly budget targets
   - Primary key: `id`
   - Indexes: `category_id`, `month_key`, `[category_id+month_key]` (compound)

5. **`events`** - Event sourcing audit log
   - Primary key: `id`
   - Indexes: `entityId`, `idempotencyKey`, `timestamp`

6. **`syncIssues`** - Conflict tracking (Phase B)
   - Primary key: `id`
   - Indexes: `entityType`, `entityId`, `resolved`

7. **`meta`** - Metadata storage
   - Key-value store for device ID, settings, etc.
   - Primary key: `key`

### Schema Versioning

**Current Version:** 2

**Version History:**

- **Version 1:** Initial schema (7 tables)
- **Version 2:** Added `syncIssues` table for conflict tracking

**Migration Pattern:**

```typescript
this.version(2)
  .stores({
    // Define new or updated table schema
    syncIssues: "++id, entityType, entityId, resolved, created_at",
  })
  .upgrade((tx) => {
    // Optional: transform existing data
    // Example: add default values to existing records
  });
```

**Versioning Rules:**

- ✅ **DO:** Increment version when adding tables, indexes, or fields
- ✅ **DO:** Use `.upgrade()` to migrate existing data
- ✅ **DO:** Provide default values for new fields
- ❌ **DON'T:** Remove fields (mark deprecated instead)
- ❌ **DON'T:** Change field types (add new field + migrate)
- ❌ **DON'T:** Skip version numbers

### Compound Indexes

Compound indexes optimize queries with multiple filters:

**Transaction Queries:**

```typescript
// Index: [account_id+date]
// Optimizes: "Get transactions for account X in date range Y-Z"
const txns = await db.transactions
  .where("[account_id+date]")
  .between([accountId, startDate], [accountId, endDate])
  .toArray();
```

**Budget Queries:**

```typescript
// Index: [category_id+month_key]
// Optimizes: "Get budget for category X in month Y"
const budget = await db.budgets
  .where("[category_id+month_key]")
  .equals([categoryId, "2025-11"])
  .first();
```

**See:** `/docs/initial plan/DATABASE.md` lines 1161-1346 for complete query-to-index mappings.

## Device Identification (`deviceManager.ts`)

### Hybrid Device ID Strategy

**4-Tier Fallback Approach:**

```
1. Memory Cache (fastest)
   ↓ (if not cached)
2. IndexedDB (meta table)
   ↓ (if not found)
3. localStorage (backup)
   ↓ (if not found)
4. FingerprintJS (browser fingerprint)
   ↓ (if fails)
5. crypto.randomUUID() (final fallback)
```

**Why Hybrid?**

- **IndexedDB:** Most reliable, survives incognito mode exit
- **localStorage:** Backup if IndexedDB is cleared
- **FingerprintJS:** Survives both being cleared (browser fingerprint)
- **RandomUUID:** Last resort (new device ID each time)

**Dual Storage:**
Device ID is stored in **both** IndexedDB and localStorage for redundancy:

- If IndexedDB cleared, localStorage provides backup
- If localStorage cleared, IndexedDB provides backup
- Both cleared → FingerprintJS regenerates same ID

### Device Registration

**Automatic Registration:**
When device ID is obtained, it's automatically registered in Supabase `devices` table:

**Registered Data:**

- `device_id` - Unique identifier
- `platform` - OS (macOS, Windows, iOS, Android, Linux)
- `browser` - Browser name (Chrome, Safari, Firefox, Edge)
- `last_seen_at` - Timestamp of last sync
- `is_active` - Active status (true)

**Purpose:**

- Track active devices for household
- Enable per-device vector clocks (Phase B)
- Support device management UI (Phase C)

**See:** DECISIONS.md #82 for promotion to MVP rationale.

### Device Manager API

**Get Device ID:**

```typescript
import { deviceManager } from "@/lib/dexie/deviceManager";

const deviceId = await deviceManager.getDeviceId();
// Returns: "device-abc123def456..."
```

**Get Platform/Browser:**

```typescript
const platform = deviceManager.getPlatform(); // "macOS" | "Windows" | ...
const browser = deviceManager.getBrowser(); // "Chrome" | "Safari" | ...
```

**Register Device:**

```typescript
await deviceManager.registerDevice(userId, householdId);
// Registers in Supabase devices table
```

**Clear Cache (Testing):**

```typescript
deviceManager.clearCache();
// Clears memory cache only (not storage)
```

## Common Development Tasks

### Adding a New Table

**1. Define TypeScript Interface:**

```typescript
export interface LocalTag {
  id: string;
  household_id: string;
  name: string;
  color: string;
  created_at: string;
}
```

**2. Add Table to Dexie Class:**

```typescript
class HouseholdHubDB extends Dexie {
  // Existing tables...
  tags!: Table<LocalTag>;

  constructor() {
    super("householdHubDB");

    // Increment version number!
    this.version(3).stores({
      // Existing tables (must repeat)...
      tags: "id, household_id, name, created_at",
      //     ^primary key  ^indexes
    });
  }
}
```

**3. Create Migration if Needed:**

```typescript
this.version(3)
  .stores({
    /* ... */
  })
  .upgrade((tx) => {
    // Optional: seed data or transform existing records
    console.log("Upgraded to version 3: Added tags table");
  });
```

**4. Use in Offline Operations:**

```typescript
import { db } from "@/lib/dexie/db";

await db.tags.put(tag); // Create or update
await db.tags.get(id); // Read
await db.tags.where("household_id").equals(householdId).toArray(); // Query
await db.tags.delete(id); // Delete
```

### Adding an Index to Existing Table

**Why Add Index?**

- Optimize specific query patterns
- Speed up filtering and sorting
- Enable compound index queries

**Steps:**

**1. Identify Query Pattern:**

```typescript
// Slow query (full table scan)
const transactions = await db.transactions
  .filter((t) => t.category_id === categoryId && t.date >= startDate)
  .toArray();
```

**2. Add Compound Index:**

```typescript
this.version(3).stores({
  transactions: "id, account_id, category_id, date, [account_id+date], [category_id+date]",
  //                                                                    ^^^ NEW INDEX
});
```

**3. Use Indexed Query:**

```typescript
// Fast query (uses index)
const transactions = await db.transactions
  .where("[category_id+date]")
  .between([categoryId, startDate], [categoryId, endDate])
  .toArray();
```

### Querying IndexedDB from DevTools

**1. Open DevTools:**

- Chrome/Edge: F12 → Application → IndexedDB → `householdHubDB`
- Firefox: F12 → Storage → Indexed DB → `householdHubDB`
- Safari: Develop → Show Web Inspector → Storage → Indexed Databases → `householdHubDB`

**2. Inspect Tables:**

- Click on table name (e.g., `transactions`)
- View all records with values
- Check indexes

**3. Verify Data:**

- Confirm writes succeeded
- Check field values
- Verify relationships (foreign keys)

### Testing with Fake IndexedDB

**Setup (Vitest):**

```typescript
import "fake-indexeddb/auto"; // MUST be first import
import { db } from "@/lib/dexie/db";

beforeEach(async () => {
  await db.delete(); // Clear database
  await db.open(); // Reopen fresh
});
```

**See:** `offline/syncQueue.test.README.md` for complete test setup guide.

## Performance Considerations

**Index Strategy:**

- Use compound indexes for multi-field queries
- Avoid over-indexing (slows writes)
- Indexes take storage space

**Query Optimization:**

- Use `.where()` with indexes (not `.filter()`)
- Limit results with `.limit(n)`
- Use `.count()` instead of `.toArray().length`

**Storage Quota:**

- Monitor with `navigator.storage.estimate()`
- Warn user at 80% capacity
- Implement cleanup at 95%
- See `useStorageQuota()` hook

**Batch Operations:**

- Use `.bulkPut()` for multiple inserts
- Use `.bulkDelete()` for multiple deletes
- Wrap in transaction for atomicity

## Error Handling

**Common Errors:**

**QuotaExceededError:**

- Storage quota exceeded (50MB default, varies by browser)
- Solution: Prompt user to clear old data or increase quota

**InvalidStateError:**

- Database not open or closing
- Solution: Ensure `db.open()` called before operations

**ConstraintError:**

- Primary key conflict
- Solution: Check for existing record before insert

**Graceful Handling:**

```typescript
try {
  await db.transactions.put(transaction);
} catch (error) {
  if (error.name === "QuotaExceededError") {
    // Handle storage full
  } else if (error.name === "ConstraintError") {
    // Handle duplicate key
  }
  console.error("IndexedDB error:", error);
}
```

## Testing Strategy

### Unit Tests

**Coverage:**

- Schema definition (table creation)
- Version migrations (upgrade functions)
- Device ID persistence (dual storage)
- Device registration in Supabase
- Platform/browser detection

**Run Tests:**

```bash
npm test -- dexie
npm test -- deviceManager
```

### Integration Tests

**Scenarios:**

- Full database lifecycle (open → CRUD → close)
- Migration from v1 → v2 → v3
- Device ID survival across storage clears
- Cross-table queries (joins)

## Related Documentation

### Comprehensive Guides

- [/docs/initial plan/DATABASE.md](../../../docs/initial%20plan/DATABASE.md) - Complete schema (47KB!)
  - Lines 1161-1346: Query patterns and index mappings
- [/docs/initial plan/SYNC-ENGINE.md](../../../docs/initial%20plan/SYNC-ENGINE.md) - Sync architecture
  - Lines 1123-1303: Device identification strategy

### Parent and Sibling READMEs

- [../README.md](../README.md) - Core business logic overview
- [../offline/README.md](../offline/README.md) - Uses Dexie for offline storage
- [../sync/README.md](../sync/README.md) - Uses device ID for sync
- [../../README.md](../../README.md) - Source code overview

### Implementation Chunks

- [Chunk 024](../../../docs/initial%20plan/implementation/chunks/024-dexie-setup/) - Dexie database setup
- [Chunk 028](../../../docs/initial%20plan/implementation/chunks/028-device-identification/) - Device ID implementation

### Decisions

- [DECISIONS.md #52](../../../docs/initial%20plan/DECISIONS.md) - Device ID strategy
- [DECISIONS.md #75](../../../docs/initial%20plan/DECISIONS.md) - Hybrid fallback approach
- [DECISIONS.md #82](../../../docs/initial%20plan/DECISIONS.md) - Devices table promoted to MVP

## Further Reading

- [Dexie.js Documentation](https://dexie.org) - Official docs
- [IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) - Browser standard
- [FingerprintJS](https://github.com/fingerprintjs/fingerprintjs) - Browser fingerprinting
- [Working with IndexedDB](https://web.dev/indexeddb/) - Google Web Fundamentals
- [Storage Quota Management](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) - Browser storage limits
