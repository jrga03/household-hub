# Troubleshooting: Offline Writes

Common issues and solutions when implementing offline write operations.

---

## IndexedDB Issues

### Problem: QuotaExceededError when writing to IndexedDB

**Symptoms**:

```
DOMException: QuotaExceededError
```

**Cause**: Browser storage quota reached

**Solution**:

Check storage quota:

```typescript
const estimate = await navigator.storage.estimate();
const percentage = (estimate.usage / estimate.quota) * 100;
console.log(`Storage: ${percentage.toFixed(2)}% full`);
```

Clear old data if needed:

```typescript
// Clear transactions older than 90 days
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

await db.transactions.where("created_at").below(ninetyDaysAgo.toISOString()).delete();
```

---

### Problem: ConstraintError when adding to IndexedDB

**Symptoms**:

```
DOMException: ConstraintError
```

**Cause**: Duplicate primary key (ID already exists)

**Solution**:

Ensure temporary IDs are unique:

```typescript
// Use nanoid with sufficient entropy
import { nanoid } from "nanoid";

const tempId = `temp-${nanoid(21)}`; // 21 characters = very low collision probability
```

Check for duplicates before insert:

```typescript
const existing = await db.transactions.get(tempId);
if (existing) {
  // Generate new ID
  tempId = `temp-${nanoid(21)}`;
}
```

---

### Problem: IndexedDB connection fails

**Symptoms**:

```
InvalidStateError: A mutation operation was attempted on a database that did not allow mutations
```

**Cause**: Database not properly opened or version mismatch

**Solution**:

Ensure Dexie database initialized before use:

```typescript
// In main.tsx or app initialization
import { db } from "@/lib/dexie/db";

// Open database
await db.open();

// Verify it's open
if (!db.isOpen()) {
  throw new Error("Database failed to open");
}
```

Check database version in DevTools:

1. Open Application → IndexedDB → HouseholdHubDB
2. Verify version matches Dexie schema version

---

## TypeScript Issues

### Problem: Type error on Transaction interface

**Symptoms**:

```typescript
Property 'device_id' does not exist on type 'Transaction'
```

**Cause**: Type definition outdated or incorrect

**Solution**:

Update `@/types/database.ts`:

```typescript
export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  account_id: string | null;
  category_id: string | null;
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  notes: string | null;
  tagged_user_ids: string[];
  transfer_group_id: string | null;
  household_id: string;
  created_by_user_id: string;
  owner_user_id: string | null;
  device_id: string; // Must be present
  created_at: string;
  updated_at: string;
}
```

Run type check:

```bash
npm run type-check
```

---

### Problem: Cannot import from @/lib/offline

**Symptoms**:

```
Cannot find module '@/lib/offline/transactions'
```

**Cause**: Path alias not configured or file doesn't exist

**Solution**:

Verify `tsconfig.json` includes path mapping:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

Verify `vite.config.ts` includes resolve alias:

```typescript
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

---

## Mutation Hook Issues

### Problem: useMutation doesn't trigger cache invalidation

**Symptoms**:

- Transaction created
- IndexedDB has data
- UI doesn't update

**Cause**: Query key mismatch between useQuery and useMutation

**Solution**:

Ensure consistent query keys:

```typescript
// In useOfflineTransactions hook (chunk 020)
const query = useQuery({
  queryKey: ["transactions", "offline"], // Must match
  queryFn: fetchOfflineTransactions,
});

// In mutation hook
onSuccess: () => {
  queryClient.invalidateQueries({
    queryKey: ["transactions", "offline"], // Exact match
  });
};
```

---

### Problem: Toast notifications don't appear

**Symptoms**:

- Mutations succeed
- No toast messages

**Cause**: Sonner not configured or imported incorrectly

**Solution**:

Verify Toaster component in root:

```typescript
// In App.tsx or root layout
import { Toaster } from "sonner";

function App() {
  return (
    <>
      <Router />
      <Toaster /> {/* Must be present */}
    </>
  );
}
```

Import toast correctly:

```typescript
import { toast } from "sonner"; // Not from other libraries
```

---

### Problem: Mutation returns success=false but no error message

**Symptoms**:

```typescript
const result = await createOfflineTransaction(input, userId);
console.log(result); // { success: false, error: undefined }
```

**Cause**: Error not caught or formatted incorrectly

**Solution**:

Improve error handling:

```typescript
export async function createOfflineTransaction(
  input: TransactionInput,
  userId: string
): Promise<OfflineOperationResult<Transaction>> {
  try {
    // ... transaction creation logic
  } catch (error) {
    console.error("Failed to create offline transaction:", error);

    // Format error message properly
    let errorMessage = "Unknown error";
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === "string") {
      errorMessage = error;
    }

    return {
      success: false,
      error: errorMessage,
      isTemporary: false,
    };
  }
}
```

---

## Temporary ID Issues

### Problem: Temporary IDs not replaced after sync

**Symptoms**:

- Transaction shows `temp-` ID forever
- References broken after sync

**Cause**: Sync queue not implemented yet (chunk 023)

**Solution**:

This is expected! Temporary IDs will be replaced when:

1. Chunk 022: Sync queue schema created
2. Chunk 023: Offline writes add to queue
3. Chunk 024: Sync processor replaces temp IDs with server IDs

For now, temporary IDs are correct behavior.

---

### Problem: References to temporary IDs break

**Symptoms**:

- Create account with `temp-123`
- Create transaction referencing `temp-123`
- After sync, transaction shows "Unknown Account"

**Cause**: ID mapping not handled during sync

**Solution**:

Will be implemented in chunk 024 (Sync Processor). The processor will:

1. Sync account first, get real ID
2. Build mapping: `temp-123 → real-uuid`
3. Update all references before syncing transactions

---

## Performance Issues

### Problem: Large batch creates freeze UI

**Symptoms**:

- Import 1000 transactions from CSV
- Browser becomes unresponsive

**Cause**: Blocking main thread with synchronous IndexedDB operations

**Solution**:

Use chunked batch processing:

```typescript
export async function createOfflineTransactionsBatch(
  inputs: TransactionInput[],
  userId: string
): Promise<OfflineOperationResult<Transaction[]>> {
  const CHUNK_SIZE = 100;
  const chunks = [];

  // Split into chunks
  for (let i = 0; i < inputs.length; i += CHUNK_SIZE) {
    chunks.push(inputs.slice(i, i + CHUNK_SIZE));
  }

  const allTransactions: Transaction[] = [];

  // Process chunks sequentially with delay
  for (const chunk of chunks) {
    const transactions = chunk.map((input) => ({
      id: `temp-${nanoid()}`,
      ...input,
      // ... rest of fields
    }));

    await db.transactions.bulkAdd(transactions);
    allTransactions.push(...transactions);

    // Yield to main thread
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return {
    success: true,
    data: allTransactions,
    isTemporary: true,
  };
}
```

---

### Problem: Query refetch slows down after many transactions

**Symptoms**:

- App fast initially
- Slows down with 1000+ transactions
- UI laggy

**Cause**: Reading all transactions from IndexedDB on every refetch

**Solution**:

Add pagination to offline reads (from chunk 020):

```typescript
// In useOfflineTransactions
const query = useQuery({
  queryKey: ["transactions", "offline", { page, limit }],
  queryFn: async () => {
    const offset = page * limit;
    return await db.transactions.orderBy("date").reverse().offset(offset).limit(limit).toArray();
  },
  staleTime: Infinity,
});
```

---

## Testing Issues

### Problem: Tests fail with "Database not found"

**Symptoms**:

```
Error: Database 'HouseholdHubDB' not found
```

**Cause**: Test database not initialized

**Solution**:

Initialize Dexie in test setup:

```typescript
import { beforeEach, afterEach } from "vitest";
import { db } from "@/lib/dexie/db";

beforeEach(async () => {
  // Open database
  if (!db.isOpen()) {
    await db.open();
  }

  // Clear tables
  await db.transactions.clear();
  await db.accounts.clear();
  await db.categories.clear();
});

afterEach(async () => {
  // Clean up
  await db.transactions.clear();
});
```

---

### Problem: Tests interfere with each other

**Symptoms**:

- Individual tests pass
- Running all tests together fails
- Random test failures

**Cause**: Shared database state between tests

**Solution**:

Use unique database name per test:

```typescript
import Dexie from "dexie";

describe("Offline Transactions", () => {
  let testDb: HouseholdHubDB;

  beforeEach(() => {
    // Create unique database instance
    testDb = new HouseholdHubDB();
    testDb.name = `test-db-${Date.now()}-${Math.random()}`;
  });

  afterEach(async () => {
    await testDb.delete();
    await testDb.close();
  });

  it("should create transaction", async () => {
    // Use testDb instead of global db
    await testDb.transactions.add(/* ... */);
  });
});
```

---

## User Experience Issues

### Problem: No feedback during offline operation

**Symptoms**:

- User creates transaction
- No loading state
- No success/error message

**Cause**: Missing toast or UI feedback

**Solution**:

Always show feedback:

```typescript
export function useCreateOfflineTransaction() {
  return useMutation({
    mutationFn: createOfflineTransaction,
    onMutate: () => {
      // Optional: Show loading toast
      // toast.loading("Creating transaction...");
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success("Transaction created");
      } else {
        toast.error(result.error || "Failed");
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
```

---

### Problem: Users confused by temporary IDs in UI

**Symptoms**:

- Users see `temp-xyz123` in URLs
- Ask if data is "really saved"

**Cause**: Exposing internal implementation detail

**Solution**:

Add visual indicator:

```typescript
// In transaction list component
function TransactionRow({ transaction }) {
  const isTemporary = transaction.id.startsWith("temp-");

  return (
    <tr>
      <td>{transaction.description}</td>
      <td>
        {formatPHP(transaction.amount_cents)}
        {isTemporary && (
          <Badge variant="secondary" className="ml-2">
            Pending Sync
          </Badge>
        )}
      </td>
    </tr>
  );
}
```

---

## Prevention Tips

1. **Always use structured result types**: Return `{success, data, error}` instead of throwing
2. **Test with large datasets**: Ensure 1000+ transactions don't break
3. **Monitor storage quota**: Check before writes, handle gracefully when full
4. **Unique IDs**: Use nanoid with high entropy (21 characters)
5. **Consistent query keys**: Document query key format in codebase
6. **Provide user feedback**: Always show toast on success/error
7. **Handle referential integrity**: Track temporary ID mappings for sync

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide first
2. Verify chunk 019 (Dexie setup) completed successfully
3. Check IndexedDB in DevTools (Application → IndexedDB)
4. Review console for errors
5. Run unit tests: `npm test src/lib/offline`
6. Check TypeScript: `npm run type-check`

---

## Quick Fixes

```bash
# Reset IndexedDB (in browser console)
await indexedDB.deleteDatabase('HouseholdHubDB');
location.reload();

# Clear all offline data
await db.transactions.clear();
await db.accounts.clear();
await db.categories.clear();

# Check storage quota
const estimate = await navigator.storage.estimate();
console.log(`Used: ${(estimate.usage / 1024 / 1024).toFixed(2)} MB`);
console.log(`Total: ${(estimate.quota / 1024 / 1024).toFixed(2)} MB`);

# Verify device ID
const deviceId = await deviceManager.getDeviceId();
console.log('Device ID:', deviceId);
```

---

**Remember**: Offline writes are the foundation of offline-first architecture. When in doubt, favor data persistence over performance.
