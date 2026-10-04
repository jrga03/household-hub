# Phase 2b: Branded Cents and Zod Boundaries (Design)

**Date:** 2026-10-04
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 2, sections 4.2 and 4.4)
**Branches:** `phase-2b0-security` (section 1), then `phase-2b-cents-boundaries` (sections 2 to 6), both cut from `main` at `59c086f` or later

## Goal

Make integer cents a type the compiler enforces from the point a value enters the app (user input, Supabase rows, RPC results, realtime payloads) to the point it is displayed, and validate every server row that reaches Dexie or arithmetic at runtime. Before that, close the two database permission gaps 2a deferred, on their own branch so 2b carries no production deploy gate.

## Background (measured on `main` at `59c086f`, 2026-10-04)

| Item                                                                       | Measurement                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `formatPHP(cents: Cents)` only                                             | 114 errors / 34 files in `tsconfig.json` (production 89 / 32, `currency.test.ts` 24). Unchanged from `ccc6263`: 2a typed rows but they still enter as `number`.                                                                                                                                                                                                          |
| Parsers return `Cents` + entity amount fields `Cents` + `formatPHP(Cents)` | 366 / 58 (production 94 / 35, tests 272 / 23). Almost all production errors are `formatPHP` on derived totals; tests are fixture literals (`debts/__tests__/crud` 42, `reversals` 38, `balance` 21).                                                                                                                                                                     |
| Same, `formatPHP(number)`                                                  | 261 / 31 (production 20 / 9: `currency.ts` 5, `offline/transactions.ts` 4, `offline/budgets.ts` 3, `debts/reversals.ts` 2, `supabaseQueries.ts` 2, `csv-importer.ts`, both debt create forms, `drafts.tsx`).                                                                                                                                                             |
| `tsconfig.tests.json`                                                      | 0 errors in every variant (it does not import entity amount types).                                                                                                                                                                                                                                                                                                      |
| RPC results                                                                | `get_account_balances` returns BIGINTs as JSON numbers (local stack: `"cleared_delta_cents":4954950`); deltas are signed. Generated types already describe both RPCs; `supabaseQueries.ts` still casts with `as AccountBalanceDeltaRow[]` (3 sites) and `as TransactionsFilterSummaryRow[]` plus `Number(...)` coercion.                                                 |
| Realtime                                                                   | `realtime-sync.ts` writes raw `Record<string, unknown>` server rows into Dexie at three sites: `handleInsert` (`table.add`), `handleUpdate` (`table.put`), and catch-up `mergeRecord` (`table.put`). Server NULLs land where local types use `undefined`.                                                                                                                |
| PDF drafts                                                                 | `import-drafts.ts:50` already builds `amount_cents` with `parsePHP`; typed correctly once `parsePHP` returns `Cents`.                                                                                                                                                                                                                                                    |
| `arch/no-ad-hoc-money-parse`                                               | Shipped in 1a (`eslint.config.js:423`), 0 violations. 2b adds only the `asCents` import restriction.                                                                                                                                                                                                                                                                     |
| `useAnalytics.ts:364`                                                      | `avgMonthlySpending = totalExpenses / monthCount`, unrounded; `formatPHP` then takes `% 100` of a fraction.                                                                                                                                                                                                                                                              |
| `debts/reversals.ts:169`                                                   | `payment_date: new Date().toISOString().slice(0, 10)`: the UTC date, so a reversal before 08:00 PHT gets yesterday.                                                                                                                                                                                                                                                      |
| `supabaseQueries.ts` `!`                                                   | `:1040`, `:1355`, `:1356`, `:1616`.                                                                                                                                                                                                                                                                                                                                      |
| `get_max_lamport_clock(text)`                                              | `SECURITY DEFINER`, no `search_path`, reads `transaction_events` across households, EXECUTE for `authenticated` (and PUBLIC by default). No caller in `src/`.                                                                                                                                                                                                            |
| `accounts_update`                                                          | WITH CHECK is `household_id = get_user_household_id()` only. (Task 1 found this was not exploitable: the `valid_ownership` CHECK and the SELECT policy applied to the new row already block reassignment. The pin is defense in depth.) The app (`offline/accounts.ts:213-220`) sets owner to the caller on a switch to personal and clears it on a switch to household. |

## 1. Phase 2b-0: security migrations (`phase-2b0-security`)

- Migration `drop_get_max_lamport_clock`: `DROP FUNCTION IF EXISTS public.get_max_lamport_clock(text);`. Regenerate `database.types.ts`.
- Migration `accounts_update_owner`: recreate `accounts_update` with the same USING and `WITH CHECK (household_id = get_user_household_id() AND (owner_user_id IS NULL OR owner_user_id = auth.uid()))`, mirroring 2a's `accounts_insert_owner`.
- pgTAP: the function no longer exists; a member cannot set `owner_user_id` to another member or take a household account as owner of someone else; switching personal to household (owner NULL) and household to personal (owner = caller) both succeed.
- Check whether the app's household switch sends `owner_user_id: null` to the server or omits it (`undefined` drops out of JSON). If omitted, the server keeps the old owner; fix in this branch (send `null`) with a unit test.
- Verify both migrations on a throwaway stack on the CLI-default Postgres image (method in `.superpowers/sdd/phase-2a/task-8a-report.md`), plus `supabase test db` on the dev stack.
- Deploy: the user runs `supabase migration list --linked`, `supabase db push --dry-run`, `supabase db push`, then a SQL check of the function and policy, before `main` is pushed.

## 2. Money API (`src/lib/currency.ts`)

```ts
declare const centsBrand: unique symbol;
export type Cents = number & { readonly [centsBrand]: true };

export function asCents(n: number): Cents; // throws CurrencyError unless Number.isSafeInteger(n)
export function parsePHP(input: string | number): Cents;
export function parsePHPSafe(
  input: string | number
): { success: true; value: Cents } | { success: false; error: CurrencyError };
export function parsePHPUnbounded(input: string): Cents | null;

export function formatPHP(cents: Cents): string;
export function formatPHPAxisTick(cents: Cents): string;
export function formatPHPChartValue(value: unknown): string; // Recharts callbacks; non-integer renders "₱—"

export const ZERO_CENTS: Cents;
export function diffCents(a: Cents, b: Cents): Cents;
export function absCents(cents: Cents): Cents;
export function sumCents(values: Iterable<Cents>): Cents;
export function negateCents(cents: Cents): Cents;
export function divideCents(cents: Cents, divisor: number): Cents; // rounds; throws on divisor <= 0
```

- The brand means "validated integer cents". Sign is not part of it: debt reversals and balance deltas are negative. Positivity stays in Zod schemas and DB checks.
- Raw arithmetic on `Cents` yields `number`, so a derived total must go through a helper or `asCents` before `formatPHP` or storage.
- `Cents` replaces `number` for `amount_cents` and `original_amount_cents` in `types/transactions.ts`, `types/debt.ts`, `types/pdf-import.ts`, `dexie/db.ts` (`LocalTransaction`, `LocalBudget`), and any other entity type that carries an amount.
- Tests use a `cents(n)` helper (wraps `asCents`) from a shared test-utils module so fixtures stay readable.

## 3. Boundaries (`src/lib/validations/`)

- **Sync rows** (`syncRows.ts`): `transactionRowSchema`, `accountRowSchema`, `categoryRowSchema`. Amount fields `.transform(asCents)` after an integer check; nullable columns transform `null` to `undefined` to match the local types. One `parseSyncRow(table, record)` is called by `handleInsert`, `handleUpdate` and `mergeRecord`.
- **Bad sync row:** skip the write, `reportError` with subsystem `realtime-sync`, table, id and the Zod issues, continue with other rows. The catch-up high-water mark still advances, so one bad row cannot wedge sync; the next online read from Supabase still shows the row.
- **RPC results** (`rpcResults.ts`): `accountBalanceDeltaSchema` (signed delta cents, integer counts) and `transactionsFilterSummarySchema`. They replace the four `as` casts and the `Number(...)` coercion. A parse failure throws as a query error; the filter summary keeps its existing network-only Dexie fallback.
- **Typed Supabase reads** are branded at the type level: `AppDatabase` maps every `*_cents` column and `overpayment_amount` to `Cents` on Row, Insert, Update and RPC returns (changed while planning; see the plan's Decisions & Deferrals).

## 4. Lint

- `no-restricted-imports` with `importNames: ["asCents"]` on `src/**`, ignoring `src/lib/currency.ts`, `src/lib/validations/**`, `src/lib/supabaseQueries.ts`, `src/lib/offline/**`, `src/lib/debts/**`, `src/lib/realtime-sync.ts` and test files. Message: use the currency helpers (`sumCents`, `divideCents`, ...) or a validation schema. Lands as `error`: it has no violations on the commit that adds it.

## 5. Deferred fixes

- `useAnalytics.ts`: `avgMonthlySpending = divideCents(totalExpenses, monthCount)`. Test: three months and a total not divisible by 3 yields an integer.
- `debts/reversals.ts:169`: `payment_date` from the local calendar date (`format(new Date(), "yyyy-MM-dd")`). Test: fake clock at 07:30 +08:00 expects that local date, not the UTC one.
- `supabaseQueries.ts`: replace the four `!` with guards (skip rows with no category or group, matching the 1b guard style).

## 6. Task order (2b)

Each step leaves all three tsc programs, lint and vitest green.

1. `Cents`, checked `asCents`, the helper family, parsers return `Cents`; `formatPHP` still takes `number`. TDD for `asCents`, `divideCents`, `sumCents`, `formatPHPChartValue`.
2. Brand entity amount fields; fix the 20 production construction sites; add `cents()` and migrate fixtures.
3. Sync-row schemas and `parseSyncRow` in `realtime-sync.ts` (tests: valid row writes, null normalization, bad row skipped and reported, high-water mark advances).
4. RPC schemas; remove the casts and coercion.
5. `formatPHP`/`formatPHPAxisTick` take `Cents`; fix display sites with the helpers; chart callbacks use `formatPHPChartValue`.
6. `asCents` import restriction.
7. Deferred fixes (section 5).

## 7. Acceptance

- 2b-0: pgTAP passes on the dev stack and on the fresh-image throwaway stack; production deploy verified by SQL before `main` is pushed.
- 2b: tsc (three programs) 0; lint 0 errors / 0 warnings; vitest passing; build ok; bundle within 355 KB gz (Zod is already bundled); production audit 0; chromium smoke passing; full chromium E2E compared per test against `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt` (a spec passing on `main` and failing on the branch is a regression).
- Screenshot pass, each screenshot read: analytics (Avg. Monthly Spending shows two decimals), dashboard charts with tooltip hover, account balances, debt detail with a reversal, transactions header totals.

## Decisions & Deferrals

- **Security migrations ship first as 2b-0 (decided 2026-10-04).** Why: they share no code with the brand, and a production `db push` gating 2b's merge would hold app work on a deploy. Revisit: never.
- **`get_max_lamport_clock` is dropped, not hardened (decided 2026-10-04).** Why: no caller in `src/`; dropping removes the cross-household `SECURITY DEFINER` read outright. Revisit: if Phase B device init needs a server max clock, re-add it as `SECURITY INVOKER` scoped by RLS.
- **The brand covers storage and display (decided 2026-10-04).** `formatPHP` takes `Cents`, at about 94 production fixes instead of 20. Why: it catches formatted fractions like the Avg. Monthly Spending bug at compile time, not just peso strings in storage. Revisit: never.
- **`asCents` is import-restricted and checks integers at runtime (decided 2026-10-04).** Components derive totals through the currency helpers; chart callbacks use `formatPHPChartValue`. Revisit: if the restricted list grows past the data layer, the boundary is in the wrong place.
- **A sync row that fails its schema is skipped and reported; catch-up still advances (decided 2026-10-04).** Why: one bad row must not wedge sync, and Supabase stays the source of truth online. Revisit: if `reportError` shows recurring skips for one table.
- **`Cents` carries no sign (decided 2026-10-04).** Why: reversals and balance deltas are negative by design. Revisit: never; positivity lives in schemas and DB checks.
- **CSV import rows are not given a Zod schema in 2b.** Section 4.2 lists them, but `csv-importer.ts` already builds amounts through `parsePHPSafe` (its fallback `0` becomes `ZERO_CENTS`), which now returns `Cents`. Revisit: if the CSV importer gains a path that bypasses `parsePHPSafe`.
