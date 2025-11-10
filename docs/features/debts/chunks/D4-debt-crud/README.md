# Chunk D4: Debt CRUD Operations

## At a Glance

- **Time**: 1.5 hours
- **Prerequisites**: D3 (Balance Calculation) complete
- **Can Skip**: No - core functionality for debt management
- **Depends On**: Balance calculation functions, Dexie schema, lamport clock utilities

## What You're Building

Complete CRUD operations for both external and internal debts:

- **Create operations**: External debt, internal debt with entity validation
- **Read operations**: Get debt by ID, list debts with filters, search by name
- **Update operations**: Edit name, archive/unarchive debt
- **Delete operations**: With validation (no payments check)
- **Entity validation**: Runtime checks for internal debt references
- **Display name caching**: Store entity names for internal debts
- **Name uniqueness**: Enforce unique active debt names per household
- **Unit tests**: Full test coverage for all operations

## Why This Matters

CRUD operations are the **foundation of user interaction**:

- **Data integrity**: Validation prevents invalid debt states
- **Offline-first**: All operations work without network
- **Type safety**: Dual support for external and internal debts
- **Performance**: Efficient queries with proper indexes
- **User experience**: Clear error messages, sensible defaults

This chunk enables users to create and manage debts in the application.

## Before You Start

Verify these prerequisites:

- [ ] **Chunk D3 complete** - Balance calculation functions available
- [ ] **Dexie schema** with debts, internalDebts tables
- [ ] **Lamport clock utilities** for idempotency keys
- [ ] **Currency utilities** for amount validation
- [ ] **Understanding of soft references** - Internal debt entities have no FK constraints

**How to verify**:

```typescript
import { db } from "@/lib/dexie/db";
import { calculateDebtBalance } from "@/lib/debts/balance";
import { getNextLamportClock } from "@/lib/dexie/lamport-clock";

console.log("Balance function:", typeof calculateDebtBalance === "function");
console.log("Lamport clock:", typeof getNextLamportClock === "function");
```

## What Happens Next

After this chunk:

- Users can create external and internal debts
- Debt editing and archiving works
- Name uniqueness enforced
- Entity references validated
- Ready for Chunk D5 (Payment Processing)

## Key Files Created

```
src/
├── lib/
│   └── debts/
│       ├── crud.ts                  # CRUD operations
│       ├── validation.ts            # Validation logic
│       └── __tests__/
│           ├── crud.test.ts         # CRUD tests
│           └── validation.test.ts   # Validation tests
└── types/
    └── debt.ts                      # MODIFIED: Add validation types
```

## Features Included

### Create Operations

**createExternalDebt()**:

- Validates amount (₱1.00 minimum)
- Validates name uniqueness (active debts only)
- Generates UUID
- Sets default status (active)
- Returns created debt

**createInternalDebt()**:

- Validates entity types (category/account/member)
- Validates entity existence (runtime check)
- Prevents self-borrowing (from === to)
- Caches display names
- Validates name uniqueness

### Read Operations

**getDebt()**: Fetch single debt by ID
**listDebts()**: Filter by status, sort by updated_at
**searchDebtsByName()**: Fuzzy search with case-insensitive matching
**getDebtWithBalance()**: Includes calculated balance field

### Update Operations

**updateDebtName()**: Validates uniqueness, updates name
**archiveDebt()**: Validates no pending payments, sets archived status
**unarchiveDebt()**: Reactivates archived debt (admin only)

### Delete Operations

**deleteDebt()**:

- Validates no payment history
- Validates no pending sync operations
- Hard deletes if safe
- Returns validation errors if blocked

### Validation Functions

**validateDebtCreation()**: Pre-creation validation
**validateDebtDeletion()**: Pre-deletion checks
**validateEntityExists()**: Runtime entity existence check
**validateDebtName()**: Name uniqueness validation

## Related Documentation

- **CRUD Operations**: `debt-implementation.md` lines 196-460 (transaction integration showing pattern)
- **Validation**: `DEBT-VALIDATION.md` lines 135-242 (debt creation rules)
- **Deletion**: `DEBT-VALIDATION.md` lines 328-375 (deletion validation)
- **Decisions**:
  - #3: Typed entity references (DEBT-DECISIONS.md lines 103-170)
  - #16: Name uniqueness for active debts only (DEBT-DECISIONS.md lines 574-614)
  - #17: Display name caching (DEBT-DECISIONS.md lines 617-663)

## Technical Stack

- **Dexie.js**: IndexedDB operations
- **TypeScript**: Type-safe CRUD
- **Vitest**: Unit testing
- **nanoid**: UUID generation

## Design Patterns

### Validation-First Pattern

```typescript
async function createDebt(data: DebtFormData): Promise<Debt> {
  // 1. Validate FIRST
  const validation = await validateDebtCreation(data);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // 2. Create SECOND
  const debt = {
    id: nanoid(),
    ...data,
    status: "active" as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.debts.add(debt);
  return debt;
}
```

**Why**: Early validation provides clear error messages before any mutations.

### Soft Reference Validation Pattern

```typescript
// No FK constraints in database - validate at runtime
async function validateEntityExists(
  entityType: "category" | "account" | "member",
  entityId: string
): Promise<boolean> {
  switch (entityType) {
    case "category":
      const cat = await db.budgetCategories.get(entityId);
      return !!cat && !cat.deleted_at;

    case "account":
      const acc = await db.accounts.get(entityId);
      return !!acc && !acc.deleted_at;

    case "member":
      const member = await db.profiles.get(entityId);
      return !!member;

    default:
      return false;
  }
}
```

**Why**: Allows entities to be deleted without breaking debt history. Display names preserve context.

### Display Name Caching Pattern

```typescript
async function cacheDisplayName(
  entityType: "category" | "account" | "member",
  entityId: string
): Promise<string> {
  const entity = await getEntity(entityType, entityId);
  return entity?.name || `Unknown ${entityType}`;
}

// Store at creation time
const internalDebt = {
  from_id: categoryId,
  from_display_name: await cacheDisplayName("category", categoryId),
};
```

**Why**: Fast reads (no joins), acceptable staleness for MVP.

### Conditional Uniqueness Pattern

```typescript
// Unique constraint: household_id + LOWER(name) WHERE status = 'active'
async function validateNameUnique(
  name: string,
  householdId: string,
  excludeId?: string
): Promise<boolean> {
  const existing = await db.debts
    .where("household_id")
    .equals(householdId)
    .and(
      (d) =>
        d.status === "active" && d.name.toLowerCase() === name.toLowerCase() && d.id !== excludeId
    )
    .first();

  return !existing; // Valid if not exists
}
```

**Why**: Allows reusing names for archived/paid_off debts.

## Critical Concepts

**Soft References**: Internal debt `from_id` and `to_id` fields reference categories/accounts/members WITHOUT foreign key constraints. This allows:

- Entities to be deleted without breaking debt history
- Categories to be renamed without updating debts
- Display names cache the original entity name

**Name Uniqueness Scope**: The unique constraint only applies to **active** debts. This means:

- Can't have two active debts named "Car Loan"
- CAN have active "Car Loan" and archived "Car Loan"
- After archiving, name can be reused for new debt

**Entity Validation**: For internal debts, entity existence is checked at **creation time only**:

- Category/account/member must exist when debt is created
- If entity is later deleted, debt remains (uses cached display name)
- UI can show tooltip: "Originally 'Groceries' (category deleted)"

**Deletion Safety**: Debts can only be deleted if:

1. No payment history exists (neither debt_payments records)
2. No pending sync operations (syncQueue for this debt)
3. If blocked, user should archive instead

**Status Preservation**: CRUD operations never automatically change status except:

- Archive operation sets `status = 'archived'` and `closed_at = now()`
- Balance calculations may trigger status updates (handled in D3)

## Validation Rules

### Amount Validation

- Minimum: ₱1.00 (100 cents)
- Maximum: ₱9,999,999.99 (999999999 cents)
- Must be integer cents (no fractions)

### Name Validation

- Required: Yes
- Min length: 1 character
- Max length: 100 characters
- Trim whitespace
- Unique among active debts in household

### Internal Debt Validation

- From and to types: 'category' | 'account' | 'member'
- From and to IDs: Must exist in database
- Self-borrowing: NOT allowed (from !== to)
- Display names: Auto-cached from entities

## Error Handling

**Validation Errors** (400-level):

- "Name is required"
- "Amount must be at least ₱1.00"
- "An active debt named 'X' already exists"
- "Cannot borrow from the same entity"
- "Invalid category selected"

**Deletion Errors** (409-level):

- "Cannot delete debt with payment history. Archive it instead."
- "Cannot delete debt with pending sync operations."

**Not Found Errors** (404-level):

- "Debt not found"
- "Entity not found"

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
