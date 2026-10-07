# Phase 2c-2: Query Keys (Design)

**Date:** 2026-10-07
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md`, Phase 2 item "`src/lib/query-keys.ts` + `@tanstack/eslint-plugin-query` strict" (4.3) and risk "Query key migration changes cache identity" (6).
**Branch:** `phase-2c2-query-keys`, cut from `main` at `93bd34f` or later

## Goal

One module owns every query key and every "this write makes that data stale" rule. Merge the near-duplicate roots, fix the derived data (balances, dashboard, budgets, category totals, analytics) that stays stale after a transaction write today, delete invalidations that target no query, and enforce the pattern with `@tanstack/eslint-plugin-query` strict plus an inline-key ban.

## Background (measured on `main` at `93bd34f`, 2026-10-07)

| Item                   | Measurement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Query definitions      | 14 across 13 roots: `accounts`, `account-balance/{id}`, `account-balances`, `categories`, `categories/grouped`, `transactions/{filters}` (infinite), `transactions/filter-summary/{filters}`, `transaction/{id}`, `category-totals/{month}`, `dashboard/{month}`, `budgets/{month}`, `analytics/{start,end,filters}` (`useAnalytics.ts`, multi-line, missing from the 2c-1 census), `transfers/{householdId}`, `debts/{hh}/external/active` (selector in `TransactionFormDialog.tsx`). 12 in `supabaseQueries.ts`. Only `accountsQueryOptions` and `categoriesQueryOptions` use the options pattern. |
| Invalidation sites     | 13 direct `invalidateQueries` calls, 13 `afterOutboxWrite(...)` callers passing bare key arrays (11 in `supabaseQueries.ts`, `TransactionFormDialog.tsx`, `useTransfers.ts`), the processor's fixed post-drain list of 6 roots, one `invalidateQueries()` with no filter in `GlobalSyncStatus.tsx`. 4 `getQueryData(["accounts" \| "categories"])` reads with hand-written generics.                                                                                                                                                                                                                 |
| Dead invalidations     | 10 calls target no query: `["debt-balance"]` (`TransactionList.tsx`, `delete-transaction.ts`, `TransactionFormDialog.tsx`), `["offline"]` (`useSyncProcessor.ts`), `["offline","sync","queue","count"]` and `["sync-queue","pending"]` (3 each, `useSyncQueueOperations.ts`). Debt pages and sync queue screens read Dexie through `useLiveQuery`.                                                                                                                                                                                                                                                   |
| Stale-after-write gaps | Transaction create, edit and delete do not invalidate account balances, `dashboard`, `category-totals`, `budgets` or `analytics`; delete invalidates `["accounts"]` (the account list) rather than balances. The post-drain list misses balances, `category-totals`, `analytics`, `transaction/{id}` and `debts`. These refresh only on `staleTime` (30 s to 5 min) or window focus. Found by reading; not reproduced at runtime.                                                                                                                                                                    |
| Cache persistence      | None (no persister). A key rename affects only the in-memory cache of the current page load.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Remote pulls           | Catch-up and realtime write Dexie and never touch the query cache. Online queries read Supabase, which already has the other device's rows, so pulls create no invalidation gap.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Plugin dry run         | `@tanstack/eslint-plugin-query@5.104.1` (peer ESLint ^9; repo has 9.39.3) `flat/recommended-strict` over `src`: 25 `prefer-query-options` reports, 0 from the other 7 rules, all in production files (`supabaseQueries.ts` 13, `useSyncQueueOperations.ts` 6, `TransactionList.tsx` 2, `TransactionFormDialog.tsx`, `useAnalytics.ts`, `useTransfers.ts`, `useSyncProcessor.ts` 1 each). It does not see arrays passed to `afterOutboxWrite` or the processor loop.                                                                                                                                  |
| Entity types           | `EntityType` (`src/types/sync.ts`) has 7 members: `transaction`, `account`, `category`, `budget`, `debt`, `internal_debt`, `debt_payment`.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Bundle                 | 354.7 KB gz against the 355 KB budget (2c-1 acceptance).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 1. Key factory: `src/lib/query-keys.ts`

Imports types only (`EntityType`, filter types, `QueryKey`). It must not import fetchers: `supabaseQueries.ts` imports `afterWrite.ts`, which imports the processor, and both will import this module.

```ts
export const queryKeys = {
  transactions: {
    all: ["transactions"] as const,
    list: (filters?: TransactionFilters) => ["transactions", "list", filters] as const,
    filterSummary: (filters?: TransactionFilters) => ["transactions", "filter-summary", filters] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    list: () => ["accounts", "list"] as const,
    balances: () => ["accounts", "balances"] as const,
    balance: (id: string) => ["accounts", "balances", id] as const,
  },
  categories: { all, list(), grouped() },
  budgets: { all, month(yyyyMM) },
  dashboard: { all, month(yyyyMM) },
  categoryTotals: { all, month(yyyyMM) },
  analytics: { all, range(start, end, filters) },
  transfers: { all, list(householdId) },
  debts: { all, selector(householdId, kind, status) },
};
```

- Merged roots: `transaction` → `transactions.detail`; `account-balance` and `account-balances` → `accounts.balances` (one prefix, so `accounts.balances()` clears both); `debt-balance` removed (no query).
- Transaction-derived roots (`dashboard`, `budgets`, `categoryTotals`, `analytics`) stay top-level and are reached through the write map (section 3), not through nesting.
- Month segments stay the `yyyy-MM` strings used today.

## 2. Query options builders

- Every query is built by an `xQueryOptions(...)` (or `xInfiniteQueryOptions`) function using `queryOptions()` / `infiniteQueryOptions()` and a `queryKeys` key, next to its fetcher, following `accountsQueryOptions`. Hooks become `useQuery(xQueryOptions(...))`. 14 definitions.
- The debts selector query leaves the component: its builder is exported from `supabaseQueries.ts` with the other reads.
- `getQueryData` reads use `xQueryOptions().queryKey`, whose data tag supplies the type, so the hand-written `<Account[]>` / `<Category[]>` generics go.

## 3. Write events and the invalidation map

`query-keys.ts` also exports:

```ts
export const invalidatesAfterWrite = {
  transaction: [
    transactions.all,
    accounts.balances(),
    categoryTotals.all,
    dashboard.all,
    budgets.all,
    analytics.all,
    transfers.all,
    debts.all,
  ],
  account: [accounts.all, transactions.all, dashboard.all, analytics.all, transfers.all],
  category: [
    categories.all,
    transactions.all,
    categoryTotals.all,
    dashboard.all,
    budgets.all,
    analytics.all,
  ],
  budget: [budgets.all, analytics.all],
  debt: [debts.all],
  internal_debt: [debts.all],
  debt_payment: [debts.all],
} satisfies Record<EntityType, readonly QueryKey[]>;

export function invalidateAfterWrite(
  queryClient: QueryClient,
  entities: EntityType | readonly EntityType[]
): void;
```

- Derived from what each fetcher reads: transaction lists join account and category names (`buildTransactionsListQuery`); balances read transactions; dashboard reads transactions, categories, accounts and balances; budgets read budgets, categories and transactions; category totals read categories and transactions; analytics reads transactions and budgets and filters by account and category; transfers read transactions and account names; the debts selector reads debts and payments (payments are created by debt-linked transaction writes).
- `invalidateAfterWrite` dedupes the union of keys for the given entities and calls `invalidateQueries({ queryKey })` once per key. Default `refetchType: "active"` means off-screen queries are only marked stale, so broad entries are cheap.
- `afterOutboxWrite(queryClient, userId, entities)` takes `EntityType | EntityType[]` instead of `QueryKey[]` and calls `invalidateAfterWrite` before and after the drain, as it does today with keys. Call sites hold no keys. `TransactionFormDialog`'s conditional debt keys and the hand-rolled debt invalidations in `TransactionList.tsx` and `delete-transaction.ts` collapse into `"transaction"`.
- The processor collects the `entity_type` of every item it synced in a drain and calls `invalidateAfterWrite` with that set, replacing the fixed list of 6 roots. A drain that synced nothing invalidates nothing (unchanged).
- The 10 dead invalidations are deleted. `GlobalSyncStatus`'s unfiltered `invalidateQueries()` (manual refresh-all) stays.

## 4. Enforcement

- Add `@tanstack/eslint-plugin-query` (dev dependency) with `flat/recommended-strict`, scoped to production files (tests exempt, as with the other `arch/*` rules). Lands at `warn`, flips to `error` in the last migration commit.
- Inline-key ban in production files except `src/lib/query-keys.ts`, at `error` in the same commit:

```js
{
  selector: "Property[key.name='queryKey'] > ArrayExpression, Property[key.name='queryKey'] > TSAsExpression > ArrayExpression",
  message: "Use queryKeys from @/lib/query-keys. Inline keys drift (see DATA-06) and break invalidation.",
}
```

The roadmap's selector (`> ArrayExpression`) misses `["x"] as const`; the extended selector covers it. An earlier `:matches(ArrayExpression, TSAsExpression > ArrayExpression)` form was wrong because the child combinator applies to the inner array, whose parent is the cast. It is registered as its own alias, `arch/no-inline-query-keys`, in `architecturePlugin` (`eslint.config.js`), following the Phase 1a pattern of one `no-restricted-syntax` alias per invariant so its file list cannot clobber the other four.

- The `afterOutboxWrite` and processor paths are enforced by types: they accept `EntityType`, not keys.

## 5. Commit sequence

1. Add the plugin at `warn` (production files).
2. `query-keys.ts` with the factory, then one entity per commit, behavior-preserving apart from the merged roots: accounts with balances, categories, budgets, dashboard with category totals, analytics, transfers, debts selector, transactions with detail (last, largest). During this step `afterOutboxWrite` still takes keys, now from the factory.
3. Write events: `invalidatesAfterWrite`, `invalidateAfterWrite`, `afterOutboxWrite(entity)`, all callers moved, coverage test (section 6). This is the behavior change that fixes the gaps.
4. Processor invalidates the drained entity types.
5. Delete the dead invalidations.
6. Plugin to `error`, `arch/no-inline-query-keys` on at `error`.
7. Docs: CLAUDE.md rule line, `src/hooks/README.md` and `src/components/transfers/README.md` examples, roadmap.

## 6. Testing and gates

- **Coverage test** (`src/lib/__tests__/query-keys.test.ts`): a table `READS` declares, for every `queryKeys` root, the entity types its queries read, typed `satisfies Record<keyof typeof queryKeys, readonly EntityType[]>` so a new root fails to compile until declared. For each root, each sample key it builds, and each entity it reads, assert some key in `invalidatesAfterWrite[entity]` prefix-matches the sample key (`partialMatchKey` from `@tanstack/react-query`). Also assert `accounts.balance(id)` is under `accounts.balances()` and `transactions.detail(id)` is under `transactions.all`.
- **Updated per commit:** `afterWrite.test.ts`, `processor.test.ts` (drained-types union, nothing synced → no invalidation), `outboxWriteHooks.test.tsx`, `useTransfers.test.tsx`, `TransactionFormDialog.test.tsx`.
- **Per commit:** lint, `vitest run`, the three tsc programs, build, `npm run size`.
- **Before merge:** chromium smoke; full chromium E2E compared per test against `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt` (a spec passing on `main` and failing on the branch is a regression); one browser check: add a transaction, then confirm the account balance and dashboard totals update without a reload.

## 7. Risks

- **A missed call site shows stale data instead of failing.** Mitigated by the coverage test, the plugin, and the inline-key ban.
- **Bundle at 354.7 / 355 KB gz.** The refactor should be neutral or smaller (shared builders, fewer literals); measure per commit and stop if a commit crosses the budget.
- **Processor change touches the drain path.** Only the invalidation call changes; covered by `processor.test.ts`.

## 8. Out of scope

- Removing the double invalidation in `afterOutboxWrite` (before and after the drain); behavior kept.
- Invalidation on catch-up or realtime pulls (no gap, see Background).
- `staleTime` tuning.

## 9. Decisions & Deferrals

- **Scope is key refactor plus invalidation fixes (decided 2026-10-07).** Why: the hierarchy alone cannot reach transaction-derived roots, and the gaps are the real stale-data risk. Behavior-preserving migration commits come first so any regression is attributable. Rejected: pure refactor; refactor plus dead-code removal only.
- **Merge only the near-duplicate roots (decided 2026-10-07).** Why: smallest cache-identity change that removes the sibling-root trap. Rejected: a shared `reports` root for dashboard, category totals and analytics; a flat factory with today's shapes.
- **Callers name the written entity, not keys (decided 2026-10-07).** Why: one typed map, exhaustive over `EntityType`, keeps dependency knowledge in one place and lets the processor reuse it. Rejected: factory keys chosen at each call site with a lint ban on literals.
- **Verification is the coverage test plus full chromium E2E and one browser check (decided 2026-10-07).** Why: a missing invalidation fails silently, so it needs a structural test. Rejected: unit tests and smoke only.
- **Plugin and ban apply to production files only (decided 2026-10-07).** Why: tests seed and assert caches with literal keys, which pins the shapes. Revisit: if tests drift from the factory.
- **Inline-key selector extended with `TSAsExpression` (decided 2026-10-07).** Why: the roadmap's selector misses `as const` keys, the form both existing builders use.
- **Re-measured counts replace the 2c-1 census (2026-10-07):** 14 query definitions in 13 roots (incl. `analytics`), 13 direct invalidations, 13 `afterOutboxWrite` callers, 10 dead invalidations, 25 plugin reports.
