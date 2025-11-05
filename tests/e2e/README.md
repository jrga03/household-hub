# E2E Tests (`/tests/e2e/`)

## Purpose

End-to-end tests using **Playwright** to verify complete user workflows in real browsers. Tests cover authentication, CRUD operations, offline functionality, PWA features, and accessibility.

## Test Files (8 specs)

- **`auth.spec.ts`** - Login, signup, logout flows
- **`transactions.spec.ts`** - Transaction CRUD operations
- **`offline.spec.ts`** - Offline mode and background sync
- **`sync.spec.ts`** - Multi-device sync scenarios
- **`pwa.spec.ts`** - PWA install, updates, notifications
- **`accessibility.spec.ts`** - WCAG 2.1 AA compliance (axe-core)
- **`keyboard-nav.spec.ts`** - Keyboard navigation and shortcuts
- **`performance.spec.ts`** - Performance budgets and metrics

### Fixtures Directory

- **`helpers.ts`** - Common test utilities (login, setup, teardown)
- **`test-data.ts`** - Mock transactions, accounts, categories
- **`test-users.ts`** - Test user credentials

## Running E2E Tests

**All tests:**

```bash
npm run test:e2e
```

**With Playwright UI:**

```bash
npm run test:e2e:ui
```

**Specific test:**

```bash
npm run test:e2e -- auth.spec.ts
```

**Headed mode (see browser):**

```bash
npm run test:e2e -- --headed
```

**Debug mode (step through):**

```bash
npm run test:e2e -- --debug
```

**Specific browser:**

```bash
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=firefox
npm run test:e2e -- --project=webkit
```

## Test Pattern

### Basic Structure

```typescript
import { test, expect } from "@playwright/test";

test.describe("Feature Name", () => {
  test.beforeEach(async ({ page }) => {
    // Setup: login, navigate, etc.
    await page.goto("/login");
    // ... login steps
  });

  test("test case description", async ({ page }) => {
    // Arrange
    await page.goto("/transactions");

    // Act
    await page.click('[data-testid="add-button"]');
    await page.fill('[name="amount"]', "1500");

    // Assert
    await expect(page.locator("text=₱1,500.00")).toBeVisible();
  });
});
```

### Using Fixtures

```typescript
import { loginAsTestUser } from "./fixtures/helpers";

test("authenticated test", async ({ page }) => {
  await loginAsTestUser(page, "test@example.com");
  // Now logged in, proceed with test
});
```

## Key Testing Scenarios

### Authentication Flow

```typescript
test("user can login", async ({ page }) => {
  await page.goto("/login");
  await page.fill('[name="email"]', "test@example.com");
  await page.fill('[name="password"]', "password");
  await page.click('[type="submit"]');

  await expect(page).toHaveURL("/dashboard");
  await expect(page.locator("text=Welcome")).toBeVisible();
});
```

### Offline Functionality

```typescript
test("app works offline", async ({ page, context }) => {
  await page.goto("/transactions");

  // Go offline
  await context.setOffline(true);

  // Create transaction offline
  await page.click('[data-testid="add-transaction"]');
  await page.fill('[name="amount"]', "1000");
  await page.click('[type="submit"]');

  // Verify offline indicator
  await expect(page.locator('[data-testid="offline-banner"]')).toBeVisible();

  // Go back online
  await context.setOffline(false);

  // Wait for sync
  await expect(page.locator('[data-testid="sync-complete"]')).toBeVisible();
});
```

### Accessibility Testing

```typescript
import { injectAxe, checkA11y } from "axe-playwright";

test("page is accessible", async ({ page }) => {
  await page.goto("/dashboard");
  await injectAxe(page);
  await checkA11y(page, null, {
    detailedReport: true,
    detailedReportOptions: {
      html: true,
    },
  });
});
```

## Test Data Management

### Setup Test Data

**Option 1: Database seed**

```bash
supabase db reset  # Applies seed.sql
```

**Option 2: Programmatic setup**

```typescript
test.beforeEach(async ({ page }) => {
  // Create test data via API
  await createTestAccount();
  await createTestTransactions();
});
```

### Cleanup

```typescript
test.afterEach(async () => {
  // Clean up test data
  await deleteTestData();
});
```

## Debugging E2E Tests

### Playwright Inspector

```bash
npm run test:e2e -- --debug
```

**Features:**

- Step through test
- Inspect locators
- View page DOM
- See network requests

### Screenshots on Failure

**Automatic:** Screenshots saved to `test-results/` on test failure

**Manual:**

```typescript
test("my test", async ({ page }) => {
  await page.screenshot({ path: "debug.png" });
});
```

### Video Recording

**Enabled on retry:** Videos saved to `test-results/`

**Always record:**

```typescript
// In playwright.config.ts
use: {
  video: "on",
}
```

### Trace Files

**On first retry:** Traces saved automatically

**View trace:**

```bash
npx playwright show-trace test-results/trace.zip
```

Or upload to: https://trace.playwright.dev

## Best Practices

### Reliable Locators

**✅ Good:**

```typescript
await page.click('[data-testid="add-button"]'); // Test ID
await page.click('button:has-text("Add")'); // Text + role
await page.locator('role=button[name="Add"]'); // ARIA role
```

**❌ Avoid:**

```typescript
await page.click(".btn-primary"); // CSS class (fragile)
await page.click("button:nth-child(2)"); // Position (fragile)
```

### Wait Strategies

**✅ Use built-in waiting:**

```typescript
await expect(page.locator("text=Success")).toBeVisible();
// Playwright waits automatically
```

**❌ Avoid arbitrary waits:**

```typescript
await page.waitForTimeout(5000); // Bad: slow and flaky
```

### Page Object Pattern (Optional)

```typescript
// pages/TransactionPage.ts
export class TransactionPage {
  constructor(private page: Page) {}

  async addTransaction(amount: string, description: string) {
    await this.page.click('[data-testid="add-button"]');
    await this.page.fill('[name="amount"]', amount);
    await this.page.fill('[name="description"]', description);
    await this.page.click('[type="submit"]');
  }

  async getTransactionByDescription(description: string) {
    return this.page.locator(`text=${description}`);
  }
}

// In test
const transactionPage = new TransactionPage(page);
await transactionPage.addTransaction("1500", "Groceries");
```

## Performance Testing

### Lighthouse Metrics

```typescript
import { playAudit } from "playwright-lighthouse";

test("lighthouse audit", async ({ page }) => {
  await page.goto("/");

  await playAudit({
    page,
    thresholds: {
      performance: 90,
      accessibility: 90,
      "best-practices": 90,
      seo: 90,
    },
  });
});
```

### Large Data Sets

```typescript
test("handles 10k transactions", async ({ page }) => {
  // Seed 10k transactions
  await seedLargeDataset();

  await page.goto("/transactions");

  // Verify virtualization working
  const visibleRows = await page.locator('[data-testid="transaction-row"]').count();
  expect(visibleRows).toBeLessThan(100); // Only visible rows rendered

  // Verify scrolling works
  await page.mouse.wheel(0, 5000);
  await expect(page.locator("text=Transaction 500")).toBeVisible();
});
```

## Related Documentation

### Parent README

- [../README.md](../README.md) - Testing strategy overview

### Comprehensive Guides

- [/docs/initial plan/TESTING-PLAN.md](../../docs/initial%20plan/TESTING-PLAN.md) - Complete testing plan

### Configuration

- [/playwright.config.ts](../../playwright.config.ts) - Playwright configuration

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference

## Further Reading

- [Playwright Documentation](https://playwright.dev/) - Official docs
- [Playwright Best Practices](https://playwright.dev/docs/best-practices) - Testing patterns
- [axe-core](https://github.com/dequelabs/axe-core) - Accessibility testing
- [Page Object Model](https://playwright.dev/docs/pom) - Test organization
