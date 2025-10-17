# Instructions: Offline Writes

Follow these steps in order. Estimated time: 1.5 hours.

---

## Step 1: Create Offline Operation Types (10 min)

Create `src/lib/offline/types.ts`:

```typescript
import type { Transaction, Account, Category } from "@/types/database";

/**
 * Input type for creating transactions offline
 */
export interface TransactionInput {
  date: string; // ISO date string (DATE type)
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  account_id?: string;
  category_id?: string;
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  notes?: string;
  tagged_user_ids?: string[];
  transfer_group_id?: string | null;
}

/**
 * Input type for creating accounts offline
 */
export interface AccountInput {
  name: string;
  type: "checking" | "savings" | "credit" | "cash" | "investment";
  visibility: "household" | "personal";
  initial_balance_cents: number;
  color?: string;
  icon?: string;
  is_active: boolean;
}

/**
 * Input type for creating categories offline
 */
export interface CategoryInput {
  name: string;
  parent_id?: string | null;
  color?: string;
  icon?: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * Offline operation result
 */
export interface OfflineOperationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  isTemporary: boolean; // True if using temporary ID
}
```

**Verify**: No TypeScript errors

---

## Step 2: Create Offline Transaction Mutations (30 min)

Create `src/lib/offline/transactions.ts`:

```typescript
import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { deviceManager } from "@/lib/dexie/deviceManager";
import type { Transaction } from "@/types/database";
import type { TransactionInput, OfflineOperationResult } from "./types";

/**
 * Create a new transaction offline
 * Generates temporary ID that will be replaced on sync
 */
export async function createOfflineTransaction(
  input: TransactionInput,
  userId: string
): Promise<OfflineOperationResult<Transaction>> {
  try {
    // Generate temporary ID
    const tempId = `temp-${nanoid()}`;
    const deviceId = await deviceManager.getDeviceId();
    const now = new Date().toISOString();

    // Create transaction object
    const transaction: Transaction = {
      id: tempId,
      date: input.date,
      description: input.description,
      amount_cents: input.amount_cents,
      type: input.type,
      account_id: input.account_id || null,
      category_id: input.category_id || null,
      status: input.status,
      visibility: input.visibility,
      notes: input.notes || null,
      tagged_user_ids: input.tagged_user_ids || [],
      transfer_group_id: input.transfer_group_id || null,
      household_id: "00000000-0000-0000-0000-000000000001", // Default household (Decision #61: Multi-household architecture ready but hardcoded for MVP)
      created_by_user_id: userId,
      owner_user_id: input.visibility === "personal" ? userId : null,
      device_id: deviceId,
      created_at: now,
      updated_at: now,
    };

    // Write to IndexedDB
    await db.transactions.add(transaction);

    return {
      success: true,
      data: transaction,
      isTemporary: true,
    };
  } catch (error) {
    console.error("Failed to create offline transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Update an existing transaction offline
 */
export async function updateOfflineTransaction(
  id: string,
  updates: Partial<TransactionInput>
): Promise<OfflineOperationResult<Transaction>> {
  try {
    // Get existing transaction
    const existing = await db.transactions.get(id);
    if (!existing) {
      return {
        success: false,
        error: "Transaction not found",
        isTemporary: false,
      };
    }

    // Merge updates
    const updated: Transaction = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    // Update in IndexedDB
    await db.transactions.put(updated);

    return {
      success: true,
      data: updated,
      isTemporary: id.startsWith("temp-"),
    };
  } catch (error) {
    console.error("Failed to update offline transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Delete a transaction offline (soft delete)
 * Actually removes from IndexedDB since we have event sourcing
 */
export async function deleteOfflineTransaction(id: string): Promise<OfflineOperationResult<void>> {
  try {
    // Verify transaction exists
    const existing = await db.transactions.get(id);
    if (!existing) {
      return {
        success: false,
        error: "Transaction not found",
        isTemporary: false,
      };
    }

    // Delete from IndexedDB
    await db.transactions.delete(id);

    return {
      success: true,
      isTemporary: id.startsWith("temp-"),
    };
  } catch (error) {
    console.error("Failed to delete offline transaction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Batch create multiple transactions (for CSV import)
 */
export async function createOfflineTransactionsBatch(
  inputs: TransactionInput[],
  userId: string
): Promise<OfflineOperationResult<Transaction[]>> {
  try {
    const deviceId = await deviceManager.getDeviceId();
    const now = new Date().toISOString();

    const transactions: Transaction[] = inputs.map((input) => ({
      id: `temp-${nanoid()}`,
      date: input.date,
      description: input.description,
      amount_cents: input.amount_cents,
      type: input.type,
      account_id: input.account_id || null,
      category_id: input.category_id || null,
      status: input.status,
      visibility: input.visibility,
      notes: input.notes || null,
      tagged_user_ids: input.tagged_user_ids || [],
      transfer_group_id: input.transfer_group_id || null,
      household_id: "00000000-0000-0000-0000-000000000001", // Default household (Decision #61)
      created_by_user_id: userId,
      owner_user_id: input.visibility === "personal" ? userId : null,
      device_id: deviceId,
      created_at: now,
      updated_at: now,
    }));

    // Bulk write to IndexedDB
    await db.transactions.bulkAdd(transactions);

    return {
      success: true,
      data: transactions,
      isTemporary: true,
    };
  } catch (error) {
    console.error("Failed to batch create offline transactions:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}
```

**Verify**: No TypeScript errors

---

## Step 3: Create Offline Account Mutations (20 min)

Create `src/lib/offline/accounts.ts`:

```typescript
import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { deviceManager } from "@/lib/dexie/deviceManager";
import type { Account } from "@/types/database";
import type { AccountInput, OfflineOperationResult } from "./types";

/**
 * Create a new account offline
 */
export async function createOfflineAccount(
  input: AccountInput,
  userId: string
): Promise<OfflineOperationResult<Account>> {
  try {
    const tempId = `temp-${nanoid()}`;
    const deviceId = await deviceManager.getDeviceId();
    const now = new Date().toISOString();

    const account: Account = {
      id: tempId,
      household_id: "00000000-0000-0000-0000-000000000001", // Default household (Decision #61)
      name: input.name,
      type: input.type,
      visibility: input.visibility,
      initial_balance_cents: input.initial_balance_cents,
      color: input.color || null,
      icon: input.icon || null,
      is_active: input.is_active,
      owner_user_id: input.visibility === "personal" ? userId : null,
      device_id: deviceId,
      created_at: now,
      updated_at: now,
    };

    await db.accounts.add(account);

    return {
      success: true,
      data: account,
      isTemporary: true,
    };
  } catch (error) {
    console.error("Failed to create offline account:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Update an existing account offline
 */
export async function updateOfflineAccount(
  id: string,
  updates: Partial<AccountInput>
): Promise<OfflineOperationResult<Account>> {
  try {
    const existing = await db.accounts.get(id);
    if (!existing) {
      return {
        success: false,
        error: "Account not found",
        isTemporary: false,
      };
    }

    const updated: Account = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await db.accounts.put(updated);

    return {
      success: true,
      data: updated,
      isTemporary: id.startsWith("temp-"),
    };
  } catch (error) {
    console.error("Failed to update offline account:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Deactivate an account (soft delete)
 */
export async function deactivateOfflineAccount(
  id: string
): Promise<OfflineOperationResult<Account>> {
  return updateOfflineAccount(id, { is_active: false });
}
```

**Verify**: No TypeScript errors

---

## Step 4: Create Offline Category Mutations (20 min)

Create `src/lib/offline/categories.ts`:

```typescript
import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import { deviceManager } from "@/lib/dexie/deviceManager";
import type { Category } from "@/types/database";
import type { CategoryInput, OfflineOperationResult } from "./types";

/**
 * Create a new category offline
 */
export async function createOfflineCategory(
  input: CategoryInput
): Promise<OfflineOperationResult<Category>> {
  try {
    const tempId = `temp-${nanoid()}`;
    const deviceId = await deviceManager.getDeviceId();
    const now = new Date().toISOString();

    const category: Category = {
      id: tempId,
      household_id: "00000000-0000-0000-0000-000000000001", // Default household (Decision #61)
      name: input.name,
      parent_id: input.parent_id || null,
      color: input.color || null,
      icon: input.icon || null,
      sort_order: input.sort_order,
      is_active: input.is_active,
      device_id: deviceId,
      created_at: now,
      updated_at: now,
    };

    await db.categories.add(category);

    return {
      success: true,
      data: category,
      isTemporary: true,
    };
  } catch (error) {
    console.error("Failed to create offline category:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Update an existing category offline
 */
export async function updateOfflineCategory(
  id: string,
  updates: Partial<CategoryInput>
): Promise<OfflineOperationResult<Category>> {
  try {
    const existing = await db.categories.get(id);
    if (!existing) {
      return {
        success: false,
        error: "Category not found",
        isTemporary: false,
      };
    }

    const updated: Category = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await db.categories.put(updated);

    return {
      success: true,
      data: updated,
      isTemporary: id.startsWith("temp-"),
    };
  } catch (error) {
    console.error("Failed to update offline category:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      isTemporary: false,
    };
  }
}

/**
 * Deactivate a category (soft delete)
 */
export async function deactivateOfflineCategory(
  id: string
): Promise<OfflineOperationResult<Category>> {
  return updateOfflineCategory(id, { is_active: false });
}
```

**Verify**: No TypeScript errors

---

## Step 5: Create React Mutation Hooks (30 min)

Create `src/hooks/useOfflineTransaction.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  createOfflineTransaction,
  updateOfflineTransaction,
  deleteOfflineTransaction,
} from "@/lib/offline/transactions";
import type { TransactionInput } from "@/lib/offline/types";

export function useCreateOfflineTransaction() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (input: TransactionInput) => {
      if (!user?.id) throw new Error("User not authenticated");
      return createOfflineTransaction(input, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        // Invalidate transactions query to refetch
        queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
        toast.success("Transaction created (offline)");
      } else {
        toast.error(result.error || "Failed to create transaction");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

export function useUpdateOfflineTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<TransactionInput> }) => {
      return updateOfflineTransaction(id, updates);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
        toast.success("Transaction updated (offline)");
      } else {
        toast.error(result.error || "Failed to update transaction");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

export function useDeleteOfflineTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteOfflineTransaction(id),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });
        toast.success("Transaction deleted (offline)");
      } else {
        toast.error(result.error || "Failed to delete transaction");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}
```

**Create similar hooks for accounts**: `src/hooks/useOfflineAccount.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import {
  createOfflineAccount,
  updateOfflineAccount,
  deactivateOfflineAccount,
} from "@/lib/offline/accounts";
import type { AccountInput } from "@/lib/offline/types";

export function useCreateOfflineAccount() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (input: AccountInput) => {
      if (!user?.id) throw new Error("User not authenticated");
      return createOfflineAccount(input, user.id);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["accounts", "offline"] });
        toast.success("Account created (offline)");
      } else {
        toast.error(result.error || "Failed to create account");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

export function useUpdateOfflineAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<AccountInput> }) => {
      return updateOfflineAccount(id, updates);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["accounts", "offline"] });
        toast.success("Account updated (offline)");
      } else {
        toast.error(result.error || "Failed to update account");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

export function useDeactivateOfflineAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateOfflineAccount(id),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["accounts", "offline"] });
        toast.success("Account deactivated (offline)");
      } else {
        toast.error(result.error || "Failed to deactivate account");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}
```

**Create similar hooks for categories**: `src/hooks/useOfflineCategory.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  createOfflineCategory,
  updateOfflineCategory,
  deactivateOfflineCategory,
} from "@/lib/offline/categories";
import type { CategoryInput } from "@/lib/offline/types";

export function useCreateOfflineCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CategoryInput) => {
      return createOfflineCategory(input);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["categories", "offline"] });
        toast.success("Category created (offline)");
      } else {
        toast.error(result.error || "Failed to create category");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

export function useUpdateOfflineCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CategoryInput> }) => {
      return updateOfflineCategory(id, updates);
    },
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["categories", "offline"] });
        toast.success("Category updated (offline)");
      } else {
        toast.error(result.error || "Failed to update category");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}

export function useDeactivateOfflineCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateOfflineCategory(id),
    onSuccess: (result) => {
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ["categories", "offline"] });
        toast.success("Category deactivated (offline)");
      } else {
        toast.error(result.error || "Failed to deactivate category");
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}
```

**Verify**: No TypeScript errors

---

### Optional Enhancement: True Optimistic Updates

The hooks above use cache invalidation (refetch after success). For instant UI feedback, you can implement true optimistic updates with `onMutate`:

```typescript
export function useCreateOfflineTransaction() {
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  return useMutation({
    mutationFn: (input: TransactionInput) => {
      if (!user?.id) throw new Error("User not authenticated");
      return createOfflineTransaction(input, user.id);
    },

    // Optimistic update: Update UI before mutation completes
    onMutate: async (input) => {
      // Cancel outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["transactions", "offline"] });

      // Snapshot previous value for rollback
      const previousTransactions = queryClient.getQueryData(["transactions", "offline"]);

      // Optimistically update cache with temporary transaction
      queryClient.setQueryData(["transactions", "offline"], (old: Transaction[] = []) => {
        const tempTransaction: Transaction = {
          id: `temp-${Date.now()}`, // Temporary ID for UI
          ...input,
          device_id: "pending",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        return [tempTransaction, ...old];
      });

      // Return context for rollback
      return { previousTransactions };
    },

    onSuccess: (result, input, context) => {
      if (result.success) {
        // Replace optimistic transaction with real one from IndexedDB
        queryClient.setQueryData(["transactions", "offline"], (old: Transaction[] = []) => {
          return old.map((tx) =>
            tx.id.startsWith("temp-") && tx.description === input.description ? result.data : tx
          );
        });
        toast.success("Transaction created (offline)");
      } else {
        // Rollback on business logic failure
        queryClient.setQueryData(["transactions", "offline"], context?.previousTransactions);
        toast.error(result.error || "Failed to create transaction");
      }
    },

    onError: (error, input, context) => {
      // Rollback on error
      queryClient.setQueryData(["transactions", "offline"], context?.previousTransactions);
      toast.error(error instanceof Error ? error.message : "Unknown error");
    },
  });
}
```

**Benefits**:

- UI updates instantly (no perceived latency)
- Better user experience for offline operations
- Automatic rollback on failure

**Trade-offs**:

- More complex code
- Requires careful cache key management
- Can cause UI flicker if rollback occurs

**Recommendation**: Start with simple cache invalidation (as shown in main hooks). Add optimistic updates later if UI feels sluggish.

---

## Step 6: Test Offline Operations (10 min)

Create test file `src/lib/offline/transactions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  createOfflineTransaction,
  updateOfflineTransaction,
  deleteOfflineTransaction,
} from "./transactions";

describe("Offline Transaction Operations", () => {
  const testUserId = "test-user-123";

  beforeEach(async () => {
    // Clear test database
    await db.transactions.clear();
  });

  afterEach(async () => {
    await db.transactions.clear();
  });

  it("should create transaction with temporary ID", async () => {
    const input = {
      date: "2024-01-15",
      description: "Test transaction",
      amount_cents: 150050,
      type: "expense" as const,
      status: "pending" as const,
      visibility: "household" as const,
    };

    const result = await createOfflineTransaction(input, testUserId);

    expect(result.success).toBe(true);
    expect(result.data?.id).toMatch(/^temp-/);
    expect(result.data?.description).toBe("Test transaction");
    expect(result.data?.amount_cents).toBe(150050);
    expect(result.isTemporary).toBe(true);

    // Verify in IndexedDB
    const stored = await db.transactions.get(result.data!.id);
    expect(stored).toBeDefined();
    expect(stored?.description).toBe("Test transaction");
  });

  it("should update existing transaction", async () => {
    // Create initial transaction
    const createResult = await createOfflineTransaction(
      {
        date: "2024-01-15",
        description: "Original",
        amount_cents: 100000,
        type: "expense" as const,
        status: "pending" as const,
        visibility: "household" as const,
      },
      testUserId
    );

    const id = createResult.data!.id;

    // Update it
    const updateResult = await updateOfflineTransaction(id, {
      description: "Updated",
      amount_cents: 200000,
    });

    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.description).toBe("Updated");
    expect(updateResult.data?.amount_cents).toBe(200000);

    // Verify in IndexedDB
    const stored = await db.transactions.get(id);
    expect(stored?.description).toBe("Updated");
  });

  it("should delete transaction", async () => {
    // Create transaction
    const createResult = await createOfflineTransaction(
      {
        date: "2024-01-15",
        description: "To delete",
        amount_cents: 100000,
        type: "expense" as const,
        status: "pending" as const,
        visibility: "household" as const,
      },
      testUserId
    );

    const id = createResult.data!.id;

    // Delete it
    const deleteResult = await deleteOfflineTransaction(id);

    expect(deleteResult.success).toBe(true);

    // Verify removed from IndexedDB
    const stored = await db.transactions.get(id);
    expect(stored).toBeUndefined();
  });
});
```

**Run tests**:

```bash
npm test src/lib/offline/transactions.test.ts
```

All tests should pass.

---

## Done!

When offline operations work and tests pass, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Temporary IDs**:

- Format: `temp-${nanoid()}`
- Will be replaced with server UUIDs on sync
- All references use temporary IDs until replacement

**Optimistic Updates**:

- UI updates immediately via TanStack Query cache invalidation
- IndexedDB write happens synchronously
- Sync queue (next chunk) will handle background sync

**Error Handling**:

- Return structured results (success/error/data)
- Don't throw exceptions in mutation functions
- Let hooks handle toast notifications

**Performance**:

- Batch operations use `bulkAdd` for efficiency
- IndexedDB transactions wrap multiple writes
- Query invalidation triggers minimal re-renders
