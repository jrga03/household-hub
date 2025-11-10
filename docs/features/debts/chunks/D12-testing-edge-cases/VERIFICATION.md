# D12 Verification: Testing & Edge Cases

This checklist verifies that all tests are working correctly and provide comprehensive coverage.

---

## Part 1: Unit Test Verification

### Test Environment Setup

**Run this command**:

```bash
npm test -- --version
```

**Expected**: Vitest version displayed (e.g., `vitest v1.0.0`)

**Check test setup file exists**:

```bash
cat src/test/setup.ts
```

**Expected**: Should contain `fake-indexeddb` import and matchers setup

---

### Balance Calculation Tests

**Run balance tests**:

```bash
npm test balance.test.ts
```

**Expected output**:

```
✓ src/lib/debts/__tests__/balance.test.ts (8)
  ✓ calculateDebtBalance (8)
    ✓ should return original amount when no payments
    ✓ should subtract single payment from original amount
    ✓ should subtract multiple payments
    ✓ should handle reversals (negative amounts)
    ✓ should handle cascading reversals (double negative)
    ✓ should return zero for exact payoff
    ✓ should return negative for overpayment
    ✓ should handle large number of payments efficiently

Test Files: 1 passed (1)
Tests: 8 passed (8)
```

**Manual verification**:

```bash
# Check test file exists
ls -la src/lib/debts/__tests__/balance.test.ts

# Verify test coverage
npm test balance.test.ts -- --coverage
```

**Expected coverage**: >95% for `src/lib/debts/balance.ts`

---

### Status Logic Tests

**Run status tests**:

```bash
npm test status.test.ts
```

**Expected output**:

```
✓ src/lib/debts/__tests__/status.test.ts (6)
  ✓ determineDebtStatus (4)
    ✓ should return "active" for positive balance
    ✓ should return "paid_off" for zero balance
    ✓ should return "overpaid" for negative balance
    ✓ should handle boundary at zero correctly
  ✓ updateDebtStatusFromBalance (4)
    ✓ should update status to paid_off when balance is zero
    ✓ should update status to overpaid when balance is negative
    ✓ should update status back to active after reversal
    ✓ should not change status if already correct

Test Files: 1 passed (1)
Tests: 6 passed (6) (tests may vary based on implementation)
```

**Check boundary tests**:

```bash
grep -A 5 "boundary" src/lib/debts/__tests__/status.test.ts
```

**Expected**: Tests for values exactly at 0, just above (1), just below (-1)

---

### Currency Utility Tests

**Run currency tests**:

```bash
npm test currency.test.ts
```

**Expected output**:

```
✓ src/lib/__tests__/currency.test.ts (15)
  ✓ formatPHP (5)
    ✓ should format positive amounts correctly
    ✓ should format negative amounts correctly
    ✓ should format zero correctly
    ✓ should handle large numbers
    ✓ should handle fractional cents
  ✓ parsePHP (6)
    ✓ should parse formatted PHP strings
    ✓ should parse plain number strings
    ✓ should parse numbers without decimals
    ✓ should parse numbers with single decimal
    ✓ should handle numbers directly
    ✓ should throw on invalid input
  ✓ validateAmount (6)
    ✓ should validate amounts within range
    ✓ should reject amounts below minimum
    ✓ should reject amounts above maximum
    ✓ should reject negative amounts
    ✓ should reject non-integer amounts
    ✓ should handle boundary values correctly

Test Files: 1 passed (1)
Tests: 15 passed (15)
```

**Manual test**: Verify formatting

```bash
node -e "const { formatPHP } = require('./src/lib/currency'); console.log(formatPHP(150050));"
```

**Expected**: `₱1,500.50`

---

## Part 2: Integration Test Verification

### CRUD Operation Tests

**Run CRUD tests**:

```bash
npm test crud.test.ts
```

**Expected output**:

```
✓ src/lib/debts/__tests__/crud.test.ts (6)
  ✓ External Debt CRUD (6)
    ✓ should create debt and generate event
    ✓ should enforce name uniqueness for active debts
    ✓ should allow duplicate names for paid_off debts
    ✓ should update debt and generate delta event
    ✓ should delete debt and cascade to payments
    ✓ should list debts with filters

Test Files: 1 passed (1)
Tests: 6 passed (6)
```

**Verify event generation**:

```bash
grep "result.event" src/lib/debts/__tests__/crud.test.ts
```

**Expected**: Multiple assertions checking event creation and structure

---

### Payment Processing Tests

**Run payment tests**:

```bash
npm test payments.test.ts
```

**Expected output**:

```
✓ src/lib/debts/__tests__/payments.test.ts (5)
  ✓ Debt Payment Processing (5)
    ✓ should create payment and update balance
    ✓ should update status to paid_off on full payment
    ✓ should update status to overpaid on overpayment
    ✓ should handle multiple sequential payments
    ✓ should generate event with payment idempotency key

Test Files: 1 passed (1)
Tests: 5 passed (5)
```

**Check status transition test**:

```bash
grep -A 10 "paid_off on full payment" src/lib/debts/__tests__/payments.test.ts
```

**Expected**: Verifies status changes from 'active' → 'paid_off'

---

### Reversal System Tests

**Run reversal tests**:

```bash
npm test reversals.test.ts
```

**Expected output**:

```
✓ src/lib/debts/__tests__/reversals.test.ts (4)
  ✓ Debt Payment Reversals (4)
    ✓ should create reversal with negative amount
    ✓ should update status back to active after reversal
    ✓ should handle cascading reversal (reversing a reversal)
    ✓ should generate event for reversal

Test Files: 1 passed (1)
Tests: 4 passed (4)
```

**Verify double negative handling**:

```bash
grep "cascading reversal" src/lib/debts/__tests__/reversals.test.ts
```

**Expected**: Test verifies reversing a reversal produces positive amount

---

## Part 3: E2E Test Verification

### E2E Test Setup

**Check Playwright installed**:

```bash
npx playwright --version
```

**Expected**: Playwright version (e.g., `Version 1.40.0`)

**List installed browsers**:

```bash
npx playwright show-report 2>&1 | grep -i browser || npx playwright install --dry-run
```

**Expected**: Chromium, Firefox, WebKit listed

---

### CRUD Workflow Tests

**Run E2E CRUD tests**:

```bash
npm run test:e2e external-debt-crud.spec.ts
```

**Expected output**:

```
Running 5 tests using 1 worker

✓ [chromium] › external-debt-crud.spec.ts:6:3 › should create external debt via form
✓ [chromium] › external-debt-crud.spec.ts:25:3 › should show validation error for duplicate name
✓ [chromium] › external-debt-crud.spec.ts:40:3 › should update debt name and description
✓ [chromium] › external-debt-crud.spec.ts:58:3 › should delete debt with confirmation
✓ [chromium] › external-debt-crud.spec.ts:75:3 › should filter debts by status

5 passed (15s)
```

**Run with UI** (for debugging):

```bash
npm run test:e2e:ui external-debt-crud.spec.ts
```

**Expected**: Playwright UI opens, can step through tests visually

---

### Payment Workflow Tests

**Run E2E payment tests**:

```bash
npm run test:e2e debt-payments.spec.ts
```

**Expected output**:

```
Running 3 tests using 1 worker

✓ [chromium] › debt-payments.spec.ts:12:3 › should create payment via transaction form
✓ [chromium] › debt-payments.spec.ts:35:3 › should show overpayment warning
✓ [chromium] › debt-payments.spec.ts:48:3 › should update status to paid_off on full payment

3 passed (12s)
```

**Verify screenshots** (if test fails):

```bash
ls -la test-results/
```

**Expected**: Screenshots and videos captured for failed tests

---

## Part 4: Coverage Verification

### Generate Coverage Report

**Run tests with coverage**:

```bash
npm test -- --coverage
```

**Expected output**:

```
 % Coverage report from v8
-------------------------|---------|----------|---------|---------|-------------------
File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------|---------|----------|---------|---------|-------------------
All files                |   92.5  |   88.2   |   95.1  |   92.8  |
 src/lib/currency.ts     |  100.0  |  100.0   |  100.0  |  100.0  |
 src/lib/debts/balance.ts|   96.2  |   91.7   |  100.0  |   96.5  | 45-47
 src/lib/debts/status.ts |   95.8  |   87.5   |  100.0  |   96.0  | 28
 src/lib/debts/crud.ts   |   91.3  |   85.2   |   93.8  |   91.7  | 112-115,203
 src/lib/debts/payments.ts|  93.1  |   89.1   |   94.4  |   93.5  | 78,156-158
 src/lib/debts/reversals.ts| 92.7  |   86.4   |   95.0  |   93.0  | 91-93
-------------------------|---------|----------|---------|---------|-------------------
```

**Coverage targets**:

- **Statements**: ≥90%
- **Branches**: ≥85%
- **Functions**: ≥90%
- **Lines**: ≥90%

**View HTML report**:

```bash
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

**Expected**: Interactive HTML report showing coverage by file

---

## Part 5: Edge Case Verification

### Boundary Value Tests

**Check minimum amount handling**:

```bash
npm test -- --grep "minimum amount"
```

**Expected**: Tests pass for ₱1.00 (100 cents)

**Check maximum amount handling**:

```bash
npm test -- --grep "maximum amount"
```

**Expected**: Tests pass for ₱999,999,999.00 (99999999900 cents)

**Check exact payoff**:

```bash
npm test -- --grep "exact payoff"
```

**Expected**: Balance exactly 0, status = 'paid_off'

---

### Concurrent Operation Tests

**Manual test - Concurrent payments**:

```typescript
// Add to payments.test.ts
it("should handle concurrent payments correctly", async () => {
  const { debt } = await createExternalDebt({
    household_id: "h1",
    name: "Test",
    original_amount_cents: 100000,
  });

  // Create two payments simultaneously
  const [result1, result2] = await Promise.all([
    createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 30000,
      transaction_id: "txn-1",
    }),
    createDebtPayment({
      debt_id: debt.id,
      debt_type: "external",
      amount_cents: 20000,
      transaction_id: "txn-2",
    }),
  ]);

  // Balance should reflect both payments
  const finalBalance = await calculateDebtBalance(debt.id, "external");
  expect(finalBalance).toBe(50000); // 100k - 30k - 20k
});
```

**Run test**:

```bash
npm test -- --grep "concurrent"
```

**Expected**: Passes without race conditions

---

### Error Recovery Tests

**Test network error handling** (requires sync implementation):

```bash
npm test -- --grep "network error"
```

**Expected**: Tests verify exponential backoff and retry logic

**Test validation error handling**:

```bash
npm test -- --grep "validation error"
```

**Expected**: Tests verify errors don't trigger retries

---

## Part 6: Performance Verification

### Balance Calculation Performance

**Run performance test**:

```bash
npm test -- --grep "large number of payments efficiently"
```

**Expected**: Test completes in <100ms for 1000 payments

**Verify test timing**:

```bash
npm test balance.test.ts -- --reporter=verbose
```

**Expected**: Each test shows duration, none exceed 1s

---

### List Rendering Performance

**Manual E2E test - Large dataset**:

```typescript
// Add to e2e tests
test("should render 100 debts smoothly", async ({ page }) => {
  // Create 100 debts via API/direct DB
  for (let i = 0; i < 100; i++) {
    await createDebt({ name: `Debt ${i}`, amount: 100000 });
  }

  // Navigate and measure
  const startTime = Date.now();
  await page.goto("/debts");
  await page.waitForSelector(".debt-card", { state: "visible" });
  const endTime = Date.now();

  const loadTime = endTime - startTime;
  expect(loadTime).toBeLessThan(2000); // <2s
});
```

**Run test**:

```bash
npm run test:e2e -- --grep "100 debts"
```

**Expected**: Page loads in <2 seconds

---

## Part 7: Accessibility Verification

### Keyboard Navigation

**Manual E2E test**:

```typescript
test("should support keyboard navigation", async ({ page }) => {
  await page.goto("/debts");

  // Tab to first interactive element
  await page.keyboard.press("Tab");

  // Verify focus visible
  const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
  expect(focusedElement).toBe("BUTTON");

  // Press Enter to activate
  await page.keyboard.press("Enter");

  // Verify dialog opened
  await expect(page.locator('[role="dialog"]')).toBeVisible();

  // Press Escape to close
  await page.keyboard.press("Escape");

  // Verify dialog closed
  await expect(page.locator('[role="dialog"]')).not.toBeVisible();
});
```

**Run test**:

```bash
npm run test:e2e -- --grep "keyboard navigation"
```

**Expected**: All interactive elements accessible via keyboard

---

### Screen Reader Support

**Check ARIA labels**:

```bash
grep -r "aria-label" src/components/debts/
```

**Expected**: All buttons, inputs, and interactive elements have labels

**Run axe accessibility tests**:

```typescript
// Add to E2E tests
import { injectAxe, checkA11y } from "@axe-core/playwright";

test("should have no accessibility violations", async ({ page }) => {
  await page.goto("/debts");
  await injectAxe(page);
  await checkA11y(page);
});
```

**Run test**:

```bash
npm run test:e2e -- --grep "accessibility violations"
```

**Expected**: Zero violations reported

---

## Part 8: Test Utility Verification

### Factory Functions

**Verify test utils exist**:

```bash
cat src/lib/debts/test-utils.ts
```

**Expected**: Contains `createTestDebt`, `createTestPayment`, `createTestInternalDebt`

**Test factory usage**:

```bash
grep -r "createTestDebt" src/lib/debts/__tests__/
```

**Expected**: Used in multiple test files for data generation

---

## Part 9: CI/CD Integration

### GitHub Actions Workflow

**Check workflow file**:

```bash
cat .github/workflows/test.yml
```

**Expected**: Contains steps for unit and E2E tests

**Verify test commands**:

```yaml
# Should include
- run: npm test
- run: npm run test:e2e
```

**Trigger workflow manually**:

```bash
git add .
git commit -m "test: add comprehensive debt tests"
git push origin main
```

**Expected**: GitHub Actions runs tests, all pass

---

## Part 10: Final Verification

### Run All Tests

**Run complete test suite**:

```bash
npm run test:all  # If script exists
# OR
npm test && npm run test:e2e
```

**Expected output**:

```
Unit Tests:
✓ 44 tests passed

E2E Tests:
✓ 8 tests passed

Total: 52 tests passed
```

**Check test scripts in package.json**:

```bash
cat package.json | grep -A 5 "scripts"
```

**Expected**:

```json
{
  "scripts": {
    "test": "vitest",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

---

## Troubleshooting

### Issue: "Cannot find module 'fake-indexeddb'"

**Fix**:

```bash
npm install -D fake-indexeddb
```

**Verify**:

```bash
npm list fake-indexeddb
```

---

### Issue: E2E tests fail with "Page not found"

**Check dev server running**:

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run E2E tests
npm run test:e2e
```

**Or use Playwright's webServer config**:

```typescript
// playwright.config.ts
export default defineConfig({
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

---

### Issue: Coverage report shows low coverage

**Identify uncovered lines**:

```bash
npm test -- --coverage --reporter=verbose
```

**Check coverage report**:

```bash
open coverage/index.html
```

**Add tests for uncovered code** or **remove dead code**

---

### Issue: Flaky tests (intermittent failures)

**Increase timeouts**:

```typescript
// In test file
test.setTimeout(30000); // 30s
```

**Add explicit waits**:

```typescript
await page.waitForSelector(".debt-card");
await waitFor(() => expect(balance).toBe(70000));
```

**Run tests multiple times**:

```bash
npm test -- --run --retry=3
```

---

## Summary Checklist

- [ ] All 8 unit test files created and passing
- [ ] All integration tests passing (CRUD, payments, reversals)
- [ ] E2E CRUD workflow tests passing
- [ ] E2E payment workflow tests passing
- [ ] Coverage ≥90% for critical paths
- [ ] Boundary value tests passing
- [ ] Performance benchmarks met (<100ms for balance calc)
- [ ] Accessibility tests passing (zero axe violations)
- [ ] Keyboard navigation working
- [ ] All tests documented with clear descriptions
- [ ] CI/CD workflow configured and passing

**Verification complete!** ✅ All tests are working correctly and the debt tracking feature is production-ready.
