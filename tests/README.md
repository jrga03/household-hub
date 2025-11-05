# Testing (`/tests/`)

## Purpose

The tests directory contains **end-to-end (E2E) and integration tests** for Household Hub. These complement unit tests (colocated with source code) to provide comprehensive test coverage across all application layers.

## Testing Strategy

### Three-Layer Testing Approach

**1. Unit Tests (Vitest) - In `/src/`**

- **Location:** Colocated with source files (`*.test.ts`)
- **Scope:** Individual functions, utilities, business logic
- **Examples:** Currency formatting, vector clocks, event generation
- **Run:** `npm test`

**2. Integration Tests - In `/tests/integration/`**

- **Location:** `/tests/integration/`
- **Scope:** Cross-module interactions, system behavior
- **Examples:** Sync flow, conflict resolution, database operations
- **Run:** `npm test -- integration`

**3. E2E Tests (Playwright) - In `/tests/e2e/`**

- **Location:** `/tests/e2e/`
- **Scope:** Full user flows, browser interactions
- **Examples:** Login, transaction creation, offline sync
- **Run:** `npm run test:e2e`

## Directory Structure

### `/tests/e2e/` - End-to-End Tests (8 spec files)

Browser-based tests using Playwright:

- **`auth.spec.ts`** - Authentication flows (login, signup, logout)
- **`transactions.spec.ts`** - Transaction CRUD operations
- **`offline.spec.ts`** - Offline functionality and sync
- **`sync.spec.ts`** - Multi-device sync scenarios
- **`pwa.spec.ts`** - PWA features (install, update, notifications)
- **`accessibility.spec.ts`** - Accessibility compliance (WCAG 2.1 AA)
- **`keyboard-nav.spec.ts`** - Keyboard navigation and shortcuts
- **`performance.spec.ts`** - Performance metrics and budgets

- **`fixtures/`** - Test helpers and mock data
  - `helpers.ts` - Common test utilities
  - `test-data.ts` - Mock transactions, accounts, categories
  - `test-users.ts` - Test user credentials

**See:** [e2e/README.md](./e2e/) for E2E testing guide

### `/tests/integration/` - Integration Tests (1 test file)

Cross-module integration tests:

- **`vector-clock-integration.test.ts`** - Vector clock system tests

**Future integration tests:**

- Sync queue → processor → Supabase flow
- Event generation → compaction flow
- ID mapping during sync
- Realtime subscriptions

## Test Coverage Goals

### Unit Tests

**Target:** 80%+ coverage for business logic

**Critical Modules:**

- ✅ Currency utilities (`lib/currency.ts`)
- ✅ Event generator (`lib/event-generator.ts`)
- ✅ Conflict resolution (`lib/conflict-resolver.ts`)
- ✅ Vector clocks (`lib/vector-clock.ts`)
- ✅ Sync idempotency (`lib/sync/idempotency.ts`)
- ⏳ Offline operations (partial)
- ⏳ Sync processor (partial)

### Integration Tests

**Target:** Key system flows covered

**Critical Flows:**

- ⏳ Full sync flow (queue → process → confirm)
- ✅ Vector clock integration
- ⏳ Conflict detection and resolution
- ⏳ Multi-device scenarios

### E2E Tests

**Target:** All critical user journeys

**Critical Journeys:**

- ✅ Authentication
- ✅ Transaction management
- ✅ Offline operation
- ✅ Sync behavior
- ✅ PWA features
- ✅ Accessibility
- ⏳ Budget management (to be added)
- ⏳ Analytics views (to be added)

## Running Tests

### Unit Tests (Vitest)

**All unit tests:**

```bash
npm test
```

**Watch mode:**

```bash
npm test -- --watch
```

**Specific file:**

```bash
npm test -- currency
npm test -- lib/sync
```

**With coverage:**

```bash
npm test -- --coverage
```

**Coverage report location:** `coverage/index.html`

### E2E Tests (Playwright)

**All E2E tests:**

```bash
npm run test:e2e
```

**With UI:**

```bash
npm run test:e2e:ui
```

**Specific test file:**

```bash
npm run test:e2e -- auth.spec.ts
```

**Headed mode (see browser):**

```bash
npm run test:e2e -- --headed
```

**Debug mode:**

```bash
npm run test:e2e -- --debug
```

### Integration Tests

**All integration tests:**

```bash
npm test -- integration
```

**Specific test:**

```bash
npm test -- vector-clock-integration
```

## Test Configuration

### Vitest Config (`vitest.config.ts`)

**Key settings:**

- Test environment: `jsdom` (browser environment)
- Setup file: `src/test/setup.ts`
- Coverage: Istanbul provider
- Globals: `true` (describe, it, expect available)

**Setup file includes:**

- IndexedDB polyfill (`fake-indexeddb`)
- Browser API mocks
- Global test utilities

### Playwright Config (`playwright.config.ts`)

**Key settings:**

- Browsers: Chromium, Firefox, WebKit
- Base URL: `http://localhost:3000`
- Screenshot on failure
- Video on retry
- Trace on first retry

**Projects:**

- Desktop Chrome
- Desktop Firefox
- Desktop Safari
- Mobile Chrome
- Mobile Safari

## Writing Tests

### Unit Test Pattern (Vitest)

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { formatPHP } from "@/lib/currency";

describe("formatPHP", () => {
  it("formats cents as PHP currency", () => {
    expect(formatPHP(150050)).toBe("₱1,500.50");
  });

  it("handles zero", () => {
    expect(formatPHP(0)).toBe("₱0.00");
  });

  it("handles large amounts", () => {
    expect(formatPHP(99999999)).toBe("₱999,999.99");
  });
});
```

### E2E Test Pattern (Playwright)

```typescript
import { test, expect } from "@playwright/test";

test.describe("Transaction Creation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.fill('[name="email"]', "test@example.com");
    await page.fill('[name="password"]', "password");
    await page.click('[type="submit"]');
  });

  test("creates income transaction", async ({ page }) => {
    await page.goto("/transactions");
    await page.click('[data-testid="add-transaction"]');

    await page.fill('[name="amount"]', "1500.50");
    await page.fill('[name="description"]', "Salary");
    await page.selectOption('[name="type"]', "income");

    await page.click('[type="submit"]');

    await expect(page.locator("text=Salary")).toBeVisible();
    await expect(page.locator("text=₱1,500.50")).toBeVisible();
  });
});
```

### Integration Test Pattern

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import { addToSyncQueue } from "@/lib/offline/syncQueue";
import { syncProcessor } from "@/lib/sync/processor";

describe("Sync Flow Integration", () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it("processes queued items and syncs to Supabase", async () => {
    // 1. Create offline transaction
    const transaction = {
      id: crypto.randomUUID(),
      amount_cents: 100000,
      type: "expense",
      // ... other fields
    };

    await db.transactions.put(transaction);

    // 2. Add to sync queue
    await addToSyncQueue("create", "transaction", transaction.id, transaction, userId);

    // 3. Process sync queue
    const result = await syncProcessor.processQueue(userId);

    // 4. Verify sync succeeded
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);

    // 5. Verify transaction in Supabase
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transaction.id)
      .single();

    expect(data).toBeTruthy();
  });
});
```

## CI/CD Integration

### GitHub Actions Workflow

**On every push/PR:**

1. Run unit tests (`npm test`)
2. Run linting (`npm run lint`)
3. Build check (`npm run build`)

**On release:**

1. Full test suite (unit + E2E)
2. Deployment to staging
3. Smoke tests on staging
4. Deployment to production

**See:** `/.github/workflows/` for workflow definitions

## Test Data Management

### Fixtures (`tests/e2e/fixtures/`)

**test-users.ts:**

- Pre-seeded test accounts
- Different permission levels
- Consistent credentials across tests

**test-data.ts:**

- Mock transactions, accounts, categories
- Realistic data for E2E tests
- Deterministic IDs for assertions

**helpers.ts:**

- Common test utilities
- Login helpers
- Data setup/teardown functions

### Database Seeding

**For E2E tests:**

```sql
-- supabase/seed.sql
INSERT INTO accounts (household_id, name, type)
VALUES
  ('...', 'Test Checking', 'checking'),
  ('...', 'Test Savings', 'savings');
```

**Reset between tests:**

```bash
supabase db reset  # Resets to seed state
```

## Debugging Tests

### Unit Tests

**Debug in VS Code:**

1. Set breakpoint in test file
2. Run "Debug Vitest" launch config
3. Step through code

**Console logs:**

```typescript
test("my test", () => {
  console.log("Debug value:", value);
  expect(value).toBe(expected);
});
```

### E2E Tests

**Playwright Inspector:**

```bash
npm run test:e2e -- --debug
```

**Screenshots:**

- Auto-captured on failure
- Saved to `test-results/`

**Videos:**

- Recorded on retry
- Saved to `test-results/`

**Trace:**

```bash
npm run test:e2e -- --trace on
```

View traces at: https://trace.playwright.dev

## Performance Testing

### Lighthouse CI (Future)

**Performance budgets:**

- First Contentful Paint: <1.5s
- Time to Interactive: <3.5s
- Lighthouse Score: >90

**Run Lighthouse:**

```bash
npm run lighthouse
```

### Load Testing (Future)

**Scenarios:**

- 10k transactions in list (virtualization)
- 1000 sync queue items processing
- Concurrent multi-device syncs

## Accessibility Testing

### Manual Testing

**Screen readers:**

- VoiceOver (macOS/iOS)
- NVDA (Windows)
- TalkBack (Android)

**Keyboard navigation:**

- Tab order logical
- Focus indicators visible
- All actions keyboard-accessible

### Automated Testing

**axe-core integration:**

```typescript
// In E2E test
import { injectAxe, checkA11y } from "axe-playwright";

test("homepage is accessible", async ({ page }) => {
  await page.goto("/");
  await injectAxe(page);
  await checkA11y(page);
});
```

**See:** `tests/e2e/accessibility.spec.ts`

## Related Documentation

### Subdirectory READMEs

- [e2e/README.md](./e2e/) - E2E testing guide with Playwright

### Comprehensive Guides

- [/docs/initial plan/TESTING-PLAN.md](../docs/initial%20plan/TESTING-PLAN.md) - Complete testing strategy

### Source Code

- [/src/test/setup.ts](../src/test/setup.ts) - Vitest test setup
- [/src/lib/](../src/lib/README.md) - Most unit tests are here

### CI/CD

- [/.github/workflows/](../.github/workflows/) - GitHub Actions (future README)

### Project Documentation

- [/CLAUDE.md](../CLAUDE.md) - Project quick reference

## Further Reading

- [Vitest Documentation](https://vitest.dev/) - Unit testing framework
- [Playwright Documentation](https://playwright.dev/) - E2E testing
- [Testing Library](https://testing-library.com/) - React component testing
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html) - TDD approach
