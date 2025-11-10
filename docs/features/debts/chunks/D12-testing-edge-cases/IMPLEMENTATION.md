# D12 Implementation: Testing & Edge Cases

**Time estimate**: 2-3 hours

This guide provides step-by-step instructions for creating comprehensive tests for all debt functionality.

---

## Step 0: Install Test Dependencies (5 minutes)

If not already installed:

```bash
# Install Vitest and testing utilities
npm install -D vitest @vitest/ui fake-indexeddb @testing-library/react @testing-library/jest-dom

# Install Playwright for E2E tests
npm install -D @playwright/test @axe-core/playwright

# Initialize Playwright (if not already done)
npx playwright install
```

**Verify installation**:

```bash
npm list vitest @playwright/test fake-indexeddb
```

**Configure Vitest** (if not already configured):

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**Create test setup file**:

```typescript
// src/test/setup.ts
import { expect, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

afterEach(() => {
  cleanup();
});

// Mock IndexedDB
import "fake-indexeddb/auto";
```

---

## Step 1: Create Test Utilities (15 minutes)

Create helper functions and factories for generating test data.

**Create test utilities file**:

```typescript
// src/lib/debts/test-utils.ts
import { nanoid } from "nanoid";
import type { Debt, InternalDebt, DebtPayment } from "./types";

/**
 * Create a test external debt with default values
 */
export function createTestDebt(overrides?: Partial<Debt>): Debt {
  return {
    id: nanoid(),
    household_id: "test-household",
    name: "Test Debt",
    original_amount_cents: 100000, // ₱1,000.00
    description: null,
    status: "active",
    type: "external",
    device_id: "test-device",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a test internal debt with default values
 */
export function createTestInternalDebt(overrides?: Partial<InternalDebt>): InternalDebt {
  return {
    id: nanoid(),
    household_id: "test-household",
    lender_user_id: "user-1",
    borrower_user_id: "user-2",
    name: "Test Internal Debt",
    original_amount_cents: 50000, // ₱500.00
    description: null,
    status: "active",
    type: "internal",
    device_id: "test-device",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a test debt payment with default values
 */
export function createTestPayment(overrides?: Partial<DebtPayment>): DebtPayment {
  return {
    id: nanoid(),
    debt_id: "test-debt",
    debt_type: "external",
    amount_cents: 10000, // ₱100.00
    transaction_id: nanoid(),
    is_reversal: false,
    reverses_payment_id: null,
    household_id: "test-household",
    device_id: "test-device",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper to wait for async operations
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Helper to create multiple payments
 */
export function createTestPayments(
  count: number,
  baseOverrides?: Partial<DebtPayment>
): DebtPayment[] {
  return Array.from({ length: count }, (_, i) =>
    createTestPayment({
      ...baseOverrides,
      id: `payment-${i}`,
      amount_cents: 10000 + i * 1000,
    })
  );
}
```

**File location**: `src/lib/debts/test-utils.ts`

---

## Step 2: Unit Tests - Balance Calculation (20 minutes)

Test the core balance calculation logic.

**Create balance tests**:

```typescript
// src/lib/debts/__tests__/balance.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/dexie";
import { calculateDebtBalance } from "../balance";
import { createTestDebt, createTestPayment } from "../test-utils";

describe("calculateDebtBalance", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
  });

  it("should return original amount when no payments", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const balance = await calculateDebtBalance("debt-1", "external");

    expect(balance).toBe(100000);
  });

  it("should subtract single payment from original amount", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const payment = createTestPayment({
      debt_id: "debt-1",
      amount_cents: 30000,
    });
    await db.debtPayments.add(payment);

    const balance = await calculateDebtBalance("debt-1", "external");

    expect(balance).toBe(70000); // 100000 - 30000
  });

  it("should subtract multiple payments", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    await db.debtPayments.bulkAdd([
      createTestPayment({ debt_id: "debt-1", amount_cents: 20000 }),
      createTestPayment({ debt_id: "debt-1", amount_cents: 30000 }),
      createTestPayment({ debt_id: "debt-1", amount_cents: 10000 }),
    ]);

    const balance = await calculateDebtBalance("debt-1", "external");

    expect(balance).toBe(40000); // 100000 - 60000
  });

  it("should handle reversals (negative amounts)", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const payment = createTestPayment({
      id: "pay-1",
      debt_id: "debt-1",
      amount_cents: 30000,
    });
    await db.debtPayments.add(payment);

    const reversal = createTestPayment({
      debt_id: "debt-1",
      amount_cents: -30000, // Negative
      is_reversal: true,
      reverses_payment_id: "pay-1",
    });
    await db.debtPayments.add(reversal);

    const balance = await calculateDebtBalance("debt-1", "external");

    expect(balance).toBe(100000); // Back to original
  });

  it("should handle cascading reversals (double negative)", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    // Original payment
    const payment = createTestPayment({
      id: "pay-1",
      debt_id: "debt-1",
      amount_cents: 30000,
    });
    await db.debtPayments.add(payment);

    // First reversal (negative)
    const reversal1 = createTestPayment({
      id: "rev-1",
      debt_id: "debt-1",
      amount_cents: -30000,
      is_reversal: true,
      reverses_payment_id: "pay-1",
    });
    await db.debtPayments.add(reversal1);

    // Reverse the reversal (positive, double negative)
    const reversal2 = createTestPayment({
      id: "rev-2",
      debt_id: "debt-1",
      amount_cents: 30000, // Positive (reversing negative)
      is_reversal: true,
      reverses_payment_id: "rev-1",
    });
    await db.debtPayments.add(reversal2);

    const balance = await calculateDebtBalance("debt-1", "external");

    expect(balance).toBe(70000); // Same as original payment
  });

  it("should return zero for exact payoff", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const payment = createTestPayment({
      debt_id: "debt-1",
      amount_cents: 100000, // Exact amount
    });
    await db.debtPayments.add(payment);

    const balance = await calculateDebtBalance("debt-1", "external");

    expect(balance).toBe(0);
  });

  it("should return negative for overpayment", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const payment = createTestPayment({
      debt_id: "debt-1",
      amount_cents: 120000, // Overpayment
    });
    await db.debtPayments.add(payment);

    const balance = await calculateDebtBalance("debt-1", "external");

    expect(balance).toBe(-20000);
  });

  it("should handle large number of payments efficiently", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      original_amount_cents: 100000000, // ₱1,000,000
    });
    await db.debts.add(debt);

    // Create 1000 small payments
    const payments = Array.from({ length: 1000 }, (_, i) =>
      createTestPayment({
        debt_id: "debt-1",
        amount_cents: 10000, // ₱100 each
      })
    );
    await db.debtPayments.bulkAdd(payments);

    const startTime = performance.now();
    const balance = await calculateDebtBalance("debt-1", "external");
    const endTime = performance.now();

    expect(balance).toBe(90000000); // 100M - 10M
    expect(endTime - startTime).toBeLessThan(100); // Should complete in <100ms
  });
});
```

**File location**: `src/lib/debts/__tests__/balance.test.ts`

---

## Step 3: Unit Tests - Status Logic (15 minutes)

Test status determination logic.

**Create status tests**:

```typescript
// src/lib/debts/__tests__/status.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/dexie";
import { determineDebtStatus, updateDebtStatusFromBalance } from "../status";
import { createTestDebt, createTestPayment } from "../test-utils";

describe("determineDebtStatus", () => {
  it('should return "active" for positive balance', () => {
    expect(determineDebtStatus(50000)).toBe("active");
    expect(determineDebtStatus(100)).toBe("active"); // ₱1.00
    expect(determineDebtStatus(1)).toBe("active"); // ₱0.01
  });

  it('should return "paid_off" for zero balance', () => {
    expect(determineDebtStatus(0)).toBe("paid_off");
  });

  it('should return "overpaid" for negative balance', () => {
    expect(determineDebtStatus(-1)).toBe("overpaid");
    expect(determineDebtStatus(-5000)).toBe("overpaid");
  });

  it("should handle boundary at zero correctly", () => {
    expect(determineDebtStatus(1)).toBe("active"); // Just above zero
    expect(determineDebtStatus(0)).toBe("paid_off"); // Exactly zero
    expect(determineDebtStatus(-1)).toBe("overpaid"); // Just below zero
  });
});

describe("updateDebtStatusFromBalance", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
  });

  it("should update status to paid_off when balance is zero", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      status: "active",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const payment = createTestPayment({
      debt_id: "debt-1",
      amount_cents: 100000, // Full payoff
    });
    await db.debtPayments.add(payment);

    const result = await updateDebtStatusFromBalance("debt-1", "external");

    expect(result.statusChanged).toBe(true);
    expect(result.newStatus).toBe("paid_off");
    expect(result.oldStatus).toBe("active");

    const updated = await db.debts.get("debt-1");
    expect(updated?.status).toBe("paid_off");
  });

  it("should update status to overpaid when balance is negative", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      status: "active",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const payment = createTestPayment({
      debt_id: "debt-1",
      amount_cents: 120000, // Overpayment
    });
    await db.debtPayments.add(payment);

    const result = await updateDebtStatusFromBalance("debt-1", "external");

    expect(result.statusChanged).toBe(true);
    expect(result.newStatus).toBe("overpaid");
  });

  it("should update status back to active after reversal", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      status: "paid_off",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const payment = createTestPayment({
      id: "pay-1",
      debt_id: "debt-1",
      amount_cents: 100000,
    });
    await db.debtPayments.add(payment);

    // Reverse the payment
    const reversal = createTestPayment({
      debt_id: "debt-1",
      amount_cents: -100000,
      is_reversal: true,
      reverses_payment_id: "pay-1",
    });
    await db.debtPayments.add(reversal);

    const result = await updateDebtStatusFromBalance("debt-1", "external");

    expect(result.statusChanged).toBe(true);
    expect(result.newStatus).toBe("active");
    expect(result.oldStatus).toBe("paid_off");
  });

  it("should not change status if already correct", async () => {
    const debt = createTestDebt({
      id: "debt-1",
      status: "active",
      original_amount_cents: 100000,
    });
    await db.debts.add(debt);

    const payment = createTestPayment({
      debt_id: "debt-1",
      amount_cents: 30000, // Still active
    });
    await db.debtPayments.add(payment);

    const result = await updateDebtStatusFromBalance("debt-1", "external");

    expect(result.statusChanged).toBe(false);
    expect(result.newStatus).toBe("active");
    expect(result.oldStatus).toBe("active");
  });
});
```

**File location**: `src/lib/debts/__tests__/status.test.ts`

---

## Step 4: Unit Tests - Currency Utilities (15 minutes)

Test currency formatting and parsing.

**Create currency tests**:

```typescript
// src/lib/__tests__/currency.test.ts
import { describe, it, expect } from "vitest";
import { formatPHP, parsePHP, validateAmount } from "../currency";

describe("formatPHP", () => {
  it("should format positive amounts correctly", () => {
    expect(formatPHP(100)).toBe("₱1.00");
    expect(formatPHP(150050)).toBe("₱1,500.50");
    expect(formatPHP(100000000)).toBe("₱1,000,000.00");
  });

  it("should format negative amounts correctly", () => {
    expect(formatPHP(-100)).toBe("₱-1.00");
    expect(formatPHP(-150050)).toBe("₱-1,500.50");
  });

  it("should format zero correctly", () => {
    expect(formatPHP(0)).toBe("₱0.00");
  });

  it("should handle large numbers", () => {
    expect(formatPHP(99999999900)).toBe("₱999,999,999.00");
  });

  it("should handle fractional cents (round to 2 decimals)", () => {
    expect(formatPHP(150)).toBe("₱1.50");
    expect(formatPHP(155)).toBe("₱1.55");
  });
});

describe("parsePHP", () => {
  it("should parse formatted PHP strings", () => {
    expect(parsePHP("₱1.00")).toBe(100);
    expect(parsePHP("₱1,500.50")).toBe(150050);
    expect(parsePHP("₱1,000,000.00")).toBe(100000000);
  });

  it("should parse plain number strings", () => {
    expect(parsePHP("1.00")).toBe(100);
    expect(parsePHP("1500.50")).toBe(150050);
  });

  it("should parse numbers without decimals", () => {
    expect(parsePHP("1000")).toBe(100000);
    expect(parsePHP("₱1,000")).toBe(100000);
  });

  it("should parse numbers with single decimal", () => {
    expect(parsePHP("1000.5")).toBe(100050);
  });

  it("should handle numbers directly", () => {
    expect(parsePHP(1000.5)).toBe(100050);
    expect(parsePHP(1000)).toBe(100000);
  });

  it("should handle zero", () => {
    expect(parsePHP("0")).toBe(0);
    expect(parsePHP("₱0.00")).toBe(0);
  });

  it("should throw on invalid input", () => {
    expect(() => parsePHP("abc")).toThrow();
    expect(() => parsePHP("₱₱100")).toThrow();
  });
});

describe("validateAmount", () => {
  it("should validate amounts within range", () => {
    expect(validateAmount(100)).toBe(true); // ₱1.00 (min)
    expect(validateAmount(50000)).toBe(true); // ₱500.00
    expect(validateAmount(99999999900)).toBe(true); // ₱999,999,999.00 (max)
  });

  it("should reject amounts below minimum", () => {
    expect(validateAmount(0)).toBe(false);
    expect(validateAmount(99)).toBe(false); // ₱0.99
  });

  it("should reject amounts above maximum", () => {
    expect(validateAmount(100000000000)).toBe(false); // ₱1,000,000,000.00
  });

  it("should reject negative amounts", () => {
    expect(validateAmount(-100)).toBe(false);
  });

  it("should reject non-integer amounts", () => {
    expect(validateAmount(100.5)).toBe(false);
  });

  it("should handle boundary values correctly", () => {
    expect(validateAmount(100)).toBe(true); // Exactly ₱1.00
    expect(validateAmount(99)).toBe(false); // Just below
    expect(validateAmount(99999999900)).toBe(true); // Exactly ₱999,999,999.00
    expect(validateAmount(99999999901)).toBe(false); // Just above
  });
});
```

**File location**: `src/lib/__tests__/currency.test.ts`

---

## Step 5: Integration Tests - CRUD Operations (20 minutes)

Test complete CRUD workflows with event generation.

**Create CRUD tests**:

```typescript
// src/lib/debts/__tests__/crud.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/dexie";
import { createExternalDebt, getDebt, updateExternalDebt, deleteDebt, listDebts } from "../crud";

describe("External Debt CRUD", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
  });

  it("should create debt and generate event", async () => {
    const result = await createExternalDebt({
      household_id: "h1",
      name: "Car Loan",
      original_amount_cents: 100000,
    });

    expect(result.debt).toBeDefined();
    expect(result.debt.name).toBe("Car Loan");
    expect(result.debt.status).toBe("active");
    expect(result.event).toBeDefined();
    expect(result.event.op).toBe("create");
    expect(result.event.entityType).toBe("debt");

    // Verify debt in database
    const saved = await db.debts.get(result.debt.id);
    expect(saved).toBeDefined();

    // Verify event in database
    const event = await db.events.get(result.event.id);
    expect(event).toBeDefined();
    expect(event?.payload).toMatchObject({
      name: "Car Loan",
      original_amount_cents: 100000,
    });
  });

  it("should enforce name uniqueness for active debts", async () => {
    await createExternalDebt({
      household_id: "h1",
      name: "Car Loan",
      original_amount_cents: 100000,
    });

    await expect(
      createExternalDebt({
        household_id: "h1",
        name: "Car Loan", // Duplicate
        original_amount_cents: 50000,
      })
    ).rejects.toThrow("already exists");
  });

  it("should allow duplicate names for paid_off debts", async () => {
    const first = await createExternalDebt({
      household_id: "h1",
      name: "Car Loan",
      original_amount_cents: 100000,
    });

    // Mark first as paid_off
    await db.debts.update(first.debt.id, { status: "paid_off" });

    // Should allow creating another with same name
    const second = await createExternalDebt({
      household_id: "h1",
      name: "Car Loan",
      original_amount_cents: 50000,
    });

    expect(second.debt).toBeDefined();
    expect(second.debt.id).not.toBe(first.debt.id);
  });

  it("should update debt and generate delta event", async () => {
    const created = await createExternalDebt({
      household_id: "h1",
      name: "Car Loan",
      original_amount_cents: 100000,
      description: "Original description",
    });

    const result = await updateExternalDebt(created.debt.id, {
      name: "New Car Loan",
      description: "Updated description",
    });

    expect(result.debt.name).toBe("New Car Loan");
    expect(result.debt.description).toBe("Updated description");
    expect(result.event.op).toBe("update");

    // Event payload should only contain changed fields
    expect(result.event.payload).toEqual({
      name: "New Car Loan",
      description: "Updated description",
      updated_at: result.debt.updated_at,
    });
    expect(result.event.payload).not.toHaveProperty("original_amount_cents");
  });

  it("should delete debt and cascade to payments", async () => {
    const created = await createExternalDebt({
      household_id: "h1",
      name: "Car Loan",
      original_amount_cents: 100000,
    });

    // Add a payment
    await db.debtPayments.add({
      id: "pay-1",
      debt_id: created.debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-1",
      is_reversal: false,
      reverses_payment_id: null,
      household_id: "h1",
      device_id: "device-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const result = await deleteDebt(created.debt.id, "external");

    expect(result.event.op).toBe("delete");

    // Verify debt deleted
    const debt = await db.debts.get(created.debt.id);
    expect(debt).toBeUndefined();

    // Verify payments cascaded
    const payments = await db.debtPayments.where("debt_id").equals(created.debt.id).toArray();
    expect(payments).toHaveLength(0);
  });

  it("should list debts with filters", async () => {
    await createExternalDebt({
      household_id: "h1",
      name: "Debt 1",
      original_amount_cents: 100000,
    });

    const debt2 = await createExternalDebt({
      household_id: "h1",
      name: "Debt 2",
      original_amount_cents: 50000,
    });

    // Mark debt 2 as paid_off
    await db.debts.update(debt2.debt.id, { status: "paid_off" });

    await createExternalDebt({
      household_id: "h1",
      name: "Debt 3",
      original_amount_cents: 75000,
    });

    // List all
    const all = await listDebts("h1", "external");
    expect(all).toHaveLength(3);

    // List active only
    const active = await listDebts("h1", "external", { status: "active" });
    expect(active).toHaveLength(2);

    // List paid_off only
    const paidOff = await listDebts("h1", "external", { status: "paid_off" });
    expect(paidOff).toHaveLength(1);
  });
});
```

**File location**: `src/lib/debts/__tests__/crud.test.ts`

---

## Step 6: Integration Tests - Payment Processing (20 minutes)

Test payment creation with balance updates and event generation.

**Create payment tests**:

```typescript
// src/lib/debts/__tests__/payments.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/dexie";
import { createExternalDebt } from "../crud";
import { createDebtPayment } from "../payments";
import { calculateDebtBalance } from "../balance";

describe("Debt Payment Processing", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
  });

  it("should create payment and update balance", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    const result = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-1",
    });

    expect(result.payment).toBeDefined();
    expect(result.payment.amount_cents).toBe(30000);
    expect(result.newBalance).toBe(70000);
    expect(result.event).toBeDefined();
    expect(result.event.op).toBe("create");
    expect(result.event.entityType).toBe("debt_payment");
  });

  it("should update status to paid_off on full payment", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    const result = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 100000, // Full amount
      transaction_id: "txn-1",
    });

    expect(result.newBalance).toBe(0);
    expect(result.statusChanged).toBe(true);
    expect(result.newStatus).toBe("paid_off");

    const updated = await db.debts.get(debt.id);
    expect(updated?.status).toBe("paid_off");
  });

  it("should update status to overpaid on overpayment", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    const result = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 120000, // Overpayment
      transaction_id: "txn-1",
    });

    expect(result.newBalance).toBe(-20000);
    expect(result.statusChanged).toBe(true);
    expect(result.newStatus).toBe("overpaid");
  });

  it("should handle multiple sequential payments", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    // First payment
    const result1 = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-1",
    });
    expect(result1.newBalance).toBe(70000);
    expect(result1.newStatus).toBe("active");

    // Second payment
    const result2 = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 40000,
      transaction_id: "txn-2",
    });
    expect(result2.newBalance).toBe(30000);
    expect(result2.newStatus).toBe("active");

    // Third payment (full payoff)
    const result3 = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-3",
    });
    expect(result3.newBalance).toBe(0);
    expect(result3.newStatus).toBe("paid_off");
  });

  it("should generate event with payment idempotency key", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    const result = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-1",
    });

    // Event should reuse payment's idempotency key (from transaction)
    expect(result.event.idempotencyKey).toBe(result.payment.idempotency_key);
  });
});
```

**File location**: `src/lib/debts/__tests__/payments.test.ts`

---

## Step 7: Integration Tests - Reversal System (20 minutes)

Test reversal logic and cascading reversals.

**Create reversal tests**:

```typescript
// src/lib/debts/__tests__/reversals.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/dexie";
import { createExternalDebt } from "../crud";
import { createDebtPayment } from "../payments";
import { reverseDebtPayment } from "../reversals";

describe("Debt Payment Reversals", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  afterEach(async () => {
    await db.close();
  });

  it("should create reversal with negative amount", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    const { payment } = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-1",
    });

    const result = await reverseDebtPayment({
      payment_id: payment.id,
      reason: "Transaction edited",
    });

    expect(result.reversal.amount_cents).toBe(-30000);
    expect(result.reversal.is_reversal).toBe(true);
    expect(result.reversal.reverses_payment_id).toBe(payment.id);
    expect(result.newBalance).toBe(100000); // Back to original
  });

  it("should update status back to active after reversal", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    const { payment } = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 100000, // Full payoff
      transaction_id: "txn-1",
    });

    // Debt should be paid_off
    const debtAfterPayment = await db.debts.get(debt.id);
    expect(debtAfterPayment?.status).toBe("paid_off");

    // Reverse the payment
    const result = await reverseDebtPayment({
      payment_id: payment.id,
      reason: "Transaction deleted",
    });

    expect(result.statusChanged).toBe(true);
    expect(result.newStatus).toBe("active");
    expect(result.newBalance).toBe(100000);
  });

  it("should handle cascading reversal (reversing a reversal)", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    // Original payment
    const { payment } = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-1",
    });

    // First reversal (negative)
    const { reversal } = await reverseDebtPayment({
      payment_id: payment.id,
      reason: "Mistake",
    });

    // Reverse the reversal (should be positive, double negative)
    const result = await reverseDebtPayment({
      payment_id: reversal.id,
      reason: "Undo mistake",
    });

    expect(result.reversal.amount_cents).toBe(30000); // Positive
    expect(result.reversal.is_reversal).toBe(true);
    expect(result.newBalance).toBe(70000); // Same as original payment
  });

  it("should generate event for reversal", async () => {
    const { debt } = await createExternalDebt({
      household_id: "h1",
      name: "Test Debt",
      original_amount_cents: 100000,
    });

    const { payment } = await createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-1",
    });

    const result = await reverseDebtPayment({
      payment_id: payment.id,
      reason: "Test",
    });

    expect(result.event).toBeDefined();
    expect(result.event.op).toBe("create");
    expect(result.event.entityType).toBe("debt_payment");
    expect(result.event.payload).toMatchObject({
      is_reversal: true,
      reverses_payment_id: payment.id,
    });
  });
});
```

**File location**: `src/lib/debts/__tests__/reversals.test.ts`

---

## Step 8: E2E Tests - Debt CRUD Workflows (30 minutes)

Test complete user workflows with Playwright.

**Create E2E CRUD tests**:

```typescript
// tests/e2e/debts/external-debt-crud.spec.ts
import { test, expect } from "@playwright/test";

test.describe("External Debt CRUD", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to debts page
    await page.goto("/debts");
  });

  test("should create external debt via form", async ({ page }) => {
    // Click "Add Debt" button
    await page.click('button:has-text("Add Debt")');

    // Fill form
    await page.fill('input[name="name"]', "Car Loan");
    await page.fill('input[name="original_amount_cents"]', "10000.00");
    await page.fill('textarea[name="description"]', "Toyota Corolla");

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success toast
    await expect(page.locator(".sonner-toast")).toContainText("Debt created");

    // Verify debt appears in list
    await expect(page.locator('.debt-card:has-text("Car Loan")')).toBeVisible();

    // Verify balance shows correct amount
    await expect(page.locator('.debt-card:has-text("Car Loan") .debt-balance')).toContainText(
      "₱10,000.00"
    );
  });

  test("should show validation error for duplicate name", async ({ page }) => {
    // Create first debt
    await page.click('button:has-text("Add Debt")');
    await page.fill('input[name="name"]', "Car Loan");
    await page.fill('input[name="original_amount_cents"]', "10000.00");
    await page.click('button[type="submit"]');
    await expect(page.locator(".sonner-toast")).toContainText("created");

    // Try to create duplicate
    await page.click('button:has-text("Add Debt")');
    await page.fill('input[name="name"]', "Car Loan"); // Same name
    await page.fill('input[name="original_amount_cents"]', "5000.00");
    await page.click('button[type="submit"]');

    // Should show error
    await expect(page.locator(".form-error")).toContainText("already exists");
  });

  test("should update debt name and description", async ({ page }) => {
    // Create debt first
    await page.click('button:has-text("Add Debt")');
    await page.fill('input[name="name"]', "Car Loan");
    await page.fill('input[name="original_amount_cents"]', "10000.00");
    await page.click('button[type="submit"]');
    await expect(page.locator(".sonner-toast")).toContainText("created");

    // Click edit button
    await page.click('.debt-card:has-text("Car Loan") button[aria-label="Edit"]');

    // Update fields
    await page.fill('input[name="name"]', "New Car Loan");
    await page.fill('textarea[name="description"]', "Updated description");

    // Submit
    await page.click('button[type="submit"]');

    // Verify updates
    await expect(page.locator(".debt-card")).toContainText("New Car Loan");
    await expect(page.locator(".debt-card")).toContainText("Updated description");
  });

  test("should delete debt with confirmation", async ({ page }) => {
    // Create debt
    await page.click('button:has-text("Add Debt")');
    await page.fill('input[name="name"]', "Car Loan");
    await page.fill('input[name="original_amount_cents"]', "10000.00");
    await page.click('button[type="submit"]');
    await expect(page.locator(".sonner-toast")).toContainText("created");

    // Click delete button
    await page.click('.debt-card:has-text("Car Loan") button[aria-label="Delete"]');

    // Confirm deletion in dialog
    await page.click('button:has-text("Delete")'); // Confirmation button

    // Verify debt removed
    await expect(page.locator('.debt-card:has-text("Car Loan")')).not.toBeVisible();
    await expect(page.locator(".sonner-toast")).toContainText("deleted");
  });

  test("should filter debts by status", async ({ page }) => {
    // Create active debt
    await page.click('button:has-text("Add Debt")');
    await page.fill('input[name="name"]', "Active Debt");
    await page.fill('input[name="original_amount_cents"]', "10000.00");
    await page.click('button[type="submit"]');

    // TODO: Create paid_off debt (needs payment flow)

    // Filter by active
    await page.click('button:has-text("Filter")');
    await page.check('input[value="active"]');

    // Verify only active shown
    await expect(page.locator('.debt-card:has-text("Active Debt")')).toBeVisible();
  });
});
```

**File location**: `tests/e2e/debts/external-debt-crud.spec.ts`

---

## Step 9: E2E Tests - Payment Workflows (20 minutes)

Test payment creation through transaction form.

**Create E2E payment tests**:

```typescript
// tests/e2e/debts/debt-payments.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Debt Payment Workflows", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/debts");

    // Create a debt to pay
    await page.click('button:has-text("Add Debt")');
    await page.fill('input[name="name"]', "Car Loan");
    await page.fill('input[name="original_amount_cents"]', "10000.00");
    await page.click('button[type="submit"]');
    await expect(page.locator(".sonner-toast")).toContainText("created");
  });

  test("should create payment via transaction form", async ({ page }) => {
    // Navigate to transactions
    await page.goto("/transactions");

    // Click "Add Transaction"
    await page.click('button:has-text("Add Transaction")');

    // Fill transaction form
    await page.fill('input[name="amount"]', "3000.00");
    await page.selectOption('select[name="type"]', "expense");
    await page.selectOption('select[name="account_id"]', { index: 0 });

    // Link to debt
    await page.selectOption('select[name="debt_id"]', { label: "Car Loan" });

    // Submit
    await page.click('button[type="submit"]');
    await expect(page.locator(".sonner-toast")).toContainText("created");

    // Go back to debts page
    await page.goto("/debts");

    // Verify balance updated
    await expect(page.locator('.debt-card:has-text("Car Loan") .debt-balance')).toContainText(
      "₱7,000.00"
    );

    // Verify progress bar
    await expect(page.locator('.debt-card:has-text("Car Loan") .progress-bar')).toHaveAttribute(
      "aria-valuenow",
      "30"
    ); // 30% paid
  });

  test("should show overpayment warning", async ({ page }) => {
    await page.goto("/transactions");
    await page.click('button:has-text("Add Transaction")');

    await page.fill('input[name="amount"]', "15000.00"); // More than debt
    await page.selectOption('select[name="type"]', "expense");
    await page.selectOption('select[name="debt_id"]', { label: "Car Loan" });

    // Should show warning
    await expect(page.locator(".warning-message")).toContainText("overpayment");
  });

  test("should update status to paid_off on full payment", async ({ page }) => {
    await page.goto("/transactions");
    await page.click('button:has-text("Add Transaction")');

    // Full payment
    await page.fill('input[name="amount"]', "10000.00");
    await page.selectOption('select[name="type"]', "expense");
    await page.selectOption('select[name="debt_id"]', { label: "Car Loan" });
    await page.click('button[type="submit"]');

    await page.goto("/debts");

    // Verify status badge
    await expect(page.locator('.debt-card:has-text("Car Loan") .status-badge')).toContainText(
      "Paid Off"
    );

    // Verify balance
    await expect(page.locator('.debt-card:has-text("Car Loan") .debt-balance')).toContainText(
      "₱0.00"
    );
  });
});
```

**File location**: `tests/e2e/debts/debt-payments.spec.ts`

---

## Step 10: Run All Tests and Verify (15 minutes)

**Run unit tests**:

```bash
npm test
```

**Expected output**:

```
✓ src/lib/debts/__tests__/balance.test.ts (8 tests)
✓ src/lib/debts/__tests__/status.test.ts (6 tests)
✓ src/lib/__tests__/currency.test.ts (15 tests)
✓ src/lib/debts/__tests__/crud.test.ts (6 tests)
✓ src/lib/debts/__tests__/payments.test.ts (5 tests)
✓ src/lib/debts/__tests__/reversals.test.ts (4 tests)

Test Files: 6 passed (6)
Tests: 44 passed (44)
```

**Run E2E tests**:

```bash
npm run test:e2e
```

**Run specific test file**:

```bash
npm test balance.test.ts
npm run test:e2e external-debt-crud.spec.ts
```

**Generate coverage report**:

```bash
npm test -- --coverage
```

**Expected coverage**:

- Balance calculation: >95%
- Status logic: >95%
- Currency utilities: 100%
- CRUD operations: >90%
- Payment processing: >90%
- Reversal system: >90%

---

## Troubleshooting

### Issue: Tests fail with "Database not found"

**Cause**: IndexedDB not properly initialized in test environment

**Fix**:

```typescript
// Add to beforeEach
beforeEach(async () => {
  await db.delete(); // Clear previous
  await db.open(); // Recreate fresh
});
```

### Issue: E2E tests timeout

**Cause**: Selectors not found or slow page load

**Fix**:

```typescript
// Increase timeout
test.setTimeout(30000); // 30 seconds

// Wait for specific element
await page.waitForSelector(".debt-card", { timeout: 10000 });
```

### Issue: Currency tests fail with formatting differences

**Cause**: Locale differences between environments

**Fix**:

```typescript
// Use explicit locale in Intl.NumberFormat
new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
```

### Issue: Flaky tests (pass sometimes, fail sometimes)

**Cause**: Race conditions, async timing issues

**Fix**:

```typescript
// Use waitFor for async assertions
await waitFor(() => {
  expect(balance).toBe(70000);
});

// Or use Playwright's auto-waiting
await expect(page.locator(".balance")).toContainText("₱7,000.00");
```

---

## Next Steps

After completing this chunk:

1. **Review test coverage** - Ensure >90% coverage for critical paths
2. **Add edge case tests** - Identify and test boundary conditions
3. **Performance benchmarks** - Measure and document performance
4. **Accessibility audit** - Run axe-core and fix violations
5. **CI/CD integration** - Add tests to GitHub Actions workflow

**Congratulations!** 🎉 The debt tracking feature is now production-ready with comprehensive test coverage.

---

## Summary Checklist

- [ ] Test utilities created with factories
- [ ] Balance calculation tests (8 tests)
- [ ] Status logic tests (6 tests)
- [ ] Currency utility tests (15 tests)
- [ ] CRUD integration tests (6 tests)
- [ ] Payment processing tests (5 tests)
- [ ] Reversal system tests (4 tests)
- [ ] E2E CRUD workflow tests (5 tests)
- [ ] E2E payment workflow tests (3 tests)
- [ ] All tests passing
- [ ] Coverage >90% for critical paths

**Total time**: ~2-3 hours
