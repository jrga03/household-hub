# Chunk D12: Testing & Edge Cases

## At a Glance

- **Time**: 2-3 hours
- **Prerequisites**: D1-D11 complete (all debt functionality implemented)
- **Can Skip**: No - testing is critical for production readiness
- **Depends On**: Vitest, Playwright, Dexie testing utilities

## What You're Building

Comprehensive test suite covering all debt functionality:

- **Unit tests**: Balance calculation, status logic, currency utilities, event generation
- **Integration tests**: CRUD operations, payment processing, reversals, sync queue
- **E2E tests**: User workflows, form validation, multi-device scenarios
- **Edge cases**: Concurrent operations, boundary values, error recovery
- **Performance tests**: Large datasets, sync queue processing, virtual scrolling
- **Accessibility tests**: Keyboard navigation, screen reader compatibility

## Why This Matters

Testing ensures **production readiness and reliability**:

- **Catch regressions**: Prevent bugs when adding new features
- **Document behavior**: Tests serve as executable specifications
- **Multi-device confidence**: Verify sync and conflict resolution work correctly
- **Edge case coverage**: Test boundary conditions and error paths
- **Performance validation**: Ensure app handles large datasets
- **Accessibility compliance**: Meet WCAG 2.1 AA standards

This chunk completes the debt tracking feature with production-grade testing.

## Before You Start

Verify these prerequisites:

- [ ] **All chunks D1-D11 complete** - All debt functionality implemented
- [ ] **Test framework setup** - Vitest configured in package.json
- [ ] **E2E framework setup** - Playwright installed and configured
- [ ] **Dexie testing** - Fake IndexedDB for unit tests (fake-indexeddb)
- [ ] **Test utilities** - Helper functions for creating test data

**How to verify**:

```bash
# Check test frameworks
npm list vitest @playwright/test fake-indexeddb

# Check test scripts
grep "test" package.json

# Run existing tests (should pass)
npm test
```

## What Happens Next

After this chunk:

- Comprehensive test coverage for all debt functionality
- Confidence in multi-device sync and conflict resolution
- Edge cases handled gracefully
- Performance validated with large datasets
- Accessibility compliance verified
- **Debt tracking feature is production-ready!**

## Key Files Created/Modified

```
src/
├── lib/
│   └── debts/
│       ├── __tests__/
│       │   ├── balance.test.ts           # NEW: Balance calculation tests
│       │   ├── status.test.ts            # NEW: Status logic tests
│       │   ├── crud.test.ts              # NEW: CRUD operation tests
│       │   ├── payments.test.ts          # NEW: Payment processing tests
│       │   ├── reversals.test.ts         # NEW: Reversal system tests
│       │   ├── events.test.ts            # NEW: Event generation tests
│       │   └── sync.test.ts              # NEW: Sync queue tests
│       └── test-utils.ts                 # NEW: Test data factories
tests/
├── e2e/
│   └── debts/
│       ├── external-debt-crud.spec.ts    # NEW: E2E CRUD tests
│       ├── internal-debt-crud.spec.ts    # NEW: E2E internal debt tests
│       ├── debt-payments.spec.ts         # NEW: E2E payment tests
│       ├── debt-reversals.spec.ts        # NEW: E2E reversal tests
│       └── multi-device-sync.spec.ts     # NEW: E2E sync tests
```

## Test Categories

### Unit Tests (Vitest)

**Balance Calculation Tests**:

- Single payment calculations
- Multiple payments aggregation
- Reversal handling (negatives)
- Cascading reversal handling (double negatives)
- Edge case: zero balance, exact payoff, overpayment

**Status Logic Tests**:

- Status determination from balance (active, paid_off, overpaid)
- Status transitions (active → paid_off, paid_off → active after reversal)
- Edge case: threshold boundaries (₱0.99 vs ₱1.00)

**Currency Utilities Tests**:

- `formatPHP()`: Positive, negative, zero, large numbers
- `parsePHP()`: Various input formats (with/without ₱, commas)
- `validateAmount()`: Min/max boundaries, invalid values

**Event Generation Tests**:

- Create events with correct payload
- Update events with delta payloads only
- Delete events
- Idempotency key uniqueness
- Lamport clock monotonic increase
- Vector clock updates

**Sync Queue Tests**:

- Queue insertion after event creation
- State transitions (draft → queued → syncing → confirmed)
- Exponential backoff calculation
- Failed sync retry logic
- Max retry handling (10 attempts)

### Integration Tests (Vitest)

**CRUD Operations**:

- Create external debt → event generated → queue item added
- Update debt → delta event → status recalculation
- Delete debt → delete event → cascade to payments
- Create internal debt with two participants

**Payment Processing**:

- Create payment → balance updated → status recalculated → event generated
- Payment causes debt to become paid_off
- Payment causes overpayment

**Reversal System**:

- Reverse payment → negative payment created → balance updated → event generated
- Reverse reversal (double negative) → balance restored
- Edit transaction with debt link → reversal + new payment
- Delete transaction with debt link → reversal only

**Sync Flow**:

- Create debt offline → sync queue item created
- Sync processor picks up item → state transitions
- Failed sync → exponential backoff → retry

### E2E Tests (Playwright)

**User Workflows**:

- User creates external debt via form → sees in list → debt card shows correct status
- User makes payment via transaction form → balance updates → progress bar animates
- User reverses payment → balance reverted → reversal shown in history
- User edits transaction with debt link → warning shown → reversal created on confirm

**Form Validation**:

- Name uniqueness validation (active debts only)
- Amount boundaries (₱1.00 to ₱999,999,999.00)
- Required field validation
- Currency input formatting

**Multi-Device Sync** (simulated with multiple browser contexts):

- Device A creates debt → Device B syncs → sees debt
- Device A makes payment → Device B syncs → sees updated balance
- Concurrent edits → conflict resolution → deterministic result

**Accessibility**:

- Keyboard navigation (tab order, enter/space activation)
- Screen reader labels (aria-label, aria-describedby)
- Focus management (dialogs, forms)
- Color contrast (WCAG 2.1 AA compliance)

### Edge Cases

**Concurrent Operations**:

- Two devices create payment simultaneously → both succeed, balance correct
- Edit and delete same transaction → deterministic outcome
- Multiple reversals in quick succession

**Boundary Values**:

- Minimum amount (₱1.00 = 100 cents)
- Maximum amount (₱999,999,999.00 = 99999999900 cents)
- Zero balance exactly
- Name exactly 100 characters
- Description exactly 500 characters

**Error Recovery**:

- Network error during sync → exponential backoff → eventual success
- Validation error → no retry → user notified
- Conflict error → server resolution → local state updated
- IndexedDB quota exceeded → graceful degradation

**Performance Validation**:

- 100 debts with 1000 payments each → list renders smoothly
- Sync queue with 1000 items → processes within reasonable time
- Virtual scrolling with 10k+ payment history items

## Test Data Factories

**Why factories?**: Reduce boilerplate, ensure valid test data, improve readability.

**Pattern**:

```typescript
// src/lib/debts/test-utils.ts
export function createTestDebt(overrides?: Partial<Debt>): Debt {
  return {
    id: nanoid(),
    household_id: "test-household",
    name: "Test Debt",
    original_amount_cents: 100000,
    status: "active",
    type: "external",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createTestPayment(overrides?: Partial<DebtPayment>): DebtPayment {
  return {
    id: nanoid(),
    debt_id: "test-debt",
    debt_type: "external",
    amount_cents: 10000,
    transaction_id: nanoid(),
    is_reversal: false,
    household_id: "test-household",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}
```

## Critical Test Scenarios

### Scenario 1: Complete Debt Lifecycle

```
1. User creates external debt (₱10,000)
   ✓ Debt created with status 'active'
   ✓ Event generated (op: 'create')
   ✓ Sync queue item added

2. User makes first payment (₱3,000)
   ✓ Payment created
   ✓ Balance = ₱7,000
   ✓ Status = 'active'
   ✓ Event generated
   ✓ Progress bar = 30%

3. User makes second payment (₱7,000)
   ✓ Payment created
   ✓ Balance = ₱0
   ✓ Status = 'paid_off'
   ✓ Status badge color changes
   ✓ Progress bar = 100%

4. User reverses second payment
   ✓ Reversal created (amount: -₱7,000)
   ✓ Balance = ₱7,000
   ✓ Status = 'active'
   ✓ Reversal shown in history

5. Sync to server
   ✓ All events synced
   ✓ Queue items confirmed
   ✓ No duplicate events
```

### Scenario 2: Multi-Device Conflict

```
Initial state: Debt with balance ₱5,000

Device A (offline):
  - Makes payment ₱2,000
  - Balance = ₱3,000
  - Event created (lamport: 42)

Device B (offline):
  - Makes payment ₱1,500
  - Balance = ₱3,500
  - Event created (lamport: 42)

Both come online:
  ✓ Both events sync to server
  ✓ Server determines canonical order (device ID tie-break)
  ✓ Both devices converge to same state
  ✓ Final balance = ₱1,500 (both payments applied)
```

### Scenario 3: Cascading Reversal

```
1. Original payment: +₱1,000
   Balance: ₱9,000

2. Reverse payment: -₱1,000
   Balance: ₱10,000

3. Reverse the reversal: +₱1,000 (double negative)
   ✓ Amount is positive
   ✓ Balance: ₱9,000 (back to original)
   ✓ is_reversal = true
   ✓ reverses_payment_id = reversal ID
```

### Scenario 4: Transaction Edit with Debt Link

```
1. Transaction created with debt link (₱500)
   ✓ Payment created automatically
   ✓ Balance decreases by ₱500

2. User edits transaction amount to ₱800
   ✓ Warning shown about reversal
   ✓ On confirm:
     - Reversal created (-₱500)
     - New payment created (+₱800)
     - Net change: +₱300
   ✓ Balance decreases by additional ₱300

3. User edits transaction, removes debt link
   ✓ Warning shown
   ✓ On confirm:
     - Reversal created (-₱800)
     - No new payment
   ✓ Balance increases by ₱800
```

## Performance Benchmarks

**Balance Calculation**:

- 1 payment: <1ms
- 100 payments: <10ms
- 1000 payments: <100ms

**List Rendering**:

- 10 debts: <50ms (first paint)
- 100 debts: <200ms (first paint)
- Virtual scrolling: Handle 1000+ debts smoothly

**Sync Queue Processing**:

- 10 items: <500ms
- 100 items: <5s
- 1000 items: <60s

**Event Query**:

- Last 100 events: <50ms
- Last 1000 events: <200ms

## Accessibility Requirements

**Keyboard Navigation**:

- All interactive elements reachable via Tab
- Modals/dialogs trap focus
- Escape closes dialogs
- Enter/Space activates buttons

**Screen Reader Support**:

- All images have alt text
- Form inputs have labels
- Error messages announced
- Status changes announced (live regions)

**Visual Requirements**:

- Color contrast ≥4.5:1 for text
- Color not the only indicator (status badges also have icons)
- Focus indicators visible (outline or ring)
- Touch targets ≥44x44px

## Related Documentation

- **Testing Strategy**: IMPLEMENTATION-PLAN.md lines 1200-1350 (testing approach)
- **Unit Test Examples**: D3 chunk (balance tests)
- **E2E Test Examples**: Playwright setup in tests/e2e/
- **Decisions**:
  - #62: Event sourcing (requires event tests)
  - #77: Conflict resolution (requires multi-device tests)

## Technical Stack

- **Vitest**: Fast unit test runner with native ESM support
- **Playwright**: E2E testing with multiple browser contexts
- **fake-indexeddb**: In-memory IndexedDB for unit tests
- **Testing Library**: React component testing utilities
- **axe-core**: Accessibility testing (via @axe-core/playwright)

## Design Patterns

### Test Isolation Pattern

```typescript
// Each test starts with clean database
beforeEach(async () => {
  await db.delete(); // Delete database
  await db.open(); // Recreate fresh
});

afterEach(async () => {
  await db.close();
});
```

**Why**: Prevents test pollution, ensures deterministic results.

### AAA Pattern (Arrange-Act-Assert)

```typescript
it("should update debt status to paid_off when balance is zero", async () => {
  // Arrange
  const debt = await createExternalDebt({
    name: "Test Debt",
    original_amount_cents: 100000,
  });

  // Act
  await createDebtPayment({
    debt_id: debt.id,
    amount_cents: 100000, // Full amount
  });

  // Assert
  const updated = await getDebt(debt.id, "external");
  expect(updated.status).toBe("paid_off");
});
```

**Why**: Clear test structure, easy to understand and maintain.

### Factory Pattern for Test Data

```typescript
// Use factories instead of inline objects
const debt = createTestDebt({ name: "Custom Name" });
const payment = createTestPayment({ debt_id: debt.id, amount_cents: 5000 });
```

**Why**: Reduces boilerplate, ensures valid defaults, improves readability.

### Snapshot Testing for UI

```typescript
it('should render debt card correctly', () => {
  const { container } = render(<DebtCard debt={testDebt} />);
  expect(container).toMatchSnapshot();
});
```

**Why**: Catch unintended UI changes, visual regression testing.

## Common Edge Cases

**Balance calculation with mixed operations**:

- Payment → Reversal → Payment → Reversal
- Verify balance correct after each step

**Concurrent status updates**:

- Two payments cause status change simultaneously
- Verify final status deterministic

**Event ordering edge cases**:

- Events with same lamport clock (device ID tie-break)
- Events arriving out of order (sort by lamport clock)

**Sync queue edge cases**:

- Network error during sync → retry with backoff
- Max retries reached → mark permanently failed
- Duplicate sync requests → idempotency key prevents duplicates

**Form validation edge cases**:

- Name with exactly 100 characters
- Amount with exactly ₱999,999,999.00
- Description with exactly 500 characters

**Currency input edge cases**:

- User types "₱1,000.50" → parsed to 100050 cents
- User types "1000.5" → parsed to 100050 cents
- User types "1000" → parsed to 100000 cents

## Testing Best Practices

**Test naming**: Use descriptive names that explain the scenario

```typescript
// Good
it("should create reversal with negative amount when reversing positive payment");

// Bad
it("test reversal");
```

**One assertion per test**: Test one behavior per test case

```typescript
// Good
it("should update balance after payment");
it("should update status after payment");

// Avoid (testing multiple things)
it("should update balance and status after payment");
```

**Test edge cases explicitly**:

```typescript
it("should handle zero balance exactly");
it("should handle minimum amount (₱1.00)");
it("should handle maximum amount (₱999,999,999.00)");
```

**Mock external dependencies**: Don't test Supabase, test your code

```typescript
// Mock Supabase client
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  },
}));
```

**Test error paths**: Don't just test happy paths

```typescript
it("should throw error if debt not found");
it("should handle network error gracefully");
it("should show validation error for invalid amount");
```

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
