# Phase 0: Fix Live Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the live bugs that the Phase 1 guardrail lint rules would flag (transfers bypassing the outbox, PDF Import opening the retired CSV page, ad hoc money parsing, the broken transfers toggle) and get the E2E budgets fixture working.

**Architecture:** Every entity write goes through `src/lib/offline/*`, which writes the entity and its sync-queue item in one Dexie transaction. Transfers reuse `createOfflineTransactionsBatch`. `/import` becomes a layout route with `<Outlet />`. Peso parsing is centralised in `src/lib/currency.ts`; URL search params are validated with a Zod schema in `src/lib/validations/`.

**Tech Stack:** React 19, TypeScript 5.9, TanStack Router + Query, Dexie (fake-indexeddb in tests), Zod 3.25, Vitest + Testing Library, Playwright, Supabase.

**Spec:** `docs/plans/2026-09-30-phase-0-live-bugs-design.md`. **Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md`.

## Global Constraints

- Work on branch `phase-0-live-bugs`. One commit per task. Commit messages have no `Co-Authored-By` or Claude session lines.
- Amounts are integer cents; `MAX_AMOUNT_CENTS = 999999999`.
- Toasts use Sonner; routing uses TanStack Router.
- No new `eslint-disable` comments.
- Comments stay sparse: explain why, not what.
- Pre-commit runs `eslint --fix` + Prettier via lint-staged; pre-push runs `npm run lint` and `npx vitest run`.
- Before claiming a task done, quote the passing test output line.

---

### Task 1: Make `/import` a layout route and retire the old CSV page

**Files:**

- Modify (full rewrite): `src/routes/import.tsx`
- Create: `src/routes/import.test.tsx`
- Delete: `src/stores/importStore.ts`, `src/stores/__tests__/importStore.test.ts`, `src/components/DuplicateResolver.tsx`
- Modify: `src/components/README.md`, `src/stores/README.md`, `src/stores/pdfImportStore.ts:7` (comment only)

**Interfaces:**

- Produces: `Route` from `src/routes/import.tsx` with `options.beforeLoad` (redirects `/import` to `/import/pdf`) and `options.component` (renders `<Outlet />`).

- [ ] **Step 1: Write the failing test**

Create `src/routes/import.test.tsx`:

```tsx
/**
 * /import is the parent of /import/pdf. Without an <Outlet> the child never
 * mounts, so these mount the real /import route options over a stub child.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as ImportRoute } from "./import";

function renderAt(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/import",
    beforeLoad: ImportRoute.options.beforeLoad,
    component: ImportRoute.options.component,
  });
  const pdfRoute = createRoute({
    getParentRoute: () => importRoute,
    path: "/pdf",
    component: () => <div data-testid="route-import-pdf" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([importRoute.addChildren([pdfRoute])]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("/import layout route", () => {
  it("renders the /import/pdf child", async () => {
    renderAt("/import/pdf");
    expect(await screen.findByTestId("route-import-pdf")).toBeInTheDocument();
  });

  it("redirects /import to /import/pdf", async () => {
    const router = renderAt("/import");
    expect(await screen.findByTestId("route-import-pdf")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/import/pdf");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/routes/import.test.tsx`
Expected: both tests FAIL with `Unable to find an element by: [data-testid="route-import-pdf"]`, and the DOM dump shows `Import Transactions` (the CSV page).

- [ ] **Step 3: Rewrite `src/routes/import.tsx`**

Replace the whole file with:

```tsx
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

/**
 * Layout route for /import; its only child is /import/pdf. CSV import will be
 * rebuilt on the draft pipeline (createImportSession -> confirmDrafts), see
 * docs/plans/2026-09-30-phase-0-live-bugs-design.md.
 */
export const Route = createFileRoute("/import")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/import") {
      throw redirect({ to: "/import/pdf" });
    }
  },
  component: ImportLayout,
});

function ImportLayout() {
  return <Outlet />;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/routes/import.test.tsx`
Expected: `2 passed`.

- [ ] **Step 5: Delete the CSV-only modules and confirm nothing else imports them**

```bash
git rm src/stores/importStore.ts src/stores/__tests__/importStore.test.ts src/components/DuplicateResolver.tsx
grep -rn "importStore\"\|/importStore'\|DuplicateResolver" src --exclude=routeTree.gen.ts
```

Expected: the grep prints only README lines and the comment in `src/stores/pdfImportStore.ts:7`. Any other hit is a real import: stop and restore the file with `git checkout HEAD -- <path>`.

- [ ] **Step 6: Update the references**

- `src/stores/pdfImportStore.ts:7`: change `* Follows the same pattern as importStore.ts for CSV imports.` to `* Zustand store for the PDF import wizard.`
- `src/components/README.md` and `src/stores/README.md`: delete the entries (headings, bullets, or table rows) that describe `DuplicateResolver` and `importStore`. Find them with `grep -n "DuplicateResolver\|importStore" src/components/README.md src/stores/README.md`.

- [ ] **Step 7: Typecheck, lint, and run the full unit suite**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint && npx vitest run`
Expected: exit 0; the vitest summary line reads `Test Files  N passed`, with no failures.

- [ ] **Step 8: Commit**

```bash
git add -A src/routes/import.tsx src/routes/import.test.tsx src/stores src/components/README.md src/components/DuplicateResolver.tsx
git commit -m "fix(import): render /import/pdf through an Outlet and retire the old CSV page

The /import parent rendered the CSV wizard without an <Outlet>, so every
PDF Import link opened the CSV page and its outbox-bypassing writes.
CSV import will be rebuilt on the draft pipeline."
```

---

### Task 2: `parsePHPUnbounded` for the currency input

**Files:**

- Modify: `src/lib/currency.ts` (add a function after `parsePHP`)
- Modify: `src/components/ui/currency-input.tsx:4` and the `catch` block of `handleChange` (currently lines 83-97)
- Test: `src/lib/currency.test.ts`

**Interfaces:**

- Produces: `parsePHPUnbounded(input: string): number | null` from `@/lib/currency`.

- [ ] **Step 1: Write the failing tests**

Add `parsePHPUnbounded` to the import from `./currency` at the top of `src/lib/currency.test.ts`, then append:

```ts
describe("parsePHPUnbounded", () => {
  it("parses formatted peso input to cents", () => {
    expect(parsePHPUnbounded("₱1,500.50")).toBe(150050);
    expect(parsePHPUnbounded(" 12.3 ")).toBe(1230);
  });

  it("returns values above MAX_AMOUNT_CENTS instead of throwing", () => {
    expect(parsePHPUnbounded("99999999")).toBe(9999999900);
  });

  it("returns null for empty, non-numeric, and negative input", () => {
    expect(parsePHPUnbounded("")).toBeNull();
    expect(parsePHPUnbounded("abc")).toBeNull();
    expect(parsePHPUnbounded("-")).toBeNull();
    expect(parsePHPUnbounded("-5")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/currency.test.ts -t parsePHPUnbounded`
Expected: FAIL with `parsePHPUnbounded is not a function` (or a missing-export error).

- [ ] **Step 3: Implement it in `src/lib/currency.ts`, directly after `parsePHP`**

```ts
/**
 * Parses peso input to cents WITHOUT the MAX_AMOUNT_CENTS check. For inputs
 * that must commit an over-max value so form validation can reject it.
 * Returns null for empty, non-numeric, or negative input.
 */
export function parsePHPUnbounded(input: string): number | null {
  const cleaned = input.replace(/[₱,\s]/g, "");
  if (cleaned === "") return null;

  const pesos = parseFloat(cleaned);
  if (isNaN(pesos) || pesos < 0) return null;

  return Math.round(pesos * 100);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/currency.test.ts`
Expected: all tests pass, including the three new `parsePHPUnbounded` tests.

- [ ] **Step 5: Use it in `currency-input.tsx`**

Change line 4 to:

```tsx
import { formatPHP, parsePHP, parsePHPUnbounded, MAX_AMOUNT_CENTS } from "@/lib/currency";
```

Replace the `catch` block of `handleChange` with the version below. The comment stays; only the parsing lines change:

```tsx
      } catch {
        // parsePHP also throws when the amount EXCEEDS MAX_AMOUNT_CENTS.
        // Swallowing that case would leave the last parseable prefix
        // committed (typing "99999999" keeps ₱9,999,999 in form state while
        // the input shows ₱99,999,999) and Enter would submit a silently
        // wrong amount. Commit the over-max cents value instead so the
        // schema-level .max() rule rejects submit with its "too large" error.
        const cents = parsePHPUnbounded(input);
        if (cents !== null && cents > MAX_AMOUNT_CENTS) {
          onChange?.(cents);
        }
        // Otherwise not parseable yet (e.g. "abc" or "-"); blur resets the display.
      }
```

- [ ] **Step 6: Run the existing currency-input regression tests**

Run: `npx vitest run src/components/ui/currency-input.test.tsx`
Expected: all pass, including `commits the over-max cents value instead of leaving a truncated prefix committed`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/currency.ts src/lib/currency.test.ts src/components/ui/currency-input.tsx
git commit -m "refactor(currency): parse over-max input via parsePHPUnbounded"
```

---

### Task 3: Debt amount input and draft edit through `parsePHPSafe`

**Files:**

- Modify: `src/lib/debts/validation.ts` (`parseAmountInput`, currently lines 391-417; plus its imports)
- Modify: `src/routes/drafts.tsx:56` (import) and `:458-463` (amount `onChange`)
- Create: `src/lib/debts/parseAmountInput.test.ts`

**Interfaces:**

- Consumes: `parsePHPSafe(input: string | number): { success: true; value: number } | { success: false; error: CurrencyError }` from `@/lib/currency` (existing).
- Produces: `parseAmountInput(input: string): number | null`, signature unchanged.

- [ ] **Step 1: Write the characterisation tests**

These lock in current behaviour so the refactor can't change it. Create `src/lib/debts/parseAmountInput.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseAmountInput } from "./validation";

describe("parseAmountInput", () => {
  it("parses formatted peso input to cents", () => {
    expect(parseAmountInput("₱1,500.50")).toBe(150050);
    expect(parseAmountInput("1")).toBe(100);
  });

  it("rejects amounts below the ₱1.00 debt minimum", () => {
    expect(parseAmountInput("0.99")).toBeNull();
    expect(parseAmountInput("0")).toBeNull();
    expect(parseAmountInput("")).toBeNull();
  });

  it("rejects negative, non-numeric, and over-max input", () => {
    expect(parseAmountInput("-5")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("10000000")).toBeNull();
  });
});
```

- [ ] **Step 2: Run them against the current code**

Run: `npx vitest run src/lib/debts/parseAmountInput.test.ts`
Expected: `3 passed`. These are characterisation tests, so they pass before the refactor.

- [ ] **Step 3: Replace the body of `parseAmountInput`**

In `src/lib/debts/validation.ts`, add `import { parsePHPSafe } from "@/lib/currency";` next to the other imports (lines 8-10), then replace the function with:

```ts
/**
 * Validate amount string and convert to cents
 *
 * @param input - Amount string (e.g., "1500", "₱1,500.50")
 * @returns Amount in cents or null if invalid
 */
export function parseAmountInput(input: string): number | null {
  const result = parsePHPSafe(input);
  if (!result.success || result.value < CURRENCY_LIMITS.MIN_DEBT) {
    return null;
  }
  return result.value;
}
```

- [ ] **Step 4: Re-run the tests**

Run: `npx vitest run src/lib/debts/parseAmountInput.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Fix the draft amount edit in `src/routes/drafts.tsx`**

Change line 56 to `import { formatPHP, parsePHPSafe } from "@/lib/currency";`, then replace the amount `Input`'s `onChange` (currently `amount_cents: Math.round(Number(e.target.value) * 100)`) with:

```tsx
                                  onChange={(e) => {
                                    const parsed = parsePHPSafe(e.target.value);
                                    if (parsed.success) {
                                      setEditValues((v) => ({ ...v, amount_cents: parsed.value }));
                                    }
                                  }}
```

Negative input is now ignored instead of stored. An empty field still commits `0` (`parsePHPSafe("")` returns 0), so the user can clear the field while retyping.

- [ ] **Step 6: Typecheck and run the debts suite**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/lib/debts`
Expected: exit 0, all debts tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/debts/validation.ts src/lib/debts/parseAmountInput.test.ts src/routes/drafts.tsx
git commit -m "fix(money): parse debt and draft amounts through parsePHPSafe

Draft edits stored negative cents from Number(e.target.value)."
```

---

### Task 4: Transactions search schema (cents filters + transfers toggle)

**Files:**

- Create: `src/lib/validations/transactionsSearch.ts`
- Create: `src/lib/validations/__tests__/transactionsSearch.test.ts`
- Modify: `src/routes/transactions.tsx:25` (imports) and the `validateSearch` body (currently lines 36-52)

**Interfaces:**

- Produces: `transactionsSearchSchema`, a Zod object whose `parse(search: Record<string, unknown>)` returns `TransactionFilters & { selected?: string }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/validations/__tests__/transactionsSearch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { transactionsSearchSchema } from "../transactionsSearch";

const parse = (search: Record<string, unknown>) => transactionsSearchSchema.parse(search);

describe("transactionsSearchSchema", () => {
  it("defaults to hiding transfers with no filters set", () => {
    expect(parse({})).toEqual({
      dateFrom: undefined,
      dateTo: undefined,
      accountId: undefined,
      categoryId: undefined,
      status: null,
      type: null,
      search: undefined,
      excludeTransfers: true,
      amountMin: undefined,
      amountMax: undefined,
      selected: undefined,
    });
  });

  it("turns transfer exclusion off for boolean false and the string 'false'", () => {
    // TanStack's default search parser round-trips ?excludeTransfers=false as a boolean
    expect(parse({ excludeTransfers: false }).excludeTransfers).toBe(false);
    expect(parse({ excludeTransfers: "false" }).excludeTransfers).toBe(false);
    expect(parse({ excludeTransfers: true }).excludeTransfers).toBe(true);
    expect(parse({ excludeTransfers: "nope" }).excludeTransfers).toBe(true);
  });

  it("keeps amount filters as integer cents and drops invalid ones", () => {
    expect(parse({ amountMin: 50000, amountMax: "150000" })).toMatchObject({
      amountMin: 50000,
      amountMax: 150000,
    });
    expect(parse({ amountMin: "abc" }).amountMin).toBeUndefined();
    expect(parse({ amountMin: -1 }).amountMin).toBeUndefined();
    expect(parse({ amountMin: 12.5 }).amountMin).toBeUndefined();
    expect(parse({ amountMax: 1_000_000_000 }).amountMax).toBeUndefined();
  });

  it("accepts only known status and type values", () => {
    expect(parse({ status: "cleared", type: "income" })).toMatchObject({
      status: "cleared",
      type: "income",
    });
    expect(parse({ status: "bogus", type: 5 })).toMatchObject({ status: null, type: null });
  });

  it("keeps numeric-looking text params as strings", () => {
    // TanStack parses ?search=123 into the number 123
    expect(parse({ search: 123 }).search).toBe("123");
    expect(parse({ search: "" }).search).toBeUndefined();
    expect(parse({ selected: "tx-1", accountId: "acc-1" })).toMatchObject({
      selected: "tx-1",
      accountId: "acc-1",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/validations/__tests__/transactionsSearch.test.ts`
Expected: FAIL with `Failed to resolve import "../transactionsSearch"`.

- [ ] **Step 3: Implement `src/lib/validations/transactionsSearch.ts`**

```ts
import { z } from "zod";
import { MAX_AMOUNT_CENTS } from "@/lib/currency";

// TanStack Router JSON-parses search values, so ?search=123 arrives as a number
const optionalText = z
  .preprocess((value) => (typeof value === "number" ? String(value) : value), z.string().min(1))
  .optional()
  .catch(undefined);

// amountMin/amountMax are already cents in the URL; never run them through parsePHP
const optionalCents = z.coerce
  .number()
  .int()
  .min(0)
  .max(MAX_AMOUNT_CENTS)
  .optional()
  .catch(undefined);

export const transactionsSearchSchema = z.object({
  dateFrom: optionalText,
  dateTo: optionalText,
  accountId: optionalText,
  categoryId: optionalText,
  status: z.enum(["pending", "cleared"]).nullable().catch(null),
  type: z.enum(["income", "expense"]).nullable().catch(null),
  search: optionalText,
  // Transfers stay hidden unless explicitly turned off (boolean or string "false")
  excludeTransfers: z.unknown().transform((value) => value !== false && value !== "false"),
  amountMin: optionalCents,
  amountMax: optionalCents,
  selected: optionalText,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/validations/__tests__/transactionsSearch.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Use the schema in `src/routes/transactions.tsx`**

Add `import { transactionsSearchSchema } from "@/lib/validations/transactionsSearch";` below the `formatPHP` import (line 24). Keep the doc comment above `export const Route`, and replace the `validateSearch` property with:

```tsx
  validateSearch: (search: Record<string, unknown>): TransactionFilters & { selected?: string } =>
    transactionsSearchSchema.parse(search),
```

- [ ] **Step 6: Typecheck and run the transactions route tests**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/__tests__/transactions-route.test.tsx src/lib/validations`
Expected: exit 0, all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/validations/transactionsSearch.ts src/lib/validations/__tests__/transactionsSearch.test.ts src/routes/transactions.tsx
git commit -m "fix(transactions): validate search params with Zod; transfers toggle works

The router round-trips ?excludeTransfers=false as a boolean, but the old
check compared against the string, so transfers could never be shown.
Amount filters stay integer cents instead of Number() on raw params."
```

---

### Task 5: `createOfflineTransfer`

**Files:**

- Modify: `src/lib/offline/transfers.ts` (imports + new export at the end)
- Modify: `src/lib/offline/transfers.test.ts` (imports, a `vi.mock` of `./syncQueue`, a new `describe` block)

**Interfaces:**

- Consumes: `createOfflineTransactionsBatch(inputs: TransactionInput[], userId: string): Promise<OfflineOperationResult<LocalTransaction[]>>` from `./transactions`; `validateAmount(cents: number): boolean` from `@/lib/currency`.
- Produces:

```ts
export interface TransferInput {
  from_account_id: string;
  to_account_id: string;
  from_account_name: string;
  to_account_name: string;
  amount_cents: number;
  date: string;
  description?: string;
}
export function createOfflineTransfer(
  input: TransferInput,
  userId: string
): Promise<OfflineOperationResult<LocalTransaction[]>>;
```

- [ ] **Step 1: Write the failing tests**

In `src/lib/offline/transfers.test.ts`:

1. Change the vitest import to `import { describe, it, expect, beforeEach, vi } from "vitest";`.
2. Change the `./transfers` import to `import { createOfflineTransfer, getLocalTransfers, groupTransferLegs, type TransferLeg } from "./transfers";`.
3. Add directly below the imports:

```ts
// Lets a test make queue-item construction fail, to prove the entity write and
// the enqueue share one Dexie transaction
const queueBuild = vi.hoisted(() => ({ fail: false }));
vi.mock("./syncQueue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./syncQueue")>();
  return {
    ...actual,
    buildSyncQueueItem: vi.fn((...args: Parameters<typeof actual.buildSyncQueueItem>) =>
      queueBuild.fail
        ? Promise.reject(new Error("queue build failed"))
        : actual.buildSyncQueueItem(...args)
    ),
  };
});
```

4. Append at the end of the file:

```ts
describe("createOfflineTransfer", () => {
  const userId = "12345678-1234-5678-1234-567812345678";
  const input = {
    from_account_id: "acc-from",
    to_account_id: "acc-to",
    from_account_name: "Checking",
    to_account_name: "Savings",
    amount_cents: 250000,
    date: "2026-09-30",
  };

  beforeEach(async () => {
    queueBuild.fail = false;
    await db.transactions.clear();
    await db.syncQueue.clear();
  });

  it("writes an expense and an income leg in one transfer group, each queued as a create", async () => {
    const result = await createOfflineTransfer(input, userId);
    expect(result.success).toBe(true);

    const rows = await db.transactions.toArray();
    expect(rows).toHaveLength(2);
    const expense = rows.find((row) => row.type === "expense");
    const income = rows.find((row) => row.type === "income");

    expect(expense).toMatchObject({
      account_id: "acc-from",
      amount_cents: 250000,
      date: "2026-09-30",
      description: "Transfer to Savings",
      status: "pending",
      visibility: "household",
    });
    expect(income).toMatchObject({
      account_id: "acc-to",
      amount_cents: 250000,
      description: "Transfer from Checking",
    });
    expect(expense?.transfer_group_id).toBeTruthy();
    expect(income?.transfer_group_id).toBe(expense?.transfer_group_id);

    const queue = await db.syncQueue.toArray();
    expect(queue).toHaveLength(2);
    expect(queue.every((item) => item.entity_type === "transaction")).toBe(true);
    expect(queue.every((item) => item.operation.op === "create")).toBe(true);
    expect(queue.map((item) => item.entity_id).sort()).toEqual(rows.map((row) => row.id).sort());
  });

  it("uses the given description for both legs", async () => {
    await createOfflineTransfer({ ...input, description: "Rent float" }, userId);
    const rows = await db.transactions.toArray();
    expect(rows.map((row) => row.description)).toEqual(["Rent float", "Rent float"]);
  });

  it("writes nothing when building a queue item fails", async () => {
    queueBuild.fail = true;
    const result = await createOfflineTransfer(input, userId);
    expect(result.success).toBe(false);
    expect(await db.transactions.count()).toBe(0);
    expect(await db.syncQueue.count()).toBe(0);
  });

  it("rejects a same-account transfer and invalid amounts without writing", async () => {
    const sameAccount = await createOfflineTransfer(
      { ...input, to_account_id: "acc-from" },
      userId
    );
    const zero = await createOfflineTransfer({ ...input, amount_cents: 0 }, userId);
    const fractional = await createOfflineTransfer({ ...input, amount_cents: 10.5 }, userId);

    expect([sameAccount.success, zero.success, fractional.success]).toEqual([false, false, false]);
    expect(await db.transactions.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/offline/transfers.test.ts`
Expected: the new `createOfflineTransfer` tests FAIL with `createOfflineTransfer is not a function`; the existing pairing tests still pass.

- [ ] **Step 3: Implement it in `src/lib/offline/transfers.ts`**

Replace the single `import { db } from "@/lib/dexie/db";` line with:

```ts
import { db, type LocalTransaction } from "@/lib/dexie/db";
import { validateAmount } from "@/lib/currency";
import { createOfflineTransactionsBatch } from "./transactions";
import type { OfflineOperationResult } from "./types";
```

If `LocalTransaction` is already imported in this file, merge instead of duplicating: check with `grep -n "^import" src/lib/offline/transfers.ts`.

Append at the end of the file:

```ts
export interface TransferInput {
  from_account_id: string;
  to_account_id: string;
  from_account_name: string;
  to_account_name: string;
  amount_cents: number;
  date: string;
  description?: string;
}

/**
 * Creates both legs of a transfer through the outbox: one Dexie transaction
 * writes the two rows and their two sync-queue items. The legs sync as two
 * ordinary creates; the server's check_transfer_integrity() accepts either
 * leg first and validates the second against it.
 */
export async function createOfflineTransfer(
  input: TransferInput,
  userId: string
): Promise<OfflineOperationResult<LocalTransaction[]>> {
  if (input.from_account_id === input.to_account_id) {
    return { success: false, error: "Cannot transfer to the same account", isTemporary: false };
  }
  if (input.amount_cents === 0 || !validateAmount(input.amount_cents)) {
    return { success: false, error: "Invalid transfer amount", isTemporary: false };
  }

  const shared = {
    date: input.date,
    amount_cents: input.amount_cents,
    status: "pending",
    visibility: "household",
    transfer_group_id: crypto.randomUUID(),
  } as const;

  return createOfflineTransactionsBatch(
    [
      {
        ...shared,
        type: "expense",
        account_id: input.from_account_id,
        description: input.description || `Transfer to ${input.to_account_name}`,
      },
      {
        ...shared,
        type: "income",
        account_id: input.to_account_id,
        description: input.description || `Transfer from ${input.from_account_name}`,
      },
    ],
    userId
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/offline/transfers.test.ts`
Expected: all tests pass (existing pairing tests plus 4 new ones).

- [ ] **Step 5: Check for an import cycle**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/lib/offline`
Expected: exit 0, all offline tests pass. If a test fails with `Cannot access '...' before initialization`, it is a cycle through `./transactions` → `@/lib/debts` → `./transfers`. Fix it by moving `createOfflineTransfer` and `TransferInput` into a new `src/lib/offline/createTransfer.ts` (and its tests into `createTransfer.test.ts`), then update the Task 6 import paths to match.

- [ ] **Step 6: Commit**

```bash
git add src/lib/offline/transfers.ts src/lib/offline/transfers.test.ts
git commit -m "feat(offline): createOfflineTransfer writes both legs through the outbox"
```

---

### Task 6: Route `useCreateTransfer` through the outbox

**Files:**

- Modify: `src/hooks/useTransfers.ts` (imports, the whole `useCreateTransfer` function, lines 1-77)
- Modify: `src/components/transfers/TransferForm.tsx:35`, `:40`, `:72` (drop `householdId`)
- Modify: `src/components/transfers/TransferForm.test.tsx:46` (drop the prop)
- Modify: `src/routes/transfers.tsx:102` (drop the prop)
- Create: `src/hooks/useTransfers.test.tsx`

**Interfaces:**

- Consumes: `createOfflineTransfer`, `TransferInput` from `@/lib/offline/transfers` (Task 5).
- Produces: `useCreateTransfer()`, whose `mutateAsync` takes `TransferInput & { user_id: string }` and resolves to the created `LocalTransaction[]`.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/useTransfers.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCreateTransfer } from "./useTransfers";
import { createOfflineTransfer } from "@/lib/offline/transfers";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/offline/transfers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/transfers")>()),
  createOfflineTransfer: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

const transfer = {
  from_account_id: "acc-from",
  to_account_id: "acc-to",
  from_account_name: "Checking",
  to_account_name: "Savings",
  amount_cents: 250000,
  date: "2026-09-30",
  description: "Rent float",
};

function renderCreateTransfer() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCreateTransfer(), { wrapper });
}

describe("useCreateTransfer", () => {
  beforeEach(() => {
    vi.mocked(createOfflineTransfer).mockReset();
    vi.mocked(supabase.from).mockReset();
  });

  it("creates the transfer through the outbox, never the Supabase client", async () => {
    vi.mocked(createOfflineTransfer).mockResolvedValue({
      success: true,
      data: [],
      isTemporary: true,
    });
    const { result } = renderCreateTransfer();

    await result.current.mutateAsync({ ...transfer, user_id: "user-1" });

    expect(createOfflineTransfer).toHaveBeenCalledWith(transfer, "user-1");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects when the outbox write fails", async () => {
    vi.mocked(createOfflineTransfer).mockResolvedValue({
      success: false,
      error: "Cannot transfer to the same account",
      isTemporary: false,
    });
    const { result } = renderCreateTransfer();

    await expect(result.current.mutateAsync({ ...transfer, user_id: "user-1" })).rejects.toThrow(
      "Cannot transfer to the same account"
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/hooks/useTransfers.test.tsx`
Expected: FAIL. The first test fails because `createOfflineTransfer` was not called (the old hook calls `supabase.from`, which the mock turns into a thrown `TypeError`).

- [ ] **Step 3: Rewrite `useCreateTransfer` and its imports**

In `src/hooks/useTransfers.ts`, replace lines 1-5 (the imports) with:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isLikelyNetworkError } from "@/lib/offline/reads";
import {
  createOfflineTransfer,
  getLocalTransfers,
  groupTransferLegs,
  type TransferInput,
  type TransferLeg,
} from "@/lib/offline/transfers";
```

Replace the whole `useCreateTransfer` function with:

```ts
export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ user_id, ...transfer }: TransferInput & { user_id: string }) => {
      const result = await createOfflineTransfer(transfer, user_id);
      if (!result.success) {
        throw new Error(result.error ?? "Failed to create transfer");
      }
      return result.data ?? [];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
      queryClient.invalidateQueries({ queryKey: ["accounts"] }); // Balances updated
    },
  });
}
```

`supabase` stays imported because `useTransfers` (the read hook) still uses it.

- [ ] **Step 4: Drop `householdId` from `TransferForm` and its callers**

- `src/components/transfers/TransferForm.tsx`: delete `householdId,` from the destructured props (line 35), `householdId: string;` from the props type (line 40), and `household_id: householdId,` from the `mutateAsync` call (line 72).
- `src/components/transfers/TransferForm.test.tsx:46`: delete `householdId="hh-1"`.
- `src/routes/transfers.tsx:102`: change to `<TransferForm accounts={accountOptions} userId={user.id} />`.

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run src/hooks/useTransfers.test.tsx src/components/transfers`
Expected: exit 0; `useTransfers.test.tsx` shows `2 passed`, and the TransferForm tests pass.

- [ ] **Step 6: Confirm no direct Supabase transaction insert remains in hooks or components**

Run: `grep -rn 'from("transactions").insert' src/hooks src/components src/routes`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useTransfers.ts src/hooks/useTransfers.test.tsx src/components/transfers/TransferForm.tsx src/components/transfers/TransferForm.test.tsx src/routes/transfers.tsx
git commit -m "fix(transfers): create transfers through the offline outbox

useCreateTransfer inserted both legs straight into Supabase, so transfers
failed offline and skipped the sync queue and event log."
```

---

### Task 7: E2E budgets fixture

**Files:**

- Modify: `tests/e2e/fixtures/db-cleanup.ts` (`cleanupTestBudgets`, `cleanupAll`, plus a new `createTestBudgetCategory`)
- Modify: `tests/e2e/budgets.spec.ts`
- Modify: `CLAUDE.md` (drop the `budgets.notes` hint from Known Infrastructure Issues)

**Interfaces:**

- Produces: `createTestBudgetCategory(): Promise<string | null>` (returns the child category name, or `null` when the admin client is unavailable); `cleanupTestBudgets(): Promise<void>`.

- [ ] **Step 1: Replace `cleanupTestBudgets` and add the category helper**

In `tests/e2e/fixtures/db-cleanup.ts`, replace the `cleanupTestBudgets` function and its doc comment with:

```ts
export const TEST_BUDGET_CATEGORY = "[E2E] Budget Category";

/**
 * Create an [E2E] parent/child category pair to budget against. Budgets are
 * UNIQUE(household_id, category_id, month), so budgeting a real category
 * would collide with user data and with leaked runs.
 */
export async function createTestBudgetCategory(): Promise<string | null> {
  if (!adminClient) return null;
  const { data: parent, error: parentError } = await adminClient
    .from("categories")
    .insert({ name: "[E2E] Budget Parent" })
    .select("id")
    .single();
  if (parentError || !parent) {
    console.error("Failed to create test budget parent category:", parentError);
    return null;
  }
  const { error } = await adminClient
    .from("categories")
    .insert({ name: TEST_BUDGET_CATEGORY, parent_id: parent.id });
  if (error) {
    console.error("Failed to create test budget category:", error);
    return null;
  }
  return TEST_BUDGET_CATEGORY;
}

/**
 * Delete budgets on [E2E] categories. budgets has no notes column.
 */
export async function cleanupTestBudgets() {
  if (!adminClient) return;
  const { data: categories, error: lookupError } = await adminClient
    .from("categories")
    .select("id")
    .ilike("name", "%[E2E]%");
  if (lookupError) {
    console.error("Failed to look up test budget categories:", lookupError);
    return;
  }
  const categoryIds = (categories ?? []).map((category) => category.id);
  if (categoryIds.length === 0) return;
  const { error } = await adminClient.from("budgets").delete().in("category_id", categoryIds);
  if (error) console.error("Failed to cleanup test budgets:", error);
}
```

In `cleanupAll`, change `await cleanupTestBudgets(userId);` to `await cleanupTestBudgets();`.

Each test creates a fresh pair; `afterEach` (Step 2) deletes every `[E2E]` category, which cascades to their budgets.

- [ ] **Step 2: Budget against the E2E category in `tests/e2e/budgets.spec.ts`**

Change the fixture import to:

```ts
import {
  cleanupTestBudgets,
  cleanupTestCategories,
  createTestBudgetCategory,
} from "./fixtures/db-cleanup";
```

Change `afterEach` to:

```ts
test.afterEach(async () => {
  await cleanupTestBudgets();
  await cleanupTestCategories();
});
```

In `create budget: fill form and verify in list`, add as the first line of the test body:

```ts
const categoryName = await createTestBudgetCategory();
test.skip(!categoryName, "Admin client unavailable - cannot create an isolated budget category");
```

Replace the category-picker block with:

```ts
const categoryTrigger = page.getByRole("combobox", { name: "Select category" });
await categoryTrigger.click();
await page
  .getByRole("option", { name: new RegExp(categoryName!.replace(/[[\]]/g, "\\$&")) })
  .click();
```

Delete the whole `// Add [E2E] marker in notes if available` block (the `notesInput` lookup and fill).

Replace `await page.waitForTimeout(1000);` with an assertion that the budget shows up:

```ts
await expect(page.getByText(categoryName!).first()).toBeVisible({ timeout: 10000 });
```

- [ ] **Step 3: Update CLAUDE.md**

In the Known Infrastructure Issues E2E entry, delete this clause: `test cleanup helpers reference a \`budgets.notes\` column that does not exist in the schema (error \`42703\` during fixture cleanup);`. Leave the rest of the entry.

- [ ] **Step 4: Type-check the edited fixtures**

`tests/` is outside every tsconfig, so check the two files directly:

Run: `npx tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 --esModuleInterop tests/e2e/fixtures/db-cleanup.ts tests/e2e/budgets.spec.ts`
Expected: exit 0. If it reports only missing Node types (`process`, `path`), those are the gap the roadmap's `tsconfig.tests.json` closes; list them in the commit body and go on.

- [ ] **Step 5: Run the budgets spec if the local stack is up**

Run: `supabase status -o env | grep API_URL && npx playwright test --project=chromium tests/e2e/budgets.spec.ts --reporter=list`
Expected: the output has no `42703` error lines. The specs may still fail at `login` while the auth issue is open (Task 8); record the result in the commit body.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/fixtures/db-cleanup.ts tests/e2e/budgets.spec.ts CLAUDE.md
git commit -m "fix(e2e): isolate budget specs on an [E2E] category; drop budgets.notes

budgets has no notes column (42703), so cleanup never ran, and budgeting a
real category collided on UNIQUE(household_id, category_id, month)."
```

---

### Task 8: E2E auth investigation (time-boxed)

Diagnosis, not TDD. **Required skill: superpowers:systematic-debugging.** Time box: 90 minutes of investigation. Per CLAUDE.md, working on a listed infrastructure issue is allowed here because it is this task's explicit scope.

**Files:** determined by the root cause. Possible outcomes are listed in Step 5.

- [ ] **Step 1: Confirm the stack and the URL the tests use**

```bash
supabase status -o env | grep -E "^API_URL|^ANON_KEY" | sed 's/=.*KEY=.*/=<redacted>/'
grep -n "SUPABASE_URL\|VITE_SUPABASE_URL\|baseURL\|webServer" playwright.config.ts
grep -n "SUPABASE_URL" .env.test .env.local .env 2>/dev/null | sed 's/=.*/=<set>/'
grep -n "HEALTH_URL\|54321\|54331" scripts/supabase-lifecycle.mjs
```

Write down what the app under test points at (host:port) and what `supabase status` reports. If they differ, that is hypothesis #1.

- [ ] **Step 2: Reproduce with artifacts**

Run: `npx playwright test --project=chromium tests/e2e/auth.spec.ts --reporter=list --trace=on`
Then read `test-results/*/error-context.md` for each failed test (use the Read tool) and quote the first error.

- [ ] **Step 3: Form one hypothesis at a time and test it minimally**

Follow systematic-debugging phases 1-3. For each hypothesis, record it and its result in the Task 8 notes at the bottom of this plan.

- [ ] **Step 4: Stop at the time box**

At 90 minutes, or once the root cause is confirmed, whichever comes first, go to Step 5.

- [ ] **Step 5: Close out with exactly one outcome**

- **Outcome A (code/config cause fixed):** apply the fix with a test where one is expressible. Then run `npm run test:e2e:smoke` and quote its summary line. The exit criterion is chromium smoke passing. Update the CLAUDE.md E2E entry to reflect the new baseline. Commit as `fix(e2e): <root cause>`.
- **Outcome B (environmental, or unresolved at the time box):** add or update an entry under CLAUDE.md "Known Infrastructure Issues" recording the symptom, the hypotheses ruled out, and the most likely remaining cause, and verify it is in place with `grep -n "Authentication" CLAUDE.md`. Commit as `docs(claude): record E2E auth investigation findings`.

**Task 8 notes** (fill in during execution):

- Hypotheses tested:
  - H1 app points at the wrong Supabase port: ruled out. `.env.local`/`.env.test` and `supabase status` all say `127.0.0.1:54331`; the lifecycle port bug is not hit because the stack was already running.
  - H2 sign-in is broken: ruled out. Failure snapshots show the authenticated sidebar; the specs expected `/dashboard` (a legacy redirect to `/`), a "welcome" text and a `User menu` control that no longer exist. Fixed in the auth spec.
  - H3 preview serves a stale bundle: confirmed as a trap. `dist/` was built 2026-07-13; `npm run preview` serves it as-is. Rebuilt before every run.
  - H4 transactions `beforeEach` races login: confirmed. It navigated to `/transactions` before the submit finished and landed on `/login`. Switched to the shared `login()` helper.
  - H5 budgets locators hit layout chrome: confirmed. `h1` first-matched the hidden tablet-header title; the Add button clause matched the sidebar's "Add Transaction". Scoped to `<main>`.
  - H6 transaction form locators are stale: confirmed (`[name="description"]` first-matches `<meta>`; type is a radio group; account is a Radix Select). Rewritten with roles, [E2E]-prefixed data and cleanup.
  - H7 category combobox has no accessible name: confirmed app a11y bug (CategorySelector dropped FormControl's id/aria props). Fixed with a unit test.
  - H8 no categories to pick: confirmed, local DB has 0 categories. Each test now seeds and deletes its own uniquely named [E2E] category (the old shared `cleanupTestCategories()` would race parallel specs).
  - H9 category option click intercepted by the dialog: confirmed genuine app bug. Dialog 1.1.19 nests `react-dismissable-layer@1.1.15`, popover uses the hoisted 1.1.11, so the popover inherits `pointer-events: none` from body. Vite `resolve.dedupe` fails to build (`useDismissableLayerSurface` missing in 1.1.11). Needs a coordinated `@radix-ui/*` upgrade; not done here.
- Outcome: B. Smoke is 7 passed / 4 failed on chromium; the 4 failures are all H9. Recorded in CLAUDE.md Known Infrastructure Issues.

---

### Task 8b: Upgrade `@radix-ui/*` so pickers inside dialogs accept pointer input

Added 2026-09-30 after Task 8 (see spec Decisions & Deferrals). Exploratory dependency work, so steps are prose; each still ends in a check.

**Files:** `package.json`, `package-lock.json`; any `src/components/ui/*` shadcn wrapper only if an upgraded Radix API forces a change.

**Bug:** `@radix-ui/react-dialog@1.1.19` depends on `react-dismissable-layer@1.1.15`; `react-popover@1.1.15`, `react-select`, `react-menu`, `react-tooltip` resolve `1.1.11`. Two copies of the layer stack mean a Popover opened inside a Dialog is treated as outside the Dialog and inherits `pointer-events: none`. Keyboard selection still works; mouse and touch do not.

- [ ] **Step 1: Record the baseline.** `npm ls @radix-ui/react-dismissable-layer` (expect two versions) and `npm run test:e2e:smoke` (expect the 4 failures at the category option click).
- [ ] **Step 2: Upgrade every direct `@radix-ui/*` dependency together** to its latest version within the current major (`npm install @radix-ui/react-<name>@^<major> ...` for each one in `package.json`).
- [ ] **Step 3: Verify a single copy.** `npm ls @radix-ui/react-dismissable-layer` must show exactly one version. If not, find the lagging package with `npm ls` and upgrade it too. Do not use `overrides` or `resolve.dedupe` unless every package already agrees on the same major, and say so in the commit body if you do.
- [ ] **Step 4: Unit suite, lint, build.** `npm run lint && npx vitest run && npm run build` all exit 0.
- [ ] **Step 5: Smoke.** `npm run test:e2e:smoke` on chromium. Exit criterion: 0 failed. The steps after the category click have never run before, so failures there are new diagnosis work within this task (systematic debugging), not reasons to weaken assertions.
- [ ] **Step 6: Commit** as `fix(deps): upgrade @radix-ui together so dialog pickers accept pointer input`, body naming the duplicated package and versions.

---

### Task 9: Final verification and roadmap update

**Files:**

- Modify: `docs/plans/2026-09-30-phase-0-live-bugs-design.md` (section 6 checkboxes)
- Modify: `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 0 checkboxes)

- [ ] **Step 1: Full verification**

Run: `npm run lint; echo "lint exit $?"; npx vitest run; echo "vitest exit $?"; npm run build; echo "build exit $?"`
Expected: all three exits are `0`. Quote the vitest `Tests` summary line and the build's final line.

- [ ] **Step 2: Confirm the Phase 1 selectors would now find no violations**

```bash
grep -rnE "db\.(transactions|accounts|categories|budgets|debts|internalDebts|debtPayments)\.(add|put|update|delete|bulkAdd|bulkPut|bulkUpdate|bulkDelete|clear)\(" src --include=*.ts --include=*.tsx | grep -vE "src/lib/(offline|debts|sync|dexie)/|\.test\.|__tests__"
grep -rnE "\b(parseFloat|Number)\(" src --include=*.ts --include=*.tsx | grep -vE "src/lib/currency\.ts|src/lib/supabaseQueries\.ts|\.test\.|__tests__"
```

Expected: the first grep prints nothing. The second grep will print non-money uses of `Number(` (ids, counts, dates). List each remaining hit with a one-line classification (money / not money) in the completion message; any **money** hit is a Phase 0 gap to raise with the user, not something to fix silently.

- [ ] **Step 3: Tick the checkboxes**

- In `docs/plans/2026-09-30-phase-0-live-bugs-design.md` section 6, tick each completed item.
- In `docs/plans/2026-09-30-guardrails-roadmap.md` Phase 0, tick each completed item; for the E2E item, add ` (outcome: A|B, see Task 8 notes)`.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-09-30-phase-0-live-bugs-design.md docs/plans/2026-09-30-guardrails-roadmap.md docs/plans/2026-09-30-phase-0-live-bugs.md
git commit -m "docs(plans): mark Phase 0 complete"
```

- [ ] **Step 5: Hand off**

Use superpowers:finishing-a-development-branch to choose merge or PR.
