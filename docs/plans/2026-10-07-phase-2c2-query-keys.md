# Phase 2c-2 Query Keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every query key comes from `src/lib/query-keys.ts`, every query is an `xQueryOptions()` builder, and every write names the entity it changed so one typed map decides which cached data goes stale.

**Architecture:** A key factory (`queryKeys`) with merged roots replaces inline arrays. Queries become `queryOptions()` / `infiniteQueryOptions()` builders next to their fetchers. `afterOutboxWrite` and the sync processor stop passing keys and pass `EntityType`s, resolved through `invalidatesAfterWrite` (exhaustive over `EntityType`). `@tanstack/eslint-plugin-query` strict and `arch/no-inline-query-keys` enforce the result.

**Tech Stack:** TypeScript 5.9, TanStack Query 5.90, `@tanstack/eslint-plugin-query` 5.104, ESLint 9 flat config, vitest.

**Spec:** `docs/plans/2026-10-07-phase-2c2-query-keys-design.md` (approved 2026-10-07).

## Global Constraints

- Tasks 2-6 change cache identity only for the merged roots: accounts list `["accounts"]` → `["accounts","list"]`, `["account-balance",id]` → `["accounts","balances",id]`, `["account-balances"]` → `["accounts","balances"]`, categories list `["categories"]` → `["categories","list"]`, transactions list `["transactions",filters]` → `["transactions","list",filters]`, `["transaction",id]` → `["transactions","detail",id]`. Every other key keeps today's exact shape. Invalidation behavior changes only in Tasks 7-9.
- No persister exists; no on-device migration is needed.
- Before each commit in Tasks 2-9: `npm run build >/dev/null && npm run size`; stop and report if a commit crosses 355 KB gz (spec section 7).
- `query-keys.ts` imports only types plus `hashKey` from `@tanstack/react-query`; it must never import a fetcher module (`supabaseQueries.ts` → `afterWrite.ts` → processor would cycle).
- The plugin and `arch/no-inline-query-keys` apply to production files only (`srcTestFiles` ignored).
- No `any`. No `!` in production code (processor and `afterWrite.ts` are under `tsconfig.strict.json`).
- Conventional Commits; never add Co-Authored-By or Claude Session lines.
- Gates: `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.tests.json`, `npx tsc --noEmit -p tsconfig.strict.json`, `npm run lint`, `npx vitest run`, `npm run build`, `npm run size` (355 KB gz budget; baseline 354.7), `npm run test:e2e:smoke`.
- `prefer-query-options` warning count after each task (from `npx eslint src 2>&1 | grep -c "@tanstack/query/prefer-query-options"`): Task 1 → 25, Task 2 → 21, Task 3 → 18, Task 4 → 15, Task 5 → 12, Task 6 → 9, Task 7 → 7, Task 9 → 0.

## File Structure

| File                                                                                                 | Responsibility                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/lib/query-keys.ts` (new)                                                                        | `queryKeys` factory; `invalidatesAfterWrite`, `keysAfterWrite`, `invalidateAfterWrite` (Task 7) |
| `src/lib/__tests__/query-keys.test.ts` (new)                                                         | Shapes, prefix nesting, write coverage                                                          |
| `src/lib/__tests__/queryOptions.test.ts` (new)                                                       | Each builder's `queryKey` equals its factory key                                                |
| `src/lib/supabaseQueries.ts`                                                                         | 12 builders (+ debts selector), hooks call `useQuery(builder)`, writes name entities            |
| `src/hooks/useAnalytics.ts`, `src/hooks/useTransfers.ts`                                             | `analyticsQueryOptions`, `transfersQueryOptions`                                                |
| `src/components/TransactionFormDialog.tsx`                                                           | Uses `activeExternalDebtsQueryOptions`; writes `"transaction"`                                  |
| `src/lib/offline/afterWrite.ts`                                                                      | `afterOutboxWrite(queryClient, userId, entities)`                                               |
| `src/lib/sync/processor.ts`                                                                          | Invalidates the drained entity types                                                            |
| `src/lib/delete-transaction.ts`, `src/components/TransactionList.tsx`, `src/routes/transactions.tsx` | Debt invalidations and the `queryClient` argument removed                                       |
| `src/hooks/useSyncQueueOperations.ts`, `src/hooks/useSyncProcessor.ts`                               | Dead invalidations removed                                                                      |
| `eslint.config.js`, `src/lib/__tests__/architecture-lint.test.ts`                                    | Plugin strict, `arch/no-inline-query-keys`, lint cases                                          |
| `CLAUDE.md`, `src/hooks/README.md`, `src/components/transfers/README.md`                             | Docs                                                                                            |

## Progress

- [ ] Task 0: Branch and baseline
- [ ] Task 1: Key factory and plugin at `warn`
- [ ] Task 2: Accounts and balances
- [ ] Task 3: Categories
- [ ] Task 4: Budgets, dashboard, category totals
- [ ] Task 5: Analytics, transfers, debts selector
- [ ] Task 6: Transactions (list, summary, detail)
- [ ] Task 7: Write events and the invalidation map
- [ ] Task 8: Processor invalidates drained entity types
- [ ] Task 9: Delete dead invalidations
- [ ] Task 10: Enforcement at `error`
- [ ] Task 11: Acceptance, docs, merge

---

### Task 0: Branch and baseline

- [ ] **Step 1:** `git status -sb` (expect `main`, clean, ahead of origin by docs-only commits), then `git switch -c phase-2c2-query-keys`.
- [ ] **Step 2:** Record baselines:

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npx tsc --noEmit -p tsconfig.json; echo "tsc app $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "tsc strict $?"
npm run build >/dev/null 2>&1 && npm run size 2>&1 | grep -i total
```

Expected (2c-1 acceptance at `23226e6`, docs-only since): 95 files passed + 1 skipped, 1218 tests + 1 skipped; tsc 0/0; 354.7 KB gz. Write the actual numbers into Acceptance results.

---

### Task 1: Key factory and plugin at `warn`

**Files:**

- Create: `src/lib/query-keys.ts`, `src/lib/__tests__/query-keys.test.ts`
- Modify: `src/hooks/useAnalytics.ts:77` (export `AnalyticsFilters`), `eslint.config.js`, `package.json`, `package-lock.json`

**Interfaces:**

- Produces: `queryKeys` (shape below), used by every later task. `SAMPLES` in the test file, extended with a coverage test in Task 7.

- [ ] **Step 1: Write the failing test** (`src/lib/__tests__/query-keys.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { partialMatchKey, type QueryKey } from "@tanstack/react-query";
import type { EntityType } from "@/types/sync";
import { queryKeys } from "@/lib/query-keys";

type Sample = { key: QueryKey; reads: readonly EntityType[] };

// Every root, every builder, and the entity types its query reads (from the
// fetcher's tables). Adding a root to queryKeys fails to compile until listed.
const SAMPLES = {
  transactions: [
    {
      key: queryKeys.transactions.list({ search: "rice" }),
      reads: ["transaction", "account", "category"],
    },
    {
      key: queryKeys.transactions.filterSummary(undefined),
      reads: ["transaction", "account", "category"],
    },
    { key: queryKeys.transactions.detail("t1"), reads: ["transaction", "account", "category"] },
  ],
  accounts: [
    { key: queryKeys.accounts.list(), reads: ["account"] },
    { key: queryKeys.accounts.balances(), reads: ["account", "transaction"] },
    { key: queryKeys.accounts.balance("a1"), reads: ["account", "transaction"] },
  ],
  categories: [
    { key: queryKeys.categories.list(), reads: ["category"] },
    { key: queryKeys.categories.grouped(), reads: ["category"] },
  ],
  budgets: [
    { key: queryKeys.budgets.month("2026-10"), reads: ["budget", "category", "transaction"] },
  ],
  dashboard: [
    { key: queryKeys.dashboard.month("2026-10"), reads: ["transaction", "category", "account"] },
  ],
  categoryTotals: [
    { key: queryKeys.categoryTotals.month("2026-10"), reads: ["transaction", "category"] },
  ],
  analytics: [
    {
      key: queryKeys.analytics.range("2026-01-01", "2026-10-31", { accountId: "a1" }),
      reads: ["transaction", "budget", "category", "account"],
    },
  ],
  transfers: [{ key: queryKeys.transfers.list("hh-1"), reads: ["transaction", "account"] }],
  debts: [
    { key: queryKeys.debts.activeExternal("hh-1"), reads: ["debt", "debt_payment", "transaction"] },
  ],
} satisfies Record<keyof typeof queryKeys, readonly Sample[]>;

describe("queryKeys", () => {
  it.each(Object.entries(SAMPLES))("nests every %s key under its root", (root, samples) => {
    const all = queryKeys[root as keyof typeof queryKeys].all;
    for (const { key } of samples) expect(partialMatchKey(key, all)).toBe(true);
  });

  it("nests a single balance under the balances prefix", () => {
    expect(partialMatchKey(queryKeys.accounts.balance("a1"), queryKeys.accounts.balances())).toBe(
      true
    );
  });

  it("keeps the account list out of the balances prefix", () => {
    expect(partialMatchKey(queryKeys.accounts.list(), queryKeys.accounts.balances())).toBe(false);
  });

  it("keeps today's shapes for roots that were not merged", () => {
    expect(queryKeys.transactions.filterSummary(undefined)).toEqual([
      "transactions",
      "filter-summary",
      undefined,
    ]);
    expect(queryKeys.categories.grouped()).toEqual(["categories", "grouped"]);
    expect(queryKeys.budgets.month("2026-10")).toEqual(["budgets", "2026-10"]);
    expect(queryKeys.dashboard.month("2026-10")).toEqual(["dashboard", "2026-10"]);
    expect(queryKeys.categoryTotals.month("2026-10")).toEqual(["category-totals", "2026-10"]);
    expect(queryKeys.analytics.range("a", "b", undefined)).toEqual([
      "analytics",
      "a",
      "b",
      undefined,
    ]);
    expect(queryKeys.transfers.list("hh-1")).toEqual(["transfers", "hh-1"]);
    expect(queryKeys.debts.activeExternal("hh-1")).toEqual(["debts", "hh-1", "external", "active"]);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/__tests__/query-keys.test.ts`. Expected: FAIL, cannot resolve `@/lib/query-keys`.
- [ ] **Step 3: Export `AnalyticsFilters`** in `src/hooks/useAnalytics.ts:77`: `interface AnalyticsFilters {` → `export interface AnalyticsFilters {`.
- [ ] **Step 4: Write `src/lib/query-keys.ts`**

```ts
import type { AnalyticsFilters } from "@/hooks/useAnalytics";
import type { TransactionFilters } from "@/types/transactions";

/**
 * Every TanStack Query key in the app. Keys nest under one root per entity so
 * invalidating `x.all` clears everything about x. Data derived from several
 * entities (dashboard, budgets, totals, analytics) keeps its own root and is
 * reached through invalidatesAfterWrite.
 */
export const queryKeys = {
  transactions: {
    all: ["transactions"] as const,
    list: (filters?: TransactionFilters) => ["transactions", "list", filters] as const,
    filterSummary: (filters?: TransactionFilters) =>
      ["transactions", "filter-summary", filters] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    list: () => ["accounts", "list"] as const,
    balances: () => ["accounts", "balances"] as const,
    balance: (id: string) => ["accounts", "balances", id] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: () => ["categories", "list"] as const,
    grouped: () => ["categories", "grouped"] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    month: (yyyyMM: string) => ["budgets", yyyyMM] as const,
  },
  dashboard: {
    all: ["dashboard"] as const,
    month: (yyyyMM: string) => ["dashboard", yyyyMM] as const,
  },
  categoryTotals: {
    all: ["category-totals"] as const,
    month: (yyyyMM: string) => ["category-totals", yyyyMM] as const,
  },
  analytics: {
    all: ["analytics"] as const,
    range: (startDate: string, endDate: string, filters?: AnalyticsFilters) =>
      ["analytics", startDate, endDate, filters] as const,
  },
  transfers: {
    all: ["transfers"] as const,
    list: (householdId: string) => ["transfers", householdId] as const,
  },
  debts: {
    all: ["debts"] as const,
    activeExternal: (householdId: string) => ["debts", householdId, "external", "active"] as const,
  },
};
```

- [ ] **Step 5:** `npx vitest run src/lib/__tests__/query-keys.test.ts`. Expected: PASS (4 + 9 `it.each` cases).
- [ ] **Step 6: Install the plugin.** `npm install -D @tanstack/eslint-plugin-query@^5.104.1`. Check `git diff package.json` shows only the new devDependency.
- [ ] **Step 7: Register it at `warn`** in `eslint.config.js`. Add the import after the `jsxA11y` import:

```js
import pluginQuery from "@tanstack/eslint-plugin-query";
```

Add after the `const srcTestFiles = [...]` declaration:

```js
// TanStack Query strict rules for production code (roadmap 4.3). Landed at
// warn while the migration runs; Task 10 of the 2c-2 plan removes this map.
const queryPluginConfigs = pluginQuery.configs["flat/recommended-strict"].map((config) => ({
  ...config,
  files: ["src/**/*.{ts,tsx}"],
  ignores: srcTestFiles,
  rules: Object.fromEntries(Object.keys(config.rules ?? {}).map((ruleId) => [ruleId, "warn"])),
}));
```

Insert `...queryPluginConfigs,` into the exported array directly after `{ ...jsxA11y.flatConfigs.recommended, files: ["src/**/*.tsx"] },`.

- [ ] **Step 8:** `npx eslint src 2>&1 | grep -c "@tanstack/query/prefer-query-options"` → expected `25`. `npm run lint; echo "lint $?"` → expected exit 0 (warnings only). `npx tsc --noEmit -p tsconfig.json; echo $?` → 0.
- [ ] **Step 9: Commit**

```bash
git add src/lib/query-keys.ts src/lib/__tests__/query-keys.test.ts src/hooks/useAnalytics.ts eslint.config.js package.json package-lock.json
git commit -m "feat(query): query key factory and eslint-plugin-query strict at warn"
```

---

### Task 2: Accounts and balances

**Files:**

- Create: `src/lib/__tests__/queryOptions.test.ts`
- Modify: `src/lib/supabaseQueries.ts` (lines 1, 62-140, 213-320, 721, 744-750), `src/lib/__tests__/outboxWriteHooks.test.tsx:144-190`

**Interfaces:**

- Consumes: `queryKeys.accounts.*` (Task 1).
- Produces: `accountsQueryOptions()` (key changes to `queryKeys.accounts.list()`), `accountBalanceQueryOptions(accountId: string)`, `accountBalancesQueryOptions()`. `useAccountBalance` / `useAccountBalances` keep their signatures.

- [ ] **Step 1: Write the failing builder test** (`src/lib/__tests__/queryOptions.test.ts`)

```ts
import { describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/lib/query-keys";
import {
  accountBalanceQueryOptions,
  accountBalancesQueryOptions,
  accountsQueryOptions,
} from "@/lib/supabaseQueries";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));

// Pins cache identity: each builder must key its query with the factory key.
describe("query options builders", () => {
  it("accounts", () => {
    expect(accountsQueryOptions().queryKey).toEqual(queryKeys.accounts.list());
    expect(accountBalanceQueryOptions("a1").queryKey).toEqual(queryKeys.accounts.balance("a1"));
    expect(accountBalancesQueryOptions().queryKey).toEqual(queryKeys.accounts.balances());
  });
});
```

- [ ] **Step 2: Seed the duplicate-name tests with the new key.** In `src/lib/__tests__/outboxWriteHooks.test.tsx`: add `import { queryKeys } from "@/lib/query-keys";` and change `QueryClient, QueryClientProvider` import to `QueryClient, QueryClientProvider, type QueryKey`; change `function clientWith(queryKey: string[], rows: unknown[])` to `function clientWith(queryKey: QueryKey, rows: unknown[])`; replace the three `clientWith(["accounts"],` / `clientWith(\n      ["accounts"],` seeds with `queryKeys.accounts.list()`.
- [ ] **Step 3:** `npx vitest run src/lib/__tests__/queryOptions.test.ts src/lib/__tests__/outboxWriteHooks.test.tsx`. Expected: FAIL (`accountBalanceQueryOptions` is not exported; the two account duplicate-name rejection tests resolve instead of rejecting).
- [ ] **Step 4: Imports** (`supabaseQueries.ts:1`):

```ts
import {
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
```

and add after the `./offline/afterWrite` import: `import { queryKeys } from "./query-keys";`. (`infiniteQueryOptions` joins this import in Task 6; adding it now fails `noUnusedLocals`.)

- [ ] **Step 5: `accountsQueryOptions`.** Replace

```ts
  return {
    queryKey: ["accounts"] as const,
```

with

```ts
  return queryOptions({
    queryKey: queryKeys.accounts.list(),
```

and its closing `  };\n}` (after `networkMode: "always" as const, ...`) with `  });\n}`.

- [ ] **Step 6: Typed cache reads.** Both `queryClient.getQueryData<Account[]>(["accounts"]) ?? []` (lines 107, 128) become `queryClient.getQueryData(accountsQueryOptions().queryKey) ?? []`.
- [ ] **Step 7: Account write invalidations.** In `useCreateAccount` and `useUpdateAccount`, `afterOutboxWrite(queryClient, userId, [["accounts"]])` → `afterOutboxWrite(queryClient, userId, [queryKeys.accounts.all])`. In `useDeleteTransaction`, `["accounts"]` → `queryKeys.accounts.all`. In `useSetTransactionStatus`, replace the two lines `["account-balance"],` and `["account-balances"],` with one line `queryKeys.accounts.balances(),`.
- [ ] **Step 8: Balance builders.** Replace

```ts
export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ["account-balance", accountId],
```

with

```ts
export function accountBalanceQueryOptions(accountId: string) {
  return queryOptions({
    queryKey: queryKeys.accounts.balance(accountId),
```

and after that function's closing `}` add:

```ts
export function useAccountBalance(accountId: string) {
  return useQuery(accountBalanceQueryOptions(accountId));
}
```

Do the same for `useAccountBalances`: `export function accountBalancesQueryOptions() {\n  return queryOptions({\n    queryKey: queryKeys.accounts.balances(),` and add `export function useAccountBalances() {\n  return useQuery(accountBalancesQueryOptions());\n}` after it. Move the JSDoc blocks so each stays above the hook it documents.

- [ ] **Step 9:** `npx vitest run src/lib/__tests__/queryOptions.test.ts src/lib/__tests__/outboxWriteHooks.test.tsx src/lib/__tests__/query-keys.test.ts` → PASS. `npx tsc --noEmit -p tsconfig.json; echo $?` → 0. Warning count → `21`.
- [ ] **Step 10: Commit**

```bash
git add src/lib/supabaseQueries.ts src/lib/__tests__/queryOptions.test.ts src/lib/__tests__/outboxWriteHooks.test.tsx
git commit -m "refactor(query): accounts and balances on the key factory"
```

---

### Task 3: Categories

**Files:** Modify `src/lib/supabaseQueries.ts` (330-443), `src/lib/__tests__/queryOptions.test.ts`, `src/lib/__tests__/outboxWriteHooks.test.tsx:194-230`

**Interfaces:**

- Produces: `categoriesQueryOptions()` (key → `queryKeys.categories.list()`), `categoriesGroupedQueryOptions()`.

- [ ] **Step 1: Failing tests.** Add `categoriesQueryOptions, categoriesGroupedQueryOptions` to the `queryOptions.test.ts` import and:

```ts
it("categories", () => {
  expect(categoriesQueryOptions().queryKey).toEqual(queryKeys.categories.list());
  expect(categoriesGroupedQueryOptions().queryKey).toEqual(queryKeys.categories.grouped());
});
```

In `outboxWriteHooks.test.tsx` replace the three `["categories"],` seeds with `queryKeys.categories.list(),`.

- [ ] **Step 2:** Run both files. Expected: FAIL (`categoriesGroupedQueryOptions` missing; category duplicate rejections resolve).
- [ ] **Step 3: `categoriesQueryOptions`.** `return {\n    queryKey: ["categories"] as const,` → `return queryOptions({\n    queryKey: queryKeys.categories.list(),` and its closing `  };` → `  });`.
- [ ] **Step 4: Grouped builder.** `export function useCategoriesGrouped() {\n  return useQuery({\n    queryKey: ["categories", "grouped"],` → `export function categoriesGroupedQueryOptions() {\n  return queryOptions({\n    queryKey: queryKeys.categories.grouped(),`; after its closing brace add:

```ts
// Fetch categories grouped by parent
export function useCategoriesGrouped() {
  return useQuery(categoriesGroupedQueryOptions());
}
```

- [ ] **Step 5:** `queryClient.getQueryData<Category[]>(["categories"]) ?? []` (two sites) → `queryClient.getQueryData(categoriesQueryOptions().queryKey) ?? []`. `afterOutboxWrite(queryClient, userId, [["categories"]])` (two sites) → `afterOutboxWrite(queryClient, userId, [queryKeys.categories.all])`.
- [ ] **Step 6:** Run the two files plus `query-keys.test.ts` → PASS; tsc app 0; warning count → `18`.
- [ ] **Step 7: Commit:** `git add` the three files, then `git commit -m "refactor(query): categories on the key factory"`.

---

### Task 4: Budgets, dashboard, category totals

**Files:** Modify `src/lib/supabaseQueries.ts` (1075-1088, 1383-1407, 1596-1617, budget mutations), `src/lib/__tests__/queryOptions.test.ts`

**Interfaces:**

- Produces: `categoryTotalsQueryOptions(month: Date, staleTime?: number)`, `dashboardQueryOptions(currentMonth: Date)`, `budgetsQueryOptions(month: Date)`. Hook signatures unchanged. Key shapes unchanged.

- [ ] **Step 1: Failing test.** Import the three builders and add:

```ts
it("month-keyed reads", () => {
  const october = new Date(2026, 9, 15);
  expect(categoryTotalsQueryOptions(october).queryKey).toEqual(
    queryKeys.categoryTotals.month("2026-10")
  );
  expect(dashboardQueryOptions(october).queryKey).toEqual(queryKeys.dashboard.month("2026-10"));
  expect(budgetsQueryOptions(october).queryKey).toEqual(queryKeys.budgets.month("2026-10"));
});
```

- [ ] **Step 2:** Run → FAIL (not exported).
- [ ] **Step 3: Category totals.** Replace the body of `useCategoryTotals` (from `export function useCategoryTotals(` to its closing brace) with:

```ts
export function categoryTotalsQueryOptions(month: Date, staleTime?: number) {
  // Adaptive caching: Historical months can be cached longer since they rarely change
  const isCurrentMonth = format(month, "yyyy-MM") === format(new Date(), "yyyy-MM");
  const defaultStaleTime = isCurrentMonth
    ? 60 * 1000 // 1 minute for current month (frequent updates expected)
    : 10 * 60 * 1000; // 10 minutes for historical months (rarely change)

  return queryOptions({
    queryKey: queryKeys.categoryTotals.month(format(month, "yyyy-MM")),
    queryFn: () => fetchCategoryTotalsFromServer(month),
    staleTime: staleTime ?? defaultStaleTime,
  });
}

export function useCategoryTotals(month: Date, options?: { staleTime?: number }) {
  return useQuery(categoryTotalsQueryOptions(month, options?.staleTime));
}
```

Keep the JSDoc above `useCategoryTotals`.

- [ ] **Step 4: Dashboard.** `export function useDashboardData(currentMonth: Date) {\n  return useQuery({\n    queryKey: ["dashboard", format(currentMonth, "yyyy-MM")],` → `export function dashboardQueryOptions(currentMonth: Date) {\n  return queryOptions({\n    queryKey: queryKeys.dashboard.month(format(currentMonth, "yyyy-MM")),`; add after it:

```ts
export function useDashboardData(currentMonth: Date) {
  return useQuery(dashboardQueryOptions(currentMonth));
}
```

- [ ] **Step 5: Budgets.** `export function useBudgets(month: Date) {\n  return useQuery({\n    queryKey: ["budgets", format(month, "yyyy-MM")],` → `export function budgetsQueryOptions(month: Date) {\n  return queryOptions({\n    queryKey: queryKeys.budgets.month(format(month, "yyyy-MM")),`; add `export function useBudgets(month: Date) {\n  return useQuery(budgetsQueryOptions(month));\n}` after it, JSDoc above the hook. In the four budget mutations, `[["budgets"]]` → `[queryKeys.budgets.all]`.
- [ ] **Step 6:** `npx vitest run src/lib/__tests__/ src/__tests__/` → PASS; tsc app 0; warning count → `15`.
- [ ] **Step 7: Commit** `refactor(query): budgets, dashboard and category totals on the key factory`.

---

### Task 5: Analytics, transfers, debts selector

**Files:** Modify `src/hooks/useAnalytics.ts:1,95-189`, `src/hooks/useTransfers.ts`, `src/lib/supabaseQueries.ts` (new builder), `src/components/TransactionFormDialog.tsx:24-38,114-132`, `src/lib/__tests__/queryOptions.test.ts`

**Interfaces:**

- Produces: `analyticsQueryOptions(startDate: Date, endDate: Date, filters?: AnalyticsFilters)` (in `useAnalytics.ts`), `transfersQueryOptions(householdId: string)` (in `useTransfers.ts`), `activeExternalDebtsQueryOptions()` (in `supabaseQueries.ts`, returns `(Debt & { balance: Cents })[]`-compatible data, same as today's inline query).

- [ ] **Step 1: Failing test.** Add to `queryOptions.test.ts`:

```ts
import { analyticsQueryOptions } from "@/hooks/useAnalytics";
import { transfersQueryOptions } from "@/hooks/useTransfers";
```

(add `activeExternalDebtsQueryOptions` to the `@/lib/supabaseQueries` import) and:

```ts
it("analytics, transfers, debts selector", () => {
  const filters = { accountId: "a1" };
  expect(
    analyticsQueryOptions(new Date(2026, 0, 1), new Date(2026, 9, 31), filters).queryKey
  ).toEqual(queryKeys.analytics.range("2026-01-01", "2026-10-31", filters));
  expect(transfersQueryOptions("hh-1").queryKey).toEqual(queryKeys.transfers.list("hh-1"));
  expect(activeExternalDebtsQueryOptions().queryKey).toEqual(
    queryKeys.debts.activeExternal("00000000-0000-0000-0000-000000000001")
  );
});
```

- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: Analytics.** In `useAnalytics.ts` change the import to `import { queryOptions, useQuery, keepPreviousData } from "@tanstack/react-query";` and add `import { queryKeys } from "@/lib/query-keys";`. Replace

```ts
export function useAnalytics(startDate: Date, endDate: Date, filters?: AnalyticsFilters) {
  return useQuery({
    queryKey: [
      "analytics",
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd"),
      filters,
    ],
```

with

```ts
export function analyticsQueryOptions(startDate: Date, endDate: Date, filters?: AnalyticsFilters) {
  return queryOptions({
    queryKey: queryKeys.analytics.range(
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd"),
      filters
    ),
```

The `queryFn`, `staleTime` and `placeholderData` lines stay as they are. After the function's closing `}` add:

```ts
export function useAnalytics(startDate: Date, endDate: Date, filters?: AnalyticsFilters) {
  return useQuery(analyticsQueryOptions(startDate, endDate, filters));
}
```

Move the hook's JSDoc above `useAnalytics`.

- [ ] **Step 4: Transfers.** In `useTransfers.ts`: import `queryOptions` alongside `useMutation, useQuery, useQueryClient`; add `import { queryKeys } from "@/lib/query-keys";`. `export function useTransfers(householdId: string) {\n  return useQuery({\n    queryKey: ["transfers", householdId],` → `export function transfersQueryOptions(householdId: string) {\n  return queryOptions({\n    queryKey: queryKeys.transfers.list(householdId),`; add after it:

```ts
export function useTransfers(householdId: string) {
  return useQuery(transfersQueryOptions(householdId));
}
```

In `useCreateTransfer`, the key list becomes `[queryKeys.transactions.all, queryKeys.transfers.all, queryKeys.accounts.all]` (same values as today; `useTransfers.test.tsx` stays green).

- [ ] **Step 5: Debts selector builder** in `supabaseQueries.ts`. Add imports:

```ts
import { calculateDebtBalance } from "@/lib/debts";
import { listDebts } from "@/lib/debts/crud";
import { DEFAULT_HOUSEHOLD_ID } from "@/lib/household";
import type { Debt } from "@/types/debt";
```

and, after `useAccountBalances`:

```ts
/** Active external debts with balances, for the transaction form's debt selector. */
export function activeExternalDebtsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.debts.activeExternal(DEFAULT_HOUSEHOLD_ID),
    queryFn: async () => {
      const allDebts = await listDebts(DEFAULT_HOUSEHOLD_ID, "external", { status: "active" });
      return Promise.all(
        allDebts.map(async (debt: Debt) => ({
          ...debt,
          balance: await calculateDebtBalance(debt.id, "external"),
        }))
      );
    },
  });
}
```

- [ ] **Step 6: Form uses it.** In `TransactionFormDialog.tsx` replace the `useQuery({ queryKey: ["debts", ...], queryFn: ..., enabled: open, })` block (lines 115-132) with:

```ts
const { data: debts } = useQuery({ ...activeExternalDebtsQueryOptions(), enabled: open });
```

Import `activeExternalDebtsQueryOptions` from `@/lib/supabaseQueries` (same line as `useAccounts, useTransaction`). Remove the now-unused imports `calculateDebtBalance`, `listDebts`, `DEFAULT_HOUSEHOLD_ID` (keep `Debt`; it types `selectedDebt`). In its `afterOutboxWrite` call, replace `["transactions"], ["transaction"]` with `queryKeys.transactions.all, ["transaction"]` and `["debts"]` with `queryKeys.debts.all` (import `queryKeys`; `["transaction"]` and `["debt-balance"]` stay literal until Tasks 6/7).

- [ ] **Step 7:** `npx vitest run src/lib/__tests__/queryOptions.test.ts src/hooks src/components/TransactionFormDialog.test.tsx` → PASS; tsc app 0; warning count → `12`; `npm run build >/dev/null && npm run size` → at or under 355 KB gz.
- [ ] **Step 8: Commit** `refactor(query): analytics, transfers and the debts selector on the key factory`.

---

### Task 6: Transactions (list, summary, detail)

**Files:** Modify `src/lib/supabaseQueries.ts` (558-770), `src/components/TransactionFormDialog.tsx` (afterOutboxWrite), `src/lib/__tests__/queryOptions.test.ts`, `src/lib/__tests__/outboxWriteHooks.test.tsx:269-313`, `src/components/TransactionFormDialog.test.tsx:413-425`

**Interfaces:**

- Produces: `transactionsInfiniteQueryOptions(filters?: TransactionFilters)`, `transactionsFilterSummaryQueryOptions(filters?: TransactionFilters)`, `transactionQueryOptions(id: string)`. Hook signatures unchanged.

- [ ] **Step 1: Failing tests.** `queryOptions.test.ts`:

```ts
it("transactions", () => {
  const filters = { search: "rice" };
  expect(transactionsInfiniteQueryOptions(filters).queryKey).toEqual(
    queryKeys.transactions.list(filters)
  );
  expect(transactionsFilterSummaryQueryOptions(filters).queryKey).toEqual(
    queryKeys.transactions.filterSummary(filters)
  );
  expect(transactionQueryOptions("t1").queryKey).toEqual(queryKeys.transactions.detail("t1"));
});
```

In `outboxWriteHooks.test.tsx`, import `partialMatchKey` from `@tanstack/react-query` and add above the `describe("refreshes the detail query after the drain"` block:

```ts
const refreshesDetail = (keys: (QueryKey | undefined)[], id: string) =>
  keys.some((key) => key !== undefined && partialMatchKey(queryKeys.transactions.detail(id), key));
```

Replace the three `expect(keys).toContainEqual(["transaction"]);` with `expect(refreshesDetail(keys, "t5")).toBe(true);` (toggle), `"t1"` (bulk status), `"t2"` (delete). Change `invalidatedKeysAfterDrain`'s return to `invalidate.mock.calls.map(([filters]) => filters?.queryKey)` (unchanged) typed by the import.

In `TransactionFormDialog.test.tsx:413-425` replace the assertion block with:

```ts
await waitFor(() => {
  const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
  expect(
    keys.some(
      (key) => key !== undefined && partialMatchKey(queryKeys.transactions.detail("txn-1"), key)
    )
  ).toBe(true);
});
```

(importing `partialMatchKey` and `queryKeys`).

- [ ] **Step 2:** Run the three files. Expected: `queryOptions.test.ts` FAILS (builders missing); the hook tests pass already (`["transactions"]` matches the new detail key), and must still pass after Step 6.
- [ ] **Step 3: List.** Add `infiniteQueryOptions` to the `@tanstack/react-query` import. `export function useTransactions(filters?: TransactionFilters) {\n  return useInfiniteQuery({\n    queryKey: ["transactions", filters],` → `export function transactionsInfiniteQueryOptions(filters?: TransactionFilters) {\n  return infiniteQueryOptions({\n    queryKey: queryKeys.transactions.list(filters),`; after it:

```ts
export function useTransactions(filters?: TransactionFilters) {
  return useInfiniteQuery(transactionsInfiniteQueryOptions(filters));
}
```

JSDoc stays above `useTransactions`.

- [ ] **Step 4: Summary.** `export function useTransactionsFilterSummary(filters?: TransactionFilters) {\n  return useQuery({\n    queryKey: ["transactions", "filter-summary", filters],` → `export function transactionsFilterSummaryQueryOptions(filters?: TransactionFilters) {\n  return queryOptions({\n    queryKey: queryKeys.transactions.filterSummary(filters),`; add `export function useTransactionsFilterSummary(filters?: TransactionFilters) {\n  return useQuery(transactionsFilterSummaryQueryOptions(filters));\n}`. In its JSDoc, `Keyed under the ["transactions"] prefix so every existing\n *   invalidateQueries({ queryKey: ["transactions"] }) call` → `Keyed under queryKeys.transactions.all so every transaction\n *   invalidation`.
- [ ] **Step 5: Detail.** `export function useTransaction(id: string) {\n  return useQuery({\n    queryKey: ["transaction", id],` → `export function transactionQueryOptions(id: string) {\n  return queryOptions({\n    queryKey: queryKeys.transactions.detail(id),`; add `export function useTransaction(id: string) {\n  return useQuery(transactionQueryOptions(id));\n}` with the `// Fetch single transaction` comment above it.
- [ ] **Step 6: Invalidation lists.** In `supabaseQueries.ts`: `useDeleteTransaction` → `[queryKeys.transactions.all, queryKeys.accounts.all]`; `useSetTransactionStatus` → `[queryKeys.transactions.all, queryKeys.accounts.balances()]`; `useToggleTransactionStatus` → `[queryKeys.transactions.all]` and its comment `// ["transaction"] refreshes an open detail sheet once the drain lands` → `// transactions.all includes the detail, so an open sheet refreshes once the drain lands`. In `TransactionFormDialog.tsx` drop `["transaction"]` from both branches.
- [ ] **Step 7:** `npx vitest run` (full) → all pass, count ≥ Task 0 + new tests. tsc app 0, strict 0. Warning count → `9`.
- [ ] **Step 8: Commit** `refactor(query): transactions on the key factory; detail nests under transactions`.

---

### Task 7: Write events and the invalidation map

**Files:** Modify `src/lib/query-keys.ts`, `src/lib/__tests__/query-keys.test.ts`, `src/lib/offline/afterWrite.ts`, `src/lib/offline/afterWrite.test.ts`, `src/lib/supabaseQueries.ts` (13 call sites), `src/hooks/useTransfers.ts`, `src/hooks/useTransfers.test.tsx:89-103`, `src/components/TransactionFormDialog.tsx`, `src/components/TransactionList.tsx:100,388-389,414-420`, `src/lib/delete-transaction.ts`, `src/routes/transactions.tsx:9,56,217-223`

**Interfaces:**

- Produces (`query-keys.ts`): `invalidatesAfterWrite: Record<EntityType, readonly QueryKey[]>`; `keysAfterWrite(entities: EntityType | readonly EntityType[]): QueryKey[]` (deduped union); `invalidateAfterWrite(queryClient: QueryClient, entities: EntityType | readonly EntityType[]): void`.
- Changes: `afterOutboxWrite(queryClient: QueryClient, userId: string | undefined, entities: EntityType | readonly EntityType[]): void`. `confirmAndDeleteTransaction` loses its `queryClient` argument.

- [ ] **Step 1: Coverage tests** (append to `query-keys.test.ts`; extend the import to `{ invalidatesAfterWrite, keysAfterWrite, queryKeys }`):

```ts
describe("invalidatesAfterWrite", () => {
  const cases = Object.entries(SAMPLES).flatMap(([root, samples]) =>
    samples.flatMap(({ key, reads }) => reads.map((entity) => ({ root, key, entity })))
  );

  it.each(cases)("a $entity write refreshes $key", ({ key, entity }) => {
    expect(invalidatesAfterWrite[entity].some((target) => partialMatchKey(key, target))).toBe(true);
  });

  it("keeps the account list out of a transaction write", () => {
    const list = queryKeys.accounts.list();
    expect(invalidatesAfterWrite.transaction.some((target) => partialMatchKey(list, target))).toBe(
      false
    );
  });

  it("dedupes the union across entities", () => {
    const keys = keysAfterWrite(["transaction", "account"]);
    expect(keys).toContainEqual(queryKeys.transactions.all);
    expect(keys.filter((key) => key[0] === "transactions")).toHaveLength(1);
  });

  it("accepts a single entity", () => {
    expect(keysAfterWrite("budget")).toEqual([queryKeys.budgets.all, queryKeys.analytics.all]);
  });
});
```

- [ ] **Step 2:** Run → FAIL (exports missing).
- [ ] **Step 3: Map** (append to `query-keys.ts`; add imports at the top):

```ts
import { hashKey, type QueryClient, type QueryKey } from "@tanstack/react-query";
import type { EntityType } from "@/types/sync";
```

```ts
/**
 * What goes stale when an entity is written, derived from the tables each
 * fetcher reads. Exhaustive over EntityType: a new entity fails to compile
 * until it says what it invalidates. Checked by query-keys.test.ts.
 */
export const invalidatesAfterWrite = {
  transaction: [
    queryKeys.transactions.all,
    queryKeys.accounts.balances(),
    queryKeys.categoryTotals.all,
    queryKeys.dashboard.all,
    queryKeys.budgets.all,
    queryKeys.analytics.all,
    queryKeys.transfers.all,
    queryKeys.debts.all,
  ],
  account: [
    queryKeys.accounts.all,
    queryKeys.transactions.all,
    queryKeys.dashboard.all,
    queryKeys.analytics.all,
    queryKeys.transfers.all,
  ],
  category: [
    queryKeys.categories.all,
    queryKeys.transactions.all,
    queryKeys.categoryTotals.all,
    queryKeys.dashboard.all,
    queryKeys.budgets.all,
    queryKeys.analytics.all,
  ],
  budget: [queryKeys.budgets.all, queryKeys.analytics.all],
  debt: [queryKeys.debts.all],
  internal_debt: [queryKeys.debts.all],
  debt_payment: [queryKeys.debts.all],
} satisfies Record<EntityType, readonly QueryKey[]>;

export function keysAfterWrite(entities: EntityType | readonly EntityType[]): QueryKey[] {
  const list: readonly EntityType[] = typeof entities === "string" ? [entities] : entities;
  const byHash = new Map<string, QueryKey>();
  for (const entity of list) {
    for (const key of invalidatesAfterWrite[entity]) byHash.set(hashKey(key), key);
  }
  return [...byHash.values()];
}

/** Off-screen queries are only marked stale (refetchType "active"), so broad entries are cheap. */
export function invalidateAfterWrite(
  queryClient: QueryClient,
  entities: EntityType | readonly EntityType[]
): void {
  for (const queryKey of keysAfterWrite(entities)) {
    queryClient.invalidateQueries({ queryKey }).catch(() => {});
  }
}
```

- [ ] **Step 4:** Run `query-keys.test.ts` → PASS.
- [ ] **Step 5: `afterWrite` test first.** Replace the body of `src/lib/offline/afterWrite.test.ts` tests:

```ts
import { keysAfterWrite } from "@/lib/query-keys";
// ...
it("invalidates the entity's keys now, drains when online, then again", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(syncProcessor.processQueue).mockResolvedValue({
    synced: 1,
    failed: 0,
    terminalFailures: 0,
  });
  const keys = keysAfterWrite("account");

  afterOutboxWrite(queryClient, "user-1", "account");

  for (const queryKey of keys) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  expect(syncProcessor.processQueue).toHaveBeenCalledWith("user-1");
  await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(keys.length * 2));
});

it("skips the drain offline or without a user", () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  afterOutboxWrite(queryClient, "user-1", "budget");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  afterOutboxWrite(queryClient, undefined, "budget");

  expect(syncProcessor.processQueue).not.toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalledTimes(keysAfterWrite("budget").length * 2);
});

it("swallows a failed drain", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.mocked(syncProcessor.processQueue).mockRejectedValue(new Error("network"));

  expect(() => afterOutboxWrite(queryClient, "user-1", "account")).not.toThrow();
  await vi.waitFor(() => expect(syncProcessor.processQueue).toHaveBeenCalled());
});
```

In `useTransfers.test.tsx:89-103` rename the test to `"invalidates what a transaction write affects on success"` and replace the three expectations with:

```ts
for (const queryKey of keysAfterWrite("transaction")) {
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
}
```

(import `keysAfterWrite` from `@/lib/query-keys`). Run both → FAIL (type error / wrong calls).

- [ ] **Step 6: `afterWrite.ts`:**

```ts
import type { QueryClient } from "@tanstack/react-query";
import { invalidateAfterWrite } from "@/lib/query-keys";
import { syncProcessor } from "@/lib/sync/processor";
import type { EntityType } from "@/types/sync";

/**
 * Outbox writes land locally first; drain right away when online so the change
 * reaches the server (and server-backed lists) without waiting for the next
 * sync trigger. Offline, processQueue would burn a retry slot per item.
 */
export function afterOutboxWrite(
  queryClient: QueryClient,
  userId: string | undefined,
  entities: EntityType | readonly EntityType[]
): void {
  invalidateAfterWrite(queryClient, entities);

  if (userId && navigator.onLine) {
    syncProcessor
      .processQueue(userId)
      .then(() => invalidateAfterWrite(queryClient, entities))
      .catch(() => {});
  }
}
```

- [ ] **Step 7: Callers.** `supabaseQueries.ts`: account mutations → `"account"`; category mutations → `"category"`; `useDeleteTransaction`, `useSetTransactionStatus`, `useToggleTransactionStatus` → `"transaction"` (delete the multi-line arrays and the "Status moves amounts..." / "transactions.all includes the detail..." comments' references to keys; keep one line: `// A transaction write refreshes lists, the open detail, balances and every total`); four budget mutations → `"budget"`. `useTransfers.ts` → `afterOutboxWrite(queryClient, variables.user_id, "transaction");`. `TransactionFormDialog.tsx` → `afterOutboxWrite(queryClient, user?.id, "transaction");` (the debt branch goes: debt payments are part of the transaction write and `"transaction"` covers `debts`). Remove `queryKeys` imports that become unused.
- [ ] **Step 8: Delete flow.** `delete-transaction.ts`: remove `import type { QueryClient }`, the `queryClient` field and parameter, and the two `invalidateQueries` lines (keep `wasDebtLinked` for the toast). Update the module comment: `then invalidates debt queries and toasts` → `then toasts (useDeleteTransaction's write event refreshes debts)`. `TransactionList.tsx`: delete lines 388-389, the `queryClient,` argument at 419, `const queryClient = useQueryClient();` (100), and the `useQueryClient` import (35). `routes/transactions.tsx`: delete the `queryClient,` argument (222), `const queryClient = useQueryClient();` (56) and the import (9), if no other use remains (`grep -n queryClient src/routes/transactions.tsx` → nothing).
- [ ] **Step 9:** `npx vitest run` → all pass. tsc app/strict 0. `grep -rn "afterOutboxWrite(" src --include='*.ts*' | grep -v test | grep "\[\["` → nothing. Warning count → `7`.
- [ ] **Step 10: Commit** `feat(query): writes name their entity; one map decides what goes stale`. Body: `Transaction writes now refresh balances, dashboard, budgets, category totals and analytics, which stayed stale until staleTime ran out.`

---

### Task 8: Processor invalidates drained entity types

**Files:** Modify `src/lib/sync/processor.ts:43,200-239`, `src/lib/sync/__tests__/processor.test.ts:253-267`

- [ ] **Step 1: Failing tests.** Replace the test at line 253 with:

```ts
it("invalidates what the synced entity types affect, once per key per drain", async () => {
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  await db.syncQueue.bulkAdd([
    makeQueueItem(),
    makeQueueItem({ entity_id: "entity-2" }),
    makeQueueItem({ entity_id: "budget-1", entity_type: "budget" }),
  ]);

  await processor.processQueue("user-1");

  const keys = keysAfterWrite(["transaction", "budget"]);
  expect(invalidateSpy).toHaveBeenCalledTimes(keys.length);
  for (const queryKey of keys) expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
});

it("invalidates only what the synced entity types affect", async () => {
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  await db.syncQueue.add(makeQueueItem({ entity_id: "budget-1", entity_type: "budget" }));

  await processor.processQueue("user-1");

  expect(invalidateSpy).toHaveBeenCalledTimes(keysAfterWrite("budget").length);
  expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.transactions.all });
});
```

Import `{ keysAfterWrite, queryKeys }` from `@/lib/query-keys`. Before running, check the budget item syncs under the default `setupSupabaseMock()` (it mocks `from()` for any table; if the budget payload is rejected by a validator, give it `payload: { id: "budget-1", amount_cents: 100 }` through `operation`). Run → FAIL (the fixed 6-key list).

- [ ] **Step 2: Implement.** Add `import { invalidateAfterWrite } from "@/lib/query-keys";` beside the `queryClient` import. In `executeProcessing`, declare `const syncedEntities = new Set<EntityType>();` before the loop; in the success branch add `syncedEntities.add(item.entity_type);`. Replace the `for (const queryKey of [ ... ]) { queryClient.invalidateQueries({ queryKey }).catch(() => {}); }` block with:

```ts
invalidateAfterWrite(queryClient, [...syncedEntities]);
```

Keep the comment above it, changed to: `// Local changes just reached the cloud: refresh what the synced entity types affect, once per drain (review R9). Fire-and-forget - refetching must not block sync.`

- [ ] **Step 3:** `npx vitest run src/lib/sync` → PASS (including "does not invalidate queries when nothing was pushed"). `npx tsc --noEmit -p tsconfig.strict.json; echo $?` → 0.
- [ ] **Step 4: Commit** `feat(sync): post-drain invalidation follows the synced entity types`.

---

### Task 9: Delete dead invalidations

**Files:** Modify `src/hooks/useSyncQueueOperations.ts`, `src/hooks/useSyncProcessor.ts`

- [ ] **Step 1:** `useSyncQueueOperations.ts`: delete the six `queryClient.invalidateQueries(...)` lines and the `// Invalidate sync queue queries` comment, the three `const queryClient = useQueryClient();` lines, and `useQueryClient` from the import. Module doc: `with proper\n * cache invalidation and user feedback` → `with user feedback (the queue screens read Dexie through useLiveQuery and update themselves)`. Hook doc "Automatically invalidates sync queue queries to update UI." → delete the line.
- [ ] **Step 2:** `useSyncProcessor.ts`: delete the `queryClient.invalidateQueries({ queryKey: ["offline"] });` call and its two comment lines, the `const queryClient = useQueryClient();` line, `useQueryClient` from its import, and in the JSDoc replace the "Query Invalidation:" bullet group with `* Query invalidation happens in the processor after a drain that synced items.`
- [ ] **Step 3:** `npx vitest run` → all pass. tsc app 0. `npx eslint src 2>&1 | grep -c "@tanstack/query/prefer-query-options"` → `0`. `grep -rnE 'queryKey: \[|invalidateQueries\(\{ queryKey: \[' src --include='*.ts*' | grep -v -E 'test|__tests__'` → nothing.
- [ ] **Step 4: Commit** `refactor(sync): drop invalidations that target no query`.

---

### Task 10: Enforcement at `error`

**Files:** Modify `eslint.config.js`, `src/lib/__tests__/architecture-lint.test.ts`

- [ ] **Step 1: Failing lint tests.** Add to the `cases` array:

```ts
  {
    rule: "arch/no-inline-query-keys",
    code: 'import { useQuery } from "@tanstack/react-query";\nexport const useProbe = () => useQuery({ queryKey: ["probe"] as const, queryFn: async () => 1 });\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/query-keys.ts",
  },
```

and after the loop:

```ts
it("arch/no-inline-query-keys flags a plain array key", async () => {
  const code =
    'import { queryOptions } from "@tanstack/react-query";\nexport const probe = () => queryOptions({ queryKey: ["probe"], queryFn: async () => 1 });\n';
  expect(await ruleIds(code, "src/lib/probe.ts")).toContain("arch/no-inline-query-keys");
});

it("@tanstack/query/prefer-query-options is an error in production code", async () => {
  const code =
    'import { useQueryClient } from "@tanstack/react-query";\nexport const useProbe = () => { const queryClient = useQueryClient(); return () => queryClient.invalidateQueries({ queryKey: ["probe"] }); };\n';
  const [result] = await eslint.lintText(code, { filePath: "src/hooks/probe.ts" });
  const message = result.messages.find((m) => m.ruleId === "@tanstack/query/prefer-query-options");
  expect(message?.severity).toBe(2);
});

it("@tanstack/query rules stay off in test files", async () => {
  const code =
    'import { useQueryClient } from "@tanstack/react-query";\nexport const useProbe = () => { const queryClient = useQueryClient(); return () => queryClient.invalidateQueries({ queryKey: ["probe"] }); };\n';
  expect(await ruleIds(code, "src/hooks/probe.test.ts")).not.toContain(
    "@tanstack/query/prefer-query-options"
  );
});
```

Run `npx vitest run src/lib/__tests__/architecture-lint.test.ts` → FAIL (rule not defined; severity 1).

- [ ] **Step 2: Plugin to `error`.** In `eslint.config.js` replace the `queryPluginConfigs` definition and its comment with:

```js
// TanStack Query strict rules for production code (roadmap 4.3).
const queryPluginConfigs = pluginQuery.configs["flat/recommended-strict"].map((config) => ({
  ...config,
  files: ["src/**/*.{ts,tsx}"],
  ignores: srcTestFiles,
}));
```

- [ ] **Step 3: Inline-key ban.** Add `"no-inline-query-keys": restrictedSyntax,` to `architecturePlugin.rules`, and a block after the `arch/no-raw-transactions-from` block:

```js
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...srcTestFiles, "src/lib/query-keys.ts"],
    rules: {
      "arch/no-inline-query-keys": [
        "error",
        {
          selector:
            "Property[key.name='queryKey'] > :matches(ArrayExpression, TSAsExpression > ArrayExpression)",
          message:
            "Use queryKeys from @/lib/query-keys. Inline keys drift (see DATA-06) and break invalidation.",
        },
      ],
    },
  },
```

Update the comment above `architecturePlugin` from "carry four different allowlists" to "carry five different allowlists".

- [ ] **Step 4:** `npx vitest run src/lib/__tests__/architecture-lint.test.ts` → PASS. `npm run lint; echo "lint $?"` → exit 0 with 0 problems (`no-rest-destructuring` stays at the plugin's default `warn` and has 0 hits).
- [ ] **Step 5: Prove the ban bites** (temporary, revert after): change `queryKey: queryKeys.transfers.list(householdId),` in `useTransfers.ts` to `queryKey: ["transfers", householdId] as const,` → `npx eslint src/hooks/useTransfers.ts` reports `arch/no-inline-query-keys`; `git checkout src/hooks/useTransfers.ts`.
- [ ] **Step 6: Commit** `feat(lint): eslint-plugin-query strict and the inline query key ban at error`.

---

### Task 11: Acceptance, docs, merge

- [ ] **Step 1: Docs.**
  - `CLAUDE.md`, "Code conventions", after the TanStack Query line add: `- Query keys come from `src/lib/query-keys.ts`; each query is an `xQueryOptions()`builder next to its fetcher. A write calls`afterOutboxWrite(queryClient, userId, "<entity>")`; when new data derives from an entity, add its root to `invalidatesAfterWrite` (`arch/no-inline-query-keys`and`@tanstack/eslint-plugin-query` enforce this).`
  - `src/hooks/README.md`: replace the query example (lines 91-104) with an `xQueryOptions` builder using `queryOptions({ queryKey: queryKeys.….list(), queryFn })` and a hook `useQuery(xQueryOptions())`; replace the mutation example's `queryClient.invalidateQueries({ queryKey: ["categories"] })` with `afterOutboxWrite(queryClient, userId, "category")`; in the "For IndexedDB" `useOfflineTags` example (lines 186-197), replace it with a `useLiveQuery(() => readDb.tags.toArray())` example (Dexie reads update themselves) and the Supabase example's `queryKey: ["tags"]` with a note to add a `tags` root to `queryKeys`.
  - `src/components/transfers/README.md`: line 281 → `- Invalidates: everything a "transaction" write affects (invalidatesAfterWrite in src/lib/query-keys.ts)`; section "4. Transfer List Query Key" code → `queryKey: queryKeys.transfers.list(householdId)` and drop "likely".
- [ ] **Step 2: Gates.**

```bash
npx tsc --noEmit -p tsconfig.json; echo "tsc app $?"
npx tsc --noEmit -p tsconfig.tests.json; echo "tsc tests $?"
npx tsc --noEmit -p tsconfig.strict.json; echo "tsc strict $?"
npm run lint; echo "lint $?"
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npm run build; echo "build $?"
npm run size
PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke
```

Expected: 0/0/0, lint 0 problems, vitest all pass above the Task 0 count, build 0, size ≤ 355 KB gz, smoke 11/11.

- [ ] **Step 3: Full chromium E2E** (`supabase start` first): `PW_TEST_HTML_REPORT_OPEN=never npx playwright test --project=chromium --reporter=list > "$TMPDIR/2c2-e2e.txt" 2>&1` (after `npm run build`; keep the output outside the repo). Compare per test against `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt`: any test passing in the baseline and failing here is a regression to fix. Record the counts.
- [ ] **Step 4: Browser check** (skill `run` or `npm run dev`): sign in, note an account's balance and the dashboard's month expense total, add an expense transaction on that account, return to Accounts and Dashboard without reloading. Both numbers must reflect the new expense. Screenshot both, Read the screenshots, and state what they show.
- [ ] **Step 5: Whole-branch review** (superpowers:requesting-code-review on `main..phase-2c2-query-keys`); fix Critical/Important; record declined Minor items below.
- [ ] **Step 6: Record.** Fill Acceptance results, tick Progress, append a Resume state bullet to the roadmap, tick the roadmap's Phase 2 checkbox "`src/lib/query-keys.ts` + `@tanstack/eslint-plugin-query` strict...".
- [ ] **Step 7: Merge.** `git switch main && git merge --ff-only phase-2c2-query-keys && git branch -d phase-2c2-query-keys`; ask the user to run `! git push origin main`; confirm CI with `gh run list --limit 4`.

## Acceptance results

Not run yet.

## Decisions & Deferrals

Planning decisions (2026-10-07):

- **`query-keys.ts` imports `hashKey` at runtime.** Why: `keysAfterWrite` dedupes the union by TanStack's own key hash, so two entities sharing a root invalidate it once. It is the only non-type import; no fetcher may be imported there.
- **The debts selector key is `debts.activeExternal(householdId)`, not a general `selector(hh, kind, status)`.** Why: one caller; YAGNI.
- **A builder-identity test (`queryOptions.test.ts`) is added per migration task.** Why: the migration commits are refactors that existing tests cannot fail on; pinning each builder's key to the factory gives every task a red step and catches a later key edit.
- **`SAMPLES` lists reads per key, not per root.** Why: the accounts list does not read transactions but balances do, so a per-root table would force transaction writes to refresh the account list.
- **`useTransfers` keeps the accounts list in its Task 5 key list.** Why: Tasks 2-6 preserve behavior; Task 7 replaces it with `"transaction"`, which refreshes balances, not the list.

From the spec (section 9), unchanged: scope is refactor plus invalidation fixes; merge only near-duplicate roots; callers name the entity; coverage test plus E2E and a browser check; plugin and ban on production files only; selector extended with `TSAsExpression`.
