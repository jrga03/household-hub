# Phase 2c-1: Data-Layer Guards (Design)

**Date:** 2026-10-07
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md`, Phase 2 item "`readDb` facade, outbox invariant test, Dexie schema snapshot test" (4.5) plus the narrowed `asCents` allow-list (4.4). Query keys (4.3) are Phase 2c-2, with their own spec.
**Branch:** `phase-2c1-data-guards`, cut from `main` at `6f7c2f1` or later

## Goal

Make it impossible to write an entity row outside the data layer, prove with one test that every data-layer mutation writes its row and outbox item atomically, freeze the shipped Dexie schema history, and keep `asCents` inside the currency module and validation schemas. No runtime behavior changes.

## Background (measured on `main` at `6f7c2f1`, 2026-10-07)

| Item                                                                            | Measurement                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asCents` importers (non-test)                                                  | `src/lib/currency.ts`, `src/lib/validations/{rpcResults,syncRows,transactionsSearch}.ts`, and `src/lib/debts/payments.ts` (re-brands a `number` balance from `DebtLedgerView` for `diffCents`). The ESLint allow-list also names `supabaseQueries.ts`, `lib/offline/**`, `lib/debts/**` and `realtime-sync.ts`, which no longer import it.                                                                             |
| ESLint block order                                                              | The nanoid ban (debt sync) is a separate `no-restricted-imports` block for `src/lib/{debts,offline}/**`. A later block's `no-restricted-imports` replaces earlier ones for the same file, so narrowing the allow-list without merging blocks would silently drop one restriction.                                                                                                                                      |
| Writable `db` importers outside `src/lib/{offline,debts,sync,dexie}` (non-test) | 11 files. Read-only: `CompactionMonitor.tsx`, `pdf-import/steps/AccountMapStep.tsx`, `TransactionList.tsx`, `ui/category-selector.tsx`, `hooks/useSyncStatus.ts`, `lib/csv-exporter.ts`, `lib/pdf-import-duplicates.ts`, `routes/drafts.tsx`. Writers: `lib/import-drafts.ts` (local-only draft tables), `lib/realtime-sync.ts` (merges pulled rows), `stores/authStore.ts` (`db.delete()` + `db.open()` on sign-out). |
| Existing write guard                                                            | `arch/no-direct-dexie-writes` (Phase 1a) flags direct entity-table writes by call shape; `where().modify()` and casts are not covered.                                                                                                                                                                                                                                                                                 |
| Exported functions                                                              | `src/lib/offline` (10 modules) and `src/lib/debts` (11 modules) mix mutations, reads and building blocks in the same modules: about 26 mutations.                                                                                                                                                                                                                                                                      |
| Dexie                                                                           | 11 versions in `src/lib/dexie/db.ts`. `db.upgrade.test.ts` has one test (v9 → v10) with a hand-copied v9 store set.                                                                                                                                                                                                                                                                                                    |

## 1. `asCents` allow-list

- Allowed importers: `src/lib/currency.ts`, `src/lib/validations/**` (tests stay exempt).
- `DebtLedgerView` stores balances as `Cents` (`calculateDebtBalance` already returns `Cents`) and `recordPayment` uses `diffCents`, so `payments.ts` no longer needs `asCents`.
- The `asCents` and nanoid restrictions become one `no-restricted-imports` configuration for `src/lib/{debts,offline}/**`, so neither can replace the other. Architecture-lint cases: `asCents` flagged in `src/lib/debts/probe.ts` and `src/lib/offline/probe.ts`; nanoid still flagged there; `asCents` silent in `src/lib/validations/probe.ts`.

## 2. `readDb` facade

New module `src/lib/dexie/readDb.ts` exporting `readDb`: the same Dexie instance as `db`, typed read-only.

- Each table is a `ReadTable<T, TKey>` exposing `get`, `bulkGet`, `count`, `toArray`, `filter`, `orderBy`, `where`, `toCollection`, `each`.
- `where()` returns a read-only where-clause whose methods (`equals`, `anyOf`, `between`, `above`, `below`, `startsWith`, ...) return `ReadCollection<T, TKey>`; `filter()`, `orderBy()` and `toCollection()` return `ReadCollection` too. `ReadCollection` exposes reads and chaining (`toArray`, `first`, `last`, `count`, `sortBy`, `each`, `keys`, `primaryKeys`, `filter`, `and`, `limit`, `offset`, `reverse`) and no `modify` or `delete`.
- A type test (`readDb.test-d.ts` or `@ts-expect-error` lines in a vitest file) proves `put`, `add`, `delete`, `clear`, `bulkPut` on a table and `modify`/`delete` on a collection do not compile.
- Import restriction: a value import of `db` from `@/lib/dexie/db` is allowed only under `src/lib/{offline,debts,sync,dexie}/**` and in test files. Type-only imports (`import type { LocalTransaction }`) stay allowed everywhere. Everyone else uses `readDb`.

## 3. Relocations (no file exceptions)

- `src/lib/realtime-sync.ts` → `src/lib/sync/realtime.ts` (the pull half of sync). Callers and tests update imports.
- `src/lib/import-drafts.ts` → `src/lib/offline/importDrafts.ts` (local-only draft tables; drafts never sync, so its functions are classified exempt in section 4). Under the nanoid ban it switches new draft ids to `crypto.randomUUID()`; existing draft ids are opaque strings and stay readable. No lint exception.
- The sign-out wipe becomes `resetLocalDatabase()` in `src/lib/dexie/`, called by `authStore`.
- The eight read-only files switch from `db` to `readDb`.

Each move is a rename plus import updates with no behavior change.

## 4. Outbox invariant test

New file `src/lib/offline/outbox.invariant.test.ts` (real Dexie on fake-indexeddb).

- **Exhaustive by construction.** `import.meta.glob` loads every non-test module under `src/lib/offline/` and `src/lib/debts/`. Every exported function must appear in a classification table as `mutation` (with a scenario), `read`, or `exempt` with a one-line reason. Exempt examples: `mirrorBudgetsForMonth` (server cache mirror), sync queue maintenance (`syncQueue.ts`, `syncQueueOperations.ts`), `importDrafts` (local-only tables), the debts `prepare*` / `applyDebtWriteSet` / `commitDebtWriteSet` building blocks (covered through their callers), `ensureLocalRow` (hydrates from the server). An unclassified export fails the test and is named in the message.
- **Per mutation:** (a) a normal call adds at least one `syncQueue` row and every new row's `entity_type` belongs to the entities the scenario writes; (b) with `db.syncQueue.add` and `db.syncQueue.bulkAdd` both rejecting, the call fails (throws or returns `success: false`) and every entity table (`transactions`, `accounts`, `categories`, `budgets`, `debts`, `internalDebts`, `debtPayments`) plus `events` deep-equals its dump from before the call.
- **Fixtures:** small builders for an account, a category, a household transaction and an external debt, created through the public offline functions. Debt payment and reversal scenarios run through `createOfflineTransaction` / `updateOfflineTransaction` / `deleteOfflineTransaction` with a debt link and the direct `processDebtPayment` / `reverseDebtPayment` paths.
- The per-module atomicity tests added in the debt sync work stay; this test is the cross-cutting guard.

## 5. Dexie schema history

- A checked-in fixture `src/lib/dexie/schema-history.json` records each version number and its `stores()` argument, in order.
- A test reads the declared versions from the app's Dexie instance and compares them to the fixture with `toEqual`. Editing a shipped version fails; adding a version means appending one fixture entry.
- Dexie has no public "stores of version N" API, so the test reads its internal version list. A guard assertion checks that internal shape first (array of versions with a numeric version and a stores source), so a Dexie upgrade that changes it fails loudly instead of comparing nothing.
- Not a vitest snapshot: `vitest -u` would rewrite history without review.

## 6. Testing and gates

Unit: the `readDb` type test, the outbox invariant test, the schema history test, and the architecture-lint cases in sections 1 and 2 (`db` value import flagged in `src/hooks/probe.ts`, silent in `src/lib/offline/probe.ts` and for a type-only import).

Gates: the three tsc programs, lint, `npx vitest run`, build, `npm run size`, chromium smoke (the relocations touch the startup path: realtime initialization and sign-out).

## 7. Rollout

No migration, no runtime behavior change. Branch `phase-2c1-data-guards`, merged to `main` locally by fast-forward, pushed by the user; CI confirms.

## 8. Out of scope

- Query keys and `@tanstack/eslint-plugin-query` (Phase 2c-2).
- Narrowing `db` itself inside the data layer.
- A runtime write-blocking proxy.
- Adding tables to the `supabase_realtime` publication.

## 9. Decisions & Deferrals

- **2c split into 2c-1 (data layer) and 2c-2 (query keys) (decided 2026-10-07).** Why: the halves are independent; query keys change cache identity across components and need E2E attention, while 2c-1 is tests and import restrictions. Revisit: 2c-2 brainstorm.
- **Writers are relocated, not allow-listed (decided 2026-10-07).** Why: a directory-only allow-list keeps "does this enqueue a sync item?" a forced question for any new writer. Rejected: named file exceptions.
- **`readDb` is read-only through collections (decided 2026-10-07).** Why: closes the roadmap's known `where().modify()` gap at compile time. Rejected: `Pick<Table>` only (gap left to lint and tests); a runtime proxy (per-call overhead, casts already blocked by review and lint).
- **Schema history uses Dexie internals behind a shape guard (decided 2026-10-07).** Why: avoids restructuring `db.ts`, which runs migrations on users' devices. Rejected: exporting per-version store constants from `db.ts`. Revisit: if a Dexie upgrade breaks the guard.
- **Query key counts re-measured (2026-10-07):** 33 `queryKey` sites, 15 `invalidateQueries` calls, 12 files, 16 root strings (roadmap said 60 and 40). Input for the 2c-2 brainstorm.
