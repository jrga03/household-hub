# Phase 2a: Schema Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate `Database` types and type the Supabase client, test every RLS policy with pgTAP, move transfer exclusion into a `security_invoker` view, and split CI into readable jobs including `database` and an unconditional chromium `e2e-smoke`.

**Architecture:** The schema becomes the contract in three layers. `supabase gen types` output is committed and checked for drift in CI, so a column that does not exist fails `tsc`. pgTAP files under `supabase/tests/` assert each table's policies as two fixture households, and `db lint` blocks broken functions. Analytics, dashboard and budget totals read `transactions_non_transfer`, so transfer exclusion lives in the schema, and a unit test pins which relation each reader uses.

**Tech Stack:** Supabase CLI 2.109.1 (Postgres 17, pgTAP 1.2 via `supabase test db`), `@supabase/supabase-js` typed client, TypeScript 5.9, Vitest, GitHub Actions, Playwright (chromium).

**Spec:** `docs/plans/2026-10-02-phase-2a-schema-contracts-design.md`

## Global Constraints

- Node 26 (`.nvmrc`). In Claude's shell, prefix node commands with `source ~/.nvm/nvm.sh && nvm use 26 >/dev/null &&` (the shell default is still 22).
- Local stack must be running (`supabase status -o env | grep -c API_URL` prints `1`; else `supabase start`). DB URL for `psql`: `postgresql://postgres:postgres@127.0.0.1:54332/postgres`.
- Migrations apply locally with `supabase migration up` only. Never `supabase db push`, `supabase test db --linked`, or anything with `--linked`: they target production (the Bash guard blocks `db push`).
- Generated types: `src/types/database.types.ts` is written only by `npm run gen:types`, never edited by hand. Regenerate after every migration and commit it with that migration.
- No `as` casts added outside `src/lib/supabase.ts`'s `untypedSupabase` export. Nullable columns: the app type follows the database, or the database is tightened (Task 2); the database is never loosened to match the app.
- Every commit passes: `npx tsc --noEmit -p tsconfig.json`, `-p tsconfig.tests.json`, `-p tsconfig.strict.json`, `npm run lint`, `npx vitest run`. From Task 4 on, `supabase test db` too.
- Commit messages: Conventional Commits, no `Co-Authored-By` or session lines (user rule).
- Bundle stays within 355 KB gz (352.6 before 2a): `npm run build && npm run size`.
- `git push` hangs from Claude's shell (SSH passphrase). Ask the user to run `! git push ...`. `gh api` works from Claude's shell for refs and run status.
- `$SCRATCH` means the session scratchpad directory (never the repo).
- If a pre-push or CI `unit tests` FAIL appears that you did not cause, name the test and log it in CLAUDE.md under Known infrastructure issues (roadmap Resume state).

## Progress

- [ ] Task 0: Preconditions, branch, ledger
- [ ] Task 1: `gen:types` and regenerated types
- [ ] Task 2: `categories.color` NOT NULL
- [ ] Task 3: Typed Supabase client (26 → 0)
- [ ] Task 4: pgTAP helpers and `check_budget_thresholds` fix
- [ ] Task 5: RLS suite (12 tables)
- [ ] Task 6: `transactions_non_transfer` view
- [ ] Task 7: Reads switch to the view; analytics parent-category filter
- [ ] Task 8: CI split
- [ ] Task 8a: Explicit table grants; diagnose the CI Chromium install hang (added 2026-10-03 after the first CI run)
- [ ] Task 9: Acceptance and docs

---

### Task 0: Preconditions, branch, ledger

**Files:**

- Create: `.superpowers/sdd/progress.md` (gitignored)

- [ ] **Step 1: Confirm state**

Run: `git status -sb | head -1 && git log --oneline -1 && supabase status -o env | grep -c API_URL && supabase --version`
Expected: `## main...origin/main` (if `ahead`, ask the user to run `! git push origin main` and wait; the commits are docs-only so pre-push skips), HEAD is this plan's commit or later, `1`, `2.109.1`.

- [ ] **Step 2: Branch**

Run: `git switch -c phase-2a-schema-contracts`

- [ ] **Step 3: Start the ledger**

Write `.superpowers/sdd/progress.md` with a heading `# Phase 2a progress`, the branch name, the base commit (`git rev-parse --short HEAD`), and one line per task from the Progress list above. Update it after every task (status, commit SHAs, anything surprising).

---

### Task 1: `gen:types` and regenerated types

**Files:**

- Modify: `package.json` (scripts)
- Modify: `.prettierignore`
- Modify: `eslint.config.js:32-42` (global ignores)
- Modify: `src/types/database.types.ts` (generated)

**Interfaces:**

- Produces: `npm run gen:types`; `Database`, `Tables<T>`, `TablesInsert<T>`, `TablesUpdate<T>` exported from `@/types/database.types` (generated). `src/types/accounts.ts` already derives `Account`/`AccountInsert`/`AccountUpdate` from it.

- [ ] **Step 1: Add the script**

In `package.json` `scripts`, after `"supabase:status"`:

```json
    "gen:types": "supabase gen types --lang=typescript --local > src/types/database.types.ts",
```

- [ ] **Step 2: Exclude the generated file from formatters**

Append to `.prettierignore` under `# Generated files`:

```
src/types/database.types.ts
```

Add `"src/types/database.types.ts",` to the global `ignores` array in `eslint.config.js` after `"src/routeTree.gen.ts",`.

Why: lint-staged runs Prettier on staged `.ts` files; a reformatted file would make CI's `git diff --exit-code` drift check fail on formatting alone.

- [ ] **Step 3: Regenerate**

Run: `npm run gen:types && wc -l src/types/database.types.ts && git diff --stat`
Expected: about 888 lines (the committed file is 270). Only `database.types.ts`, `package.json`, `.prettierignore`, `eslint.config.js` changed.

- [ ] **Step 4: Verify nothing else breaks (client still untyped)**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.tests.json && npx tsc --noEmit -p tsconfig.strict.json && npm run lint && npx vitest run --silent`
Expected: all exit 0. (Measured during planning: with the regenerated file and an untyped client, `tsc` reports 0.)

- [ ] **Step 5: Confirm prettier leaves it alone**

Run: `npx prettier --check src/types/database.types.ts; echo "exit $?"`
Expected: a "No files matching the pattern were found" / ignored message, not a formatting warning.

- [ ] **Step 6: Commit**

```bash
git add package.json .prettierignore eslint.config.js src/types/database.types.ts
git commit -m "build(types): gen:types script and regenerated Supabase types"
```

---

### Task 2: `categories.color` NOT NULL

Four of the 26 typed-client errors (`supabaseQueries.ts:1020`, `:1056`, `:1339`, `:1517`) are `categories.color` being nullable. The column has a default (`'#6B7280'`), `createOfflineCategory` always sets a colour, every reader already falls back to `'#6B7280'`, and the local database has no null rows. Tightening the column is the honest contract.

**Files:**

- Create: `supabase/migrations/20261002120000_categories_color_not_null.sql`
- Modify: `src/types/database.types.ts` (regenerated)

- [ ] **Step 1: Write the migration**

```sql
-- categories.color has always defaulted to '#6B7280' and the app never writes
-- NULL; make the contract explicit so generated types say `string`.
UPDATE public.categories SET color = '#6B7280' WHERE color IS NULL;
ALTER TABLE public.categories ALTER COLUMN color SET NOT NULL;
```

- [ ] **Step 2: Apply and regenerate**

Run: `supabase migration up && npm run gen:types && grep -n "color: string" src/types/database.types.ts | head -3`
Expected: migration applied; the `categories` `Row` now has `color: string;` (not `string | null`).

- [ ] **Step 3: Verify**

Run: `psql postgresql://postgres:postgres@127.0.0.1:54332/postgres -Atc "select is_nullable from information_schema.columns where table_name='categories' and column_name='color'"` → `NO`.
Run the five gate commands (Global Constraints). Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261002120000_categories_color_not_null.sql src/types/database.types.ts
git commit -m "feat(db): categories.color is NOT NULL"
```

---

### Task 3: Typed Supabase client (26 → 0)

Fix the remaining sites first (each fix is valid with the untyped client too), then type the client in the last commit so every commit stays green.

**Files:**

- Modify: `src/lib/supabase.ts`
- Modify: `src/lib/sync/processor.ts:31` (import), `:309`, `:341`, `:358`
- Modify: `src/lib/offline/ensureLocal.ts`
- Modify: `src/lib/dexie/deviceManager.ts:284-350` (`updateUserDevice`)
- Modify: `src/lib/supabaseQueries.ts:648-657`, `:1510-1513`

**Interfaces:**

- Produces: `export const untypedSupabase: SupabaseClient` from `@/lib/supabase` (the same client instance, widened to the schema-agnostic type). Used only where the table is chosen at runtime: the sync processor and `ensureLocalRow`.

- [ ] **Step 1: Measure the starting count**

Write `$SCRATCH/type-client.sh`:

```bash
#!/bin/bash
# Count tsc errors with the client typed, then restore src/lib/supabase.ts.
SCRATCH="$(cd "$(dirname "$0")" && pwd)"
cd "$(git rev-parse --show-toplevel)"
cp src/lib/supabase.ts "$SCRATCH/supabase.ts.bak"
sed -i '' 's/^import { createClient } from "@supabase\/supabase-js";/import { createClient } from "@supabase\/supabase-js";\nimport type { Database } from "@\/types\/database.types";/; s/createClient(supabaseUrl/createClient<Database>(supabaseUrl/' src/lib/supabase.ts
npx tsc --noEmit -p tsconfig.json | grep "error TS"
cp "$SCRATCH/supabase.ts.bak" src/lib/supabase.ts
```

Run: `bash <scratchpad>/type-client.sh | wc -l && git status -s`
Expected: `22` (26 minus the four `color` errors fixed in Task 2), and a clean tree. If it is not 22, list the errors and reconcile before continuing.

- [ ] **Step 2: `untypedSupabase` for runtime-chosen tables**

In `src/lib/supabase.ts`, change the import and add the export after the `supabase` client:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
```

```ts
// The same client, widened to the schema-agnostic type, for code that picks the
// table at runtime (the sync processor writes queue payloads; ensureLocalRow
// fetches by table name). A union of table names cannot select one typed
// overload, and queue payloads are JSON whose shape is fixed where it is built.
export const untypedSupabase: SupabaseClient = supabase;
```

In `src/lib/sync/processor.ts`, import it (`import { supabase, untypedSupabase } from "@/lib/supabase";`, keeping `supabase` only if still used elsewhere in the file; check with `grep -n "supabase\." src/lib/sync/processor.ts`) and replace the three table calls:

```ts
const table = untypedSupabase.from(tableName);
```

```ts
const { error } = await untypedSupabase.from(tableName).update(serverPayload).eq("id", entityId);
```

```ts
const { error } = await untypedSupabase.from(tableName).delete().eq("id", entityId);
```

In `src/lib/offline/ensureLocal.ts`, replace the `supabase` import with `import { untypedSupabase } from "@/lib/supabase";` and the fetch line with:

```ts
const { data, error } = await untypedSupabase.from(table).select("*").eq("id", id).maybeSingle();
```

Note: `src/lib/sync/processor.ts` is on the Supabase-write allowlist; `ensureLocal.ts` only reads, so `arch/no-direct-supabase-writes` is unaffected. If `src/lib/sync/__tests__/processor.test.ts` mocks `@/lib/supabase` with only `{ supabase }`, add `untypedSupabase` pointing at the same mock object in that `vi.mock` factory (same for any `ensureLocal` test).

- [ ] **Step 3: Verify and commit**

Run: `bash <scratchpad>/type-client.sh | wc -l` → `15`. Run the five gate commands → all exit 0.

```bash
git add src/lib/supabase.ts src/lib/sync/processor.ts src/lib/offline/ensureLocal.ts src/lib/sync/__tests__ src/lib/offline
git commit -m "refactor(sync): runtime-chosen tables go through untypedSupabase"
```

- [ ] **Step 4: `deviceManager` device id guard**

`this.deviceId` is `string | null`; `updateUserDevice` uses it as the row id. At the top of the `try` in `updateUserDevice` (before `supabase.auth.getUser()`):

```ts
const deviceId = this.deviceId;
if (!deviceId) return; // getDeviceId() has not resolved yet; registration retries on the next call
```

Replace the four `this.deviceId` uses inside `updateUserDevice` (`.eq("id", …)` twice, `id:`, `fingerprint:`) with `deviceId`. Leave the `console.debug`/`console.info` arguments as they are or switch them to `deviceId` (same value).

Run: `bash <scratchpad>/type-client.sh | wc -l` → `11`. Gates → exit 0. Run `npx vitest run src/lib/dexie --silent` → pass.

```bash
git add src/lib/dexie/deviceManager.ts
git commit -m "fix(devices): skip registration until the device id is known"
```

- [ ] **Step 5: RPC defaults in `useTransactionsFilterSummary`**

The generator types SQL `DEFAULT NULL` parameters as optional (`p_date_from?: string`), so `?? null` does not type-check. An omitted parameter takes its SQL default, which is `NULL`, so `?? undefined` is equivalent. In `src/lib/supabaseQueries.ts:649-657`, change each `?? null` to `?? undefined` (nine lines, `p_date_from` through `p_search`).

Run: `bash <scratchpad>/type-client.sh | wc -l` → `2`.

- [ ] **Step 6: Budget spending map guard**

`fetchBudgetGroupsFromServer` (`supabaseQueries.ts:1510`): the query filters `.in("category_id", categoryIds)`, but the column is nullable. Replace the loop body:

```ts
transactions?.forEach((t) => {
  if (!t.category_id) return; // excluded by the .in() filter; narrows the type
  const existing = spendingMap.get(t.category_id) || 0;
  spendingMap.set(t.category_id, existing + t.amount_cents);
});
```

Run: `bash <scratchpad>/type-client.sh` → no output (0 errors). If any remain, fix them under the same rules (Global Constraints) and note each in the ledger.

- [ ] **Step 7: Type the client**

In `src/lib/supabase.ts`:

```ts
import type { Database } from "@/types/database.types";
```

```ts
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
```

Run the five gate commands. Expected: all exit 0 (`tsc` 0 errors in all three programs).

- [ ] **Step 8: Prove it bites**

Temporarily add to the end of `src/lib/supabaseQueries.ts`: `void supabase.from("transactions").select("id").eq("no_such_column", 1);`
Run: `npx tsc --noEmit -p tsconfig.json | grep -c "error TS"` → `1` or more. Remove the line; re-run → `0`. Record the error text in the ledger.

- [ ] **Step 9: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabaseQueries.ts
git commit -m "feat(types): type the Supabase client with generated Database types"
```

---

### Task 4: pgTAP helpers and `check_budget_thresholds` fix

`supabase db lint` reports `check_budget_thresholds` returning `numeric` in column 6 where it declares `bigint` (`SUM(bigint)` is `numeric`). Every call fails, so the `budget-alerts` edge function cannot succeed.

**Files:**

- Create: `supabase/tests/000_helpers.sql`
- Create: `supabase/tests/200_check_budget_thresholds.sql`
- Create: `supabase/migrations/20261002120100_fix_check_budget_thresholds.sql`
- Create: `supabase/tests/README.md`

**Interfaces:**

- Produces (SQL, schema `tests`, test-only): `tests.id(label text) → uuid` (deterministic, `md5(label)::uuid`); `tests.household('h1' | 'h2') → uuid` (fresh ids, never the profile default household, so local dev rows stay invisible to fixture users); `tests.authenticate_as('a1' | 'a2' | 'b1')`; `tests.authenticate_as_anon()`; `tests.seed()`. Fixture: h1 = users a1, a2; h2 = user b1; devices `device-a1`, `device-a2`, `device-b1`; labelled rows `acc_h1`, `acc_h1_personal_a1`, `acc_h2`, `cat_h1_parent`, `cat_h1_child`, `cat_h2`, `tx_h1`, `tx_h1_personal_a1`, `tx_h1_transfer_out`, `tx_h1_transfer_in`, `tx_h2`, `bud_h1`, `bud_h2`, `debt_h1`, `debt_h2`, `idebt_h1`, `idebt_h2`, `pay_h1`, `pay_h2`, `sq_a1`, `sq_a1_done`, `sq_a2`, `ev_h1`, `ev_h2`, `ps_a1`, `ps_a2`. Return to the superuser inside a test with `reset role;`.

- [ ] **Step 1: Helpers file**

`supabase test db` runs files in name order (verified during planning), each in its own psql session. This file sorts first and commits the `tests` schema; every other file opens with `begin;` and ends with `rollback;`. Create `supabase/tests/000_helpers.sql`:

```sql
-- Shared helpers for the pgTAP suite. This file sorts first and COMMITS, so the
-- `tests` schema exists for every later file. Test-only: never put it in a migration.
begin;
create schema if not exists tests;
grant usage on schema tests to anon, authenticated;

-- Deterministic UUID per fixture label, e.g. tests.id('acc_h1').
create or replace function tests.id(label text) returns uuid
language sql immutable as $$ select md5(label)::uuid $$;

-- Fresh household ids, never the profiles.household_id default, so local dev
-- rows in the default household stay invisible to fixture users.
create or replace function tests.household(label text) returns uuid
language sql immutable as $$ select md5('household_' || label)::uuid $$;

-- Switch to the authenticated role as a fixture user ('a1', 'a2', 'b1').
create or replace function tests.authenticate_as(user_label text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', tests.id('user_' || user_label), 'role', 'authenticated')::text,
    true
  );
end
$$;

create or replace function tests.authenticate_as_anon() returns void
language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
end
$$;

-- Fixture: households h1 (users a1, a2) and h2 (user b1), one device each, and
-- rows in every table for both households. Call as postgres, before switching role.
create or replace function tests.seed() returns void
language plpgsql as $$
declare
  h1 uuid := tests.household('h1');
  h2 uuid := tests.household('h2');
  this_month date := date_trunc('month', now() at time zone 'Asia/Manila')::date;
begin
  insert into auth.users (id, email, aud, role) values
    (tests.id('user_a1'), 'a1@test.local', 'authenticated', 'authenticated'),
    (tests.id('user_a2'), 'a2@test.local', 'authenticated', 'authenticated'),
    (tests.id('user_b1'), 'b1@test.local', 'authenticated', 'authenticated');
  update public.profiles set household_id = h1 where id in (tests.id('user_a1'), tests.id('user_a2'));
  update public.profiles set household_id = h2 where id = tests.id('user_b1');

  insert into public.devices (id, user_id, household_id, name, platform, fingerprint) values
    ('device-a1', tests.id('user_a1'), h1, 'A1 laptop', 'web', 'device-a1'),
    ('device-a2', tests.id('user_a2'), h1, 'A2 phone', 'web', 'device-a2'),
    ('device-b1', tests.id('user_b1'), h2, 'B1 laptop', 'web', 'device-b1');

  insert into public.accounts (id, household_id, name, type, visibility, owner_user_id) values
    (tests.id('acc_h1'), h1, 'H1 joint', 'bank', 'household', null),
    (tests.id('acc_h1_personal_a1'), h1, 'A1 wallet', 'cash', 'personal', tests.id('user_a1')),
    (tests.id('acc_h2'), h2, 'H2 joint', 'bank', 'household', null);

  insert into public.categories (id, household_id, name, parent_id) values
    (tests.id('cat_h1_parent'), h1, 'H1 Food', null),
    (tests.id('cat_h1_child'), h1, 'H1 Groceries', tests.id('cat_h1_parent')),
    (tests.id('cat_h2'), h2, 'H2 Food', null);

  insert into public.transactions
    (id, household_id, date, description, amount_cents, type, account_id, category_id,
     visibility, created_by_user_id, transfer_group_id) values
    (tests.id('tx_h1'), h1, this_month, 'H1 groceries', 10000, 'expense',
     tests.id('acc_h1'), tests.id('cat_h1_child'), 'household', tests.id('user_a1'), null),
    (tests.id('tx_h1_personal_a1'), h1, this_month, 'A1 personal', 2000, 'expense',
     tests.id('acc_h1_personal_a1'), tests.id('cat_h1_child'), 'personal', tests.id('user_a1'), null),
    (tests.id('tx_h1_transfer_out'), h1, this_month, 'H1 transfer out', 5000, 'expense',
     tests.id('acc_h1'), null, 'household', tests.id('user_a1'), tests.id('tg_h1')),
    (tests.id('tx_h1_transfer_in'), h1, this_month, 'H1 transfer in', 5000, 'income',
     tests.id('acc_h1_personal_a1'), null, 'household', tests.id('user_a1'), tests.id('tg_h1')),
    (tests.id('tx_h2'), h2, this_month, 'H2 groceries', 3000, 'expense',
     tests.id('acc_h2'), tests.id('cat_h2'), 'household', tests.id('user_b1'), null);

  insert into public.budgets (id, household_id, category_id, month, amount_cents) values
    (tests.id('bud_h1'), h1, tests.id('cat_h1_child'), this_month, 10000),
    (tests.id('bud_h2'), h2, tests.id('cat_h2'), this_month, 100000);

  insert into public.debts (id, household_id, name, original_amount_cents) values
    (tests.id('debt_h1'), h1, 'H1 loan', 100000),
    (tests.id('debt_h2'), h2, 'H2 loan', 100000);

  insert into public.internal_debts
    (id, household_id, name, original_amount_cents, from_type, from_id, from_display_name,
     to_type, to_id, to_display_name) values
    (tests.id('idebt_h1'), h1, 'H1 IOU', 5000, 'member', tests.id('user_a1'), 'A1',
     'member', tests.id('user_a2'), 'A2'),
    (tests.id('idebt_h2'), h2, 'H2 IOU', 5000, 'account', tests.id('acc_h2'), 'H2 joint',
     'category', tests.id('cat_h2'), 'H2 Food');

  insert into public.debt_payments
    (id, household_id, debt_id, transaction_id, amount_cents, payment_date, device_id) values
    (tests.id('pay_h1'), h1, tests.id('debt_h1'), tests.id('tx_h1'), 1000, this_month, 'device-a1'),
    (tests.id('pay_h2'), h2, tests.id('debt_h2'), tests.id('tx_h2'), 1000, this_month, 'device-b1');

  insert into public.sync_queue
    (id, household_id, entity_type, entity_id, operation, device_id, user_id, status) values
    (tests.id('sq_a1'), h1, 'transaction', 'tx', '{"op":"create"}', 'device-a1', tests.id('user_a1'), 'queued'),
    (tests.id('sq_a1_done'), h1, 'transaction', 'tx', '{"op":"create"}', 'device-a1', tests.id('user_a1'), 'completed'),
    (tests.id('sq_a2'), h1, 'transaction', 'tx', '{"op":"create"}', 'device-a2', tests.id('user_a2'), 'queued');

  insert into public.transaction_events
    (id, household_id, entity_id, op, payload, actor_user_id, device_id, idempotency_key,
     lamport_clock, vector_clock, checksum) values
    (tests.id('ev_h1'), h1, tests.id('tx_h1'), 'create', '{}', tests.id('user_a1'), 'device-a1',
     'ev-h1', 1, '{}', 'c1'),
    (tests.id('ev_h2'), h2, tests.id('tx_h2'), 'create', '{}', tests.id('user_b1'), 'device-b1',
     'ev-h2', 1, '{}', 'c2');

  insert into public.push_subscriptions (id, user_id, device_id, endpoint, p256dh, auth) values
    (tests.id('ps_a1'), tests.id('user_a1'), 'device-a1', 'https://push.test/a1', 'k', 'a'),
    (tests.id('ps_a2'), tests.id('user_a2'), 'device-a2', 'https://push.test/a2', 'k', 'a');
end
$$;

select plan(1);
select has_function('tests', 'seed', 'pgTAP helpers are installed');
select * from finish();
commit;
```

- [ ] **Step 2: Write the failing test**

Create `supabase/tests/200_check_budget_thresholds.sql`:

```sql
begin;
select plan(3);
select tests.seed();

select lives_ok($$ select * from public.check_budget_thresholds() $$,
  'check_budget_thresholds runs (its result type matches its declaration)');
select results_eq(
  $$ select user_id, spent_cents, percentage from public.check_budget_thresholds()
     where id = tests.id('bud_h1') order by user_id $$,
  $$ select u, 12000::bigint, 120 from unnest(array[tests.id('user_a1'), tests.id('user_a2')]) u order by 1 $$,
  'a budget at 80% or more is returned once per household member, transfers excluded');
select ok(
  not has_function_privilege('authenticated', 'public.check_budget_thresholds()', 'execute'),
  'only service_role may call it');

select * from finish();
rollback;
```

Expected values: `bud_h1` targets 10000 in `cat_h1_child`; spending there is `tx_h1` 10000 plus `tx_h1_personal_a1` 2000 (the function is `SECURITY DEFINER` and counts every row; transfers are excluded) = 12000 = 120%, returned once per h1 profile. `bud_h2` is 3% and is not returned.

- [ ] **Step 3: Run it to verify it fails**

Run: `supabase test db 2>&1 | tail -15`
Expected: `000_helpers.sql .. ok`, `200_check_budget_thresholds.sql` fails at test 1 with `structure of query does not match function result type`.

- [ ] **Step 4: Migration**

Create `supabase/migrations/20261002120100_fix_check_budget_thresholds.sql`:

```sql
-- db lint: SUM(bigint) is numeric, so RETURN QUERY failed on every call
-- ("Returned type numeric does not match expected type bigint in column 6").
-- Same body as 20260702120000_security_hardening.sql with spent_cents cast to
-- BIGINT; CREATE OR REPLACE keeps the service_role-only grant.
CREATE OR REPLACE FUNCTION public.check_budget_thresholds()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id UUID,
  category_name TEXT,
  amount_cents BIGINT,
  spent_cents BIGINT,
  percentage INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH budget_spending AS (
    SELECT
      b.id,
      b.household_id,
      b.category_id,
      b.amount_cents,
      c.name AS category_name,
      -- SUM(bigint) is numeric; the declared column is bigint
      COALESCE(SUM(
        CASE
          WHEN t.type = 'expense' AND t.transfer_group_id IS NULL
          THEN t.amount_cents
          ELSE 0
        END
      ), 0)::BIGINT AS spent_cents
    FROM budgets b
    INNER JOIN categories c ON b.category_id = c.id
    LEFT JOIN transactions t ON
      t.category_id = b.category_id
      AND (EXTRACT(YEAR FROM t.date) * 100 + EXTRACT(MONTH FROM t.date))::INT = b.month_key
      AND t.transfer_group_id IS NULL
    WHERE
      b.month >= DATE_TRUNC('month', (NOW() AT TIME ZONE 'Asia/Manila'))::DATE
    GROUP BY b.id, b.household_id, b.category_id, b.amount_cents, c.name
  )
  SELECT
    bs.id,
    p.id AS user_id,
    bs.category_id,
    bs.category_name,
    bs.amount_cents,
    bs.spent_cents,
    CASE
      WHEN bs.amount_cents > 0
      THEN ((bs.spent_cents * 100) / bs.amount_cents)::INTEGER
      ELSE 0
    END AS percentage
  FROM budget_spending bs
  CROSS JOIN profiles p
  WHERE
    p.household_id = bs.household_id
    AND bs.amount_cents > 0
    AND ((bs.spent_cents * 100) / bs.amount_cents) >= 80
  ORDER BY percentage DESC;
END;
$$;
```

`CREATE OR REPLACE` keeps the existing grants (service_role only, `20260702120000_security_hardening.sql`); test 3 checks that.

- [ ] **Step 5: Apply and verify**

Run: `supabase migration up && supabase test db 2>&1 | tail -6 && supabase db lint --fail-on error; echo "lint exit $?"`
Expected: `All tests successful.`, `Result: PASS`; `db lint` prints no `"level":"error"` issue and `lint exit 0`.
Run: `npm run gen:types && git diff --stat src/types/database.types.ts` → no change (function signature unchanged).

- [ ] **Step 6: README**

Create `supabase/tests/README.md`:

```markdown
# pgTAP tests

Run with `supabase test db` against the local stack. Files run in name order, each in its own session.

- `000_helpers.sql` commits a `tests` schema (fixture ids, role switching, `tests.seed()`). It is test-only and never belongs in a migration.
- Every other file wraps its assertions in `begin; … rollback;`, calls `tests.seed()` as the superuser, then switches role with `tests.authenticate_as('a1' | 'a2' | 'b1')` or `tests.authenticate_as_anon()`.
- Fixture: household h1 has users a1 and a2, household h2 has b1. Both households are fresh ids, so local dev data is invisible to fixture users.
- RLS denies a write in two ways: INSERT raises `42501`; UPDATE/DELETE silently match no rows. Assert the first with `throws_ok(…, '42501', …)` and the second with `is_empty($$ update … returning id $$, …)`.
- Never run `supabase test db --linked`: it targets production.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/tests supabase/migrations/20261002120100_fix_check_budget_thresholds.sql
git commit -m "fix(db): check_budget_thresholds returns bigint spent_cents, with pgTAP helpers"
```

---

### Task 5: RLS suite (12 tables)

Each file tests SELECT for every fixture role and INSERT/UPDATE/DELETE where a policy allows or denies. Tests assert the policies as written; where a policy surprised us during planning it is labelled in the test name and in Decisions & Deferrals, not silently changed. All of the files below passed against the local stack during planning (110 assertions in 14 files, plus the helpers check).

**Files:**

- Create: `supabase/tests/010_accounts_rls.sql` … `120_transactions_rls.sql` (12 files)

- [ ] **Step 1: accounts**

`supabase/tests/010_accounts_rls.sql`:

```sql
begin;
select plan(13);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.accounts order by id $$,
  $$ select unnest(array[tests.id('acc_h1'), tests.id('acc_h1_personal_a1')]) order by 1 $$,
  'owner sees household and own personal accounts'
);
select tests.authenticate_as('a2');
select results_eq($$ select id from public.accounts $$, $$ values (tests.id('acc_h1')) $$,
  'member sees household accounts, not another member''s personal account');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.accounts $$, $$ values (tests.id('acc_h2')) $$,
  'other household sees only its own accounts');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.accounts $$, 'anon sees no accounts');

select tests.authenticate_as('a2');
select lives_ok(
  $$ insert into public.accounts (household_id, name, type) values (tests.household('h1'), 'A2 new', 'bank') $$,
  'member can insert into own household');
select lives_ok(
  $$ insert into public.accounts (household_id, name, type, visibility, owner_user_id)
     values (tests.household('h1'), 'Planted', 'cash', 'personal', tests.id('user_a1')) $$,
  'KNOWN GAP: insert does not pin owner_user_id to the caller (see 2a plan Decisions)');
select is_empty(
  $$ update public.accounts set name = 'x' where id = tests.id('acc_h1_personal_a1') returning id $$,
  'member cannot update another member''s personal account');
select is_empty(
  $$ delete from public.accounts where id = tests.id('acc_h1_personal_a1') returning id $$,
  'member cannot delete another member''s personal account');
select isnt_empty(
  $$ update public.accounts set name = 'Renamed' where id = tests.id('acc_h1') returning id $$,
  'member can update a household account');

select tests.authenticate_as('a1');
select isnt_empty(
  $$ update public.accounts set name = 'Mine' where id = tests.id('acc_h1_personal_a1') returning id $$,
  'owner can update own personal account');

select tests.authenticate_as('b1');
select throws_ok(
  $$ insert into public.accounts (household_id, name, type) values (tests.household('h1'), 'x', 'bank') $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.accounts set name = 'x' where id = tests.id('acc_h1') returning id $$,
  'other household cannot update');
select is_empty(
  $$ delete from public.accounts where id = tests.id('acc_h1') returning id $$,
  'other household cannot delete');

select * from finish();
rollback;
```

- [ ] **Step 2: budgets, categories**

`supabase/tests/020_budgets_rls.sql`:

```sql
begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.budgets $$, $$ values (tests.id('bud_h1')) $$,
  'member sees household budgets');
select isnt_empty(
  $$ update public.budgets set amount_cents = 20000 where id = tests.id('bud_h1') returning id $$,
  'member can update a household budget');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.budgets $$, $$ values (tests.id('bud_h2')) $$,
  'other household sees only its own budgets');
select throws_ok(
  $$ insert into public.budgets (household_id, category_id, month) values
     (tests.household('h1'), tests.id('cat_h1_parent'), date '2026-01-01') $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.budgets set amount_cents = 1 where id = tests.id('bud_h1') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.budgets where id = tests.id('bud_h1') returning id $$,
  'other household cannot delete');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.budgets $$, 'anon sees no budgets');

select * from finish();
rollback;
```

`supabase/tests/030_categories_rls.sql` (its first assertion covers Task 2):

```sql
begin;
select plan(8);
select tests.seed();

select col_not_null('public', 'categories', 'color', 'categories.color is NOT NULL (every reader assumes a colour)');

select tests.authenticate_as('a2');
select results_eq(
  $$ select id from public.categories order by id $$,
  $$ select unnest(array[tests.id('cat_h1_parent'), tests.id('cat_h1_child')]) order by 1 $$,
  'member sees household categories');
select isnt_empty(
  $$ update public.categories set name = 'Food' where id = tests.id('cat_h1_parent') returning id $$,
  'member can update a household category');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.categories $$, $$ values (tests.id('cat_h2')) $$,
  'other household sees only its own categories');
select throws_ok(
  $$ insert into public.categories (household_id, name) values (tests.household('h1'), 'x') $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.categories set name = 'x' where id = tests.id('cat_h1_child') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.categories where id = tests.id('cat_h1_child') returning id $$,
  'other household cannot delete');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.categories $$, 'anon sees no categories');

select * from finish();
rollback;
```

- [ ] **Step 3: debt tables**

`supabase/tests/040_debt_payments_rls.sql`:

```sql
begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.debt_payments $$, $$ values (tests.id('pay_h1')) $$,
  'member sees household debt payments');
select lives_ok(
  $$ insert into public.debt_payments (household_id, debt_id, transaction_id, amount_cents, payment_date, device_id)
     values (tests.household('h1'), tests.id('debt_h1'), tests.id('tx_h1'), 500, current_date, 'device-a2') $$,
  'member can record a payment');
select is_empty(
  $$ update public.debt_payments set amount_cents = 1 where id = tests.id('pay_h1') returning id $$,
  'payments are append-only: no update');
select is_empty($$ delete from public.debt_payments where id = tests.id('pay_h1') returning id $$,
  'payments are append-only: no delete (reverse with a negative row instead)');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.debt_payments $$, $$ values (tests.id('pay_h2')) $$,
  'other household sees only its own payments');
select throws_ok(
  $$ insert into public.debt_payments (household_id, debt_id, transaction_id, amount_cents, payment_date, device_id)
     values (tests.household('h1'), tests.id('debt_h1'), tests.id('tx_h1'), 500, current_date, 'device-b1') $$,
  '42501', null, 'other household cannot insert');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.debt_payments $$, 'anon sees no payments');

select * from finish();
rollback;
```

`supabase/tests/050_debts_rls.sql`:

```sql
begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.debts $$, $$ values (tests.id('debt_h1')) $$,
  'member sees household debts');
select isnt_empty(
  $$ update public.debts set name = 'Renamed' where id = tests.id('debt_h1') returning id $$,
  'member can update household debts');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.debts $$, $$ values (tests.id('debt_h2')) $$,
  'other household sees only its own debts');
select throws_ok(
  $$ insert into public.debts (household_id, name, original_amount_cents) values (tests.household('h1'), 'x', 100) $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.debts set name = 'x' where id = tests.id('debt_h1') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.debts where id = tests.id('debt_h1') returning id $$,
  'other household cannot delete');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.debts $$, 'anon sees no debts');

select * from finish();
rollback;
```

`supabase/tests/060_internal_debts_rls.sql`:

```sql
begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.internal_debts $$, $$ values (tests.id('idebt_h1')) $$,
  'member sees household internal_debts');
select isnt_empty(
  $$ update public.internal_debts set name = 'Renamed' where id = tests.id('idebt_h1') returning id $$,
  'member can update household internal_debts');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.internal_debts $$, $$ values (tests.id('idebt_h2')) $$,
  'other household sees only its own internal_debts');
select throws_ok(
  $$ insert into public.internal_debts (household_id, name, original_amount_cents, from_type, from_id, from_display_name, to_type, to_id, to_display_name) values (tests.household('h1'), 'x', 100, 'member', tests.id('user_b1'), 'B1', 'member', tests.id('user_a1'), 'A1') $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.internal_debts set name = 'x' where id = tests.id('idebt_h1') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.internal_debts where id = tests.id('idebt_h1') returning id $$,
  'other household cannot delete');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.internal_debts $$, 'anon sees no internal_debts');

select * from finish();
rollback;
```

- [ ] **Step 4: per-user tables**

`supabase/tests/070_devices_rls.sql`:

```sql
begin;
select plan(7);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq($$ select id from public.devices $$, $$ values ('device-a1') $$,
  'user sees only own devices, not a household member''s');
select isnt_empty(
  $$ update public.devices set name = 'Renamed' where id = 'device-a1' returning id $$,
  'user can update own device');
select throws_ok(
  $$ insert into public.devices (id, user_id, household_id, name, platform, fingerprint)
     values ('device-x', tests.id('user_a2'), tests.household('h1'), 'x', 'web', 'x') $$,
  '42501', null, 'user cannot register a device for someone else');
select is_empty($$ update public.devices set name = 'x' where id = 'device-a2' returning id $$,
  'user cannot update another user''s device');
select is_empty($$ delete from public.devices where id = 'device-a2' returning id $$,
  'user cannot delete another user''s device');
select lives_ok(
  $$ insert into public.devices (id, user_id, household_id, name, platform, fingerprint)
     values ('device-a1-2', tests.id('user_a1'), tests.household('h1'), 'A1 tablet', 'web', 'device-a1-2') $$,
  'user can register own device');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.devices $$, 'anon sees no devices');

select * from finish();
rollback;
```

`supabase/tests/080_profiles_rls.sql`:

```sql
begin;
select plan(8);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.profiles order by id $$,
  $$ select unnest(array[tests.id('user_a1'), tests.id('user_a2')]) order by 1 $$,
  'user sees profiles in own household');
select isnt_empty(
  $$ update public.profiles set full_name = 'A1' where id = tests.id('user_a1') returning id $$,
  'user can update own profile');
select is_empty(
  $$ update public.profiles set full_name = 'x' where id = tests.id('user_a2') returning id $$,
  'user cannot update another member''s profile');
select throws_ok(
  $$ update public.profiles set household_id = tests.household('h2') where id = tests.id('user_a1') $$,
  '42501', null,
  'user cannot move self into another household (the updated row fails the SELECT policy)');
select is_empty($$ delete from public.profiles where id = tests.id('user_a2') returning id $$,
  'no profile delete policy');
select throws_ok(
  $$ insert into public.profiles (id, email) values (tests.id('user_b1'), 'x@test.local') $$,
  '42501', null, 'no profile insert policy (profiles come from the signup trigger)');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.profiles $$, $$ values (tests.id('user_b1')) $$,
  'other household sees only its own profiles');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.profiles $$, 'anon sees no profiles');

select * from finish();
rollback;
```

`supabase/tests/090_push_subscriptions_rls.sql`:

```sql
begin;
select plan(6);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq($$ select id from public.push_subscriptions $$, $$ values (tests.id('ps_a1')) $$,
  'user sees only own subscriptions');
select isnt_empty(
  $$ update public.push_subscriptions set auth = 'b' where id = tests.id('ps_a1') returning id $$,
  'user can update own subscription');
select throws_ok(
  $$ insert into public.push_subscriptions (user_id, device_id, endpoint, p256dh, auth)
     values (tests.id('user_a2'), 'device-a2', 'https://push.test/x', 'k', 'a') $$,
  '42501', null, 'user cannot subscribe someone else');
select is_empty(
  $$ update public.push_subscriptions set auth = 'x' where id = tests.id('ps_a2') returning id $$,
  'user cannot update another user''s subscription');
select is_empty($$ delete from public.push_subscriptions where id = tests.id('ps_a2') returning id $$,
  'user cannot delete another user''s subscription');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.push_subscriptions $$, 'anon sees no subscriptions');

select * from finish();
rollback;
```

`supabase/tests/100_sync_queue_rls.sql`:

```sql
begin;
select plan(9);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.sync_queue order by id $$,
  $$ select unnest(array[tests.id('sq_a1'), tests.id('sq_a1_done')]) order by 1 $$,
  'user sees own queue items across devices (per user, not per device; see 2a design)');
select isnt_empty(
  $$ update public.sync_queue set status = 'syncing' where id = tests.id('sq_a1') returning id $$,
  'user can update own queue item');
select is_empty($$ delete from public.sync_queue where id = tests.id('sq_a1') returning id $$,
  'queued items cannot be deleted');
select isnt_empty($$ delete from public.sync_queue where id = tests.id('sq_a1_done') returning id $$,
  'completed items can be deleted');
select throws_ok(
  $$ insert into public.sync_queue (household_id, entity_type, entity_id, operation, device_id, user_id)
     values (tests.household('h1'), 'transaction', 'tx', '{}', 'device-a2', tests.id('user_a2')) $$,
  '42501', null, 'user cannot enqueue for someone else');
select is_empty(
  $$ update public.sync_queue set status = 'failed' where id = tests.id('sq_a2') returning id $$,
  'user cannot update a household member''s queue item');
select is_empty($$ delete from public.sync_queue where id = tests.id('sq_a2') returning id $$,
  'user cannot delete a household member''s queue item');
select tests.authenticate_as('b1');
select is_empty($$ select id from public.sync_queue $$, 'other household sees no queue items');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.sync_queue $$, 'anon sees no queue items');

select * from finish();
rollback;
```

- [ ] **Step 5: event log and transactions**

`supabase/tests/110_transaction_events_rls.sql`:

```sql
begin;
select plan(8);
select tests.seed();

select tests.authenticate_as('a2');
select results_eq($$ select id from public.transaction_events $$, $$ values (tests.id('ev_h1')) $$,
  'member sees household events');
select lives_ok(
  $$ insert into public.transaction_events (household_id, entity_id, op, payload, actor_user_id,
       device_id, idempotency_key, lamport_clock, vector_clock, checksum)
     values (tests.household('h1'), tests.id('tx_h1'), 'update', '{}', tests.id('user_a2'),
       'device-a2', 'ev-a2', 2, '{}', 'c') $$,
  'member can log an event as self from own device');
select throws_ok(
  $$ insert into public.transaction_events (household_id, entity_id, op, payload, actor_user_id,
       device_id, idempotency_key, lamport_clock, vector_clock, checksum)
     values (tests.household('h1'), tests.id('tx_h1'), 'update', '{}', tests.id('user_a1'),
       'device-a2', 'ev-spoof', 2, '{}', 'c') $$,
  '42501', null, 'member cannot log an event as another user');
select throws_ok(
  $$ insert into public.transaction_events (household_id, entity_id, op, payload, actor_user_id,
       device_id, idempotency_key, lamport_clock, vector_clock, checksum)
     values (tests.household('h1'), tests.id('tx_h1'), 'update', '{}', tests.id('user_a2'),
       'device-a1', 'ev-device', 2, '{}', 'c') $$,
  '42501', null, 'member cannot log an event from another user''s device');
select is_empty(
  $$ update public.transaction_events set checksum = 'x' where id = tests.id('ev_h1') returning id $$,
  'events are append-only: no update');
select is_empty($$ delete from public.transaction_events where id = tests.id('ev_h1') returning id $$,
  'events are append-only: no delete');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.transaction_events $$, $$ values (tests.id('ev_h2')) $$,
  'other household sees only its own events');
select tests.authenticate_as_anon();
select is_empty($$ select id from public.transaction_events $$, 'anon sees no events');

select * from finish();
rollback;
```

`supabase/tests/120_transactions_rls.sql`:

```sql
begin;
select plan(13);
select tests.seed();

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.transactions order by id $$,
  $$ select unnest(array[tests.id('tx_h1'), tests.id('tx_h1_personal_a1'),
       tests.id('tx_h1_transfer_out'), tests.id('tx_h1_transfer_in')]) order by 1 $$,
  'creator sees household rows and own personal rows');
select isnt_empty(
  $$ delete from public.transactions where id = tests.id('tx_h1_personal_a1') returning id $$,
  'creator can delete own transaction');

select tests.authenticate_as('a2');
select results_eq(
  $$ select id from public.transactions order by id $$,
  $$ select unnest(array[tests.id('tx_h1'), tests.id('tx_h1_transfer_out'),
       tests.id('tx_h1_transfer_in')]) order by 1 $$,
  'member sees household rows, not another member''s personal rows');
select isnt_empty(
  $$ update public.transactions set description = 'Edited' where id = tests.id('tx_h1') returning id $$,
  'member can edit a household transaction');
select throws_ok(
  $$ update public.transactions set visibility = 'personal' where id = tests.id('tx_h1') $$,
  'P0001', 'Only the creator can change transaction visibility',
  'only the creator can change visibility (pin_transaction_ownership trigger)');
select is_empty(
  $$ delete from public.transactions where id = tests.id('tx_h1_transfer_in') returning id $$,
  'only the creator can delete a household transaction');
select lives_ok(
  $$ insert into public.transactions (household_id, date, description, amount_cents, type, created_by_user_id)
     values (tests.household('h1'), current_date, 'A2 coffee', 150, 'expense', tests.id('user_a2')) $$,
  'member can create a transaction as self');
select throws_ok(
  $$ insert into public.transactions (household_id, date, description, amount_cents, type, created_by_user_id)
     values (tests.household('h1'), current_date, 'Spoof', 150, 'expense', tests.id('user_a1')) $$,
  '42501', null, 'member cannot create a transaction as another user');

select tests.authenticate_as('b1');
select results_eq($$ select id from public.transactions $$, $$ values (tests.id('tx_h2')) $$,
  'other household sees only its own transactions');
select throws_ok(
  $$ insert into public.transactions (household_id, date, description, amount_cents, type, created_by_user_id)
     values (tests.household('h1'), current_date, 'x', 1, 'expense', tests.id('user_b1')) $$,
  '42501', null, 'other household cannot insert');
select is_empty(
  $$ update public.transactions set description = 'x' where id = tests.id('tx_h1') returning id $$,
  'other household cannot update');
select is_empty($$ delete from public.transactions where id = tests.id('tx_h1') returning id $$,
  'other household cannot delete');

select tests.authenticate_as_anon();
select is_empty($$ select id from public.transactions $$, 'anon sees no transactions');

select * from finish();
rollback;
```

- [ ] **Step 6: Run the suite**

Run: `supabase test db 2>&1 | grep -E "\.sql|Result|Failed|not ok"`
Expected: every file `ok`, `Result: PASS`. A failing assertion here means a policy changed since planning: stop, record the failing test and the policy (`psql … -c "select * from pg_policies where tablename='<t>'"`), and ask the user before changing either the test or the policy. A real gap is fixed in its own migration with its test, never by weakening the test.

- [ ] **Step 7: Prove a test bites**

Loosen one policy in the local database (not a migration): `psql postgresql://postgres:postgres@127.0.0.1:54332/postgres -c "alter policy categories_select on public.categories using (true)"`. Run `supabase test db supabase/tests/000_helpers.sql supabase/tests/030_categories_rls.sql 2>&1 | grep -c "not ok"` → at least `1`. Restore it exactly: `psql postgresql://postgres:postgres@127.0.0.1:54332/postgres -c "alter policy categories_select on public.categories using (household_id = get_user_household_id())"`, then `supabase test db` → `Result: PASS`. Never use `supabase db reset` for this (it wipes local dev data). Record both outputs in the ledger.

- [ ] **Step 8: Commit**

```bash
git add supabase/tests
git commit -m "test(db): pgTAP RLS suite for all 12 public tables"
```

---

### Task 6: `transactions_non_transfer` view

**Files:**

- Create: `supabase/tests/210_transactions_non_transfer_view.sql`
- Create: `supabase/migrations/20261002120200_transactions_non_transfer_view.sql`
- Modify: `src/types/database.types.ts` (regenerated)

**Interfaces:**

- Produces: relation `public.transactions_non_transfer` (same columns as `transactions`, `transfer_group_id IS NULL`, RLS of `transactions` via `security_invoker`, SELECT for `authenticated` only); `Database["public"]["Views"]["transactions_non_transfer"]` in the generated types.

- [ ] **Step 1: Write the failing test**

`supabase/tests/210_transactions_non_transfer_view.sql`:

```sql
begin;
select plan(8);
select tests.seed();

select has_view('public', 'transactions_non_transfer', 'transfer-excluding view exists');
select results_eq(
  $$ select column_name::text, data_type::text from information_schema.columns
     where table_schema = 'public' and table_name = 'transactions_non_transfer' order by ordinal_position $$,
  $$ select column_name::text, data_type::text from information_schema.columns
     where table_schema = 'public' and table_name = 'transactions' order by ordinal_position $$,
  'view columns match transactions (recreate the view after adding a column)');

select tests.authenticate_as('a1');
select results_eq(
  $$ select id from public.transactions_non_transfer order by id $$,
  $$ select unnest(array[tests.id('tx_h1'), tests.id('tx_h1_personal_a1')]) order by 1 $$,
  'creator sees own non-transfer rows, transfers excluded');
select tests.authenticate_as('a2');
select results_eq($$ select id from public.transactions_non_transfer $$, $$ values (tests.id('tx_h1')) $$,
  'RLS applies through the view (security_invoker): personal rows hidden');
select throws_ok(
  $$ insert into public.transactions_non_transfer (household_id, date, description, amount_cents, type)
     values (tests.household('h1'), current_date, 'x', 1, 'expense') $$,
  '42501', null, 'the view is read-only for clients');
select tests.authenticate_as('b1');
select results_eq($$ select id from public.transactions_non_transfer $$, $$ values (tests.id('tx_h2')) $$,
  'other household sees only its own rows');
select is_empty(
  $$ select id from public.transactions_non_transfer where transfer_group_id is not null $$,
  'no transfer legs');
select tests.authenticate_as_anon();
select throws_ok($$ select id from public.transactions_non_transfer $$, '42501', null,
  'anon has no access to the view');

select * from finish();
rollback;
```

Run: `supabase test db 2>&1 | grep -A3 210_`
Expected: FAIL (`has_view` not ok; later assertions error with `relation "public.transactions_non_transfer" does not exist`).

- [ ] **Step 2: Migration**

`supabase/migrations/20261002120200_transactions_non_transfer_view.sql`:

```sql
-- Transfer exclusion in the schema (roadmap 4.6). security_invoker runs the view
-- with the caller's rights, so the transactions RLS policies still apply.
-- Postgres expands * when the view is created: after adding a column to
-- transactions, recreate this view (supabase/tests/210_* fails until you do).
CREATE VIEW public.transactions_non_transfer
  WITH (security_invoker = true) AS
  SELECT * FROM public.transactions WHERE transfer_group_id IS NULL;

-- Supabase's default privileges grant new relations to anon and authenticated.
-- Clients only read this view; writes stay on transactions.
REVOKE ALL ON public.transactions_non_transfer FROM anon, authenticated;
GRANT SELECT ON public.transactions_non_transfer TO authenticated;
```

- [ ] **Step 3: Apply, test, regenerate**

Run: `supabase migration up && supabase test db 2>&1 | tail -4 && npm run gen:types && grep -n "transactions_non_transfer" src/types/database.types.ts | head -2`
Expected: `Result: PASS`; the view appears under `Views`.

- [ ] **Step 4: Embedding through the view works over REST**

`fetchAnalyticsTransactions` selects `*, categories(name)`; PostgREST must infer the `category_id` foreign key through the view. As a fixture-free check, sign in as an existing local dev user is not needed: query with the service role key.

```bash
eval "$(supabase status -o env | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
curl -s "$API_URL/rest/v1/transactions_non_transfer?select=id,categories(name)&limit=1" \
  -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

Expected: a JSON array (possibly `[]`), not `{"code":"PGRST200",…"Could not find a relationship"…}`. If PGRST200: stop and record it; the fallback is to keep `fetchAnalyticsTransactions` on a separate `categories` lookup, decided with the user.

- [ ] **Step 5: Gates and commit**

Run the five gate commands → exit 0.

```bash
git add supabase/migrations/20261002120200_transactions_non_transfer_view.sql supabase/tests/210_transactions_non_transfer_view.sql src/types/database.types.ts
git commit -m "feat(db): transactions_non_transfer security_invoker view"
```

---

### Task 7: Reads switch to the view; analytics parent-category filter

**Files:**

- Modify: `src/lib/supabaseQueries.ts` (`nonTransferTransactionsQuery` ~`:807`, `fetchAnalyticsTransactions`, `fetchAnalyticsTransactionTotals`, `useCategoryTotals` ~`:940`, `fetchDashboardDataFromServer` ~`:1160`, `fetchBudgetGroupsFromServer` ~`:1433`)
- Modify: `src/lib/__tests__/transactionReads.test.ts`
- Create: `src/lib/__tests__/nonTransferReads.test.ts`
- Modify: `eslint.config.js` (`arch/no-raw-transactions-from` message)

**Interfaces:**

- Consumes: `transactions_non_transfer` (Task 6).
- Produces: `export async function fetchCategoryTotalsFromServer(month: Date): Promise<CategoryTotalGroup[]>` (extracted from `useCategoryTotals`'s `queryFn`, which becomes `queryFn: () => fetchCategoryTotalsFromServer(month)`); `fetchDashboardDataFromServer` and `fetchBudgetGroupsFromServer` become `export`ed (test access; no behaviour change).

- [ ] **Step 1: Write the failing analytics tests**

In `src/lib/__tests__/transactionReads.test.ts`:

1. Add `"in"` to the method list in `queryBuilder`: `for (const method of ["select", "gte", "lte", "is", "eq", "in", "not", "order"])`.
2. Add after `mockFrom`:

```ts
// One recorded builder per table, so a test can assert which relation each query read.
function mockTables(results: Record<string, { data: unknown; error: unknown }>) {
  const callsByTable: Record<string, Call[]> = {};
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    const { builder, calls } = queryBuilder(results[table] ?? { data: [], error: null });
    callsByTable[table] = calls;
    return builder;
  }) as never);
  return callsByTable;
}
```

3. Replace the first two tests of `describe("analytics transaction reads")` with:

```ts
it("reads the transfer-excluding view and applies the date range and filters", async () => {
  const calls = mockTables({
    categories: { data: [], error: null },
    transactions_non_transfer: { data: [{ id: "t1" }], error: null },
  });

  const rows = await fetchAnalyticsTransactions(range, {
    accountId: "acc-1",
    categoryId: "cat-1",
    type: "expense",
  });

  expect(supabase.from).not.toHaveBeenCalledWith("transactions");
  expect(calls.transactions_non_transfer).toEqual([
    ["select", ["*, categories(name)"]],
    ["gte", ["date", "2026-04-01"]],
    ["lte", ["date", "2026-09-30"]],
    ["eq", ["account_id", "acc-1"]],
    ["in", ["category_id", ["cat-1"]]],
    ["eq", ["type", "expense"]],
  ]);
  expect(rows).toEqual([{ id: "t1" }]);
});

it("expands a parent category to itself and its children", async () => {
  const calls = mockTables({
    categories: { data: [{ id: "child-1" }, { id: "child-2" }], error: null },
  });

  await fetchAnalyticsTransactions(range, { categoryId: "parent-1" });

  expect(calls.categories).toEqual([
    ["select", ["id"]],
    ["eq", ["parent_id", "parent-1"]],
  ]);
  expect(calls.transactions_non_transfer).toContainEqual([
    "in",
    ["category_id", ["parent-1", "child-1", "child-2"]],
  ]);
});

it("does not look up categories when no category filter is set", async () => {
  const calls = mockTables({});

  await fetchAnalyticsTransactions(range);

  expect(calls.categories).toBeUndefined();
});

it("selects only type and amount for totals, from the view", async () => {
  const calls = mockTables({ transactions_non_transfer: { data: null, error: null } });

  const rows = await fetchAnalyticsTransactionTotals(range);

  expect(calls.transactions_non_transfer).toEqual([
    ["select", ["type, amount_cents"]],
    ["gte", ["date", "2026-04-01"]],
    ["lte", ["date", "2026-09-30"]],
  ]);
  expect(rows).toEqual([]);
});

it("throws the category lookup error", async () => {
  const error = { message: "categories down" };
  mockTables({ categories: { data: null, error } });

  await expect(fetchAnalyticsTransactions(range, { categoryId: "cat-1" })).rejects.toBe(error);
});
```

Keep the existing "throws the Supabase error" test and the `fetchTransferLegs` describe (transfer legs stay on `transactions`).

Run: `npx vitest run src/lib/__tests__/transactionReads.test.ts`
Expected: the five new/changed tests FAIL (the query still reads `transactions` with `.eq("category_id", …)`).

- [ ] **Step 2: Implement the analytics reads**

In `src/lib/supabaseQueries.ts`, replace `nonTransferTransactionsQuery` and the two fetchers:

```ts
// Analytics offers top-level categories while transactions carry child ids, so a
// category filter matches the category itself and its direct children.
async function categoryFilterIds(categoryId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("parent_id", categoryId);
  if (error) throw error;
  return [categoryId, ...(data ?? []).map((child) => child.id)];
}

function nonTransferTransactionsQuery(
  columns: string,
  range: IsoDateRange,
  filters: TransactionReadFilters,
  categoryIds: string[] | null
) {
  let query = supabase
    .from("transactions_non_transfer")
    .select(columns)
    .gte("date", range.startDate)
    .lte("date", range.endDate);

  if (filters.accountId) query = query.eq("account_id", filters.accountId);
  if (categoryIds) query = query.in("category_id", categoryIds);
  if (filters.type) query = query.eq("type", filters.type);
  return query;
}

export async function fetchAnalyticsTransactions(
  range: IsoDateRange,
  filters: TransactionReadFilters = {}
): Promise<AnalyticsTransactionRow[]> {
  const categoryIds = filters.categoryId ? await categoryFilterIds(filters.categoryId) : null;
  const { data, error } = await nonTransferTransactionsQuery(
    "*, categories(name)",
    range,
    filters,
    categoryIds
  );
  if (error) throw error;
  return (data ?? []) as unknown as AnalyticsTransactionRow[];
}

export async function fetchAnalyticsTransactionTotals(
  range: IsoDateRange,
  filters: TransactionReadFilters = {}
): Promise<Array<Pick<AnalyticsTransactionRow, "type" | "amount_cents">>> {
  const categoryIds = filters.categoryId ? await categoryFilterIds(filters.categoryId) : null;
  const { data, error } = await nonTransferTransactionsQuery(
    "type, amount_cents",
    range,
    filters,
    categoryIds
  );
  if (error) throw error;
  return (data ?? []) as unknown as Array<Pick<AnalyticsTransactionRow, "type" | "amount_cents">>;
}
```

(The two `as unknown as` casts are pre-existing; the typed client cannot infer a row type from a non-literal `columns` string. Leave them.)

Run: `npx vitest run src/lib/__tests__/transactionReads.test.ts` → PASS.

- [ ] **Step 3: Write the failing relation test**

Create `src/lib/__tests__/nonTransferReads.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { supabase } from "@/lib/supabase";
import {
  fetchBudgetGroupsFromServer,
  fetchCategoryTotalsFromServer,
  fetchDashboardDataFromServer,
} from "@/lib/supabaseQueries";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/lib/offline/budgets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/budgets")>()),
  mirrorBudgetsForMonth: vi.fn(),
}));

// Every query resolves to an empty result; only the relation names matter here.
function recordRelations(): string[] {
  const relations: string[] = [];
  const empty = { data: [], error: null };
  const builder: object = new Proxy(
    {},
    {
      get: (_target, property) =>
        property === "then" ? (resolve: (value: unknown) => void) => resolve(empty) : () => builder,
    }
  );
  vi.mocked(supabase.from).mockImplementation(((relation: string) => {
    relations.push(relation);
    return builder;
  }) as never);
  vi.mocked(supabase.rpc).mockResolvedValue(empty as never);
  return relations;
}

function transactionRelationCounts(relations: string[]) {
  const counts: Record<string, number> = {};
  for (const relation of relations.filter((name) => name.startsWith("transactions"))) {
    counts[relation] = (counts[relation] ?? 0) + 1;
  }
  return counts;
}

const month = new Date(2026, 9, 1);

describe("totals read transactions only through transactions_non_transfer", () => {
  it.each([
    // The dashboard's "recent transactions" list shows transfers on purpose.
    [
      "dashboard",
      () => fetchDashboardDataFromServer(month),
      { transactions_non_transfer: 3, transactions: 1 },
    ],
    [
      "category totals",
      () => fetchCategoryTotalsFromServer(month),
      { transactions_non_transfer: 1 },
    ],
    ["budget groups", () => fetchBudgetGroupsFromServer(month), { transactions_non_transfer: 1 }],
  ])("%s", async (_name, fetchTotals, expected) => {
    const relations = recordRelations();

    await fetchTotals();

    expect(transactionRelationCounts(relations)).toEqual(expected);
  });
});
```

Run: `npx vitest run src/lib/__tests__/nonTransferReads.test.ts`
Expected: FAIL to compile/import (`fetchCategoryTotalsFromServer` is not exported; the other two are not exported).

- [ ] **Step 4: Export, extract, switch**

1. `fetchDashboardDataFromServer` and `fetchBudgetGroupsFromServer`: add `export`.
2. Move `useCategoryTotals`'s `queryFn` body into `export async function fetchCategoryTotalsFromServer(month: Date): Promise<CategoryTotalGroup[]>` directly above `useCategoryTotals`, and set `queryFn: () => fetchCategoryTotalsFromServer(month),`.
3. In those three functions, change each transfer-excluding read from `.from("transactions")` to `.from("transactions_non_transfer")` and delete its `.is("transfer_group_id", null)` line and the "Exclude transfers" comment on it (the dashboard's current-month, previous-month and six-month queries; category totals; budget groups). Leave the dashboard's "recent transactions" query on `transactions`.

Run: `npx vitest run src/lib/__tests__/nonTransferReads.test.ts src/lib/__tests__/transactionReads.test.ts` → PASS. If a fetcher throws on the empty fixture (for example, it indexes into `rpc` data), give that one call a minimal valid result in the test rather than changing production code, and note it in the ledger.

Run: `grep -n 'is("transfer_group_id", null)' src/lib/supabaseQueries.ts`
Expected: only `buildTransactionsListQuery` (the list's `excludeTransfers` option) and `fetchTransferLegs`'s `.not(...)` remain.

- [ ] **Step 5: Lint message**

In `eslint.config.js`, the `arch/no-raw-transactions-from` message becomes:

```js
          message:
            "Read transactions through src/lib/supabaseQueries.ts. Totals (analytics, dashboard, budgets) read the transactions_non_transfer view so transfers can never leak into them.",
```

If `src/lib/__tests__/architecture-lint.test.ts` asserts the old message text, update it to match.

- [ ] **Step 6: Query plan**

Run:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54332/postgres -c "set role authenticated; select set_config('request.jwt.claims', '{\"sub\":\"'||(select id from profiles limit 1)||'\",\"role\":\"authenticated\"}', true); explain select category_id, amount_cents, type from transactions_non_transfer where date between '2026-10-01' and '2026-10-31';"
```

Expected: the plan scans `transactions` (the view is inlined) with the `transfer_group_id IS NULL` and RLS quals applied; record it in the ledger. With little local data a Seq Scan is expected and fine; the check is that the view is inlined, not a materialized subquery.

- [ ] **Step 7: Gates and commit**

Run the five gate commands → exit 0.

```bash
git add src/lib/supabaseQueries.ts src/lib/__tests__/transactionReads.test.ts src/lib/__tests__/nonTransferReads.test.ts eslint.config.js src/lib/__tests__/architecture-lint.test.ts
git commit -m "feat(analytics): totals read transactions_non_transfer; parent category filter includes children"
```

---

### Task 8: CI split

**Files:**

- Modify: `.github/workflows/ci.yml` (replace the `ci` job; keep the `e2e` job as is)

- [ ] **Step 1: Replace the `ci` job**

Replace the whole `ci:` job (lines 10-56) with the jobs below. Keep `on:` and the existing `e2e:` job unchanged.

```yaml
lint:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
        cache: "npm"
    - run: npm ci
    - name: Lint
      run: npm run lint

typecheck:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
        cache: "npm"
    - run: npm ci
    - name: Typecheck app
      run: npx tsc --noEmit -p tsconfig.json
    # tests/ and the Playwright config are outside the app program.
    - name: Typecheck tests
      run: npx tsc --noEmit -p tsconfig.tests.json
    # noUncheckedIndexedAccess over sync, offline, debts and their imports
    # (roadmap 4.8). Delete with tsconfig.strict.json when Phase 3 enables
    # the flag repo-wide.
    - name: Typecheck strict
      run: npx tsc --noEmit -p tsconfig.strict.json

unit-tests:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
        cache: "npm"
    - run: npm ci
    - name: Unit tests
      run: npx vitest run --allowOnly=false

build:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
        cache: "npm"
    - run: npm ci
    - name: Build
      run: npm run build
      env:
        VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL || 'https://dummy.supabase.co' }}
        VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkdW1teSIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQwOTk1MjAwLCJleHAiOjE5NTY1NzEyMDB9.dummy' }}
    # Initial-bundle budget (review UI-03/Theme 7).
    - name: Bundle size budget
      run: npm run size

# Schema contract (roadmap 4.1): db lint, pgTAP RLS suite, and generated
# types drift. The CLI is pinned so gen types output matches the committed file.
database:
  runs-on: ubuntu-latest
  timeout-minutes: 15
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
    - uses: supabase/setup-cli@v1
      with:
        version: 2.109.1
    - name: Start Postgres
      run: supabase db start
    - name: Lint database functions
      run: supabase db lint --fail-on error
    - name: pgTAP
      run: supabase test db
    - name: Generated types are current
      run: |
        npm run gen:types
        git diff --exit-code src/types/database.types.ts

# Chromium smoke against a local Supabase stack, on every push and PR.
e2e-smoke:
  runs-on: ubuntu-latest
  timeout-minutes: 20
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
        cache: "npm"
    - run: npm ci
    - uses: supabase/setup-cli@v1
      with:
        version: 2.109.1
    - name: Start Supabase
      run: supabase start -x studio,imgproxy,edge-runtime,analytics,vector
    - name: Export local Supabase credentials
      run: |
        eval "$(supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
        {
          echo "VITE_SUPABASE_URL=$API_URL"
          echo "VITE_SUPABASE_ANON_KEY=$ANON_KEY"
          echo "SUPABASE_URL=$API_URL"
          echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
        } >> "$GITHUB_ENV"
    - name: Install Chromium
      run: npx playwright install --with-deps chromium
    - name: Smoke tests
      run: npm run test:e2e:smoke
      env:
        PW_TEST_HTML_REPORT_OPEN: never
    - name: Upload smoke report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-smoke-report
        path: |
          playwright-report/
          test-results/
        retention-days: 7
```

- [ ] **Step 2: Validate locally**

Run: `npx prettier --check .github/workflows/ci.yml && node -e "const y=require('fs').readFileSync('.github/workflows/ci.yml','utf8'); for (const j of ['lint','typecheck','unit-tests','build','database','e2e-smoke','e2e']) if (!y.includes('\n  '+j+':')) throw new Error('missing job '+j); console.log('jobs ok')"`
Expected: formatted; `jobs ok`.

Run the `database` job's commands locally: `supabase db lint --fail-on error && supabase test db && npm run gen:types && git diff --exit-code src/types/database.types.ts; echo "exit $?"` → `exit 0`.

- [ ] **Step 3: Commit, push, watch**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: split into lint, typecheck, unit-tests, build, database and e2e-smoke jobs"
```

Ask the user to run `! git push -u origin phase-2a-schema-contracts` (pre-push runs the full checks). Then:

Run: `gh run list --branch phase-2a-schema-contracts --limit 3` and, once complete, `gh run view <id> --json jobs --jq '.jobs[] | "\(.name): \(.conclusion)"'`
Expected: `lint`, `typecheck`, `unit-tests`, `build`, `database`, `e2e-smoke` all `success`; `e2e` `success` or `skipped` (credential-gated, push only).

If `database` fails at `gen types` or `test db` because Postgres alone is not enough: change its start step to `supabase start -x studio,imgproxy,edge-runtime,analytics,vector,storage,realtime,inbucket,functions` (roadmap fallback) and record it. If `e2e-smoke` fails, download the report (`gh run download <id> -n playwright-smoke-report`), read it, and compare with a local `npm run test:e2e:smoke` before changing anything. Record the green run URL in the ledger.

---

### Task 8a: Explicit table grants; diagnose the CI Chromium install hang

Added 2026-10-03. The first CI run (37132227085) failed `database`: every RLS file stopped at its first query with `permission denied for table <t>`. Production and the linked local stack run `supabase/postgres:17.6.1.063` (`supabase/.temp/postgres-version`), whose image set default privileges granting `anon`, `authenticated` and `service_role` full access in `public`. CI gets the CLI default `17.6.1.143`, which no longer does. No migration ever granted table access, so any fresh database is unusable by the app. `e2e-smoke` never reached its tests: `npx playwright install --with-deps chromium` went silent for 18 minutes after the download finished and hit the job timeout.

**Files:**

- Create: `supabase/migrations/20261003120000_explicit_table_grants.sql`
- Modify: the anon assertions in `supabase/tests/0*_rls.sql` and `120_transactions_rls.sql` (12 files)
- Modify: `.github/workflows/ci.yml` (`e2e-smoke` install steps)

- [ ] **Step 1: Migration.** For the 12 public tables by name: `GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`; `GRANT ALL … TO service_role`; `REVOKE ALL … FROM anon`. `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role`. Leave `transactions_non_transfer` grants as they are (select for authenticated only). Header comment: why (image default privileges changed; production is a no-op except the anon revoke).
- [ ] **Step 2: anon tests.** Each RLS file's `is_empty($$ select id from public.<t> $$, 'anon sees no …')` becomes `throws_ok($$ select id from public.<t> $$, '42501', null, 'anon has no access to <t>')`.
- [ ] **Step 3: Verify on the CI image locally.** Copy `supabase/config.toml`, `supabase/migrations/` and `supabase/tests/` to `$SCRATCH/fresh/supabase/`, set a different `project_id` and free ports for `[db]` (and shadow), with no `.temp`, so the CLI uses its default image. `supabase db start --workdir $SCRATCH/fresh`, confirm the image tag is `17.6.1.143`, run `supabase db lint --fail-on error`, `supabase test db`, and `gen types` (diff against the committed file) with `--workdir`. All must pass. Then `supabase stop --no-backup --workdir $SCRATCH/fresh` (never without `--workdir`: that would stop the dev stack). Also run the suite on the dev stack after `supabase migration up`.
- [ ] **Step 4: CI install steps.** Replace the single install step with `npx playwright install-deps chromium` and `npx playwright install chromium`, each with `timeout-minutes: 6` and `DEBUG: pw:install` in `env`.
- [ ] **Step 5: Commit, push (user), watch.** `feat(db): explicit table grants; anon has no table access` and `ci: split Playwright install with debug logging and step timeouts`. Record the run URL and each job's conclusion; if the install hangs again, read the `pw:install` log and record the last line before the hang.

---

### Task 9: Acceptance and docs

**Files:**

- Modify: `CLAUDE.md` (transfer rule line, Commands block)
- Modify: `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 2 checkboxes, Resume state)
- Modify: this plan (Progress, Acceptance results)

- [ ] **Step 1: Gates**

Run (Node 26): `npx tsc --noEmit -p tsconfig.json; npx tsc --noEmit -p tsconfig.tests.json; npx tsc --noEmit -p tsconfig.strict.json; npm run lint; npx vitest run --silent; npm run build && npm run size; supabase db lint --fail-on error; supabase test db; npm run gen:types && git diff --exit-code src/types/database.types.ts`
Expected: every command exit 0; quote the vitest file/test counts, bundle size, and pgTAP `Files=15` line in the results.

- [ ] **Step 2: Smoke**

Run: `PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke` → `11 passed`.

- [ ] **Step 3: Screenshots (read each one)**

With `npm run dev` against local data containing a parent category with spending in a child category (create one through the UI if needed): open Analytics, pick the parent category in the filter, and screenshot. Read it: rows from the child appear (before this branch the view was empty). Screenshot the dashboard on `main` and on the branch with the same local data; read both: income, expense and category totals are identical.

- [ ] **Step 4: Docs**

`CLAUDE.md`, "Transfers are excluded" bullet becomes:

```markdown
- **Transfers are excluded from analytics and budgets.** Totals read the `transactions_non_transfer` view (`security_invoker`, so RLS applies); read transactions through `src/lib/supabaseQueries.ts` (`arch/no-raw-transactions-from`).
```

In the Commands block add:

```bash
npm run gen:types          # regenerate src/types/database.types.ts (commit with each migration)
supabase test db           # pgTAP: RLS for every table, functions, the transfer view
```

Roadmap: tick Phase 2's `gen:types`, `database` CI job, `transactions_non_transfer`, and `Split CI jobs` items with "(2a, merged <date> at <sha>)"; update Resume state (2a done; next: 2b brainstorm). Tick this plan's Progress and add an "Acceptance results" section quoting Step 1-3 evidence.

- [ ] **Step 5: Finish**

Use superpowers:finishing-a-development-branch. Migrations reach production only by the user's own deployment step; list the three new migrations for them and do not run any remote command.

---

## Decisions & Deferrals

- **`categories.color` becomes NOT NULL instead of `| null` in the app (decided while planning, 2026-10-02).** Why: the column already defaults to `'#6B7280'`, the app never writes null, every reader falls back to the same colour, and the local database has no null rows; tightening removes four errors without spreading null handling through the UI. Revisit: if the production backfill touches rows (the `UPDATE` reports a count when the user applies it).
- **`untypedSupabase` for runtime-chosen tables (decided while planning).** Why: `supabase.from(unionOfTables)` cannot pick a typed overload; queue payloads are JSON whose shape is fixed where `src/lib/offline/*` builds them; widening the instance avoids casts. Phase 2b's Zod schemas add the runtime check. Revisit: 2b.
- **pgTAP helpers live in a committed `tests` schema created by `000_helpers.sql` (decided while planning).** Why: `supabase test db` runs files in name order, one session each, so shared fixtures must persist; Supabase documents the same pattern. Cost: the local dev database keeps a `tests` schema (not in `public`, so invisible to `gen types` and `db lint`). Revisit: never.
- **`000_helpers.sql` does not create the pgTAP extension (found in Task 4).** Why: `supabase test db` installs pgTAP for the run and drops it afterwards; committing `create extension` left it installed, and `supabase db lint` then lints pgTAP's own functions in `extensions` and exits 1. Revisit: never.
- **The `e2e` job now `needs: [lint, typecheck, unit-tests, build]` (found in Task 8).** Why: it had `needs: ci`, and a `needs` naming a removed job makes GitHub reject the whole workflow. Revisit: never.
- **Table privileges are explicit in a migration; `anon` gets none (decided 2026-10-03).** Why: the CI image (`17.6.1.143`) no longer ships default grants, so a fresh database built from migrations gave `authenticated` no table access; production (`17.6.1.063`) has blanket grants from its image. Naming the 12 tables keeps the transfer view read-only and future tables unexposed until granted. Cost: in production the anon revoke turns a pre-login anon table read from an empty result into `permission denied`. Revisit: if a pre-login screen shows a permission error.
- **e2e-smoke stays in 2a; the Chromium install hang is diagnosed from a debug run (decided 2026-10-03).** Why: the first run hung after the download with no output. Revisit: if the debug run does not explain it, defer the job and log it under CLAUDE.md Known infrastructure issues.
- **Fixture households are fresh ids, not the profile default (found while planning).** Why: the default household holds local dev data, which made `count(*)` assertions see 7 rows instead of 3. Revisit: never.
- **KNOWN GAP, not fixed in 2a: `accounts_insert` does not pin `owner_user_id` (found while planning).** A household member can insert a personal account owned by another member (it then shows up in that member's list). The test documents current behaviour. Revisit: 2a acceptance; ask the user whether to tighten the policy (`owner_user_id IS NULL OR owner_user_id = auth.uid()`) in its own migration.
- **Noted, not changed: only a transaction's creator can delete it, while any household member can edit a household transaction (found while planning).** The test asserts current behaviour. Revisit: if users report being unable to delete shared transactions.
- **Moving self into another household is blocked only because the updated row must also pass the SELECT policy (found while planning).** `profiles_update` checks only `id = auth.uid()`; Postgres applies `profiles_select` to the new row, so changing `household_id` raises `42501`. `080_profiles_rls.sql` pins this so a future policy edit cannot open it silently. Revisit: never (the test is the guard).
- **Analytics has no Dexie fallback, so the parent-category fix is server-only (found while planning).** The spec's `offline/reads.ts:50` reference is the transactions-list filter, which takes real (child) ids from click-through and stays as is. Revisit: never.
- **Dashboard "recent transactions" stays on `transactions` (decided while planning).** Why: it is a list, and transfers belong in it; the relation test pins three view reads plus this one table read. Revisit: never.
