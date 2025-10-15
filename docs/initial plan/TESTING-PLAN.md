# Testing Plan

## Overview

Comprehensive testing strategy using Playwright for E2E tests, Vitest for unit tests, and synthetic data generation for realistic scenarios. Focus on offline functionality, sync reliability, and PHP currency accuracy.

## Table of Contents

### Testing Stack & Strategy

- [Testing Stack](#testing-stack) - Playwright, Vitest, Testing Library, k6, Percy
- [Test Categories](#test-categories) - Unit, Integration, E2E, Property-based, Load

### Unit & Integration Tests

- [Unit Tests (Vitest)](#1-unit-tests-vitest) - Currency, vector clocks, calculations
- [Integration Tests](#2-integration-tests) - Dexie, Supabase operations
- [Synthetic Data Generation](#5-synthetic-data-generation) - Test fixtures

### End-to-End Testing

- [E2E Tests (Playwright)](#3-e2e-tests-playwright) - Test config, critical flows
- [Test Configuration](#test-configuration) - Playwright setup
- [Critical User Flows](#critical-user-flows) - Offline sync, concurrent edits
- [PWA Installation Test](#pwa-installation-test) - PWA features

### Advanced Testing

- [Property-Based Testing](#4-property-based-testing-for-sync-conflicts) - Sync convergence
- [Sync Failure Scenarios](#sync-failure-scenarios) - Network failures, clock skew
- [Load Testing](#5-load-testing) - Performance, large datasets
- [Visual Regression Testing](#6-visual-regression-testing-optional) - Screenshot comparison

### Accessibility

- [Accessibility Testing](#7-accessibility-testing) - Complete a11y suite
  - [Automated Tests](#automated-accessibility-tests) - Axe, Lighthouse
  - [Keyboard Navigation](#keyboard-navigation-tests) - Tab, focus, escape
  - [Screen Reader Tests](#screen-reader-tests) - NVDA, JAWS, VoiceOver
  - [Semantic HTML](#semantic-html-tests) - Landmarks, headings, labels
  - [Manual Testing Checklist](#manual-accessibility-testing-checklist) - Human verification
  - [Lighthouse CI](#lighthouse-ci-integration) - Automated CI checks

### Operations

- [Test Execution Strategy](#test-execution-strategy) - Local & CI/CD
- [Test Data Management](#test-data-management) - Seeding, test users
- [Coverage Requirements](#coverage-requirements) - 75% overall target
- [Performance Benchmarks](#performance-benchmarks) - Load, render, sync times
- [Test Documentation](#test-documentation) - Writing guidelines
- [Troubleshooting Guide](#troubleshooting-guide) - Common issues
- [Test Maintenance](#test-maintenance) - Monthly & quarterly tasks

---

## Testing Stack

- **E2E Testing**: Playwright
- **Unit Testing**: Vitest
- **Component Testing**: Testing Library
- **Performance Testing**: Lighthouse CI
- **Load Testing**: k6
- **Visual Regression**: Percy (optional)

## Test Categories

### 1. Unit Tests (Vitest)

#### Currency Formatting

```typescript
// tests/unit/currency.test.ts
import { describe, it, expect } from "vitest";
import { formatPHP, parsePHP } from "@/utils/currency";

describe("PHP Currency Formatting", () => {
  it("formats cents to PHP display", () => {
    expect(formatPHP(150050)).toBe("₱1,500.50");
    expect(formatPHP(0)).toBe("₱0.00");
    expect(formatPHP(100)).toBe("₱1.00");
    expect(formatPHP(999999999)).toBe("₱9,999,999.99");
  });

  it("parses PHP input to cents", () => {
    expect(parsePHP("1,500.50")).toBe(150050);
    expect(parsePHP("₱1,500.50")).toBe(150050);
    expect(parsePHP("1500.50")).toBe(150050);
    expect(parsePHP("0")).toBe(0);
  });

  it("handles invalid input gracefully", () => {
    expect(parsePHP("invalid")).toBe(0);
    expect(parsePHP("")).toBe(0);
    expect(parsePHP(null)).toBe(0);
  });
});
```

#### Vector Clock Operations

```typescript
// tests/unit/vector-clock.test.ts
import { describe, it, expect } from "vitest";
import { VectorClock } from "@/sync/vector-clock";

describe("Per-Entity Vector Clocks", () => {
  it("compares vector clocks correctly", () => {
    const vc1 = { device1: 5, device2: 3 };
    const vc2 = { device1: 5, device2: 3 };
    const vc3 = { device1: 6, device2: 3 };
    const vc4 = { device1: 5, device2: 4 };
    const vc5 = { device1: 4, device2: 4 };

    expect(VectorClock.compare(vc1, vc2)).toBe("equal");
    expect(VectorClock.compare(vc3, vc1)).toBe("greater");
    expect(VectorClock.compare(vc1, vc4)).toBe("less");
    expect(VectorClock.compare(vc3, vc5)).toBe("concurrent");
  });

  it("merges vector clocks correctly", () => {
    const vc1 = { device1: 5, device2: 3 };
    const vc2 = { device1: 4, device2: 5, device3: 2 };

    const merged = VectorClock.merge(vc1, vc2);

    expect(merged).toEqual({
      device1: 5,
      device2: 5,
      device3: 2,
    });
  });

  it("increments clock for device", () => {
    const vc = { device1: 5, device2: 3 };
    const updated = VectorClock.increment(vc, "device1");

    expect(updated.device1).toBe(6);
    expect(updated.device2).toBe(3);
  });
});
```

#### Transaction Calculations

```typescript
// tests/unit/calculations.test.ts
import { describe, it, expect } from "vitest";
import { calculateBalance, calculateRunningTotal } from "@/utils/calculations";

describe("Transaction Calculations", () => {
  const transactions = [
    { type: "income", amount_cents: 500000, status: "cleared" },
    { type: "expense", amount_cents: 100000, status: "cleared" },
    { type: "expense", amount_cents: 50000, status: "pending" },
  ];

  it("calculates account balance correctly", () => {
    const balance = calculateBalance(transactions, 100000); // 1000 PHP initial
    expect(balance).toBe(450000); // 1000 + 5000 - 1000 - 500
  });

  it("calculates running totals", () => {
    const totals = calculateRunningTotal(transactions, 100000);
    expect(totals).toEqual([
      600000, // 1000 + 5000
      500000, // 6000 - 1000
      450000, // 5000 - 500
    ]);
  });

  it("filters by status correctly", () => {
    const cleared = calculateBalance(transactions, 0, "cleared");
    expect(cleared).toBe(400000); // 5000 - 1000
  });
});
```

### 2. Integration Tests

#### Dexie Offline Storage

```typescript
// tests/integration/dexie.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie";

describe("Dexie Offline Storage", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("stores transactions offline", async () => {
    const tx = {
      id: "tx-1",
      amount_cents: 10000,
      type: "expense",
      description: "Test transaction",
      date: new Date().toISOString(),
    };

    await db.transactions.add(tx);
    const stored = await db.transactions.get("tx-1");

    expect(stored).toMatchObject(tx);
  });

  it("handles sync queue", async () => {
    const queueItem = {
      entityType: "transaction",
      entityId: "tx-1",
      operation: "create",
      state: "queued",
    };

    await db.syncQueue.add(queueItem);
    const queued = await db.syncQueue.where("state").equals("queued").toArray();

    expect(queued).toHaveLength(1);
  });
});
```

#### Supabase Operations

```typescript
// tests/integration/supabase.test.ts
import { describe, it, expect } from "vitest";
import { supabase } from "@/lib/supabase";

describe("Supabase Operations", () => {
  it("respects RLS policies for transactions", async () => {
    // Create household transaction
    const { data: household } = await supabase
      .from("transactions")
      .insert({
        amount_cents: 10000,
        type: "expense",
        visibility: "household",
        description: "Groceries",
      })
      .select()
      .single();

    expect(household).toBeDefined();

    // Create personal transaction
    const { data: personal } = await supabase
      .from("transactions")
      .insert({
        amount_cents: 5000,
        type: "expense",
        visibility: "personal",
        description: "Personal",
      })
      .select()
      .single();

    expect(personal).toBeDefined();
  });
});
```

### 3. E2E Tests (Playwright)

#### Test Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 12"] },
    },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
});
```

#### Critical User Flows

```typescript
// tests/e2e/critical-flows.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Critical User Flows", () => {
  test("create transaction offline and sync", async ({ page }) => {
    await page.goto("/transactions");

    // Go offline
    await page.context().setOffline(true);

    // Create transaction
    await page.getByRole("button", { name: "Add Transaction" }).click();
    await page.getByLabel("Amount").fill("1,500.50");
    await page.getByLabel("Type").selectOption("expense");
    await page.getByLabel("Description").fill("Groceries");
    await page.getByLabel("Account").selectOption("Cash");
    await page.getByLabel("Category").selectOption("Food");
    await page.getByRole("button", { name: "Save" }).click();

    // Verify transaction appears
    await expect(page.getByText("Groceries")).toBeVisible();
    await expect(page.getByText("₱1,500.50")).toBeVisible();

    // Verify offline indicator
    await expect(page.getByTestId("offline-indicator")).toBeVisible();

    // Go online
    await page.context().setOffline(false);

    // Wait for sync
    await expect(page.getByTestId("sync-indicator")).toHaveText("Synced");

    // Refresh and verify persistence
    await page.reload();
    await expect(page.getByText("Groceries")).toBeVisible();
  });

  test("calculate running totals correctly", async ({ page }) => {
    await page.goto("/accounts");

    // Initial balance
    const initialBalance = await page.getByTestId("account-balance-cash").textContent();
    expect(initialBalance).toBe("₱10,000.00");

    // Add income
    await page.getByRole("button", { name: "Add Transaction" }).click();
    await page.getByLabel("Amount").fill("5,000");
    await page.getByLabel("Type").selectOption("income");
    await page.getByRole("button", { name: "Save" }).click();

    // Verify updated balance
    await expect(page.getByTestId("account-balance-cash")).toHaveText("₱15,000.00");

    // Add expense
    await page.getByRole("button", { name: "Add Transaction" }).click();
    await page.getByLabel("Amount").fill("2,500");
    await page.getByLabel("Type").selectOption("expense");
    await page.getByRole("button", { name: "Save" }).click();

    // Verify final balance
    await expect(page.getByTestId("account-balance-cash")).toHaveText("₱12,500.00");
  });

  test("handle concurrent edits with conflict resolution", async ({ browser }) => {
    // Create two browser contexts (simulate two devices)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Both load the same transaction
    await page1.goto("/transactions/tx-123/edit");
    await page2.goto("/transactions/tx-123/edit");

    // Both go offline
    await context1.setOffline(true);
    await context2.setOffline(true);

    // Device 1 changes amount
    await page1.getByLabel("Amount").fill("2,000");
    await page1.getByRole("button", { name: "Save" }).click();

    // Device 2 changes description
    await page2.getByLabel("Description").fill("Updated description");
    await page2.getByRole("button", { name: "Save" }).click();

    // Both go online
    await context1.setOffline(false);
    await context2.setOffline(false);

    // Wait for sync
    await page1.waitForTimeout(2000);
    await page2.waitForTimeout(2000);

    // Reload both
    await page1.reload();
    await page2.reload();

    // Both should have merged changes (field-level merge)
    await expect(page1.getByLabel("Amount")).toHaveValue("2,000");
    await expect(page1.getByLabel("Description")).toHaveValue("Updated description");

    await expect(page2.getByLabel("Amount")).toHaveValue("2,000");
    await expect(page2.getByLabel("Description")).toHaveValue("Updated description");
  });
});
```

#### PWA Installation Test

```typescript
// tests/e2e/pwa.spec.ts
import { test, expect } from "@playwright/test";

test.describe("PWA Features", () => {
  test("shows install prompt", async ({ page }) => {
    await page.goto("/");

    // Wait for install prompt
    const installPrompt = page.getByTestId("install-prompt");
    await expect(installPrompt).toBeVisible({ timeout: 10000 });

    // Click install
    await installPrompt.getByRole("button", { name: "Install" }).click();

    // Verify installation (mock for testing)
    await expect(page.getByText("App installed")).toBeVisible();
  });

  test("works offline after caching", async ({ page }) => {
    // First visit to cache resources
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Go offline
    await page.context().setOffline(true);

    // Navigate should still work
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    // Can still view cached data
    await expect(page.getByTestId("transaction-list")).toBeVisible();
  });
});
```

### 4. Property-Based Testing for Sync Conflicts

**⚠️ CI Strategy (Decision #85)**: Property-based tests run nightly only to keep PR CI fast.

**Test Schedule**:

- **PR CI**: Unit + integration + E2E (~3 min) - property tests excluded
- **Nightly CI**: All tests including property-based (~15 min)
- **Manual**: `RUN_PROPERTY_TESTS=1 npm test`

Using fast-check for property-based testing to ensure sync convergence:

```typescript
// tests/sync/property-based.test.ts
import fc from "fast-check";
import { describe, it, expect } from "vitest";
import { SyncEngine, ConflictResolver } from "@/sync";
import { createMockDevice } from "@/tests/utils";

describe("Sync Convergence Properties", () => {
  // Property 1: All devices eventually converge to the same state
  it("converges regardless of event order", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            deviceId: fc.string(),
            entityId: fc.uuid(),
            operation: fc.constantFrom("create", "update", "delete"),
            timestamp: fc.integer({ min: 1000000, max: 9999999 }),
            data: fc.object(),
          }),
          { minLength: 1, maxLength: 100 }
        ),
        async (events) => {
          // Shuffle events and apply to different devices
          const device1 = createMockDevice("device1");
          const device2 = createMockDevice("device2");

          // Apply events in different orders
          const shuffled1 = [...events].sort(() => Math.random() - 0.5);
          const shuffled2 = [...events].sort(() => Math.random() - 0.5);

          await device1.applyEvents(shuffled1);
          await device2.applyEvents(shuffled2);

          // Both devices should have same final state
          expect(device1.getState()).toEqual(device2.getState());
        }
      ),
      { numRuns: 1000 }
    );
  });

  // Property 2: Conflict resolution is deterministic
  it("resolves conflicts deterministically", () => {
    fc.assert(
      fc.property(
        fc.record({
          local: fc.object(),
          remote: fc.object(),
          localTime: fc.integer(),
          remoteTime: fc.integer(),
          localDevice: fc.string(),
          remoteDevice: fc.string(),
        }),
        (conflictData) => {
          const resolver = new ConflictResolver();

          // Resolution should be deterministic
          const result1 = resolver.resolve(conflictData);
          const result2 = resolver.resolve(conflictData);

          expect(result1).toEqual(result2);

          // Result should be one of the inputs (LWW)
          expect([conflictData.local, conflictData.remote]).toContainEqual(result1);
        }
      ),
      { numRuns: 1000 }
    );
  });

  // Property 3: Transfer integrity maintained
  it("maintains transfer integrity across sync", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            transferGroupId: fc.uuid(),
            transactions: fc.array(
              fc.record({
                type: fc.constantFrom("income", "expense"),
                amount_cents: fc.integer({ min: 100, max: 999999 }),
                account_id: fc.uuid(),
              }),
              { minLength: 2, maxLength: 2 }
            ),
          })
        ),
        async (transfers) => {
          const syncEngine = new SyncEngine();

          for (const transfer of transfers) {
            await syncEngine.createTransfer(transfer);
          }

          // Verify all transfers maintain integrity
          const allTransfers = await syncEngine.getTransfers();
          for (const transfer of allTransfers) {
            // Exactly 2 transactions
            expect(transfer.transactions).toHaveLength(2);

            // Opposite types
            const types = transfer.transactions.map((t) => t.type);
            expect(types).toContain("income");
            expect(types).toContain("expense");

            // Same amount
            const amounts = transfer.transactions.map((t) => t.amount_cents);
            expect(amounts[0]).toBe(amounts[1]);
          }
        }
      ),
      { numRuns: 500 }
    );
  });

  // Property 4: No data loss under concurrent modifications
  it("preserves all data under concurrent modifications", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            deviceId: fc.string(),
            operations: fc.array(fc.constantFrom("create", "update", "delete")),
            delays: fc.array(fc.integer({ min: 0, max: 100 })),
          }),
          { minLength: 2, maxLength: 5 }
        ),
        async (deviceOps) => {
          const syncEngine = new SyncEngine();
          const entityId = "test-entity";
          const initialEventCount = await syncEngine.getEventCount();

          // Simulate concurrent operations
          const promises = deviceOps.map(async ({ deviceId, operations, delays }) => {
            for (let i = 0; i < operations.length; i++) {
              await new Promise((resolve) => setTimeout(resolve, delays[i]));
              await syncEngine.applyOperation(entityId, operations[i], deviceId);
            }
          });

          await Promise.all(promises);

          // All operations should be recorded as events
          const finalEventCount = await syncEngine.getEventCount();
          const expectedEvents = deviceOps.reduce((sum, d) => sum + d.operations.length, 0);

          expect(finalEventCount - initialEventCount).toBe(expectedEvents);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("Sync Failure Scenarios", () => {
  // Test network failures
  it("handles intermittent network failures", async () => {
    const scenarios = [
      "timeout",
      "connection-refused",
      "partial-response",
      "500-error",
      "rate-limit",
    ];

    for (const scenario of scenarios) {
      const syncEngine = new SyncEngine();

      // Simulate failure
      syncEngine.mockNetworkFailure(scenario);

      // Should queue for retry
      await syncEngine.sync();
      expect(syncEngine.getQueueLength()).toBeGreaterThan(0);

      // Should eventually succeed with retries
      syncEngine.clearNetworkMock();
      await syncEngine.processQueue();
      expect(syncEngine.getQueueLength()).toBe(0);
    }
  });

  // Test clock skew
  it("handles device clock skew", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -86400000, max: 86400000 }), // ±1 day in ms
        async (clockSkew) => {
          const device1 = createMockDevice("device1");
          const device2 = createMockDevice("device2", { clockSkew });

          // Both create same entity
          const entity = { id: "test", value: "initial" };
          await device1.create(entity);
          await device2.create(entity);

          // Sync should handle clock skew
          await device1.sync();
          await device2.sync();

          // Should converge despite skew
          expect(device1.getEntity(entity.id)).toBeDefined();
          expect(device2.getEntity(entity.id)).toBeDefined();
        }
      )
    );
  });
});
```

### 5. Load Testing

#### Transaction Performance

```javascript
// tests/load/transactions.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 }, // Ramp up
    { duration: "1m", target: 20 }, // Stay at 20 users
    { duration: "30s", target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<2000"], // 95% of requests under 2s
    http_req_failed: ["rate<0.1"], // Error rate under 10%
  },
};

export default function () {
  // Create transaction
  const payload = JSON.stringify({
    amount_cents: Math.floor(Math.random() * 100000),
    type: Math.random() > 0.5 ? "income" : "expense",
    description: `Load test ${Date.now()}`,
    visibility: "household",
  });

  const params = {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${__ENV.AUTH_TOKEN}`,
    },
  };

  const res = http.post("http://localhost:3000/api/transactions", payload, params);

  check(res, {
    "status is 201": (r) => r.status === 201,
    "transaction created": (r) => r.json("id") !== undefined,
  });

  sleep(1);
}
```

#### Large Dataset Rendering

```javascript
// tests/load/render-10k.js
import { chromium } from "k6/experimental/browser";
import { check } from "k6";

export const options = {
  scenarios: {
    browser: {
      executor: "constant-vus",
      vus: 1,
      duration: "2m",
    },
  },
};

export default async function () {
  const browser = chromium.launch({ headless: true });
  const page = browser.newPage();

  try {
    // Load page with 10k transactions
    await page.goto("http://localhost:5173/test/large-dataset");

    // Measure render time
    const renderTime = await page.evaluate(() => {
      return performance.measure("render").duration;
    });

    check(renderTime, {
      "renders under 2s": (t) => t < 2000,
    });

    // Test virtual scrolling
    await page.evaluate(() => {
      document.querySelector(".transaction-list").scrollTop = 10000;
    });

    // Verify smooth scrolling
    const fps = await page.evaluate(() => {
      return window.__FPS__; // Custom FPS counter
    });

    check(fps, {
      "maintains 30+ FPS": (f) => f >= 30,
    });
  } finally {
    page.close();
    browser.close();
  }
}
```

### 5. Synthetic Data Generation

```typescript
// tests/fixtures/data-generator.ts
import { faker } from "@faker-js/faker";

export class TestDataGenerator {
  generateTransaction(overrides = {}) {
    return {
      id: faker.string.uuid(),
      amount_cents: faker.number.int({ min: 100, max: 1000000 }),
      type: faker.helpers.arrayElement(["income", "expense"]),
      description: faker.commerce.productName(),
      date: faker.date.recent({ days: 30 }).toISOString(),
      status: faker.helpers.arrayElement(["pending", "cleared"]),
      visibility: faker.helpers.arrayElement(["household", "personal"]),
      category_id: faker.string.uuid(),
      account_id: faker.string.uuid(),
      created_by_user_id: faker.string.uuid(),
      device_id: faker.string.alphanumeric(16),
      ...overrides,
    };
  }

  generateAccount(overrides = {}) {
    return {
      id: faker.string.uuid(),
      name: faker.helpers.arrayElement(["Cash", "Checking", "Savings", "Credit Card"]),
      type: faker.helpers.arrayElement(["bank", "cash", "credit_card"]),
      initial_balance_cents: faker.number.int({ min: 0, max: 10000000 }),
      currency_code: "PHP",
      visibility: faker.helpers.arrayElement(["household", "personal"]),
      ...overrides,
    };
  }

  generateCategory(overrides = {}) {
    const parentCategories = ["Living", "Transportation", "Food", "Entertainment", "Savings"];
    const isParent = faker.datatype.boolean();

    return {
      id: faker.string.uuid(),
      name: isParent ? faker.helpers.arrayElement(parentCategories) : faker.commerce.department(),
      parent_id: isParent ? null : faker.string.uuid(),
      color: faker.internet.color(),
      icon: faker.helpers.arrayElement(["folder", "tag", "star", "heart"]),
      ...overrides,
    };
  }

  generateBulkTransactions(count: number) {
    return Array.from({ length: count }, () => this.generateTransaction());
  }

  generateRealisticMonthlyData() {
    const transactions = [];
    const now = new Date();

    // Fixed expenses
    transactions.push(
      this.generateTransaction({
        description: "Rent",
        amount_cents: 3000000, // 30,000 PHP
        type: "expense",
        date: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        status: "cleared",
      }),
      this.generateTransaction({
        description: "Internet",
        amount_cents: 159900, // 1,599 PHP
        type: "expense",
        date: new Date(now.getFullYear(), now.getMonth(), 5).toISOString(),
        status: "cleared",
      })
    );

    // Income
    transactions.push(
      this.generateTransaction({
        description: "Salary",
        amount_cents: 7500000, // 75,000 PHP
        type: "income",
        date: new Date(now.getFullYear(), now.getMonth(), 15).toISOString(),
        status: "cleared",
      })
    );

    // Variable expenses
    for (let i = 0; i < 20; i++) {
      transactions.push(this.generateTransaction());
    }

    return transactions;
  }
}
```

### 6. Visual Regression Testing (Optional)

```typescript
// tests/visual/snapshots.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Visual Regression", () => {
  test("dashboard layout", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveScreenshot("dashboard.png");
  });

  test("transaction form", async ({ page }) => {
    await page.goto("/transactions/new");
    await expect(page).toHaveScreenshot("transaction-form.png");
  });

  test("mobile responsive", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    await expect(page).toHaveScreenshot("mobile-home.png");
  });
});
```

### 7. Accessibility Testing

#### Automated Accessibility Tests

**Pass Criteria:**

- ✅ Lighthouse Accessibility Score ≥ 95
- ✅ Axe Critical Violations = 0
- ✅ Axe Serious Violations = 0
- ✅ All keyboard navigation flows working
- ✅ All screen reader announcements correct

```typescript
// tests/accessibility/a11y.spec.ts
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility Compliance", () => {
  test("homepage passes axe accessibility scan", async ({ page }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    // Critical: No violations allowed
    expect(accessibilityScanResults.violations).toHaveLength(0);
  });

  test("transaction form passes accessibility scan", async ({ page }) => {
    await page.goto("/transactions/new");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toHaveLength(0);
  });

  test("budget dashboard passes accessibility scan", async ({ page }) => {
    await page.goto("/budget");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .exclude("#third-party-widget") // Exclude external widgets
      .analyze();

    expect(accessibilityScanResults.violations).toHaveLength(0);
  });

  test("reports page passes accessibility scan", async ({ page }) => {
    await page.goto("/reports");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toHaveLength(0);
  });
});
```

#### Keyboard Navigation Tests

```typescript
// tests/accessibility/keyboard-nav.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Keyboard Navigation", () => {
  test("can navigate entire app with keyboard only", async ({ page }) => {
    await page.goto("/");

    // Tab through main navigation
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute("data-nav", "dashboard");

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute("data-nav", "transactions");

    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute("data-nav", "budget");

    // Enter transactions page with Enter
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/.*transactions/);
  });

  test("can create transaction using keyboard only", async ({ page }) => {
    await page.goto("/transactions");

    // Focus "Add Transaction" button with Tab
    await page.keyboard.press("Tab"); // Skip nav
    await page.keyboard.press("Tab"); // Focus add button
    await page.keyboard.press("Enter");

    // Fill form with keyboard
    await page.keyboard.type("1500.50"); // Amount field auto-focused
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown"); // Select expense type
    await page.keyboard.press("Tab");
    await page.keyboard.type("Groceries"); // Description
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown"); // Select category
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter"); // Save button

    // Verify transaction created
    await expect(page.getByText("Groceries")).toBeVisible();
  });

  test("can use arrow keys in transaction list", async ({ page }) => {
    await page.goto("/transactions");

    // Focus first transaction
    const firstTx = page.getByTestId("transaction-item").first();
    await firstTx.focus();

    // Navigate down with arrow key
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("transaction-item").nth(1)).toBeFocused();

    // Navigate up
    await page.keyboard.press("ArrowUp");
    await expect(page.getByTestId("transaction-item").first()).toBeFocused();

    // Open with Enter
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/.*transactions\/.*\/edit/);
  });

  test("can close modals with Escape key", async ({ page }) => {
    await page.goto("/transactions");

    // Open transaction form modal
    await page.getByRole("button", { name: "Add Transaction" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Close with Escape
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("skip to main content link works", async ({ page }) => {
    await page.goto("/");

    // First Tab should focus skip link
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute("aria-label", "Skip to main content");

    // Activate skip link
    await page.keyboard.press("Enter");

    // Focus should move to main content
    await expect(page.locator("main")).toBeFocused();
  });

  test("focus trap works in modals", async ({ page }) => {
    await page.goto("/transactions/new");

    // Tab through all focusable elements in modal
    const focusableElements = await page.locator('dialog [tabindex]:not([tabindex="-1"])').count();

    // Tab through all elements
    for (let i = 0; i < focusableElements; i++) {
      await page.keyboard.press("Tab");
    }

    // Next Tab should cycle back to first element (focus trap)
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveAttribute("data-first-focusable", "true");
  });
});
```

#### Screen Reader Tests

```typescript
// tests/accessibility/screen-reader.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Screen Reader Announcements", () => {
  test("announces page navigation", async ({ page }) => {
    await page.goto("/");

    // Check for aria-live region
    const liveRegion = page.getByRole("status", { name: "page-announcements" });
    await expect(liveRegion).toBeAttached();

    // Navigate to transactions
    await page.getByRole("link", { name: "Transactions" }).click();

    // Verify announcement
    await expect(liveRegion).toHaveText("Navigated to Transactions page");
  });

  test("announces transaction creation", async ({ page }) => {
    await page.goto("/transactions");

    const liveRegion = page.getByRole("status");

    // Create transaction
    await page.getByRole("button", { name: "Add Transaction" }).click();
    await page.getByLabel("Amount").fill("1500.50");
    await page.getByLabel("Description").fill("Test");
    await page.getByRole("button", { name: "Save" }).click();

    // Verify success announcement
    await expect(liveRegion).toHaveText(/Transaction created successfully/);
  });

  test("announces sync status changes", async ({ page }) => {
    await page.goto("/");

    const syncStatus = page.getByRole("status", { name: "sync-status" });

    // Go offline
    await page.context().setOffline(true);
    await expect(syncStatus).toHaveText("Offline mode active");

    // Go online
    await page.context().setOffline(false);
    await expect(syncStatus).toHaveText(/Syncing|Synced/);
  });

  test("form validation errors are announced", async ({ page }) => {
    await page.goto("/transactions/new");

    // Submit form without required fields
    await page.getByRole("button", { name: "Save" }).click();

    // Verify error announcements
    const errorSummary = page.getByRole("alert", { name: "form-errors" });
    await expect(errorSummary).toBeVisible();
    await expect(errorSummary).toContainText("Amount is required");
    await expect(errorSummary).toContainText("Description is required");

    // Individual field errors should also be announced
    await expect(page.getByLabel("Amount")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Amount")).toHaveAttribute("aria-describedby");
  });

  test("budget progress is announced", async ({ page }) => {
    await page.goto("/budget");

    // Check progress bar has proper labels
    const foodBudget = page.getByRole("progressbar", { name: /Food budget/ });
    await expect(foodBudget).toHaveAttribute("aria-valuenow");
    await expect(foodBudget).toHaveAttribute("aria-valuemin", "0");
    await expect(foodBudget).toHaveAttribute("aria-valuemax");
    await expect(foodBudget).toHaveAttribute("aria-valuetext"); // e.g., "1,200 of 2,000 PHP spent"
  });

  test("loading states are announced", async ({ page }) => {
    await page.goto("/transactions");

    // Trigger data loading
    await page.getByRole("button", { name: "Load More" }).click();

    // Verify loading announcement
    const loadingStatus = page.getByRole("status", { name: "loading" });
    await expect(loadingStatus).toHaveText("Loading transactions");

    // Verify completion announcement
    await expect(loadingStatus).toHaveText("10 more transactions loaded");
  });
});
```

#### Semantic HTML Tests

```typescript
// tests/accessibility/semantics.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Semantic HTML Structure", () => {
  test("has proper heading hierarchy", async ({ page }) => {
    await page.goto("/");

    // Check for single h1
    const h1Count = await page.locator("h1").count();
    expect(h1Count).toBe(1);

    // Check heading order (no skipped levels)
    const headings = await page.locator("h1, h2, h3, h4, h5, h6").allTextContents();
    // Verify no h3 before h2, etc.
  });

  test("uses proper landmark regions", async ({ page }) => {
    await page.goto("/");

    // Required landmarks
    await expect(page.locator('header[role="banner"], header:not([role])')).toBeVisible();
    await expect(page.locator('nav[role="navigation"], nav:not([role])')).toBeVisible();
    await expect(page.locator('main[role="main"], main:not([role])')).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"], footer:not([role])')).toBeVisible();
  });

  test("form inputs have associated labels", async ({ page }) => {
    await page.goto("/transactions/new");

    // All inputs must have labels
    const inputs = await page.locator("input, select, textarea").all();

    for (const input of inputs) {
      const id = await input.getAttribute("id");
      const ariaLabel = await input.getAttribute("aria-label");
      const ariaLabelledBy = await input.getAttribute("aria-labelledby");

      // Must have either: label[for], aria-label, or aria-labelledby
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        const hasLabel = (await label.count()) > 0;
        expect(hasLabel || ariaLabel || ariaLabelledBy).toBeTruthy();
      }
    }
  });

  test("buttons have accessible names", async ({ page }) => {
    await page.goto("/");

    const buttons = await page.locator("button").all();

    for (const button of buttons) {
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute("aria-label");
      const ariaLabelledBy = await button.getAttribute("aria-labelledby");

      // Button must have visible text, aria-label, or aria-labelledby
      expect(text?.trim() || ariaLabel || ariaLabelledBy).toBeTruthy();
    }
  });

  test("images have alt text", async ({ page }) => {
    await page.goto("/");

    const images = await page.locator("img").all();

    for (const img of images) {
      const alt = await img.getAttribute("alt");
      const role = await img.getAttribute("role");

      // Images must have alt text or role="presentation" for decorative images
      expect(alt !== null || role === "presentation").toBeTruthy();
    }
  });
});
```

#### Manual Accessibility Testing Checklist

**Testing with Assistive Technologies:**

```markdown
## Manual Accessibility Test Checklist

### Screen Reader Testing (NVDA/JAWS/VoiceOver)

- [ ] All navigation items are announced correctly
- [ ] Page titles are announced on navigation
- [ ] Form labels are announced when focusing inputs
- [ ] Error messages are announced immediately
- [ ] Success messages are announced in live regions
- [ ] Table headers are announced when navigating cells
- [ ] Modal dialogs trap focus and announce title
- [ ] Loading states are announced
- [ ] Dynamic content changes are announced
- [ ] All interactive elements have accessible names

### Keyboard-Only Navigation

- [ ] All interactive elements are reachable via Tab
- [ ] Focus indicators are clearly visible
- [ ] Tab order follows logical reading order
- [ ] Escape key closes modals and dropdowns
- [ ] Enter/Space activate buttons and links
- [ ] Arrow keys navigate within components (lists, menus)
- [ ] Ctrl+Home/End navigate to start/end of lists
- [ ] No keyboard traps (can Tab out of all sections)
- [ ] Skip navigation link works

### Visual Accessibility

- [ ] All text meets 4.5:1 contrast ratio (WCAG AA)
- [ ] Large text (18pt+) meets 3:1 contrast ratio
- [ ] Focus indicators are visible and meet 3:1 contrast
- [ ] Color is not the only means of conveying information
- [ ] Text can be resized to 200% without loss of content
- [ ] Content reflows at 320px viewport width
- [ ] No horizontal scrolling at 1280px width
- [ ] Animations can be disabled (prefers-reduced-motion)

### Form Accessibility

- [ ] All form fields have visible labels
- [ ] Required fields are indicated (not color-only)
- [ ] Error messages are associated with fields (aria-describedby)
- [ ] Error summary appears at top of form
- [ ] Success confirmations are announced
- [ ] Autocomplete attributes used where appropriate
- [ ] Field validation occurs without page refresh

### Touch Target Size (Mobile)

- [ ] All touch targets are at least 44x44 CSS pixels
- [ ] Adequate spacing between touch targets (8px min)
- [ ] Gestures have alternatives (e.g., swipe + button)
- [ ] Pinch-to-zoom is not disabled

### Content Accessibility

- [ ] Headings follow proper hierarchy (no skipped levels)
- [ ] Lists use proper semantic HTML (<ul>, <ol>)
- [ ] Tables have <thead>, <tbody>, proper headers
- [ ] Links are descriptive (avoid "click here")
- [ ] Language is specified in HTML (<html lang="en">)
- [ ] Page has a descriptive <title>
- [ ] Landmarks (header, nav, main, aside, footer) are used
```

#### Lighthouse CI Integration

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI

on:
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run build

      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          urls: |
            http://localhost:5173
            http://localhost:5173/transactions
            http://localhost:5173/budget
            http://localhost:5173/reports
          uploadArtifacts: true
          temporaryPublicStorage: true

      - name: Check Accessibility Score
        run: |
          # Fail if accessibility score < 95
          score=$(jq '.[] | select(.url == "http://localhost:5173") | .categories.accessibility.score' lighthouseci/manifest.json)
          if (( $(echo "$score < 0.95" | bc -l) )); then
            echo "Accessibility score $score is below 95"
            exit 1
          fi
```

#### Accessibility Configuration

```typescript
// .lighthouserc.js
module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      startServerCommand: "npm run preview",
      url: [
        "http://localhost:5173",
        "http://localhost:5173/transactions",
        "http://localhost:5173/budget",
      ],
    },
    assert: {
      preset: "lighthouse:recommended",
      assertions: {
        "categories:accessibility": ["error", { minScore: 0.95 }],
        "categories:performance": ["warn", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.9 }],

        // Specific accessibility rules
        "color-contrast": "error",
        "heading-order": "error",
        "html-has-lang": "error",
        "valid-lang": "error",
        "aria-required-attr": "error",
        "button-name": "error",
        "image-alt": "error",
        label: "error",
        "link-name": "error",
        list: "error",
        listitem: "error",
        "meta-viewport": "error",
        tabindex: "error",
        "td-headers-attr": "error",
        "th-has-data-cells": "error",
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
```

## Test Execution Strategy

### Local Development

```bash
# Unit tests (watch mode)
npm run test:unit -- --watch

# Integration tests
npm run test:integration

# E2E tests (headed)
npm run test:e2e -- --headed

# Specific test file
npm run test:e2e -- tests/e2e/critical-flows.spec.ts
```

### CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: "20"
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/

  load-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - run: |
          wget https://github.com/grafana/k6/releases/download/v0.47.0/k6-v0.47.0-linux-amd64.tar.gz
          tar -xzf k6-v0.47.0-linux-amd64.tar.gz
          sudo mv k6-v0.47.0-linux-amd64/k6 /usr/local/bin/
      - run: k6 run tests/load/transactions.js
```

## Test Data Management

### Database Seeding

```typescript
// scripts/seed-test-data.ts
import { supabase } from "@/lib/supabase";
import { TestDataGenerator } from "@/tests/fixtures/data-generator";

async function seedTestData() {
  const generator = new TestDataGenerator();

  // Clear existing data
  await supabase.from("transactions").delete().neq("id", "");

  // Seed accounts
  const accounts = [
    generator.generateAccount({ name: "Cash", initial_balance_cents: 1000000 }),
    generator.generateAccount({ name: "BDO Savings", initial_balance_cents: 5000000 }),
    generator.generateAccount({ name: "Credit Card", initial_balance_cents: 0 }),
  ];

  await supabase.from("accounts").insert(accounts);

  // Seed categories
  const categories = [
    { name: "Living Expenses", parent_id: null },
    { name: "Food & Dining", parent_id: null },
    { name: "Transportation", parent_id: null },
  ];

  await supabase.from("categories").insert(categories);

  // Seed transactions
  const transactions = generator.generateRealisticMonthlyData();
  await supabase.from("transactions").insert(transactions);

  console.log("Test data seeded successfully");
}

seedTestData();
```

### Test User Management

```typescript
// tests/helpers/test-users.ts
export async function createTestUser(email = "test@example.com") {
  const { data: user } = await supabase.auth.signUp({
    email,
    password: "testpassword123",
  });

  return user;
}

export async function loginTestUser(email = "test@example.com") {
  const { data: session } = await supabase.auth.signInWithPassword({
    email,
    password: "testpassword123",
  });

  return session;
}

export async function cleanupTestUser(userId: string) {
  await supabase.auth.admin.deleteUser(userId);
}
```

## Coverage Requirements

### Minimum Coverage Targets

- **Unit Tests**: 80% coverage
- **Integration Tests**: 70% coverage
- **E2E Tests**: Critical paths only
- **Overall**: 75% coverage

### Coverage Configuration

```javascript
// vite.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: ["node_modules/", "tests/", "*.config.*", "src/types/"],
      thresholds: {
        statements: 75,
        branches: 70,
        functions: 75,
        lines: 75,
      },
    },
  },
});
```

## Performance Benchmarks

### Target Metrics

- **Initial Load**: < 2s (3G network)
- **Transaction List (1000 items)**: < 100ms render
- **Virtual Scroll (10k items)**: 60 FPS
- **Offline to Online Sync**: < 5s for 100 items
- **Bundle Size**: < 200KB initial
- **Lighthouse Score**: > 90

### Performance Testing Script

```typescript
// tests/performance/benchmarks.ts
import { test, expect } from "@playwright/test";

test("performance metrics", async ({ page }) => {
  await page.goto("/");

  const metrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    const paint = performance.getEntriesByType("paint");

    return {
      domContentLoaded: navigation.domContentLoadedEventEnd,
      loadComplete: navigation.loadEventEnd,
      firstPaint: paint.find((p) => p.name === "first-paint")?.startTime,
      firstContentfulPaint: paint.find((p) => p.name === "first-contentful-paint")?.startTime,
    };
  });

  expect(metrics.domContentLoaded).toBeLessThan(1500);
  expect(metrics.firstContentfulPaint).toBeLessThan(2000);
});
```

## Test Documentation

### Writing Test Cases

```typescript
/**
 * Test Case Template
 *
 * Feature: [Feature Name]
 * User Story: As a [user], I want to [action], so that [benefit]
 *
 * Scenario: [Scenario description]
 * Given: [Initial context]
 * When: [Action taken]
 * Then: [Expected outcome]
 */

test("user can create expense transaction", async ({ page }) => {
  // Given: User is on transactions page
  await page.goto("/transactions");

  // When: User creates an expense
  await createExpenseTransaction(page, {
    amount: "1,500.50",
    description: "Groceries",
  });

  // Then: Transaction appears in list with correct formatting
  await expect(page.getByText("₱1,500.50")).toBeVisible();
});
```

## Troubleshooting Guide

### Common Issues

1. **Flaky Tests**
   - Add explicit waits: `await page.waitForLoadState('networkidle')`
   - Use data-testid attributes
   - Increase timeout for slow operations

2. **Offline Testing**
   - Clear service worker cache between tests
   - Use separate browser contexts
   - Mock time for sync timing

3. **Database State**
   - Use transactions for test isolation
   - Clean up after each test
   - Use unique IDs to avoid conflicts

4. **CI Failures**
   - Check for hardcoded ports
   - Ensure database migrations run
   - Verify environment variables set

## Test Maintenance

### Monthly Tasks

- Update Playwright to latest version
- Review and update flaky test list
- Analyze test execution times
- Update synthetic data patterns

### Quarterly Tasks

- Review coverage reports
- Update performance benchmarks
- Audit test suite for redundancy
- Update load test scenarios

### Best Practices

1. Keep tests independent and isolated
2. Use descriptive test names
3. Avoid hardcoded values
4. Mock external dependencies
5. Test user journeys, not implementation
6. Maintain test data generators
7. Document complex test scenarios
8. Regular test suite cleanup
