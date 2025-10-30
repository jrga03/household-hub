# Instructions: E2E Tests

Follow these steps in order. Estimated time: 2 hours.

---

## Before You Begin

Verify these prerequisites are met before starting:

### ✅ Required Features Working

1. **Auth System** (Chunk 002):
   - Start dev server: `npm run dev`
   - Navigate to `/login`
   - Can sign up with new email
   - Can sign in with existing credentials
   - Redirects to dashboard after login

2. **Accounts Page** (Chunk 008):
   - Navigate to `/accounts`
   - Page loads without errors
   - Can view account list
   - Can create new account

3. **Transactions Page** (Chunk 010):
   - Navigate to `/transactions`
   - Transaction list loads
   - Can create new transaction
   - Can edit existing transaction
   - Can delete transaction

4. **IndexedDB Setup** (Chunk 020) - _Required for offline tests_:
   - Open DevTools → Application → IndexedDB
   - Database "household-hub-db" exists
   - Tables: transactions, accounts, categories exist

5. **Sync Processor** (Chunk 024) - _Optional, for sync tests_:
   - If implementing sync tests, verify sync queue exists
   - Offline changes are queued
   - Changes sync when back online

### ✅ Environment Ready

```bash
# Verify dev server starts
npm run dev
# → Should start on port 3000

# Verify build works
npm run build
# → Should create dist/ folder

# Verify preview server works
npm run preview
# → Should start on port 4173
```

If any prerequisite fails, complete the required chunks first before proceeding.

---

## Step 1: Configure Playwright (10 min)

```bash
npm install -D @playwright/test @axe-core/playwright
npx playwright install
```

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",

  use: {
    baseURL: "http://localhost:4173", // Preview server
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
    command: "npm run preview",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

## Step 2: Create Auth Tests (15 min)

Create `tests/e2e/auth.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should sign up new user", async ({ page }) => {
    await page.goto("/signup");

    await page.fill('[name="email"]', `test-${Date.now()}@example.com`);
    await page.fill('[name="password"]', "TestPassword123!");
    await page.fill('[name="confirmPassword"]', "TestPassword123!");

    await page.click('button[type="submit"]');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByText(/welcome/i)).toBeVisible();
  });

  test("should sign in existing user", async ({ page }) => {
    await page.goto("/login");

    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");

    await page.click('button[type="submit"]');

    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("should sign out", async ({ page, context }) => {
    // Sign in first
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    // Sign out
    await page.click('[aria-label="User menu"]');
    await page.click("text=Sign out");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test("should protect routes when not authenticated", async ({ page }) => {
    await page.goto("/transactions");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
```

---

## Step 3: Create Transaction Tests (20 min)

Create `tests/e2e/transactions.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Transactions", () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');
  });

  test("should create new transaction", async ({ page }) => {
    await page.goto("/transactions");
    await page.click("text=Add Transaction");

    // Fill form
    await page.fill('[name="description"]', "Test Expense");
    await page.fill('[name="amount"]', "1500.50");
    await page.selectOption('[name="type"]', "expense");
    await page.selectOption('[name="account"]', { index: 1 });
    await page.selectOption('[name="category"]', { index: 1 });

    await page.click('button[type="submit"]');

    // Verify created
    await expect(page.getByText("Test Expense")).toBeVisible();
    await expect(page.getByText("₱1,500.50")).toBeVisible();
  });

  test("should edit transaction", async ({ page }) => {
    await page.goto("/transactions");

    // Click first transaction
    await page.click('[data-testid="transaction-row"]:first-child');

    // Edit
    await page.click("text=Edit");
    await page.fill('[name="description"]', "Updated Description");
    await page.click('button[type="submit"]');

    // Verify updated
    await expect(page.getByText("Updated Description")).toBeVisible();
  });

  test("should delete transaction", async ({ page }) => {
    await page.goto("/transactions");

    const transactionText = await page
      .locator('[data-testid="transaction-row"]:first-child')
      .textContent();

    // Delete
    await page.click('[data-testid="transaction-row"]:first-child');
    await page.click("text=Delete");
    await page.click("text=Confirm");

    // Verify deleted
    await expect(page.getByText(transactionText!)).not.toBeVisible();
  });

  test("should calculate account balance correctly", async ({ page }) => {
    await page.goto("/accounts");

    // Get first account balance
    const balance = await page.locator('[data-testid="account-balance"]:first-child').textContent();

    // Verify format
    expect(balance).toMatch(/₱[\d,]+\.\d{2}/);
  });
});
```

---

## Step 4: Create Offline Tests (20 min)

Create `tests/e2e/offline.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Offline Mode", () => {
  test("should create transaction offline and sync when online", async ({ page, context }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");

    // Go offline
    await context.setOffline(true);

    // Verify offline indicator
    await expect(page.getByText(/offline/i)).toBeVisible();

    // Create transaction offline
    await page.click("text=Add Transaction");
    await page.fill('[name="description"]', "Offline Transaction");
    await page.fill('[name="amount"]', "500");
    await page.selectOption('[name="type"]', "expense");
    await page.click('button[type="submit"]');

    // Verify queued
    await expect(page.getByText("Offline Transaction")).toBeVisible();
    await expect(page.getByText(/pending sync/i)).toBeVisible();

    // Go online
    await context.setOffline(false);

    // Wait for sync
    await page.waitForSelector('[data-testid="sync-complete"]', { timeout: 5000 });

    // Verify synced
    await expect(page.getByText(/pending sync/i)).not.toBeVisible();
  });

  test("should load cached data when offline", async ({ page, context }) => {
    // Load page online first
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    // Go offline
    await context.setOffline(true);

    // Reload
    await page.reload();

    // Should still load
    await expect(page.getByText(/transactions/i)).toBeVisible();
  });
});
```

---

## Step 4.5: Create Multi-Device Sync Tests (20 min)

**Note**: Only include this if you've implemented Chunk 024 (sync-processor). Skip if using basic offline-only.

Create `tests/e2e/sync.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Multi-Device Sync", () => {
  test("should handle concurrent edits with field-level merge", async ({ browser }) => {
    // Create two browser contexts (simulate two devices)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Login on both devices
    await page1.goto("/login");
    await page1.fill('[name="email"]', "test@example.com");
    await page1.fill('[name="password"]', "TestPassword123!");
    await page1.click('button[type="submit"]');

    await page2.goto("/login");
    await page2.fill('[name="email"]', "test@example.com");
    await page2.fill('[name="password"]', "TestPassword123!");
    await page2.click('button[type="submit"]');

    // Both navigate to same transaction
    await page1.goto("/transactions");
    await page2.goto("/transactions");

    const firstTransaction = page1.locator('[data-testid="transaction-row"]').first();
    await firstTransaction.click();
    await page1.click("text=Edit");

    await page2.locator('[data-testid="transaction-row"]').first().click();
    await page2.click("text=Edit");

    // Both go offline
    await context1.setOffline(true);
    await context2.setOffline(true);

    // Device 1 changes amount
    await page1.fill('[name="amount"]', "2000");
    await page1.click('button[type="submit"]');

    // Device 2 changes description
    await page2.fill('[name="description"]', "Updated from device 2");
    await page2.click('button[type="submit"]');

    // Both go online
    await context1.setOffline(false);
    await context2.setOffline(false);

    // Wait for sync (look for sync indicator)
    await page1.waitForSelector('[data-testid="sync-complete"]', { timeout: 5000 });
    await page2.waitForSelector('[data-testid="sync-complete"]', { timeout: 5000 });

    // Reload both pages
    await page1.reload();
    await page2.reload();

    // Open transaction again on both
    await page1.locator('[data-testid="transaction-row"]').first().click();
    await page2.locator('[data-testid="transaction-row"]').first().click();

    // Both should have merged changes (field-level merge)
    const amount1 = await page1.locator('[data-testid="transaction-amount"]').textContent();
    const description1 = await page1
      .locator('[data-testid="transaction-description"]')
      .textContent();

    const amount2 = await page2.locator('[data-testid="transaction-amount"]').textContent();
    const description2 = await page2
      .locator('[data-testid="transaction-description"]')
      .textContent();

    // Verify both devices converged to same state
    expect(amount1).toBe("₱2,000.00");
    expect(description1).toContain("Updated from device 2");
    expect(amount2).toBe("₱2,000.00");
    expect(description2).toContain("Updated from device 2");

    // Cleanup
    await context1.close();
    await context2.close();
  });

  test("should sync new transaction from one device to another", async ({ browser }) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Login both devices
    await page1.goto("/login");
    await page1.fill('[name="email"]', "test@example.com");
    await page1.fill('[name="password"]', "TestPassword123!");
    await page1.click('button[type="submit"]');

    await page2.goto("/login");
    await page2.fill('[name="email"]', "test@example.com");
    await page2.fill('[name="password"]', "TestPassword123!");
    await page2.click('button[type="submit"]');

    // Device 1 creates new transaction
    await page1.goto("/transactions");
    await page1.click("text=Add Transaction");
    await page1.fill('[name="description"]', "Sync Test Transaction");
    await page1.fill('[name="amount"]', "999");
    await page1.selectOption('[name="type"]', "expense");
    await page1.click('button[type="submit"]');

    // Wait for device 1 to sync
    await page1.waitForSelector('[data-testid="sync-complete"]', { timeout: 5000 });

    // Device 2 should receive the new transaction via realtime
    await page2.goto("/transactions");
    await page2.waitForTimeout(2000); // Wait for realtime subscription

    // Verify transaction appears on device 2
    await expect(page2.getByText("Sync Test Transaction")).toBeVisible();

    // Cleanup
    await context1.close();
    await context2.close();
  });
});
```

---

## Step 5: Create Accessibility Tests (15 min)

Create `tests/e2e/accessibility.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test("should not have accessibility violations on home page", async ({ page }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toHaveLength(0);
  });

  test("should not have accessibility violations on transactions page", async ({ page }) => {
    // Login first
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toHaveLength(0);
  });

  test("should not have accessibility violations on transaction form", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");
    await page.click("text=Add Transaction");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toHaveLength(0);
  });

  test("should not have accessibility violations on accounts page", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/accounts");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toHaveLength(0);
  });

  test("should not have accessibility violations on budget page", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/budget");

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    expect(accessibilityScanResults.violations).toHaveLength(0);
  });
});
```

---

## Step 5.5: Create PWA Tests (15 min)

**Note**: Only include this if you've implemented Chunk 041 (pwa-manifest) and Chunk 042 (service-worker).

Create `tests/e2e/pwa.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("PWA Features", () => {
  test("should register service worker", async ({ page }) => {
    await page.goto("/");

    // Wait for service worker registration
    const swRegistered = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return false;

      const registration = await navigator.serviceWorker.ready;
      return registration.active !== null;
    });

    expect(swRegistered).toBe(true);
  });

  test("should work offline after caching", async ({ page, context }) => {
    // First visit to cache resources
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Wait for service worker to finish caching
    await page.waitForTimeout(2000);

    // Go offline
    await context.setOffline(true);

    // Reload page
    await page.reload();

    // App shell should still load from cache
    await expect(page.locator("body")).toBeVisible();
    await expect(page.getByRole("heading")).toBeVisible();
  });

  test("should load cached transactions offline", async ({ page, context }) => {
    // Login and load transactions
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");

    // Wait for data to be cached
    await page.waitForTimeout(1000);

    // Go offline
    await context.setOffline(true);

    // Reload
    await page.reload();

    // Should still see cached transaction list
    await expect(page.getByTestId("transaction-list")).toBeVisible();
  });

  test("should show offline indicator when offline", async ({ page, context }) => {
    await page.goto("/");

    // Go offline
    await context.setOffline(true);

    // Offline indicator should appear
    await expect(page.getByTestId("offline-indicator")).toBeVisible();

    // Go back online
    await context.setOffline(false);

    // Offline indicator should disappear
    await expect(page.getByTestId("offline-indicator")).not.toBeVisible({ timeout: 3000 });
  });
});
```

---

## Step 6: Create Performance Tests (15 min)

Create `tests/e2e/performance.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Performance", () => {
  test("should handle 10k transactions", async ({ page }) => {
    // Seed 10k transactions (via API or fixture)
    await page.request.post("/api/seed-transactions", {
      data: { count: 10000 },
    });

    await page.goto("/transactions");

    // Should load within 3s
    await page.waitForSelector('[data-testid="transaction-row"]', { timeout: 3000 });

    // Virtual scrolling should work
    const visibleRows = await page.locator('[data-testid="transaction-row"]').count();
    expect(visibleRows).toBeLessThan(100); // Should virtualize

    // Scroll should be smooth
    await page.evaluate(() => window.scrollTo(0, 10000));
    await page.waitForTimeout(100);

    // More rows should be visible after scroll
    const visibleAfterScroll = await page.locator('[data-testid="transaction-row"]').count();
    expect(visibleAfterScroll).toBeGreaterThan(0);
  });

  test("should have acceptable bundle size", async ({ page }) => {
    await page.goto("/");

    const resources = await page.evaluate(() =>
      performance
        .getEntriesByType("resource")
        .filter((r) => r.name.includes(".js"))
        .reduce((sum, r) => sum + (r as any).transferSize, 0)
    );

    // Should be under 200KB
    expect(resources).toBeLessThan(200 * 1024);
  });
});
```

---

## Step 6.5: Create Keyboard Navigation Tests (15 min)

Create `tests/e2e/keyboard-nav.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Keyboard Navigation", () => {
  test("should navigate main menu with keyboard only", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/");

    // Tab through main navigation
    await page.keyboard.press("Tab");
    const firstNav = await page.evaluate(() => document.activeElement?.getAttribute("data-nav"));
    expect(firstNav).toBeTruthy();

    await page.keyboard.press("Tab");
    const secondNav = await page.evaluate(() => document.activeElement?.getAttribute("data-nav"));
    expect(secondNav).toBeTruthy();

    // Verify we can navigate with keyboard
    expect(firstNav).not.toBe(secondNav);
  });

  test("should create transaction using keyboard only", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");

    // Find and focus the "Add Transaction" button
    const addButton = page.getByRole("button", { name: /add transaction/i });
    await addButton.focus();
    await page.keyboard.press("Enter");

    // Wait for form to appear
    await page.waitForSelector('[name="amount"]');

    // Fill form with keyboard
    await page.keyboard.type("1500.50"); // Amount field should be auto-focused
    await page.keyboard.press("Tab");

    await page.keyboard.press("ArrowDown"); // Select type
    await page.keyboard.press("Tab");

    await page.keyboard.type("Keyboard Test Transaction"); // Description
    await page.keyboard.press("Tab");

    await page.keyboard.press("ArrowDown"); // Select account
    await page.keyboard.press("Tab");

    await page.keyboard.press("ArrowDown"); // Select category
    await page.keyboard.press("Tab");

    await page.keyboard.press("Enter"); // Submit

    // Verify transaction created
    await expect(page.getByText("Keyboard Test Transaction")).toBeVisible({ timeout: 5000 });
  });

  test("should navigate transaction list with arrow keys", async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "TestPassword123!");
    await page.click('button[type="submit"]');

    await page.goto("/transactions");

    // Focus first transaction
    const firstTx = page.locator('[data-testid="transaction-row"]').first();
    await firstTx.focus();

    // Get first transaction text
    const firstText = await firstTx.textContent();

    // Navigate down with arrow key
    await page.keyboard.press("ArrowDown");

    // Get second transaction text
    const secondTx = page.locator('[data-testid="transaction-row"]').nth(1);
    const secondText = await secondTx.textContent();

    // Verify we moved to different transaction
    expect(firstText).not.toBe(secondText);

    // Navigate back up
    await page.keyboard.press("ArrowUp");

    // Should be back at first transaction
    const focusedElement = await page.evaluate(() => document.activeElement?.textContent);
    expect(focusedElement).toContain(firstText?.substring(0, 20) || "");
  });
});
```

---

## Step 7: Create Test Fixtures (10 min)

Test fixtures provide reusable test data and helper functions.

Create `tests/e2e/fixtures/test-users.ts`:

```typescript
export const testUsers = {
  primary: {
    email: "test@example.com",
    password: "TestPassword123!",
  },
  secondary: {
    email: "test2@example.com",
    password: "TestPassword456!",
  },
};
```

Create `tests/e2e/fixtures/test-data.ts`:

```typescript
export const testAccounts = [
  {
    name: "Cash",
    type: "cash",
    initial_balance: 1000000, // ₱10,000.00 in cents
  },
  {
    name: "Checking",
    type: "bank",
    initial_balance: 5000000, // ₱50,000.00 in cents
  },
];

export const testCategories = [
  {
    name: "Food",
    type: "expense",
    subcategories: ["Groceries", "Dining Out"],
  },
  {
    name: "Income",
    type: "income",
    subcategories: ["Salary", "Freelance"],
  },
];

export const testTransactions = [
  {
    description: "Grocery Shopping",
    amount_cents: 150050, // ₱1,500.50
    type: "expense",
    date: "2025-01-15",
    category: "Food > Groceries",
    account: "Cash",
  },
  {
    description: "Monthly Salary",
    amount_cents: 5000000, // ₱50,000.00
    type: "income",
    date: "2025-01-01",
    category: "Income > Salary",
    account: "Checking",
  },
];
```

Create `tests/e2e/fixtures/helpers.ts`:

```typescript
import { Page } from "@playwright/test";
import { testUsers } from "./test-users";

export async function login(page: Page, userKey: "primary" | "secondary" = "primary") {
  const user = testUsers[userKey];

  await page.goto("/login");
  await page.fill('[name="email"]', user.email);
  await page.fill('[name="password"]', user.password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL(/\/(dashboard|transactions)/);
}

export async function createTestTransaction(
  page: Page,
  transaction: {
    description: string;
    amount: string;
    type: "income" | "expense";
    account?: string;
    category?: string;
  }
) {
  await page.goto("/transactions");
  await page.click("text=Add Transaction");

  await page.fill('[name="description"]', transaction.description);
  await page.fill('[name="amount"]', transaction.amount);
  await page.selectOption('[name="type"]', transaction.type);

  if (transaction.account) {
    await page.selectOption('[name="account"]', transaction.account);
  }

  if (transaction.category) {
    await page.selectOption('[name="category"]', transaction.category);
  }

  await page.click('button[type="submit"]');

  // Wait for success
  await page.waitForSelector('[data-testid="transaction-list"]');
}

export async function waitForSync(page: Page, timeout = 5000) {
  await page.waitForSelector('[data-testid="sync-complete"]', { timeout });
}
```

---

## Step 8: Add to package.json (5 min)

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

---

## Step 9: Create CI Workflow (10 min)

Create `.github/workflows/test.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Build application
        run: npm run build

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

      - name: Upload test screenshots
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-screenshots
          path: test-results/
          retention-days: 7
```

This workflow will:

- Run on every push to main/develop
- Run on every pull request
- Install Playwright with all browser dependencies
- Build the production bundle
- Run all E2E tests
- Upload reports and screenshots if tests fail

---

## Step 10: Run Tests (10 min)

```bash
# Build first
npm run build

# Run all tests
npm run test:e2e

# Run specific test
npx playwright test auth.spec.ts

# Debug mode
npm run test:e2e:debug

# View report
npx playwright show-report
```

---

## Done!

When all tests pass, proceed to checkpoint.

**Next**: `checkpoint.md`
