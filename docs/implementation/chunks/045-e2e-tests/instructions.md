# Instructions: E2E Tests

Follow these steps in order. Estimated time: 2 hours.

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
  testDir: "./tests",
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

Create `tests/auth.spec.ts`:

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

Create `tests/transactions.spec.ts`:

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

Create `tests/offline.spec.ts`:

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

## Step 5: Create Accessibility Tests (15 min)

Create `tests/accessibility.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test("should not have accessibility violations on home page", async ({ page }) => {
    await page.goto("/");

    const accessibilityScanResults = await new AxeBuilder({ page }).analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test("should have proper ARIA labels on forms", async ({ page }) => {
    await page.goto("/transactions/new");

    // Check form inputs have labels
    const amountInput = page.locator('[name="amount"]');
    await expect(amountInput).toHaveAttribute("aria-label");

    const descriptionInput = page.locator('[name="description"]');
    await expect(descriptionInput).toHaveAttribute("aria-label");
  });

  test("should support keyboard navigation", async ({ page }) => {
    await page.goto("/transactions");

    // Tab through elements
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    // Should be able to navigate
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });
});
```

---

## Step 6: Create Performance Tests (15 min)

Create `tests/performance.spec.ts`:

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

## Step 7: Add to package.json (5 min)

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

## Step 8: Run Tests (10 min)

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
