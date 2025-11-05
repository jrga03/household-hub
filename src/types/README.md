# Type Definitions (`/src/types/`)

## Purpose

The types directory contains **TypeScript type definitions** for the entire application. Types ensure type safety, enable autocomplete, and document data structures throughout the codebase.

## Organization Strategy

**Entity Types:** Each database entity has its own type file (e.g., `transactions.ts`, `accounts.ts`)

**System Types:** Sync, events, and device types in dedicated files

**Generated Types:** `database.types.ts` is auto-generated from Supabase schema

## Contents

### Entity Types

- **`transactions.ts`** - Transaction entity types
  - `Transaction` - Main transaction type
  - `CreateTransactionInput` - Input for creating transactions
  - `UpdateTransactionInput` - Input for updating transactions
  - `TransactionFilters` - Filter options for queries

- **`accounts.ts`** - Account entity types
  - `Account` - Financial account type
  - `CreateAccountInput` - Input for creating accounts
  - `UpdateAccountInput` - Input for updating accounts

- **`categories.ts`** - Category entity types
  - `Category` - Category type
  - `CreateCategoryInput` - Input for creating categories
  - `UpdateCategoryInput` - Input for updating categories

- **`currency.ts`** - Currency-related types
  - `CurrencyCode` - Supported currency codes ('PHP' only for MVP)
  - `AmountCents` - Type alias for integer cents
  - `FormattedAmount` - Formatted currency string

### System Types

- **`sync.ts`** - Sync system types
  - `SyncQueueItem` - Sync queue item structure
  - `SyncStatus` - Queue item status enum
  - `EntityType` - Supported entity types for sync
  - `Operation` - CRUD operation types ('create' | 'update' | 'delete')
  - `IdempotencyKey` - Idempotency key type

- **`event.ts`** - Event sourcing types
  - `TransactionEvent` - Event log entry structure
  - `EventOperation` - Event operation enum
  - `EventPayload` - Event payload union type
  - `VectorClock` - Vector clock type (Phase B)

- **`device.ts`** - Device identification types
  - `Device` - Device registration type
  - `Platform` - OS platform enum
  - `Browser` - Browser enum

- **`resolution.ts`** - Conflict resolution types (Phase B)
  - `Conflict` - Conflict detection result
  - `ResolutionStrategy` - Resolution strategy enum
  - `MergedEntity` - Result of conflict merge

### Generated Types

- **`database.types.ts`** - **AUTO-GENERATED** from Supabase schema
  - All database table types
  - View types
  - Function parameter types
  - **⚠️ DO NOT EDIT MANUALLY**

**Regeneration:**

```bash
npx supabase gen types typescript --project-id [project-id] > src/types/database.types.ts
```

### Integration Types

- **`sentry.ts`** - Sentry integration types
  - Type guards for Sentry availability
  - Error context types

- **`window.d.ts`** - Global window type extensions
  - PWA prompt events
  - Service worker types

## Key Patterns

### Entity Type Structure

**Pattern:**

```typescript
// Base entity (matches database)
export interface Transaction {
  id: string;
  household_id: string;
  amount_cents: number;
  type: "income" | "expense";
  date: string; // ISO date
  // ... other fields
}

// Create input (omits auto-generated fields)
export type CreateTransactionInput = Omit<Transaction, "id" | "created_at" | "updated_at">;

// Update input (all fields optional except id)
export type UpdateTransactionInput = Partial<Transaction> & {
  id: string;
};
```

### Enum vs Union Types

**Union Types (Preferred):**

```typescript
export type TransactionType = "income" | "expense";
export type SyncStatus = "queued" | "syncing" | "completed" | "failed";
```

**Benefits:**

- No runtime overhead
- Better autocomplete
- Simpler to use

**Enums (When Needed):**

```typescript
export enum Platform {
  MacOS = "macOS",
  Windows = "Windows",
  iOS = "iOS",
  Android = "Android",
  Linux = "Linux",
}
```

**Use When:**

- Need to iterate over values
- Need reverse mapping
- Library requires enum

### Type Aliases vs Interfaces

**Interfaces (Preferred for Objects):**

```typescript
export interface Account {
  id: string;
  name: string;
  type: AccountType;
}
```

**Type Aliases (For Unions, Primitives):**

```typescript
export type AccountType = "checking" | "savings" | "credit";
export type AmountCents = number;
```

### Utility Types

**Partial Updates:**

```typescript
export type UpdateAccountInput = Partial<Account> & { id: string };
```

**Pick Fields:**

```typescript
export type AccountSummary = Pick<Account, "id" | "name" | "balance">;
```

**Omit Fields:**

```typescript
export type CreateAccountInput = Omit<Account, "id" | "created_at">;
```

## Common Development Tasks

### Adding a New Entity Type

**1. Create type file:**

```typescript
// src/types/tags.ts
export interface Tag {
  id: string;
  household_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export type CreateTagInput = Omit<Tag, "id" | "created_at" | "updated_at">;
export type UpdateTagInput = Partial<Tag> & { id: string };
```

**2. Use in code:**

```typescript
import { Tag, CreateTagInput } from "@/types/tags";

function createTag(input: CreateTagInput): Promise<Tag> {
  // Implementation
}
```

### Updating Auto-Generated Types

**When Needed:**

- After database schema changes
- After adding new tables
- After modifying column types

**Steps:**

1. **Update Supabase schema** (migrations)
2. **Regenerate types:**
   ```bash
   npx supabase gen types typescript --project-id [project-id] > src/types/database.types.ts
   ```
3. **Verify no type errors** in codebase

### Creating Discriminated Unions

**Pattern:**

```typescript
interface CreateOperation {
  type: "create";
  entity: Transaction;
}

interface UpdateOperation {
  type: "update";
  entityId: string;
  changes: Partial<Transaction>;
}

interface DeleteOperation {
  type: "delete";
  entityId: string;
}

export type Operation = CreateOperation | UpdateOperation | DeleteOperation;

// Type-safe switch
function handleOperation(op: Operation) {
  switch (op.type) {
    case "create":
      return createEntity(op.entity); // op.entity is available
    case "update":
      return updateEntity(op.entityId, op.changes); // op.changes is available
    case "delete":
      return deleteEntity(op.entityId); // Only entityId available
  }
}
```

### Type Guards

**Pattern:**

```typescript
export function isTransaction(value: unknown): value is Transaction {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "amount_cents" in value &&
    "type" in value
  );
}

// Usage
if (isTransaction(data)) {
  // data is now typed as Transaction
  console.log(data.amount_cents);
}
```

### Extending Database Types

**Pattern:**

```typescript
import { Database } from "./database.types";

// Extract table type
export type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];

// Extend with computed fields
export interface Transaction extends TransactionRow {
  // Add computed fields not in database
  formatted_amount?: string;
  category_name?: string;
}
```

## Type Safety Best Practices

**Avoid `any`:**

```typescript
// ❌ Bad
function process(data: any) {
  return data.field;
}

// ✅ Good
function process(data: Transaction) {
  return data.amount_cents;
}
```

**Use `unknown` for Uncertain Types:**

```typescript
// ✅ Good
function parse(json: string): unknown {
  return JSON.parse(json);
}

// Then validate
const data = parse(jsonString);
if (isTransaction(data)) {
  // Safe to use as Transaction
}
```

**Strict Null Checks:**

```typescript
// ✅ Good
interface Account {
  balance: number | null; // Explicit null handling
}

function getBalance(account: Account): number {
  return account.balance ?? 0; // Handle null case
}
```

**Readonly for Immutable Data:**

```typescript
// ✅ Good
export interface TransactionEvent {
  readonly id: string;
  readonly timestamp: number;
  readonly operation: Operation;
}
```

## Testing Types

### Type Tests

**Pattern:**

```typescript
import { expectType } from "tsd";
import { Transaction, CreateTransactionInput } from "./transactions";

// Verify type structure
expectType<string>(transaction.id);
expectType<number>(transaction.amount_cents);

// Verify omitted fields
const input: CreateTransactionInput = {
  amount_cents: 100,
  // @ts-expect-error - id should not be in CreateInput
  id: "123",
};
```

## Related Documentation

### Parent README

- [../README.md](../README.md) - Source code overview

### Related Directories

- [../lib/README.md](../lib/README.md) - Business logic that uses types
- [../components/README.md](../components/README.md) - Components that use types
- [../lib/types/README.md](../lib/types/README.md) - Lib-specific types

### External Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/) - Official docs
- [TypeScript Deep Dive](https://basarat.gitbook.io/typescript/) - Comprehensive guide
- [Supabase CLI](https://supabase.com/docs/reference/cli) - Type generation

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference
- [/docs/initial plan/DATABASE.md](../../docs/initial%20plan/DATABASE.md) - Database schema reference
