# QA Test Plan - Household Hub

## Overview

This document serves as the master QA test plan for the Household Hub application. It maps every feature to its test coverage across three test types: unit tests (Vitest), E2E tests (Playwright), and AI QA scripts (Claude in Chrome).

## Test Type Summary

| Type          | Count        | Framework               | Runs In            |
| ------------- | ------------ | ----------------------- | ------------------ |
| Unit Tests    | ~550         | Vitest + fake-indexeddb | `npm test`         |
| E2E Tests     | ~50          | Playwright              | `npm run test:e2e` |
| AI QA Scripts | 52 scenarios | Claude in Chrome        | Manual             |

## Coverage Matrix

### Feature → Test Type Mapping

| Feature               | Unit Tests                                                   | E2E (Playwright)                         | AI QA Script         |
| --------------------- | ------------------------------------------------------------ | ---------------------------------------- | -------------------- |
| **Authentication**    | authStore.test.ts                                            | auth.spec.ts                             | auth.md (5)          |
| **Dashboard**         | —                                                            | dashboard.spec.ts                        | dashboard.md (4)     |
| **Transactions CRUD** | transaction validation                                       | transactions.spec.ts                     | transactions.md (8)  |
| **Budgets**           | budgetCalculations.test.ts                                   | budgets.spec.ts                          | budgets.md (6)       |
| **Transfers**         | —                                                            | transfers.spec.ts                        | transfers.md (5)     |
| **Categories**        | —                                                            | categories.spec.ts                       | categories.md (5)    |
| **CSV Import**        | duplicate-detector.test.ts, importStore.test.ts              | import.spec.ts                           | import-export.md (4) |
| **CSV Export**        | —                                                            | settings.spec.ts                         | import-export.md (2) |
| **Analytics**         | —                                                            | analytics.spec.ts                        | analytics.md (4)     |
| **Debts**             | —                                                            | debts/\*.spec.ts (existing)              | debts.md (5)         |
| **Offline/Sync**      | syncStore, syncIssuesStore, conflictStore, processor.test.ts | offline.spec.ts, sync.spec.ts (existing) | offline-sync.md (4)  |
| **Settings**          | —                                                            | settings.spec.ts                         | —                    |
| **Navigation**        | navStore.test.ts                                             | —                                        | —                    |
| **Device ID**         | device.test.ts                                               | —                                        | —                    |
| **Sync Queue**        | syncQueue.test.ts (existing)                                 | —                                        | —                    |
| **Idempotency**       | idempotency.test.ts (existing)                               | —                                        | —                    |
| **Event Compactor**   | event-compactor.test.ts (existing)                           | —                                        | —                    |
| **Currency**          | currency.test.ts (existing)                                  | —                                        | —                    |
| **Account Balance**   | accountBalance.test.ts (existing)                            | —                                        | —                    |
| **PWA**               | —                                                            | pwa.spec.ts (existing)                   | —                    |
| **Accessibility**     | —                                                            | accessibility.spec.ts (existing)         | —                    |
| **Keyboard Nav**      | —                                                            | keyboard-nav.spec.ts (existing)          | —                    |

### Unit Test Files (New)

| File                                                | Tests | What It Covers                                              |
| --------------------------------------------------- | ----- | ----------------------------------------------------------- |
| `src/stores/__tests__/syncStore.test.ts`            | 7     | Sync status, last sync time, pending changes                |
| `src/stores/__tests__/conflictStore.test.ts`        | 8     | Add/remove/clear conflicts, pending count                   |
| `src/stores/__tests__/syncIssuesStore.test.ts`      | 8     | Add/remove/clear sync issues                                |
| `src/stores/__tests__/navStore.test.ts`             | 10    | Sidebar, mobile nav, quick add, localStorage persist        |
| `src/stores/__tests__/importStore.test.ts`          | 14    | CSV import wizard state machine                             |
| `src/stores/__tests__/authStore.test.ts`            | 12    | Auth lifecycle, unsynced data warning, export abort         |
| `src/lib/validations/__tests__/transaction.test.ts` | 22    | Zod schema: date, description, amount, enums, cross-field   |
| `src/lib/__tests__/duplicate-detector.test.ts`      | 16    | Fingerprint generation, duplicate detection                 |
| `src/lib/__tests__/device.test.ts`                  | 7     | Device ID generation, storage, cleanup                      |
| `src/hooks/__tests__/budgetCalculations.test.ts`    | 9     | Budget totals, percentages, zero-target safety              |
| `src/lib/sync/__tests__/processor.test.ts`          | 25    | Queue processing, error handling, ID mapping, table mapping |

### E2E Spec Files (New)

| File                           | Tests | Cleanup Method              |
| ------------------------------ | ----- | --------------------------- |
| `tests/e2e/dashboard.spec.ts`  | 4     | None (read-only)            |
| `tests/e2e/budgets.spec.ts`    | 3     | `cleanupTestBudgets()`      |
| `tests/e2e/transfers.spec.ts`  | 3     | `cleanupTestTransfers()`    |
| `tests/e2e/categories.spec.ts` | 4     | `cleanupTestCategories()`   |
| `tests/e2e/import.spec.ts`     | 2     | `cleanupTestTransactions()` |
| `tests/e2e/analytics.spec.ts`  | 4     | None (read-only)            |
| `tests/e2e/settings.spec.ts`   | 4     | None (read-only)            |

## Test Data Requirements

### Unit Tests

- **No external dependencies** — all data mocked or created in-memory
- `fake-indexeddb` provides IndexedDB mock
- Supabase mocked via `vi.mock`

### E2E Tests

- **Supabase instance required** — local or staging
- **Test user**: test@example.com / TestPassword123!
- **Test data prefix**: All test-created data uses `[E2E]` in description/name
- **Accounts**: At least 2 (Cash, Checking/Bank)
- **Categories**: At least 3 with parent-child hierarchy
- **Transactions**: At least 10 across different months
- **`.env.test`**: Required for DB cleanup (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

### AI QA Scripts

- Same as E2E: running dev server + Supabase + test user
- Chrome browser with DevTools access (for offline testing)

## Cleanup Procedures

### Unit Tests

- `afterEach`: `localStorage.clear()` + `vi.clearAllMocks()` (handled by `src/test/setup.ts`)
- Zustand stores: Reset via `store.setState()` in `beforeEach`

### E2E Tests

- **DB Cleanup**: `tests/e2e/fixtures/db-cleanup.ts` provides cleanup functions
- **Convention**: `afterEach` in CRUD specs calls appropriate cleanup
- **Pattern**: `[E2E]` prefix in all test data for reliable identification
- **Fallback**: Manual cleanup via Supabase dashboard

### AI QA Scripts

- Each scenario includes manual cleanup steps
- All test data uses `[E2E]` prefix for identification

## Running Instructions

### Unit Tests

```bash
# Run all unit tests
npm test -- --run

# Run specific test file
npx vitest run src/stores/__tests__/authStore.test.ts

# Watch mode
npm test

# With coverage
npx vitest run --coverage
```

### E2E Tests

```bash
# Run all E2E tests (requires preview server)
npm run test:e2e

# Run specific project (browser)
npm run test:e2e -- --project=chromium

# Run smoke tests only (auth + transactions + budgets)
npm run test:e2e:smoke

# Debug mode
npm run test:e2e:debug

# UI mode
npm run test:e2e:ui
```

### AI QA Scripts

```
1. Start dev server: npm run dev
2. Open Chrome to http://localhost:3000
3. Provide a script from tests/qa-scripts/ to Claude
4. Claude executes steps and verifies results
```

## Pre-push Hook (unchanged)

```bash
# .husky/pre-push runs:
npm run lint:fix
npm test    # Unit tests only — E2E not triggered
```

## Known Limitations

| Limitation                              | Impact                                                               | Workaround                                                       |
| --------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| CSV download verification in Playwright | Cannot read downloaded file contents                                 | Verify download event triggers; manual check                     |
| Offline simulation in E2E               | `context.setOffline()` doesn't fully simulate service worker offline | Dedicated offline.spec.ts uses browser context API               |
| Transfer exclusion E2E                  | Hard to verify exact arithmetic in E2E                               | Unit tests cover calculation; QA script does manual verification |
| Multi-device sync E2E                   | Requires two browser contexts with different auth                    | Existing sync.spec.ts covers this                                |
| iOS Safari background sync              | Cannot test in Playwright (WebKit != Safari)                         | Manual QA on real device                                         |
| Storage quota warnings                  | Hard to trigger in test environment                                  | Unit test mocks `navigator.storage.estimate()`                   |
