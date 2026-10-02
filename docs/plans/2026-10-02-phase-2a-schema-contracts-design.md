# Phase 2a: Schema Contracts (Design)

**Date:** 2026-10-02
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 2, sections 4.1, 4.6 and 4.13)
**Branch:** `phase-2a-schema-contracts`, cut from `main` at `ccc6263` or later

## Goal

Make the database schema a compile-time and CI-checked contract: generate `Database` types and type the Supabase client, test every RLS policy with pgTAP, move transfer exclusion into a `security_invoker` view, and split CI into readable jobs that include a database job and an unconditional chromium smoke job.

Phase 2 is split into 2a (this spec), 2b (branded `Cents`, Zod boundaries) and 2c (`readDb` facade, outbox invariant and Dexie snapshot tests, query keys). 2b and 2c build on the generated types from 2a.

## Background (measured on `main` at `ccc6263`, 2026-10-02)

| Item                                           | Measurement                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase gen types --lang=typescript --local` | Works against the local stack on CLI 2.109.1 (exit 0, 888 lines). The committed `src/types/database.types.ts` is 270 lines, last touched in "chunk 004", and is imported only by `src/types/accounts.ts`.                                                                                                                                                                                                                    |
| `createClient<Database>`                       | 26 errors in `tsconfig.json` (same 26 in the strict program, 0 in tests): `supabaseQueries.ts` 15, `sync/processor.ts` 6, `dexie/deviceManager.ts` 4, `offline/ensureLocal.ts` 1.                                                                                                                                                                                                                                            |
| Error shapes                                   | RPC parameters with SQL `DEFAULT NULL` are generated as optional (`string \| undefined`), so `?? null` fails (`supabaseQueries.ts:649-657`). Nullable columns the app types as non-null (`categories.color` at `supabaseQueries.ts:1020`, plus `:1056`, `:1339`, `:1511-1517`; `deviceManager.ts:302-348`). The processor passes `Record<string, unknown>` to a union of table insert/update types (`processor.ts:309-358`). |
| `supabase db lint`                             | One error: `check_budget_thresholds` returns `numeric` in column 6 where the function declares `bigint`. Calling it fails at runtime even with zero budgets (`structure of query does not match function result type`). Its only caller is the `budget-alerts` edge function.                                                                                                                                                |
| RLS                                            | `sync_queue` policies are per user ("Users see own sync queue"), not per device. All 12 public tables have RLS enabled: `accounts` 4 policies, `budgets` 1, `categories` 4, `debt_payments` 2, `debts` 1, `devices` 4, `internal_debts` 1, `profiles` 2, `push_subscriptions` 4, `sync_queue` 4, `transaction_events` 2, `transactions` 4. `supabase/tests/` does not exist.                                                 |
| Transfer exclusion                             | All 11 `.from("transactions")` reads are in `supabaseQueries.ts` (moved there in 1a). Six apply `.is("transfer_group_id", null)`: `nonTransferTransactionsQuery` (analytics), `useCategoryTotals`, `fetchDashboardDataFromServer` (current month, previous month, six-month trend) and `fetchBudgetGroupsFromServer`. No route or component imports the Supabase client.                                                     |
| Analytics parent filter                        | `nonTransferTransactionsQuery` filters `category_id = filters.categoryId`; `FilterPanel` offers parent categories while transactions carry child ids (1a deferral). The Dexie fallback (`offline/reads.ts:50`) has the same equality filter.                                                                                                                                                                                 |
| CI                                             | `ci.yml` has one `ci` job (lint, tsc tests, tsc strict, vitest, build, size) and a credential-gated `e2e` job. The audit gate lives in `security-check.yml` and is unchanged. The Supabase CLI is not pinned anywhere.                                                                                                                                                                                                       |

## 1. Generated types and typed client

- `package.json`: `"gen:types": "supabase gen types --lang=typescript --local > src/types/database.types.ts"`.
- `src/types/database.types.ts` is added to `.prettierignore` and the ESLint ignores so lint-staged never rewrites it; generated output is committed byte for byte.
- `src/lib/supabase.ts`: `createClient<Database>(...)`.
- Fix rules for the 26 errors:
  - RPC arguments: `?? null` becomes `?? undefined` (an omitted argument takes the SQL default, which is `NULL`).
  - Nullable columns: the app type follows the database (`| null`), and the reader handles `null` (render fallback such as a default category colour, or skip). The database is never loosened to match the app.
  - Processor: a per-entity map from `EntityType` to the table name with typed `TablesInsert<T>` / `TablesUpdate<T>` payloads at the single dispatch point in `processor.ts`. Payload validation stays where it is; the map is the only place a payload is narrowed to a table type.
  - `ensureLocal.ts`: type its generic table parameter against `Database["public"]["Tables"]` so `"id"` is a known column.
- The Supabase CLI version is pinned: CI installs it with `supabase/setup-cli` at the local version (2.109.1), so generator output is identical. Upgrading the CLI is its own commit that regenerates types.

## 2. Migrations

1. **`check_budget_thresholds` fix.** Recreate the function with column 6 (`spent_cents`) cast to `bigint` so the query matches the declared `TABLE(...)`. A pgTAP test calls it (section 3).
2. **`transactions_non_transfer` view.**
   ```sql
   create view public.transactions_non_transfer
     with (security_invoker = true) as
     select * from public.transactions where transfer_group_id is null;
   ```
   Grants match `transactions` for `authenticated` (select only; writes stay on the table). `anon` gets nothing. Postgres expands `*` at creation time, so a later column added to `transactions` is not in the view until it is recreated; the parity test in section 3 catches that.

## 3. pgTAP suite (`supabase/tests/`)

- `00_setup.sql` (or a shared helper loaded by each file): two households, each with a household member, the owner of personal rows, a second member, and two devices; one row of every table per household, with household and personal variants where the table has `visibility` (`accounts`, `transactions`; only `accounts` also has `owner_user_id`).
- One file per table (12). For each table, as `anon`, a member of the same household, the row owner, and a member of the other household:
  - SELECT returns exactly the rows the policy intends (household rows to every member, personal rows only to the owner, `sync_queue`, `devices` and `push_subscriptions` only to their own user, nothing to `anon`). Tests assert the policies as written; where a policy differs from the roadmap's intent (the roadmap assumed `sync_queue` is per device, the policies are per user), the test follows the policy and the difference is recorded, not silently changed.
  - INSERT, UPDATE and DELETE are denied where the policy denies them (other household, non-owner of a personal row, `anon`), and allowed for the intended role.
- `transactions_non_transfer`: the same SELECT matrix as `transactions` (proves `security_invoker`), no transfer rows returned, and a column-parity test (view columns equal table columns, by `information_schema.columns`).
- `check_budget_thresholds`: runs without error and returns a budget at 80% or more of its target.
- Run locally with `supabase test db`.

## 4. App reads

- The six transfer-excluding reads (Background) switch to `.from("transactions_non_transfer")` and drop their `.is("transfer_group_id", null)`. The list, detail, toggle, transfer-legs and dashboard "recent" reads stay on `transactions`.
- A unit test over these builders asserts which relation each one reads, so the exclusion is checked structurally.
- `arch/no-raw-transactions-from` message and docs (CLAUDE.md "Transfers are excluded" line) mention the view.
- Analytics parent-category filter: when `categoryId` is a parent, expand to the parent plus its child ids and filter with `.in("category_id", ids)`. Same expansion in the Dexie fallback (`offline/reads.ts`). Tests for both, including a child id passed directly.
- After the switch, `EXPLAIN` the month-aggregate query through the view and confirm it still uses the `transactions` date/household indexes (roadmap risk). Record the plan in the plan doc.

## 5. CI split (`ci.yml`)

Jobs, all on `ubuntu-latest`, Node from `.nvmrc`:

1. `lint`: `npm run lint`.
2. `typecheck`: `tsc --noEmit` for `tsconfig.json`, `tsconfig.tests.json`, `tsconfig.strict.json`.
3. `unit-tests`: `npx vitest run`.
4. `build`: `npm run build`, `npm run size`.
5. `database`: pinned CLI, `supabase db start`, `supabase db lint --fail-on error`, `supabase test db`, `npm run gen:types`, `git diff --exit-code src/types/database.types.ts`. If `gen types` or pgTAP needs more than Postgres on the runner, switch to `supabase start` (roadmap decision) and record it.
6. `e2e-smoke`: pinned CLI, `supabase start`, write `.env` from `supabase status -o env`, `npm run test:e2e:smoke` (chromium), upload the report on failure. Unconditional on push and pull request.

The credential-gated full E2E job and `security-check.yml` are unchanged. Knip stays in Phase 3.

## 6. Task order

1. Branch; add `gen:types`, prettier/eslint ignores, regenerate. Commit (types unused, so tsc stays green).
2. Type the client and fix the 26 errors, one commit per file group (`supabaseQueries`, processor, `deviceManager`, `ensureLocal`). Each commit passes all three tsc programs, lint and vitest.
3. `check_budget_thresholds` migration (TDD: pgTAP test first, failing with the runtime error).
4. pgTAP setup and the 12 per-table files. A test that exposes a real policy gap stops the task: record it, and fix it in its own migration with the test.
5. View migration, regenerate types, parity and view tests.
6. Switch the six reads and add the relation test; parent-category filter (TDD, server and Dexie); `EXPLAIN`.
7. CI split (section 5); verify on the branch's first push that every job runs and passes.
8. Acceptance (section 7).

## 7. Acceptance

- `tsc` exit 0 for all three programs; lint 0 errors, 0 warnings; vitest all passing; build ok; bundle within 355 KB gz (352.6 before 2a).
- `supabase db lint` reports no errors; `supabase test db` all passing; `npm run gen:types` leaves `git diff` empty.
- Chromium smoke 11/11 locally.
- Analytics screenshot with a parent category selected, read and described (rows from its children appear), and the dashboard totals unchanged against `main` on the same local data.
- First CI run on the branch: every job in section 5 green, with the run URL recorded.
- Not verified by this phase: the deployed `budget-alerts` function (only the SQL it calls is tested), non-chromium browsers, and production RLS (the suite runs against local migrations, which are what production applies).

## Decisions & Deferrals

- **Phase 2 split into 2a/2b/2c (decided 2026-10-02).** See the roadmap's Decisions & Deferrals.
- **pgTAP covers read and write policies on all 12 tables (decided 2026-10-02).** Why: write policies are where a leak corrupts data rather than only exposing it. Revisit: if the `database` job exceeds five minutes, move pgTAP to a nightly run (roadmap decision).
- **Unconditional chromium smoke job in CI (decided 2026-10-02).** Why: nothing in CI exercises the app against a database on push today. Cost: a few minutes per run, parallel to the other jobs. Revisit: if it flakes more than once a week, gate it to pull requests.
- **Transfer view with a column-parity test (decided 2026-10-02).** Why: `select *` in a view is frozen at creation, so a new `transactions` column would silently be missing from analytics reads. Revisit: if `EXPLAIN` shows the view defeats the month-aggregate indexes.
- **`check_budget_thresholds` is fixed in 2a (found while measuring).** Why: `db lint` must be blocking, and the function fails on every call. Revisit: never.
- **Nullable columns: app types follow the database (decided 2026-10-02).** Why: the generated types are the contract; loosening a column to match an app type would hide drift. Revisit: never.
- **Supabase CLI pinned to the local version in CI (decided 2026-10-02).** Why: the drift check compares generator output byte for byte. Revisit: on each CLI upgrade, in its own commit.
- **Debt-reversal UTC `payment_date` moves to 2b (decided 2026-10-02).** Why: it is a debts/money contract and 2b already touches debts for `Cents`. Revisit: 2b spec.
