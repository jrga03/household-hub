# D4 Implementation: Debt CRUD Operations

## Overview

You'll create complete CRUD operations for external and internal debts with comprehensive validation. This includes creation, reading, updating, deletion, and entity validation for internal debt references.

**Estimated time**: 1.5 hours

---

## Step 1: Create Validation Module

Create file: `src/lib/debts/validation.ts`

```typescript
// src/lib/debts/validation.ts
/**
 * Debt Validation Logic
 *
 * Validates debt creation, updates, and deletion
 * Enforces business rules and data integrity
 */

import { db } from "@/lib/dexie/db";
import type { DebtFormData, InternalDebtFormData, EntityType } from "@/types/debt";

// =====================================================
// Types
// =====================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// =====================================================
// Amount Validation
// =====================================================

const CURRENCY_LIMITS = {
  MIN_CENTS: 0,
  MAX_CENTS: 999999999, // ₱9,999,999.99
  MIN_DEBT: 100, // ₱1.00 minimum debt
};

export function validateAmount(cents: number, type: "debt"): ValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(cents)) {
    errors.push("Amount must be in whole cents (no fractions)");
  }

  if (cents < CURRENCY_LIMITS.MIN_DEBT) {
    errors.push("Amount must be at least ₱1.00");
  }

  if (cents > CURRENCY_LIMITS.MAX_CENTS) {
    errors.push(`Amount exceeds maximum of ₱9,999,999.99`);
  }

  return { valid: errors.length === 0, errors };
}

// =====================================================
// Name Validation
// =====================================================

export async function validateDebtName(
  name: string,
  householdId: string,
  debtType: "external" | "internal",
  excludeId?: string
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Trim and check empty
  const trimmedName = name.trim();
  if (!trimmedName) {
    errors.push("Name is required");
    return { valid: false, errors };
  }

  // Length check
  if (trimmedName.length > 100) {
    errors.push("Name must be 100 characters or less");
  }

  // Uniqueness check (active debts only)
  const table = debtType === "external" ? db.debts : db.internalDebts;
  const duplicate = await table
    .where("household_id")
    .equals(householdId)
    .and(
      (debt) =>
        debt.name.toLowerCase() === trimmedName.toLowerCase() &&
        debt.status === "active" &&
        debt.id !== excludeId // Exclude self when editing
    )
    .first();

  if (duplicate) {
    errors.push(`An active debt named "${trimmedName}" already exists`);
  }

  return { valid: errors.length === 0, errors };
}

// =====================================================
// Entity Validation (Internal Debts)
// =====================================================

/**
 * Validate that entity exists in database
 * Soft references - no FK constraints, runtime validation
 */
export async function validateEntityExists(
  entityType: EntityType,
  entityId: string
): Promise<boolean> {
  switch (entityType) {
    case "category":
      const category = await db.budgetCategories.get(entityId);
      return !!category && !category.deleted_at;

    case "account":
      const account = await db.accounts.get(entityId);
      return !!account && !account.deleted_at;

    case "member":
      const member = await db.profiles.get(entityId);
      return !!member;

    default:
      return false;
  }
}

/**
 * Get display name for entity (for caching)
 */
export async function getEntityDisplayName(
  entityType: EntityType,
  entityId: string
): Promise<string> {
  switch (entityType) {
    case "category":
      const category = await db.budgetCategories.get(entityId);
      return category?.name || `Unknown category`;

    case "account":
      const account = await db.accounts.get(entityId);
      return account?.name || `Unknown account`;

    case "member":
      const member = await db.profiles.get(entityId);
      return member?.email || `Unknown member`;

    default:
      return `Unknown ${entityType}`;
  }
}

// =====================================================
// Debt Creation Validation
// =====================================================

export async function validateDebtCreation(data: DebtFormData): Promise<ValidationResult> {
  const errors: string[] = [];

  // Name validation
  const nameValidation = await validateDebtName(data.name, data.household_id, "external");
  errors.push(...nameValidation.errors);

  // Amount validation
  const amountValidation = validateAmount(data.original_amount_cents, "debt");
  errors.push(...amountValidation.errors);

  return { valid: errors.length === 0, errors };
}

export async function validateInternalDebtCreation(
  data: InternalDebtFormData
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Name validation
  const nameValidation = await validateDebtName(data.name, data.household_id, "internal");
  errors.push(...nameValidation.errors);

  // Amount validation
  const amountValidation = validateAmount(data.original_amount_cents, "debt");
  errors.push(...amountValidation.errors);

  // Self-borrowing check
  if (data.from_type === data.to_type && data.from_id === data.to_id) {
    errors.push("Cannot borrow from the same entity");
  }

  // Entity type validation
  const validTypes: EntityType[] = ["category", "account", "member"];
  if (!validTypes.includes(data.from_type)) {
    errors.push(`Invalid from_type: ${data.from_type}`);
  }
  if (!validTypes.includes(data.to_type)) {
    errors.push(`Invalid to_type: ${data.to_type}`);
  }

  // Entity existence validation (runtime)
  if (!(await validateEntityExists(data.from_type, data.from_id))) {
    errors.push(`Invalid ${data.from_type} selected`);
  }
  if (!(await validateEntityExists(data.to_type, data.to_id))) {
    errors.push(`Invalid ${data.to_type} selected`);
  }

  return { valid: errors.length === 0, errors };
}

// =====================================================
// Debt Deletion Validation
// =====================================================

export async function validateDebtDeletion(
  debtId: string,
  type: "external" | "internal"
): Promise<ValidationResult> {
  const errors: string[] = [];

  // Check for payment history
  const field = type === "external" ? "debt_id" : "internal_debt_id";
  const paymentCount = await db.debtPayments.where(field).equals(debtId).count();

  if (paymentCount > 0) {
    errors.push("Cannot delete debt with payment history. Archive it instead.");
  }

  // Check for pending sync operations
  const pendingOps = await db.syncQueue
    .where("entity_id")
    .equals(debtId)
    .and((item) => item.status === "queued" || item.status === "syncing")
    .count();

  if (pendingOps > 0) {
    errors.push(
      "Cannot delete debt with pending sync operations. Please wait for sync to complete."
    );
  }

  // Check for pending payment sync operations
  const pendingPayments = await db.syncQueue
    .where("entity_type")
    .equals("debt_payment")
    .and((item) => {
      const payload = item.payload as any;
      const hasDebtId =
        type === "external" ? payload.debt_id === debtId : payload.internal_debt_id === debtId;
      return hasDebtId && (item.status === "queued" || item.status === "syncing");
    })
    .count();

  if (pendingPayments > 0) {
    errors.push(
      `Cannot delete debt with ${pendingPayments} pending payment(s). Please wait for sync to complete.`
    );
  }

  return { valid: errors.length === 0, errors };
}
```

---

## Step 2: Create CRUD Module

Create file: `src/lib/debts/crud.ts`

```typescript
// src/lib/debts/crud.ts
/**
 * Debt CRUD Operations
 *
 * Create, Read, Update, Delete operations for debts
 * Supports both external and internal debt types
 */

import { nanoid } from "nanoid";
import { db } from "@/lib/dexie/db";
import {
  validateDebtCreation,
  validateInternalDebtCreation,
  validateDebtDeletion,
  validateDebtName,
  getEntityDisplayName,
} from "./validation";
import { calculateDebtBalance } from "./balance";
import type {
  Debt,
  InternalDebt,
  DebtFormData,
  InternalDebtFormData,
  DebtWithBalance,
  InternalDebtWithBalance,
  DebtStatus,
} from "@/types/debt";

// =====================================================
// CREATE Operations
// =====================================================

/**
 * Create external debt (loan from outside)
 */
export async function createExternalDebt(data: DebtFormData): Promise<Debt> {
  // 1. Validate
  const validation = await validateDebtCreation(data);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // 2. Create debt
  const debt: Debt = {
    id: nanoid(),
    household_id: data.household_id,
    name: data.name.trim(),
    original_amount_cents: data.original_amount_cents,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.debts.add(debt);

  console.log("[Debt Created]", debt.name, `(₱${(debt.original_amount_cents / 100).toFixed(2)})`);

  return debt;
}

/**
 * Create internal debt (household borrowing)
 */
export async function createInternalDebt(data: InternalDebtFormData): Promise<InternalDebt> {
  // 1. Validate
  const validation = await validateInternalDebtCreation(data);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // 2. Cache display names
  const fromDisplayName = await getEntityDisplayName(data.from_type, data.from_id);
  const toDisplayName = await getEntityDisplayName(data.to_type, data.to_id);

  // 3. Create internal debt
  const debt: InternalDebt = {
    id: nanoid(),
    household_id: data.household_id,
    name: data.name.trim(),
    original_amount_cents: data.original_amount_cents,
    from_type: data.from_type,
    from_id: data.from_id,
    from_display_name: fromDisplayName,
    to_type: data.to_type,
    to_id: data.to_id,
    to_display_name: toDisplayName,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await db.internalDebts.add(debt);

  console.log(
    "[Internal Debt Created]",
    debt.name,
    `${fromDisplayName} → ${toDisplayName}`,
    `(₱${(debt.original_amount_cents / 100).toFixed(2)})`
  );

  return debt;
}

// =====================================================
// READ Operations
// =====================================================

/**
 * Get debt by ID
 */
export async function getDebt(
  debtId: string,
  type: "external" | "internal"
): Promise<Debt | InternalDebt | undefined> {
  const table = type === "external" ? db.debts : db.internalDebts;
  return await table.get(debtId);
}

/**
 * Get debt with calculated balance
 */
export async function getDebtWithBalance(
  debtId: string,
  type: "external" | "internal"
): Promise<DebtWithBalance | InternalDebtWithBalance | undefined> {
  const debt = await getDebt(debtId, type);
  if (!debt) return undefined;

  const balance = await calculateDebtBalance(debtId, type);

  return {
    ...debt,
    current_balance_cents: balance,
  } as DebtWithBalance | InternalDebtWithBalance;
}

/**
 * List debts with filters
 */
export async function listDebts(
  householdId: string,
  type: "external" | "internal",
  filters?: {
    status?: DebtStatus;
    limit?: number;
    offset?: number;
  }
): Promise<Array<Debt | InternalDebt>> {
  const table = type === "external" ? db.debts : db.internalDebts;

  let query = table.where("household_id").equals(householdId);

  // Filter by status if provided
  if (filters?.status) {
    const allDebts = await query.toArray();
    const filtered = allDebts.filter((d) => d.status === filters.status);

    // Sort by updated_at DESC
    filtered.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

    // Apply pagination
    const offset = filters.offset || 0;
    const limit = filters.limit || filtered.length;
    return filtered.slice(offset, offset + limit);
  }

  // No status filter - sort by updated_at DESC
  const debts = await query.reverse().sortBy("updated_at");

  // Apply pagination
  const offset = filters?.offset || 0;
  const limit = filters?.limit || debts.length;
  return debts.slice(offset, offset + limit);
}

/**
 * Search debts by name (fuzzy, case-insensitive)
 */
export async function searchDebtsByName(
  householdId: string,
  type: "external" | "internal",
  searchTerm: string
): Promise<Array<Debt | InternalDebt>> {
  const table = type === "external" ? db.debts : db.internalDebts;

  const allDebts = await table.where("household_id").equals(householdId).toArray();

  const term = searchTerm.toLowerCase();

  return allDebts.filter((debt) => debt.name.toLowerCase().includes(term));
}

// =====================================================
// UPDATE Operations
// =====================================================

/**
 * Update debt name
 */
export async function updateDebtName(
  debtId: string,
  type: "external" | "internal",
  newName: string
): Promise<void> {
  const table = type === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    throw new Error("Debt not found");
  }

  // Validate new name
  const validation = await validateDebtName(
    newName,
    debt.household_id,
    type,
    debtId // Exclude self
  );

  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  await table.update(debtId, {
    name: newName.trim(),
    updated_at: new Date().toISOString(),
  });

  console.log("[Debt Updated]", `"${debt.name}" → "${newName.trim()}"`);
}

/**
 * Archive debt (sets status to archived)
 */
export async function archiveDebt(debtId: string, type: "external" | "internal"): Promise<void> {
  const table = type === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    throw new Error("Debt not found");
  }

  if (debt.status === "archived") {
    console.log("[Archive] Debt already archived");
    return;
  }

  await table.update(debtId, {
    status: "archived",
    closed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  console.log("[Debt Archived]", debt.name);
}

/**
 * Unarchive debt (reactivate)
 * NOTE: This is a manual operation, not automatic
 */
export async function unarchiveDebt(debtId: string, type: "external" | "internal"): Promise<void> {
  const table = type === "external" ? db.debts : db.internalDebts;
  const debt = await table.get(debtId);

  if (!debt) {
    throw new Error("Debt not found");
  }

  if (debt.status !== "archived") {
    console.log("[Unarchive] Debt not archived");
    return;
  }

  // Determine status based on current balance
  const balance = await calculateDebtBalance(debtId, type);
  const newStatus: DebtStatus = balance <= 0 ? "paid_off" : "active";

  await table.update(debtId, {
    status: newStatus,
    closed_at: newStatus === "paid_off" ? debt.closed_at : null,
    updated_at: new Date().toISOString(),
  });

  console.log("[Debt Unarchived]", debt.name, `(status: ${newStatus})`);
}

// =====================================================
// DELETE Operations
// =====================================================

/**
 * Delete debt (hard delete)
 * Only allowed if no payment history exists
 */
export async function deleteDebt(debtId: string, type: "external" | "internal"): Promise<void> {
  // 1. Validate deletion
  const validation = await validateDebtDeletion(debtId, type);
  if (!validation.valid) {
    throw new Error(validation.errors.join(", "));
  }

  // 2. Get debt for logging
  const debt = await getDebt(debtId, type);
  if (!debt) {
    throw new Error("Debt not found");
  }

  // 3. Delete
  const table = type === "external" ? db.debts : db.internalDebts;
  await table.delete(debtId);

  console.log("[Debt Deleted]", debt.name);
}

// =====================================================
// Bulk Operations
// =====================================================

/**
 * Get debts with balances (batch operation)
 */
export async function getDebtsWithBalances(
  householdId: string,
  type: "external" | "internal",
  filters?: { status?: DebtStatus }
): Promise<Array<DebtWithBalance | InternalDebtWithBalance>> {
  const debts = await listDebts(householdId, type, filters);

  const withBalances = await Promise.all(
    debts.map(async (debt) => {
      const balance = await calculateDebtBalance(debt.id, type);
      return {
        ...debt,
        current_balance_cents: balance,
      };
    })
  );

  return withBalances as Array<DebtWithBalance | InternalDebtWithBalance>;
}
```

---

## Step 3: Update Debt Types

Modify `src/types/debt.ts` to add form data types:

```typescript
// Add to src/types/debt.ts

// =====================================================
// Form Data Types (for CRUD operations)
// =====================================================

export interface DebtFormData {
  name: string;
  original_amount_cents: number;
  household_id: string;
}

export interface InternalDebtFormData extends DebtFormData {
  from_type: EntityType;
  from_id: string;
  to_type: EntityType;
  to_id: string;
}

// Note: from_display_name and to_display_name are auto-generated
// Don't include in form data - they're cached during creation
```

---

## Step 4: Create Validation Tests

Create file: `src/lib/debts/__tests__/validation.test.ts`

```typescript
// src/lib/debts/__tests__/validation.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  validateAmount,
  validateDebtName,
  validateEntityExists,
  validateDebtCreation,
  validateInternalDebtCreation,
  validateDebtDeletion,
} from "../validation";

describe("Debt Validation", () => {
  beforeEach(async () => {
    await db.debts.clear();
    await db.internalDebts.clear();
    await db.debtPayments.clear();
  });

  describe("validateAmount", () => {
    it("should accept valid amounts", () => {
      expect(validateAmount(100, "debt").valid).toBe(true); // ₱1.00
      expect(validateAmount(100000, "debt").valid).toBe(true); // ₱1,000
      expect(validateAmount(999999999, "debt").valid).toBe(true); // Max
    });

    it("should reject amounts below minimum", () => {
      const result = validateAmount(99, "debt");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Amount must be at least ₱1.00");
    });

    it("should reject amounts above maximum", () => {
      const result = validateAmount(1000000000, "debt");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("exceeds maximum");
    });

    it("should reject non-integer amounts", () => {
      const result = validateAmount(100.5, "debt");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Amount must be in whole cents");
    });
  });

  describe("validateDebtName", () => {
    it("should reject empty names", async () => {
      const result = await validateDebtName("", "household-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Name is required");
    });

    it("should reject names over 100 characters", async () => {
      const longName = "A".repeat(101);
      const result = await validateDebtName(longName, "household-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("100 characters");
    });

    it("should reject duplicate active debt names", async () => {
      // Create existing debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtName("Car Loan", "household-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("already exists");
    });

    it("should allow duplicate names if one is archived", async () => {
      // Create archived debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "archived",
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtName("Car Loan", "household-1", "external");
      expect(result.valid).toBe(true);
    });

    it("should allow same name when excluding self (edit)", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Editing debt-1, name unchanged
      const result = await validateDebtName("Car Loan", "household-1", "external", "debt-1");
      expect(result.valid).toBe(true);
    });
  });

  describe("validateDebtDeletion", () => {
    it("should allow deletion of debt with no payments", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtDeletion("debt-1", "external");
      expect(result.valid).toBe(true);
    });

    it("should block deletion of debt with payment history", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      const result = await validateDebtDeletion("debt-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("payment history");
      expect(result.errors[0]).toContain("Archive");
    });
  });
});
```

---

## Step 5: Create CRUD Tests

Create file: `src/lib/debts/__tests__/crud.test.ts`

```typescript
// src/lib/debts/__tests__/crud.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  createExternalDebt,
  createInternalDebt,
  getDebt,
  getDebtWithBalance,
  listDebts,
  searchDebtsByName,
  updateDebtName,
  archiveDebt,
  unarchiveDebt,
  deleteDebt,
} from "../crud";

describe("Debt CRUD Operations", () => {
  beforeEach(async () => {
    await db.debts.clear();
    await db.internalDebts.clear();
    await db.debtPayments.clear();
  });

  describe("createExternalDebt", () => {
    it("should create external debt", async () => {
      const debt = await createExternalDebt({
        name: "Car Loan",
        original_amount_cents: 500000,
        household_id: "household-1",
      });

      expect(debt.id).toBeDefined();
      expect(debt.name).toBe("Car Loan");
      expect(debt.original_amount_cents).toBe(500000);
      expect(debt.status).toBe("active");

      // Verify in database
      const retrieved = await db.debts.get(debt.id);
      expect(retrieved).toEqual(debt);
    });

    it("should reject invalid amount", async () => {
      await expect(
        createExternalDebt({
          name: "Test",
          original_amount_cents: 50, // Below minimum
          household_id: "household-1",
        })
      ).rejects.toThrow("at least ₱1.00");
    });

    it("should reject duplicate active name", async () => {
      await createExternalDebt({
        name: "Car Loan",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await expect(
        createExternalDebt({
          name: "Car Loan",
          original_amount_cents: 200000,
          household_id: "household-1",
        })
      ).rejects.toThrow("already exists");
    });
  });

  describe("getDebt", () => {
    it("should retrieve debt by ID", async () => {
      const created = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      const retrieved = await getDebt(created.id, "external");
      expect(retrieved).toEqual(created);
    });

    it("should return undefined for non-existent debt", async () => {
      const retrieved = await getDebt("non-existent", "external");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("listDebts", () => {
    it("should list all debts for household", async () => {
      await createExternalDebt({
        name: "Debt 1",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await createExternalDebt({
        name: "Debt 2",
        original_amount_cents: 200000,
        household_id: "household-1",
      });

      const debts = await listDebts("household-1", "external");
      expect(debts).toHaveLength(2);
    });

    it("should filter by status", async () => {
      const debt1 = await createExternalDebt({
        name: "Active",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      const debt2 = await createExternalDebt({
        name: "To Archive",
        original_amount_cents: 200000,
        household_id: "household-1",
      });

      await archiveDebt(debt2.id, "external");

      const activeDebts = await listDebts("household-1", "external", { status: "active" });
      expect(activeDebts).toHaveLength(1);
      expect(activeDebts[0].name).toBe("Active");
    });
  });

  describe("updateDebtName", () => {
    it("should update debt name", async () => {
      const debt = await createExternalDebt({
        name: "Old Name",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await updateDebtName(debt.id, "external", "New Name");

      const updated = await getDebt(debt.id, "external");
      expect(updated?.name).toBe("New Name");
    });

    it("should reject duplicate name", async () => {
      await createExternalDebt({
        name: "Existing",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      const debt2 = await createExternalDebt({
        name: "To Rename",
        original_amount_cents: 200000,
        household_id: "household-1",
      });

      await expect(updateDebtName(debt2.id, "external", "Existing")).rejects.toThrow(
        "already exists"
      );
    });
  });

  describe("archiveDebt", () => {
    it("should archive debt", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await archiveDebt(debt.id, "external");

      const updated = await getDebt(debt.id, "external");
      expect(updated?.status).toBe("archived");
      expect(updated?.closed_at).toBeDefined();
    });
  });

  describe("deleteDebt", () => {
    it("should delete debt with no payments", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await deleteDebt(debt.id, "external");

      const retrieved = await getDebt(debt.id, "external");
      expect(retrieved).toBeUndefined();
    });

    it("should reject deletion with payment history", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      // Add payment
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: debt.id,
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      await expect(deleteDebt(debt.id, "external")).rejects.toThrow("payment history");
    });
  });
});
```

---

## Step 6: Run Tests

```bash
# Run all debt tests
npm test src/lib/debts

# Expected output:
# ✓ validation.test.ts (10+ tests)
# ✓ crud.test.ts (15+ tests)
# ✓ balance.test.ts (from D3)
# ✓ status.test.ts (from D3)
```

---

## Step 7: Verify in Browser Console

```typescript
import { createExternalDebt, createInternalDebt, listDebts } from "@/lib/debts/crud";

// Create external debt
const externalDebt = await createExternalDebt({
  name: "Browser Test Loan",
  original_amount_cents: 500000, // ₱5,000
  household_id: "00000000-0000-0000-0000-000000000001",
});

console.log("Created external debt:", externalDebt);

// List debts
const debts = await listDebts("00000000-0000-0000-0000-000000000001", "external");

console.log("All external debts:", debts);

// Cleanup
await deleteDebt(externalDebt.id, "external");
```

---

## Verification Checklist

After completing implementation:

- [ ] `validation.ts` created with 6+ validation functions
- [ ] `crud.ts` created with 12+ CRUD functions
- [ ] Type definitions added to `debt.ts`
- [ ] All validation tests pass (10+)
- [ ] All CRUD tests pass (15+)
- [ ] Name uniqueness works (active debts only)
- [ ] Self-borrowing prevented
- [ ] Entity existence validated
- [ ] Display names cached
- [ ] Deletion blocked when payments exist
- [ ] Browser console verification successful
- [ ] TypeScript compilation passes

---

## Troubleshooting

See `VERIFICATION.md` for common issues and solutions.

**Next**: Proceed to `VERIFICATION.md` for comprehensive testing
