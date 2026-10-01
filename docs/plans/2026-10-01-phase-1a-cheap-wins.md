# Phase 1a: Cheap Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the outbox, money, data-access, and transactions-read rules fail lint; wire jsx-a11y; add two tsconfig flags and a type-checked `tests/` tree; add Claude Code hooks; add Dependabot and a production audit gate.

**Architecture:** ESLint's core `no-restricted-syntax` is registered under four names in a local `arch` plugin so each invariant has its own allowlist; a Vitest test drives the real config through the ESLint Node API to prove each rule fires. Three raw transactions reads and the analytics route's Supabase import move behind `src/lib/supabaseQueries.ts` and shared hooks first, so every rule lands as `error`. Hooks are small scripts under `scripts/`; the Bash guard's matching is a pure Node function with a unit test.

**Tech Stack:** ESLint 9.39 flat config, `eslint-plugin-jsx-a11y` 6.10, TypeScript 5.9, Vitest 3, React 19, TanStack Query, Supabase JS, Playwright, GitHub Actions, Claude Code hooks.

**Spec:** `docs/plans/2026-10-01-phase-1a-cheap-wins-design.md`. **Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md`.

## Global Constraints

- Branch `phase-1a-cheap-wins`; do not switch branches. One commit per task. Commit messages have no `Co-Authored-By` or Claude session lines.
- No `any`, no new `eslint-disable`, no weakened or deleted assertions (except the two dead E2E locals named in Task 5), no new skips. Comments sparse: why, not what.
- All new rules land as `error`. `npm run lint` must stay at 0 errors, 0 warnings (baseline at `913efac`).
- No query text, query key, or Supabase behaviour changes in Task 2 beyond what the task states.
- `@radix-ui/*` packages must stay on one `@radix-ui/react-dismissable-layer` version (`npm ls @radix-ui/react-dismissable-layer`), per CLAUDE.md Known Infrastructure Issues.
- Do not edit `docs/plans/` except in Task 8.
- zsh: `$PIPESTATUS` is empty and a bare `echo ===` errors; get exit codes with `; echo "exit $?"`. Playwright runs use `PW_TEST_HTML_REPORT_OPEN=never`. Local Supabase API is `127.0.0.1:54331`.
- Never run `supabase db reset`, `supabase db push`, or `supabase stop --no-backup`.
- Before claiming a task done, run `npx tsc --noEmit -p tsconfig.json && npm run lint && npx vitest run; echo "exit $?"` and quote the `Test Files` / `Tests` lines and the exit code. Baseline: 72 files / 918 tests.

---

### Task 1: tsconfig flags

**Files:**

- Modify: `tsconfig.json` (`compilerOptions`, Linting block)
- Modify: `src/components/ErrorBoundary.tsx:30,38`
- Modify: `src/components/AccountFormDialog.tsx:19`, `src/components/AuthProvider.tsx:1`, `src/lib/dexie/db.ts:19`, `src/lib/supabaseQueries.ts:33`, `src/stores/authStore.ts:2`, `src/types/accounts.ts:1`

**Interfaces:** none.

- [x] **Step 1: Enable the flags and confirm the failures**

In `tsconfig.json`, under `/* Linting */`, after `"noUncheckedSideEffectImports": true,` add:

```json
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
```

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"; echo "exit $?"`
Expected: `10` (2 × TS4114 in `ErrorBoundary.tsx`, 8 × TS1484).

- [x] **Step 2: Fix `ErrorBoundary.tsx`**

```tsx
  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
```

```tsx
  override render() {
```

- [x] **Step 3: Fix the eight type-only imports**

| File                                      | New import line                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `src/components/AccountFormDialog.tsx:19` | `import type { AccountType, AccountVisibility } from "@/types/accounts";` |
| `src/components/AuthProvider.tsx:1`       | `import { useEffect, type ReactNode } from "react";`                      |
| `src/lib/dexie/db.ts:19`                  | `import Dexie, { type Table } from "dexie";`                              |
| `src/lib/supabaseQueries.ts:33`           | `import type { Account } from "@/types/accounts";`                        |
| `src/stores/authStore.ts:2`               | `import type { User, Session } from "@supabase/supabase-js";`             |
| `src/types/accounts.ts:1`                 | `import type { Database } from "./database.types";`                       |

If any of these files also imports a value from the same module on that line, keep the value import and mark only the types with inline `type`.

- [x] **Step 4: Verify**

Run: `npx tsc --noEmit -p tsconfig.json; echo "exit $?"` → `exit 0`.
Run: `npm run build; echo "exit $?"` → `exit 0` (the build runs `tsc -b`, so the flags gate it).
Run the standard check from Global Constraints → 72 files / 918 tests, exit 0.

- [x] **Step 5: Commit**

```bash
git add tsconfig.json src/components/ErrorBoundary.tsx src/components/AccountFormDialog.tsx src/components/AuthProvider.tsx src/lib/dexie/db.ts src/lib/supabaseQueries.ts src/stores/authStore.ts src/types/accounts.ts
git commit -m "build(ts): enable noImplicitOverride and verbatimModuleSyntax"
```

---

### Task 2: Move raw transactions reads behind supabaseQueries; analytics route uses shared hooks

**Files:**

- Modify: `src/lib/supabaseQueries.ts` (new exports inserted immediately before the `TanStack Query hooks for category totals analytics` comment block, ~line 778; one new type import)
- Modify: `src/hooks/useAnalytics.ts` (imports, `Transaction` interface, `queryFn`, `calculateTotal`, `processYearOverYear`)
- Modify: `src/hooks/useTransfers.ts` (imports, `queryFn` body)
- Modify: `src/routes/analytics/index.tsx` (imports, the two `useQuery` blocks)
- Create: `src/lib/__tests__/transactionReads.test.ts`

**Interfaces:**

- Produces (in `@/lib/supabaseQueries`):
  - `interface AnalyticsTransactionRow { id: string; date: string; type: "income" | "expense"; amount_cents: number; category_id: string | null; account_id: string; description: string; categories?: { name: string } }`
  - `interface TransactionReadFilters { accountId?: string; categoryId?: string; type?: "income" | "expense" }`
  - `interface IsoDateRange { startDate: string; endDate: string }` (both `yyyy-MM-dd`)
  - `fetchAnalyticsTransactions(range: IsoDateRange, filters?: TransactionReadFilters): Promise<AnalyticsTransactionRow[]>` — throws the Supabase error
  - `fetchAnalyticsTransactionTotals(range: IsoDateRange, filters?: TransactionReadFilters): Promise<Array<Pick<AnalyticsTransactionRow, "type" | "amount_cents">>>` — throws the Supabase error
  - `fetchTransferLegs(householdId: string): Promise<TransferLeg[]>` — throws the Supabase error
- Consumes: `TransferLeg` from `@/lib/offline/transfers`; `useAccounts`, `useCategories` (existing).

- [x] **Step 1: Write the failing tests**

Create `src/lib/__tests__/transactionReads.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import {
  fetchAnalyticsTransactions,
  fetchAnalyticsTransactionTotals,
  fetchTransferLegs,
} from "@/lib/supabaseQueries";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

type Call = [method: string, args: unknown[]];

// Records every builder call and resolves like a PostgREST query when awaited.
function queryBuilder(result: { data: unknown; error: unknown }) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (value: unknown) => void) => resolve(result),
  };
  for (const method of ["select", "gte", "lte", "is", "eq", "not", "order"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return builder;
    };
  }
  return { builder, calls };
}

function mockFrom(result: { data: unknown; error: unknown }) {
  const { builder, calls } = queryBuilder(result);
  vi.mocked(supabase.from).mockReturnValue(builder as never);
  return calls;
}

const range = { startDate: "2026-04-01", endDate: "2026-09-30" };

describe("analytics transaction reads", () => {
  beforeEach(() => vi.mocked(supabase.from).mockReset());

  it("excludes transfers and applies the date range and filters", async () => {
    const calls = mockFrom({ data: [{ id: "t1" }], error: null });

    const rows = await fetchAnalyticsTransactions(range, {
      accountId: "acc-1",
      categoryId: "cat-1",
      type: "expense",
    });

    expect(supabase.from).toHaveBeenCalledWith("transactions");
    expect(calls).toEqual([
      ["select", ["*, categories(name)"]],
      ["gte", ["date", "2026-04-01"]],
      ["lte", ["date", "2026-09-30"]],
      ["is", ["transfer_group_id", null]],
      ["eq", ["account_id", "acc-1"]],
      ["eq", ["category_id", "cat-1"]],
      ["eq", ["type", "expense"]],
    ]);
    expect(rows).toEqual([{ id: "t1" }]);
  });

  it("selects only type and amount for totals, still excluding transfers", async () => {
    const calls = mockFrom({ data: null, error: null });

    const rows = await fetchAnalyticsTransactionTotals(range);

    expect(calls).toEqual([
      ["select", ["type, amount_cents"]],
      ["gte", ["date", "2026-04-01"]],
      ["lte", ["date", "2026-09-30"]],
      ["is", ["transfer_group_id", null]],
    ]);
    expect(rows).toEqual([]);
  });

  it("throws the Supabase error", async () => {
    const error = { message: "boom" };
    mockFrom({ data: null, error });

    await expect(fetchAnalyticsTransactions(range)).rejects.toBe(error);
  });
});

describe("fetchTransferLegs", () => {
  beforeEach(() => vi.mocked(supabase.from).mockReset());

  it("reads only transfer rows for the household, newest first, unwrapping array joins", async () => {
    const calls = mockFrom({
      data: [
        {
          id: "t1",
          date: "2026-09-30",
          amount_cents: 1000,
          description: "Float",
          transfer_group_id: "g1",
          type: "expense",
          account: [{ id: "acc-1", name: "Checking" }],
        },
        {
          id: "t2",
          date: "2026-09-30",
          amount_cents: 1000,
          description: "Float",
          transfer_group_id: "g1",
          type: "income",
          account: null,
        },
      ],
      error: null,
    });

    const legs = await fetchTransferLegs("hh-1");

    expect(supabase.from).toHaveBeenCalledWith("transactions");
    expect(calls.slice(1)).toEqual([
      ["eq", ["household_id", "hh-1"]],
      ["not", ["transfer_group_id", "is", null]],
      ["order", ["date", { ascending: false }]],
    ]);
    expect(legs).toEqual([
      {
        id: "t1",
        date: "2026-09-30",
        amount_cents: 1000,
        description: "Float",
        transfer_group_id: "g1",
        type: "expense",
        account: { id: "acc-1", name: "Checking" },
      },
      {
        id: "t2",
        date: "2026-09-30",
        amount_cents: 1000,
        description: "Float",
        transfer_group_id: "g1",
        type: "income",
        account: null,
      },
    ]);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/transactionReads.test.ts; echo "exit $?"`
Expected: FAIL, the three functions are not exported.

- [x] **Step 3: Add the read functions to `supabaseQueries.ts`**

Add to the imports near the other `./offline/*` imports:

```ts
import type { TransferLeg } from "./offline/transfers";
```

Insert immediately before the `/** TanStack Query hooks for category totals analytics` comment:

```ts
/**
 * Raw transactions reads for analytics and transfers. Every `.from("transactions")`
 * read lives in this file (lint rule arch/no-raw-transactions-from) so transfer
 * exclusion is decided in one place.
 */

export interface AnalyticsTransactionRow {
  id: string;
  date: string;
  type: "income" | "expense";
  amount_cents: number;
  category_id: string | null;
  account_id: string;
  description: string;
  categories?: { name: string };
}

export interface TransactionReadFilters {
  accountId?: string;
  categoryId?: string;
  type?: "income" | "expense";
}

export interface IsoDateRange {
  startDate: string;
  endDate: string;
}

function nonTransferTransactionsQuery(
  columns: string,
  range: IsoDateRange,
  filters: TransactionReadFilters
) {
  let query = supabase
    .from("transactions")
    .select(columns)
    .gte("date", range.startDate)
    .lte("date", range.endDate)
    .is("transfer_group_id", null); // transfers are account movements, never income or spending

  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.type) query = query.eq("type", filters.type);
  return query;
}

export async function fetchAnalyticsTransactions(
  range: IsoDateRange,
  filters: TransactionReadFilters = {}
): Promise<AnalyticsTransactionRow[]> {
  const { data, error } = await nonTransferTransactionsQuery("*, categories(name)", range, filters);
  if (error) throw error;
  return (data ?? []) as AnalyticsTransactionRow[];
}

export async function fetchAnalyticsTransactionTotals(
  range: IsoDateRange,
  filters: TransactionReadFilters = {}
): Promise<Array<Pick<AnalyticsTransactionRow, "type" | "amount_cents">>> {
  const { data, error } = await nonTransferTransactionsQuery("type, amount_cents", range, filters);
  if (error) throw error;
  return (data ?? []) as Array<Pick<AnalyticsTransactionRow, "type" | "amount_cents">>;
}

export async function fetchTransferLegs(householdId: string): Promise<TransferLeg[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(
      `
      id,
      date,
      amount_cents,
      description,
      transfer_group_id,
      type,
      account:accounts!transactions_account_id_fkey(id, name)
    `
    )
    .eq("household_id", householdId)
    .not("transfer_group_id", "is", null)
    .order("date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((transaction) => {
    // Supabase joins return arrays; extract the first element for single-record joins
    const accountData = Array.isArray(transaction.account)
      ? (transaction.account[0] ?? null)
      : transaction.account;

    return {
      id: transaction.id,
      date: transaction.date,
      amount_cents: transaction.amount_cents,
      description: transaction.description,
      transfer_group_id: transaction.transfer_group_id,
      type: transaction.type,
      account: accountData ? { id: accountData.id, name: accountData.name } : null,
    };
  });
}
```

If `tsc` rejects a `(data ?? []) as X[]` cast because the dynamic `select(columns)` infers an error type, change only that line to `as unknown as X[]` and say so in the task report. Do not add `any`.

- [x] **Step 4: Run the new test**

Run: `npx vitest run src/lib/__tests__/transactionReads.test.ts; echo "exit $?"` → 4 passed, exit 0.

- [x] **Step 5: Point `useAnalytics` at the new functions**

In `src/hooks/useAnalytics.ts`:

Replace the imports and the local `Transaction` interface (lines 1-15) with:

```ts
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  fetchAnalyticsTransactions,
  fetchAnalyticsTransactionTotals,
  type AnalyticsTransactionRow,
} from "@/lib/supabaseQueries";
import { startOfMonth, subYears, format, differenceInDays } from "date-fns";

type Transaction = AnalyticsTransactionRow;
type TransactionAmount = Pick<Transaction, "type" | "amount_cents">;
```

(The `supabase` import stays: the budgets read in the same `queryFn` is not a transactions read and is out of scope.)

Replace the main query block (from `// Base query with transfer exclusion` through the `if (error) { throw ... }` block) with:

```ts
const range = {
  startDate: format(startDate, "yyyy-MM-dd"),
  endDate: format(endDate, "yyyy-MM-dd"),
};
const transactionData = await fetchAnalyticsTransactions(range, filters).catch(
  (error: { message: string }) => {
    throw new Error(`Failed to fetch analytics: ${error.message}`);
  }
);
```

Replace the previous-year block (from `let prevQuery = supabase` through the `if (prevYearError) { console.warn(...) }` block; keep the `prevYearStart`/`prevYearEnd` lines above it) with:

```ts
const prevYearData = await fetchAnalyticsTransactionTotals(
  {
    startDate: format(prevYearStart, "yyyy-MM-dd"),
    endDate: format(prevYearEnd, "yyyy-MM-dd"),
  },
  filters
).catch((prevYearError: unknown) => {
  console.warn("Failed to fetch previous year data:", prevYearError);
  return [];
});
```

Replace the processing block's data arguments so they use the already-defaulted arrays:

```ts
const monthlyTrend = processMonthlyTrend(transactionData);
const categoryBreakdown = processCategoryBreakdown(transactionData);
const totalIncome = calculateTotal(transactionData, "income");
const totalExpenses = calculateTotal(transactionData, "expense");
const budgetVariance = processBudgetVariance(budgetData, transactionData);
const yearOverYear = processYearOverYear(transactionData, prevYearData);
const insights = processInsights(transactionData, startDate, endDate);
```

Widen the two helpers that only need type and amount:

```ts
function calculateTotal(data: TransactionAmount[], type: "income" | "expense"): number {
```

```ts
function processYearOverYear(
  currentData: TransactionAmount[],
  previousData: TransactionAmount[]
): YearOverYear {
```

- [x] **Step 6: Point `useTransfers` at `fetchTransferLegs`**

In `src/hooks/useTransfers.ts`, replace `import { supabase } from "@/lib/supabase";` with `import { fetchTransferLegs } from "@/lib/supabaseQueries";`, remove `type TransferLeg` from the `@/lib/offline/transfers` import, and replace the body of the `try` block with:

```ts
// Pairing lives in offline/transfers.ts (groupTransferLegs) so the
// server path and the Dexie fallback can never drift (review R11)
return groupTransferLegs(await fetchTransferLegs(householdId));
```

The `catch` block (network fallback to `getLocalTransfers`) is unchanged.

- [x] **Step 7: Analytics route uses the shared hooks**

In `src/routes/analytics/index.tsx`:

- Remove `import { useQuery } from "@tanstack/react-query";` and `import { supabase } from "@/lib/supabase";`.
- Change `import { Suspense, useState } from "react";` to `import { Suspense, useMemo, useState } from "react";`.
- Add `import { useAccounts, useCategories } from "@/lib/supabaseQueries";`.
- Replace both `useQuery` blocks (`const { data: accounts = [] } = useQuery({...});` and `const { data: categories = [] } = useQuery({...});`) with:

```tsx
// Shared hooks, not private queries: the old route cached its own fetch under
// the shared ["accounts"]/["categories"] keys and poisoned every other picker (DATA-06).
const { data: accounts = [] } = useAccounts();
const { data: allCategories = [] } = useCategories();
const categories = useMemo(
  () => allCategories.filter((category) => category.parent_id === null),
  [allCategories]
);
```

- [x] **Step 8: Verify**

Run: `grep -rn 'from("transactions")' src --include='*.ts' --include='*.tsx' | grep -v "\.test\.\|__tests__" | grep -vE "^src/lib/(supabaseQueries\.ts|sync/|debts/|realtime-sync\.ts)"; echo "exit $?"` → no lines, `exit 1`.
Run: `grep -rn "lib/supabase\"" src/routes src/components; echo "exit $?"` → no lines, `exit 1`.
Run the standard check → exit 0; tests = baseline + 4.
Run: `npm run build; echo "exit $?"` → exit 0.

- [x] **Step 9: Commit**

```bash
git add src/lib/supabaseQueries.ts src/hooks/useAnalytics.ts src/hooks/useTransfers.ts src/routes/analytics/index.tsx src/lib/__tests__/transactionReads.test.ts
git commit -m "refactor(queries): move raw transactions reads into supabaseQueries; analytics uses shared hooks"
```

---

### Task 3: Architecture lint rules

**Files:**

- Modify: `eslint.config.js` (new import, plugin constant, six config objects before `prettier`)
- Create: `src/lib/__tests__/architecture-lint.test.ts`

**Interfaces:**

- Consumes: Task 2 (no `.from("transactions")` or `@/lib/supabase` import left outside the allowlists).
- Produces: rule IDs `arch/no-direct-dexie-writes`, `arch/no-direct-supabase-writes`, `arch/no-ad-hoc-money-parse`, `arch/no-raw-transactions-from`, plus core `no-restricted-imports` on routes/components.

- [x] **Step 1: Write the failing test**

Create `src/lib/__tests__/architecture-lint.test.ts`:

```ts
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

// Drives the real eslint.config.js so a glob typo or a moved
// eslint/use-at-your-own-risk export cannot silently disable a rule.
let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: process.cwd() });
});

async function ruleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.map((message) => message.ruleId);
}

const cases = [
  {
    rule: "arch/no-direct-dexie-writes",
    code: 'import { db } from "@/lib/dexie/db";\nexport const write = () => db.transactions.add({} as never);\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/offline/probe.ts",
  },
  {
    rule: "arch/no-direct-supabase-writes",
    code: 'import { supabase } from "@/lib/supabase";\nexport const write = () => supabase.from("accounts").update({}).eq("id", "x");\n',
    flagged: "src/lib/probe.ts",
    allowed: "src/lib/sync/probe.ts",
  },
  {
    rule: "arch/no-ad-hoc-money-parse",
    code: 'export const cents = Math.round(parseFloat("1.50") * 100);\n',
    flagged: "src/components/probe.tsx",
    allowed: "src/lib/currency.ts",
  },
  {
    rule: "arch/no-raw-transactions-from",
    code: 'import { supabase } from "@/lib/supabase";\nexport const read = () => supabase.from("transactions").select("*");\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/supabaseQueries.ts",
  },
  {
    rule: "no-restricted-imports",
    code: 'import { supabase } from "@/lib/supabase";\nexport { supabase };\n',
    flagged: "src/routes/probe.tsx",
    allowed: "src/hooks/probe.ts",
  },
];

describe.each(cases)("$rule", ({ rule, code, flagged, allowed }) => {
  it(`fires in ${flagged}`, async () => {
    expect(await ruleIds(code, flagged)).toContain(rule);
  });

  it(`is silent in ${allowed}`, async () => {
    expect(await ruleIds(code, allowed)).not.toContain(rule);
  });

  it("is silent in test files", async () => {
    expect(await ruleIds(code, flagged.replace(/\.tsx?$/, ".test.ts"))).not.toContain(rule);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/__tests__/architecture-lint.test.ts; echo "exit $?"`
Expected: the five `fires in …` tests FAIL (the `arch/*` rules are not defined, and `no-restricted-imports` is not configured); the silent tests pass.

- [x] **Step 3: Add the rules to `eslint.config.js`**

Add to the imports:

```js
import { builtinRules } from "eslint/use-at-your-own-risk";
```

After the imports, before `export default [`:

```js
// The core no-restricted-syntax rule, registered once per invariant. Flat config
// replaces a rule's options wholesale per rule ID, so one shared array could not
// carry four different allowlists (Phase 1a design, section 1).
const restrictedSyntax = builtinRules.get("no-restricted-syntax");
const architecturePlugin = {
  rules: {
    "no-direct-dexie-writes": restrictedSyntax,
    "no-direct-supabase-writes": restrictedSyntax,
    "no-ad-hoc-money-parse": restrictedSyntax,
    "no-raw-transactions-from": restrictedSyntax,
  },
};

const srcTestFiles = [
  "src/**/*.test.{ts,tsx}",
  "src/**/*.spec.ts",
  "src/**/__tests__/**",
  "src/test/**",
];
```

Insert these objects in the exported array immediately before the final `prettier,` entry:

```js
  // Architecture rules (roadmap 4.4-4.6). Each error message says why the rule
  // exists and what to do instead.
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { arch: architecturePlugin },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...srcTestFiles,
      "src/lib/offline/**",
      "src/lib/debts/**",
      "src/lib/sync/**",
      "src/lib/dexie/**",
    ],
    rules: {
      "arch/no-direct-dexie-writes": [
        "error",
        {
          selector:
            "CallExpression[callee.object.object.name='db'][callee.object.property.name=/^(transactions|accounts|categories|budgets|debts|internalDebts|debtPayments)$/][callee.property.name=/^(add|put|update|delete|bulkAdd|bulkPut|bulkUpdate|bulkDelete|clear)$/]",
          message:
            "Entity writes go through src/lib/offline/* (or src/lib/debts/*), which write the row and its sync-queue item in one Dexie transaction. A direct db.<table> write never reaches Supabase (IMP-01).",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...srcTestFiles,
      "src/lib/sync/**",
      "src/lib/dexie/deviceManager.ts",
      "src/lib/device-registration.ts",
    ],
    rules: {
      "arch/no-direct-supabase-writes": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(insert|upsert|update|delete)$/][callee.object.callee.property.name='from']",
          message:
            "Supabase entity writes belong to the sync processor (src/lib/sync). Write through src/lib/offline/* instead; a direct write skips the outbox, the event log, and offline support.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...srcTestFiles, "src/lib/currency.ts", "src/lib/supabaseQueries.ts"],
    rules: {
      "arch/no-ad-hoc-money-parse": [
        "error",
        {
          selector: "CallExpression[callee.name=/^(parseFloat|Number)$/]",
          message:
            "Parse peso input with parsePHP, parsePHPSafe, or parsePHPUnbounded from @/lib/currency, which return validated integer cents. URL amount params are already cents: validate them in the route's search schema (see src/lib/validations/transactionsSearch.ts). For a number that is not an amount, disable this line with a `-- reason`.",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      ...srcTestFiles,
      "src/lib/supabaseQueries.ts",
      "src/lib/sync/**",
      "src/lib/debts/**",
      "src/lib/realtime-sync.ts",
    ],
    rules: {
      "arch/no-raw-transactions-from": [
        "error",
        {
          selector: "CallExpression[callee.property.name='from'] > Literal[value='transactions']",
          message:
            "Read transactions through src/lib/supabaseQueries.ts, which owns transfer exclusion for analytics and budget reads (and, from Phase 2, the transactions_non_transfer view).",
        },
      ],
    },
  },
  {
    files: ["src/routes/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: srcTestFiles,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/supabase"],
              message:
                "Routes and components fetch through a hook or @/lib/supabaseQueries so reads get the Dexie offline fallback and shared query keys.",
            },
          ],
        },
      ],
    },
  },
```

- [x] **Step 4: Run the test and the full lint**

Run: `npx vitest run src/lib/__tests__/architecture-lint.test.ts; echo "exit $?"` → 15 passed, exit 0.
Run: `npm run lint; echo "exit $?"` → no output problems, exit 0. If any real file is reported, stop and report it: Task 2 and the measurements say there are none.

- [x] **Step 5: Standard check, then commit**

Run the standard check → exit 0; tests = Task 2 count + 15.

```bash
git add eslint.config.js src/lib/__tests__/architecture-lint.test.ts
git commit -m "build(lint): enforce outbox, money, data-access, and transactions-read rules"
```

---

### Task 4: jsx-a11y and labelled amount fields

**Files:**

- Modify: `eslint.config.js` (jsx-a11y import and config object)
- Modify: `src/components/transfers/TransferForm.tsx:91,116,141`
- Modify: `src/components/dashboard/CategoryChart.tsx:121-136`
- Modify: `src/routes/categories.tsx:101-113`
- Modify: `src/components/TransactionFormDialog.tsx:315`
- Modify: `src/components/ui/category-selector.tsx:17,~160-200`
- Modify: `src/components/ui/currency-input.tsx:118`
- Modify: `src/components/ui/currency-input.test.tsx`, `src/components/TransactionFormDialog.test.tsx` (label queries), `src/components/ui/category-selector.test.tsx` (new test)
- Modify: `tests/e2e/budgets.spec.ts:46`, `tests/e2e/transactions.spec.ts:39`

**Interfaces:** none.

- [x] **Step 1: Write the failing tests**

Append to `src/components/ui/currency-input.test.tsx`:

```tsx
describe("CurrencyInput labelling", () => {
  it("is named by its visible label when the host passes an id", () => {
    render(
      <>
        <label htmlFor="budget-amount">Budget Amount</label>
        <CurrencyInput id="budget-amount" value={0} />
      </>
    );
    const input = screen.getByLabelText("Budget Amount");
    expect(input).not.toHaveAttribute("aria-label");
  });

  it("keeps an explicit aria-label", () => {
    render(<CurrencyInput aria-label="Original amount" value={0} />);
    expect(screen.getByLabelText("Original amount")).toBeInTheDocument();
  });

  it("falls back to the generic label when nothing names it", () => {
    render(<CurrencyInput value={0} />);
    expect(screen.getByLabelText("Amount in Philippine Pesos")).toBeInTheDocument();
  });
});
```

Add inside `describe("CategorySelector combobox", ...)` in `src/components/ui/category-selector.test.tsx` (`getTrigger` and `openPicker` are the file's existing helpers):

```tsx
it("points the combobox at the popup it controls", async () => {
  render(<CategorySelector value={undefined} onChange={() => {}} />);
  await openPicker();
  const controlsId = getTrigger().getAttribute("aria-controls");
  expect(controlsId).toBeTruthy();
  expect(document.getElementById(controlsId!)).toContainElement(
    screen.getByPlaceholderText("Search categories...")
  );
});
```

Add inside `describe("TransactionFormDialog", ...)` in `src/components/TransactionFormDialog.test.tsx`, after "renders a centered Dialog on desktop" (`renderDialog` is the file's existing helper; add `waitFor` to the `@testing-library/react` import if it is missing):

```tsx
it("focuses the Amount field when the dialog opens", async () => {
  await renderDialog();

  await waitFor(() => expect(screen.getByLabelText("Amount")).toHaveFocus());
});
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/ui/currency-input.test.tsx src/components/ui/category-selector.test.tsx src/components/TransactionFormDialog.test.tsx; echo "exit $?"`
Expected: FAIL on "is named by its visible label…", "keeps an explicit aria-label" (the hardcoded label overrides both), and "focuses the Amount field" (`getByLabelText("Amount")` finds nothing: the input is named "Amount in Philippine Pesos"). "points the combobox…" may already pass (Radix injects `aria-controls` at runtime); that is fine, it guards Step 9.

- [x] **Step 3: Fix `CurrencyInput`**

In `src/components/ui/currency-input.tsx`, replace `aria-label="Amount in Philippine Pesos"` with:

```tsx
          // A host label (id + htmlFor, shadcn FormControl's injected id, or
          // aria-labelledby) names the field; the generic name is a fallback only.
          aria-label={
            props.id || props["aria-label"] || props["aria-labelledby"]
              ? props["aria-label"]
              : "Amount in Philippine Pesos"
          }
```

- [x] **Step 4: Update the label queries that relied on the hardcoded name**

- `src/components/TransactionFormDialog.test.tsx`: every `screen.getByLabelText("Amount in Philippine Pesos")` becomes `screen.getByLabelText("Amount")` (lines ~176, 200, 207, 262, 298). The dialog's `<Label htmlFor="amount">Amount</Label>` now names the input.
- `src/components/ui/currency-input.test.tsx`: `getInput()` stays as is (its harness passes no id, so the fallback applies).
- `tests/e2e/transactions.spec.ts:39`: `dialog.getByRole("textbox", { name: "Amount", exact: true })`.
- `tests/e2e/budgets.spec.ts:46`: `page.getByRole("textbox", { name: "Budget Amount", exact: true })` (BudgetForm's `FormLabel` text).

- [x] **Step 5: Wire jsx-a11y and see the violations**

In `eslint.config.js` add `import jsxA11y from "eslint-plugin-jsx-a11y";` and, immediately after the `// Main source code (React app)` object, add:

```js
  { ...jsxA11y.flatConfigs.recommended, files: ["src/**/*.tsx"] },
```

Run: `npx eslint src 2>&1 | grep jsx-a11y; echo "exit $?"`
Expected: 9 lines: `TransferForm.tsx` 91/116/141 (label-has-associated-control), `CategoryChart.tsx:123` and `routes/categories.tsx:103` (click-events-have-key-events, no-static-element-interactions), `TransactionFormDialog.tsx:315` (no-autofocus), `ui/category-selector.tsx:166` (role-has-required-aria-props).

- [x] **Step 6: Fix `TransferForm.tsx` labels**

```tsx
            <label htmlFor="transfer-from-account" className="text-sm font-medium">From Account</label>
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger id="transfer-from-account" className="w-full">
```

```tsx
            <label htmlFor="transfer-to-account" className="text-sm font-medium">To Account</label>
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger id="transfer-to-account" className="w-full">
```

```tsx
            <label htmlFor="transfer-amount" className="text-sm font-medium">Amount</label>
            <CurrencyInput id="transfer-amount" {...field} error={fieldState.error?.message} />
```

- [x] **Step 7: Make the clickable rows real buttons**

`src/components/dashboard/CategoryChart.tsx`, replace the `legendItems.map(...)` callback body with:

```tsx
{
  legendItems.map((category) => {
    const rowContent = (
      <>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
          <span className="text-sm">{category.categoryName}</span>
        </div>
        <span className="text-sm font-mono">{formatPHP(category.amountCents)}</span>
      </>
    );
    const rowClassName = "flex w-full items-center justify-between p-2 rounded transition-colors";

    // Uncategorized has no id to filter by, so it is not interactive
    return category.categoryId ? (
      <button
        key={category.categoryId}
        type="button"
        className={cn(rowClassName, "text-left cursor-pointer hover:bg-accent")}
        onClick={() => handleCategoryClick(category.categoryId)}
      >
        {rowContent}
      </button>
    ) : (
      <div key={category.categoryName} className={rowClassName}>
        {rowContent}
      </div>
    );
  });
}
```

`src/routes/categories.tsx`, the child category `div` becomes:

```tsx
<button
  key={child.id}
  type="button"
  className="flex w-full items-center gap-3 rounded-md border p-3 text-left hover:bg-accent cursor-pointer transition-colors"
  onClick={() => {
    setEditingId(child.id);
    setDefaultParentId(null);
    setIsFormOpen(true);
  }}
  style={{ borderLeftWidth: "3px", borderLeftColor: child.color }}
>
  <span className="text-sm font-medium">{child.name}</span>
</button>
```

- [x] **Step 8: Remove `autoFocus` from the amount field**

In `src/components/TransactionFormDialog.tsx`, delete the `autoFocus` line on the `CurrencyInput` (line ~315). Radix Dialog and Sheet already move focus to the first tabbable element on open, and Amount is the first field (the file's header comment says so). The new test from Step 1 proves it.

- [x] **Step 9: Give the category combobox its controlled element**

In `src/components/ui/category-selector.tsx`, change the React import to `import { useId, useMemo, useState, type ComponentProps } from "react";`. In the component body, next to the other hooks, add `const popupId = useId();`. On the trigger `<button>` add `aria-controls={popupId}` after `aria-expanded={open}`. On `<PopoverContent` add `id={popupId}`. Radix merges child props over its own, so both ends use `popupId`.

- [x] **Step 10: Verify**

Run: `npx eslint src 2>&1 | grep -c jsx-a11y; echo "exit $?"` → `0`.
Run: `npx vitest run src/components/ui/currency-input.test.tsx src/components/ui/category-selector.test.tsx src/components/TransactionFormDialog.test.tsx; echo "exit $?"` → all pass.
Run the standard check → exit 0; tests = Task 3 count + 5.
Run: `npm run build && PW_TEST_HTML_REPORT_OPEN=never npx playwright test --project=chromium tests/e2e/budgets.spec.ts tests/e2e/transactions.spec.ts --reporter=list; echo "exit $?"` with the local stack running (`supabase status -o env` shows `API_URL`; if it is not running, `supabase start` first). Expected: every test that passes on `main` still passes; quote the summary line. (`npm run test:e2e:smoke` in Task 8 is the full gate.)

- [x] **Step 11: Commit**

```bash
git add eslint.config.js src/components/transfers/TransferForm.tsx src/components/dashboard/CategoryChart.tsx src/routes/categories.tsx src/components/TransactionFormDialog.tsx src/components/TransactionFormDialog.test.tsx src/components/ui/category-selector.tsx src/components/ui/category-selector.test.tsx src/components/ui/currency-input.tsx src/components/ui/currency-input.test.tsx tests/e2e/budgets.spec.ts tests/e2e/transactions.spec.ts
git commit -m "feat(a11y): wire jsx-a11y; label amount fields by their visible labels"
```

---

### Task 5: Type-check `tests/`

**Files:**

- Create: `tsconfig.tests.json`
- Modify: `package.json` / `package-lock.json` (`@types/node` devDependency)
- Modify: `tests/e2e/debts/debt-payments.spec.ts:314`, `tests/e2e/debts/debt-reversals.spec.ts:370,373`, `tests/e2e/fixtures/helpers.ts:1`
- Modify: `.github/workflows/ci.yml` (new step in `ci` job)

**Interfaces:** none.

- [x] **Step 1: Add the config and dependency, confirm the failures**

`tsconfig.tests.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "allowJs": true
  },
  "include": ["tests/**/*.ts", "playwright.config.ts"]
}
```

Run: `npm install --save-dev @types/node@^24.7.2; echo "exit $?"` → exit 0.
Run: `npx tsc --noEmit -p tsconfig.tests.json 2>&1 | grep "error TS"; echo "exit $?"`
Expected: exactly 4 errors: `debt-payments.spec.ts(314)` TS6133 `_debts`, `debt-reversals.spec.ts(370)` TS2345, `debt-reversals.spec.ts(373)` TS6133 `_warning`, `fixtures/helpers.ts(1)` TS1484 `Page`.

- [x] **Step 2: Fix them**

- `tests/e2e/fixtures/helpers.ts:1`: `import type { Page } from "@playwright/test";`. If the line imports values too, mark only `Page` with inline `type`.
- `tests/e2e/debts/debt-payments.spec.ts:314`: delete the `const _debts = page.locator('[data-testid="debt-card"]');` line. It was never asserted; keep the two comment lines below it.
- `tests/e2e/debts/debt-reversals.spec.ts:370`: Playwright's `selectOption` takes a string `label`, not a RegExp, so the regex never matched anything. Change to `await debtSelector.selectOption({ value: "" });` (the empty value is the "no debt" option).
- `tests/e2e/debts/debt-reversals.spec.ts:373`: delete `const _warning = page.locator("text=/reversal|remove.*debt.*link/i");`. It was never asserted; keep the `// Should warn about reversal` comment.

Run: `npx tsc --noEmit -p tsconfig.tests.json; echo "exit $?"` → `exit 0`.

- [x] **Step 3: Add the CI step**

In `.github/workflows/ci.yml`, in the `ci` job, after the `Run linter` step:

```yaml
# src is type-checked by `npm run build` (tsc -b); tests/ and the Playwright
# config are outside that program, so they get their own pass.
- name: Typecheck tests
  run: npx tsc --noEmit -p tsconfig.tests.json
```

- [x] **Step 4: Verify and commit**

Run: `npm ls @types/node --depth=0; echo "exit $?"` → lists `@types/node@24.x`, exit 0.
Run the standard check → exit 0, test count unchanged from Task 4.

```bash
git add tsconfig.tests.json package.json package-lock.json tests/e2e/debts/debt-payments.spec.ts tests/e2e/debts/debt-reversals.spec.ts tests/e2e/fixtures/helpers.ts .github/workflows/ci.yml
git commit -m "build(ts): type-check tests/ and the Playwright config in CI"
```

---

### Task 6: Claude Code hooks

**Files:**

- Create: `scripts/agent-stop-check.sh`, `scripts/agent-lint-file.sh`, `scripts/agent-session-start.sh` (all `chmod +x`)
- Create: `scripts/agent-bash-guard.mjs`, `scripts/agent-bash-guard.test.mjs`
- Modify: `.claude/settings.json`

**Interfaces:**

- Produces: `blockedReason(command: string, options: { projectDir: string; tmpDirs: string[] }): string | null` exported from `scripts/agent-bash-guard.mjs`.

- [x] **Step 1: Write the failing guard test**

`scripts/agent-bash-guard.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { blockedReason } from "./agent-bash-guard.mjs";

const options = { projectDir: "/repo", tmpDirs: ["/tmp", "/private/tmp"] };

describe("blockedReason", () => {
  it.each([
    "git push --force",
    "git push -f origin main",
    "git push --force-with-lease origin main",
    "git push origin +main",
    "cd /repo && git push -uf origin feature",
    "supabase db push",
    "supabase db reset --linked",
    "rm -rf /",
    'rm -rf "/"',
    "rm -rf ~",
    "rm -rf ~/Documents",
    "rm -rf $HOME/projects",
    "rm -rf ..",
    "rm -rf ../other-repo",
    "rm -rf .",
    "rm -rf /repo",
    "rm -rf /Users/someone/elsewhere",
    "rm -r /etc",
    "sudo rm -rf /var/lib/thing",
    "rm --recursive --force /opt",
  ])("blocks %s", (command) => {
    expect(blockedReason(command, options)).toEqual(expect.any(String));
  });

  it.each([
    "git push",
    "git push -u origin feature",
    "git push origin main && rm -f notes.txt",
    "git status -sb",
    "supabase status -o env",
    "rm -rf dist",
    "rm -rf node_modules/.vite",
    "rm -rf /repo/dist",
    "rm -rf /tmp/claude-501/scratch",
    "rm -rf /private/tmp/claude-501/scratch",
    "rm notes.txt",
    "npm run lint",
  ])("allows %s", (command) => {
    expect(blockedReason(command, options)).toBeNull();
  });
});
```

Run: `npx vitest run scripts/agent-bash-guard.test.mjs; echo "exit $?"` → FAIL (module not found).

- [x] **Step 2: Implement the guard**

`scripts/agent-bash-guard.mjs`:

```js
#!/usr/bin/env node
// PreToolUse(Bash) guard: refuses commands that rewrite shared history, touch the
// linked Supabase project, or recursively delete outside the repo or temp dirs.
// Hooks can only tighten permissions, so this never allows anything by itself.
import { readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

function isInside(path, dir) {
  const root = resolve(dir);
  return path.startsWith(root + sep);
}

function isDangerousTarget(rawTarget, { projectDir, tmpDirs }) {
  const target = rawTarget.replace(/^["']|["']$/g, "");
  if (target === "." || target === "./" || target === "*") return true;
  if (target.startsWith("~") || target.startsWith("$HOME") || target.startsWith("${HOME}")) {
    return true;
  }
  if (target.startsWith("..")) return true;
  if (!isAbsolute(target)) return false;
  const path = resolve(target);
  return ![projectDir, ...tmpDirs].some((dir) => isInside(path, dir));
}

function forcePushReason(tokens) {
  const pushIndex = tokens.indexOf("push");
  if (tokens[0] !== "git" || pushIndex === -1) return null;
  const forced = tokens
    .slice(pushIndex + 1)
    .some(
      (token) =>
        token.startsWith("--force") ||
        /^-[a-zA-Z]*f[a-zA-Z]*$/.test(token) ||
        (token.startsWith("+") && token.length > 1)
    );
  return forced ? "force-push rewrites shared history; push normally or ask the user." : null;
}

function supabaseReason(segment) {
  if (/\bsupabase\s+db\s+push\b/.test(segment)) {
    return "supabase db push applies migrations to a remote project; ask the user.";
  }
  if (/\bsupabase\s+db\s+reset\b/.test(segment) && /--linked\b/.test(segment)) {
    return "supabase db reset --linked wipes the remote database; ask the user.";
  }
  return null;
}

function recursiveRmReason(tokens, options) {
  const rmIndex = tokens.findIndex((token) => token === "rm" || token.endsWith("/rm"));
  if (rmIndex === -1) return null;
  const args = tokens.slice(rmIndex + 1);
  const recursive = args.some(
    (arg) => arg === "--recursive" || (/^-[a-zA-Z]+$/.test(arg) && /[rR]/.test(arg))
  );
  if (!recursive) return null;
  const target = args
    .filter((arg) => !arg.startsWith("-"))
    .find((arg) => isDangerousTarget(arg, options));
  return target
    ? `recursive rm of ${target} is outside the repo and temp dirs; delete a narrower path or ask the user.`
    : null;
}

export function blockedReason(command, options) {
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    if (tokens[0] === "sudo") tokens.shift();
    if (tokens.length === 0) continue;
    const reason =
      forcePushReason(tokens) ?? supabaseReason(segment) ?? recursiveRmReason(tokens, options);
    if (reason) return reason;
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const reason = blockedReason(input.tool_input?.command ?? "", {
    projectDir: process.env.CLAUDE_PROJECT_DIR ?? process.cwd(),
    tmpDirs: [process.env.TMPDIR, "/tmp", "/private/tmp"].filter(Boolean),
  });
  if (reason) {
    process.stderr.write(`Blocked by scripts/agent-bash-guard.mjs: ${reason}\n`);
    process.exit(2);
  }
}
```

Run: `npx vitest run scripts/agent-bash-guard.test.mjs; echo "exit $?"` → 32 passed, exit 0. If a case fails, fix the guard, not the test, unless the case contradicts the spec; report any such case.

- [x] **Step 3: Write the three shell hooks**

`scripts/agent-stop-check.sh`:

```bash
#!/bin/bash
# Lint + typecheck what changed on this branch. Blocks the stop once per
# distinct working-tree state: Claude gets one chance to fix each failure,
# and an unfixable failure cannot loop because the tree hash stops changing.
set -u
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
input=$(cat)
session=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).session_id||"nosession")}catch{process.stdout.write("nosession")}})')

base=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null || echo HEAD)
changed=$( { git diff --name-only --diff-filter=ACMR "$base"; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx)$' | sort -u)
[ -z "$changed" ] && exit 0

typecheck_tests=""
if printf '%s\n' "$changed" | grep -qE '^(tests/|playwright\.config\.ts$)'; then
  typecheck_tests="yes"
fi

# Phase 3 exit criterion adds --max-warnings=0 here (roadmap section 5).
output=$(npx eslint $changed 2>&1 \
  && npx tsc --noEmit -p tsconfig.json 2>&1 \
  && { [ -z "$typecheck_tests" ] || npx tsc --noEmit -p tsconfig.tests.json 2>&1; })
[ $? -eq 0 ] && exit 0

marker="${TMPDIR:-/tmp}/household-hub-stop-${session}"
current=$(cat $changed | git hash-object --stdin)
if [ -f "$marker" ] && [ "$(cat "$marker")" = "$current" ]; then
  exit 0 # same tree as the last block: no progress, let the stop through
fi
printf '%s' "$current" > "$marker"
echo "$output" | tail -40 >&2
exit 2
```

`scripts/agent-lint-file.sh`:

```bash
#!/bin/bash
# PostToolUse(Edit|Write): lint the one edited src file so feedback lands seconds
# after the edit; the Stop hook stays the backstop for cross-file type errors.
set -u
project="${CLAUDE_PROJECT_DIR:-$PWD}"
file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path||"")}catch{}})')
case "$file" in
  "$project"/src/*.ts | "$project"/src/*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0
output=$(cd "$project" && npx eslint "$file" 2>&1) && exit 0
echo "$output" | tail -30 >&2
exit 2
```

`scripts/agent-session-start.sh`:

```bash
#!/bin/bash
# SessionStart: hand the agent the repo state so resuming after a gap starts
# from facts (CLAUDE.md "Multi-day sessions"), not memory.
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
newest_plan=$(git log -1 --name-only --format= -- docs/plans/ | head -1)
CONTEXT="$(git status -sb)
$(git log --oneline -10)
Most recently committed plan doc: ${newest_plan:-none}" \
  node -e 'process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:process.env.CONTEXT}}))'
```

Run: `chmod +x scripts/agent-stop-check.sh scripts/agent-lint-file.sh scripts/agent-session-start.sh scripts/agent-bash-guard.mjs; echo "exit $?"` → exit 0.

- [x] **Step 4: Merge the hooks into `.claude/settings.json`**

```json
{
  "statusLine": {
    "type": "command",
    "command": ".claude/statusline.sh",
    "padding": 0
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/agent-session-start.sh" }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR\"/scripts/agent-bash-guard.mjs"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/agent-lint-file.sh" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/agent-stop-check.sh" }
        ]
      }
    ]
  }
}
```

- [x] **Step 5: Exercise every script directly**

Run each and record the printed exit code. `P` is the repo root.

```bash
P=$PWD
# Bash guard: blocked, then allowed
echo '{"tool_input":{"command":"git push --force"}}' | CLAUDE_PROJECT_DIR=$P node scripts/agent-bash-guard.mjs; echo "exit $?"   # expect: Blocked... , exit 2
echo '{"tool_input":{"command":"git status"}}' | CLAUDE_PROJECT_DIR=$P node scripts/agent-bash-guard.mjs; echo "exit $?"        # expect: exit 0

# Lint-file: failing src file, then a non-src file
printf 'export const probe: any = 1;\n' > src/zz-lint-probe.ts
echo "{\"tool_input\":{\"file_path\":\"$P/src/zz-lint-probe.ts\"}}" | CLAUDE_PROJECT_DIR=$P scripts/agent-lint-file.sh; echo "exit $?"   # expect: no-explicit-any output, exit 2
echo "{\"tool_input\":{\"file_path\":\"$P/README.md\"}}" | CLAUDE_PROJECT_DIR=$P scripts/agent-lint-file.sh; echo "exit $?"            # expect: exit 0
rm src/zz-lint-probe.ts

# Stop hook: clean branch passes; a broken file blocks once, then the same tree is let through
echo '{"session_id":"phase1a-probe"}' | CLAUDE_PROJECT_DIR=$P scripts/agent-stop-check.sh; echo "exit $?"   # expect: exit 0
printf 'export const probe: number = "x";\n' > src/zz-stop-probe.ts
echo '{"session_id":"phase1a-probe"}' | CLAUDE_PROJECT_DIR=$P scripts/agent-stop-check.sh; echo "exit $?"   # expect: TS2322 output, exit 2
echo '{"session_id":"phase1a-probe"}' | CLAUDE_PROJECT_DIR=$P scripts/agent-stop-check.sh; echo "exit $?"   # expect: exit 0 (loop guard)
printf 'export const probe: number = "y";\n' > src/zz-stop-probe.ts
echo '{"session_id":"phase1a-probe"}' | CLAUDE_PROJECT_DIR=$P scripts/agent-stop-check.sh; echo "exit $?"   # expect: exit 2 (new tree state)
rm src/zz-stop-probe.ts "${TMPDIR:-/tmp}/household-hub-stop-phase1a-probe"

# Session start: valid JSON with the expected field
CLAUDE_PROJECT_DIR=$P scripts/agent-session-start.sh | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.hookSpecificOutput.hookEventName, j.hookSpecificOutput.additionalContext.split("\n")[0])})'; echo "exit $?"   # expect: "SessionStart ## phase-1a-cheap-wins...", exit 0
git status -s   # expect: only the Task 6 files
```

Every expectation must match. Quote each exit code in the task report.

- [x] **Step 6: Standard check and commit**

Run the standard check → exit 0; tests = Task 5 count + 32.

```bash
git add scripts/agent-stop-check.sh scripts/agent-lint-file.sh scripts/agent-session-start.sh scripts/agent-bash-guard.mjs scripts/agent-bash-guard.test.mjs .claude/settings.json
git commit -m "chore(claude): add session-start, bash-guard, per-file lint, and stop-check hooks"
```

The live in-session check happens after the branch is done (Task 8, Step 5), because hook config is read when a session starts.

---

### Task 7: Dependabot, pinned toolchain, audit job

**Files:**

- Create: `.github/dependabot.yml`
- Modify: `package.json` (`packageManager`)
- Modify: `.github/workflows/ci.yml` (both `setup-node` steps; new `audit` job)
- Modify: `.github/workflows/security-check.yml` (`setup-node` step)

**Interfaces:** none.

- [x] **Step 1: Dependabot config**

`.github/dependabot.yml`:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
    groups:
      # All @radix-ui/* must move together: mixed versions split
      # react-dismissable-layer and break pointer events in dialogs (CLAUDE.md).
      radix:
        patterns: ["@radix-ui/*"]
        update-types: [major, minor, patch]
      minor-and-patch:
        update-types: [minor, patch]
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
```

- [x] **Step 2: Pin the toolchain**

In `package.json`, add after `"type"` (or after `"version"` if there is no `"type"`): `"packageManager": "npm@10.9.8",`.

In `.github/workflows/ci.yml` (both jobs) and `.github/workflows/security-check.yml`, replace

```yaml
node-version: "22"
```

with

```yaml
node-version-file: .nvmrc
```

- [x] **Step 3: Audit job** (superseded 2026-10-01: consolidated into security-check.yml, see design Decisions)

Append to `jobs:` in `.github/workflows/ci.yml`:

```yaml
audit:
  runs-on: ubuntu-latest
  timeout-minutes: 5

  steps:
    - name: Checkout code
      uses: actions/checkout@v4

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc

    # Blocking gate: only what ships to users. Dev-only advisories (the
    # @lhci/cli/lighthouse chain has no non-breaking fix) are reported below.
    - name: Audit production dependencies
      run: npm audit --omit=dev --audit-level=high

    - name: Audit all dependencies (report only)
      continue-on-error: true
      run: npm audit --audit-level=high
```

- [x] **Step 4: Verify**

Run: `node -e 'for (const f of [".github/dependabot.yml",".github/workflows/ci.yml",".github/workflows/security-check.yml"]) { require("fs").readFileSync(f,"utf8"); } console.log("read ok")'; npx --yes yaml-lint .github/dependabot.yml .github/workflows/ci.yml .github/workflows/security-check.yml; echo "exit $?"` → `exit 0`. If `yaml-lint` cannot be fetched, use `npx prettier --check` on the three files instead and quote its output.
Run: `grep -n 'node-version' .github/workflows/*.yml` → only `node-version-file: .nvmrc` lines.
Run: `npm install --package-lock-only; git diff --stat package-lock.json; echo "exit $?"` → the lockfile is unchanged or changes only its `packageManager` echo; exit 0.
Run: `npm audit --omit=dev --audit-level=high; echo "exit $?"` → still `exit 1` here (`seroval`); Task 8 fixes it. Quote the line naming `seroval`.

- [x] **Step 5: Commit**

```bash
git add .github/dependabot.yml .github/workflows/ci.yml .github/workflows/security-check.yml package.json package-lock.json
git commit -m "ci: Dependabot, .nvmrc-pinned Node, packageManager, and audit job"
```

---

### Task 8: Non-breaking `npm audit fix`, full acceptance, docs

**Files:**

- Modify: `package-lock.json` (and `package.json` only if `npm audit fix` changes a range)
- Modify: `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 1a checkboxes, Resume state)
- Modify: `docs/plans/2026-10-01-phase-1a-cheap-wins.md` (this plan's checkboxes)
- Modify: `CLAUDE.md` only if a new pre-existing failure is found (Known Infrastructure Issues rule)

**Interfaces:** none.

- [x] **Step 1: Apply the non-breaking fixes**

Run: `npm audit fix; echo "exit $?"`. Never `--force`.
Run: `npm audit --omit=dev --audit-level=high; echo "exit $?"` → `exit 0`.
Run: `npm audit --audit-level=high 2>&1 | tail -3` → quote it. Remaining advisories should be the `@lhci/cli`/`lighthouse` chain only; list any others in the report.
Run: `npm ls @radix-ui/react-dismissable-layer` → a single version. If not, revert the lockfile (`git checkout package-lock.json package.json`), and report instead of continuing.

- [x] **Step 2: Full acceptance**

Each must succeed; quote the evidence line:

```bash
npx tsc --noEmit -p tsconfig.json; echo "exit $?"
npx tsc --noEmit -p tsconfig.tests.json; echo "exit $?"
npm run lint; echo "exit $?"                      # 0 errors, 0 warnings
npx vitest run; echo "exit $?"                    # quote Test Files / Tests lines
npm run build; echo "exit $?"
npm run size; echo "exit $?"
supabase status -o env | grep API_URL             # local stack must be up (127.0.0.1:54331)
PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke; echo "exit $?"   # expect 11 passed
```

A smoke failure is a regression only if it passes on `main` (CLAUDE.md Known Infrastructure Issues: compare with `git stash`/`main` before debugging).

- [x] **Step 3: Commit the lockfile**

```bash
git add package-lock.json package.json
git commit -m "chore(deps): apply non-breaking npm audit fixes"
```

- [x] **Step 4: Update the docs**

- This plan: tick every completed step.
- Roadmap: tick the six Phase 1a items; replace the Phase 1a line in `## Resume state` with the branch head, the acceptance numbers from Step 2, and "next: final whole-branch review, then merge; then Phase 1b brainstorm".

```bash
git add docs/plans/2026-09-30-guardrails-roadmap.md docs/plans/2026-10-01-phase-1a-cheap-wins.md
git commit -m "docs(plans): mark Phase 1a tasks complete"
```

- [ ] **Step 5: Live hook check (controller, not a subagent)**

In a fresh Claude Code session in this repo: confirm the SessionStart context appears; ask it to run `git push --force` and confirm the refusal; have it edit a `src` file to add an `any` and confirm the PostToolUse feedback. Record the results in the roadmap's Resume state.

---

## Self-review notes

- Spec coverage: section 1 → Tasks 2-3; section 2 → Task 4; section 3 → Tasks 1, 5; section 4 → Task 6; section 5 → Tasks 7-8; section 7 acceptance → Task 8 Step 2; hook live check → Task 8 Step 5.
- Test counts: Task 2 +4, Task 3 +15, Task 4 +5, Task 6 +32. Expected final: 918 + 56 = 974 tests across 72 + 3 = 75 files (Task 4 adds to existing files).
