# Phase 2b: Branded Cents and Zod Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two database permission gaps (2b-0), then make integer cents a compiler-enforced type from every entry point (input, PostgREST rows, RPCs, realtime) to every display, with Zod validating server rows before they reach Dexie.

**Architecture:** 2b-0 is two migrations plus pgTAP on its own branch, deployed by the user before merge. 2b adds `Cents` and a small helper family to `currency.ts`, brands every `*_cents` column at the type level through `AppDatabase` (so typed Supabase reads arrive branded with no runtime cost), brands entity and input types, puts Zod schemas in front of the three realtime write paths and the two RPCs, then flips `formatPHP` to `Cents` so every displayed total must come from a branded producer. An import restriction keeps the raw `asCents` constructor in the data layer.

**Tech Stack:** TypeScript 5.9, Zod 3.25, Dexie + fake-indexeddb, Vitest, ESLint flat config, Supabase CLI 2.109.1 (pgTAP via `supabase test db`).

**Spec:** `docs/plans/2026-10-04-phase-2b-cents-boundaries-design.md`

## Global Constraints

- Node 26 (`.nvmrc`). In Claude's shell, prefix node commands with `source ~/.nvm/nvm.sh && nvm use 26 >/dev/null &&`.
- Local stack must be running (`supabase status -o env | grep -c API_URL` prints `1`). DB URL for `psql`: `postgresql://postgres:postgres@127.0.0.1:54332/postgres`.
- Migrations apply locally with `supabase migration up` only. Never `supabase db push` or anything with `--linked` from Claude's shell; the user runs production commands.
- `src/types/database.types.ts` is written only by `npm run gen:types`; commit it with the migration that changed it.
- Every commit passes: `npx tsc --noEmit -p tsconfig.json`, `-p tsconfig.tests.json`, `-p tsconfig.strict.json`, `npm run lint`, `npx vitest run`. 2b-0 commits also pass `supabase test db`.
- No new `as` casts in production code except the single `n as Cents` inside `asCents`. No new `!` in production code. No `any`.
- Money rules (CLAUDE.md) still hold: amounts are integer cents; never divide cents without rounding (use `divideCents`).
- `Cents` carries no sign. Positivity is checked by schemas (`.refine((c) => c > 0)`) and DB constraints, never by the brand.
- Commit messages: Conventional Commits, no `Co-Authored-By` or session lines (user rule).
- Bundle stays within 355 KB gz: `npm run build && npm run size`.
- `git push` hangs from Claude's shell (SSH passphrase). Ask the user to run `! git push ...`. `gh api` works from Claude's shell.
- `$SCRATCH` means the session scratchpad directory (never the repo).
- If a pre-push or CI failure appears that you did not cause, check CLAUDE.md "Known infrastructure issues" first; log new ones there.

## Progress

- [x] Task 0: Preconditions, 2b-0 branch, ledger
- [x] Task 1: 2b-0 migrations and pgTAP
- [x] Task 2: 2b-0 merge, production deploy (user), push (merged to `main` at `02bf830`; deployed and SQL-verified on production 2026-10-05; `main` pushed at `3b6b9f8`)
- [x] Task 3: 2b branch; `Cents` core in `currency.ts`
- [x] Task 4: Branded rows, entities, inputs and forms
- [x] Task 5: Sync-row schemas in front of realtime writes
- [x] Task 6: RPC result schemas
- [x] Task 7: Branded producers; `formatPHP` takes `Cents`
- [x] Task 8: `asCents` import restriction
- [x] Task 9: Reversal `payment_date` uses the local date
- [ ] Task 10: Acceptance and docs (Steps 1-4 done; Step 5, finishing the branch, pending the final review)

---

### Task 0: Preconditions, 2b-0 branch, ledger

**Files:**

- Create: `.superpowers/sdd/progress.md` (gitignored)

- [ ] **Step 1: Confirm state**

Run: `git status -sb | head -1 && git log --oneline -1 && supabase status -o env | grep -c API_URL && supabase --version`
Expected: `## main...origin/main` (if `ahead`, ask the user to run `! git push origin main` and wait; the commits are docs-only so pre-push skips), HEAD is this plan's commit or later, `1`, `2.109.1`.

- [ ] **Step 2: Branch**

Run: `git switch -c phase-2b0-security`

- [ ] **Step 3: Start the ledger**

Write `.superpowers/sdd/progress.md` with a heading `# Phase 2b progress`, the branch name, the base commit (`git rev-parse --short HEAD`), and one line per task from the Progress list above. Update it after every task (status, commit SHAs, anything surprising).

---

### Task 1: 2b-0 migrations and pgTAP

**Files:**

- Create: `supabase/migrations/20261004130000_drop_get_max_lamport_clock.sql`
- Create: `supabase/migrations/20261004130100_accounts_update_owner.sql`
- Modify: `supabase/tests/010_accounts_rls.sql` (plan 14 → 18)
- Modify: `supabase/tests/220_privileges.sql` (one assertion, bump its `plan(n)`)
- Modify: `src/types/database.types.ts` (regenerated)

**Interfaces:**

- Consumes: `tests.seed()`, `tests.authenticate_as()`, `tests.id()`, `tests.household()` from `supabase/tests/000_helpers.sql`; fixture accounts `acc_h1` (household, owner NULL) and `acc_h1_personal_a1` (personal, owner `user_a1`).
- Produces: `accounts_update` WITH CHECK `household_id = get_user_household_id() AND (owner_user_id IS NULL OR owner_user_id = auth.uid())`; no `public.get_max_lamport_clock`.

Already verified while planning: the app's household switch clears the owner on the server. `offline/accounts.ts:219` sets `owner_user_id = undefined`, and `sync/processor.ts:335-339` maps `undefined` to `null` for every update. No app change is needed.

- [ ] **Step 1: Write the failing pgTAP assertions**

In `supabase/tests/010_accounts_rls.sql`, change `select plan(14);` to `select plan(18);` and insert before `select * from finish();`:

```sql
-- accounts_update WITH CHECK pins the owner to the caller (2b-0)
select tests.authenticate_as('a2');
select throws_ok(
  $$ update public.accounts set visibility = 'personal', owner_user_id = tests.id('user_a1')
     where id = tests.id('acc_h1') $$,
  '42501', null, 'member cannot make a household account personal to someone else');
select throws_ok(
  $$ update public.accounts set owner_user_id = tests.id('user_b1') where id = tests.id('acc_h1') $$,
  '42501', null, 'member cannot assign a household account to another user');
select lives_ok(
  $$ update public.accounts set visibility = 'personal', owner_user_id = tests.id('user_a2')
     where id = tests.id('acc_h1') $$,
  'member can make a household account their own personal account');

select tests.authenticate_as('a1');
select lives_ok(
  $$ update public.accounts set visibility = 'household', owner_user_id = null
     where id = tests.id('acc_h1_personal_a1') $$,
  'owner can switch their personal account to household');
```

In `supabase/tests/220_privileges.sql`, bump its `select plan(n);` by one and add before `finish()`:

```sql
select hasnt_function('public', 'get_max_lamport_clock', array['text'],
  'get_max_lamport_clock is dropped (2b-0)');
```

- [ ] **Step 2: Run to verify RED**

Run: `supabase test db 2>&1 | tail -15`
Expected: `Result: FAIL`. `010_accounts_rls.sql` fails the two `throws_ok` assertions (the updates succeed today), `220_privileges.sql` fails `hasnt_function`. The two `lives_ok` assertions already pass.

- [ ] **Step 3: Write the migrations**

`supabase/migrations/20261004130000_drop_get_max_lamport_clock.sql`:

```sql
-- get_max_lamport_clock was SECURITY DEFINER with no search_path and read
-- transaction_events across households. Nothing in src/ calls it. Dropped
-- rather than hardened; re-add as SECURITY INVOKER if Phase B device init
-- needs a server-side max clock.
drop function if exists public.get_max_lamport_clock(text);
```

`supabase/migrations/20261004130100_accounts_update_owner.sql`:

```sql
-- accounts_update only checked the household on the new row, so a member
-- could reassign a household account to another member. Pin owner_user_id
-- to the caller, as accounts_insert does since 20261004120100. USING is
-- unchanged.
drop policy if exists "accounts_update" on public.accounts;

create policy "accounts_update"
  on public.accounts for update
  to authenticated
  using (
    household_id = get_user_household_id()
    and (visibility = 'household' or owner_user_id = auth.uid())
  )
  with check (
    household_id = get_user_household_id()
    and (owner_user_id is null or owner_user_id = auth.uid())
  );

comment on policy "accounts_update" on public.accounts is
  'Users can update household accounts or their own personal accounts; a personal account can only be owned by the caller';
```

- [ ] **Step 4: Apply and run to verify GREEN**

Run: `supabase migration up && supabase test db 2>&1 | tail -5 && supabase db lint --fail-on error`
Expected: `Files=16, Tests=149, Result: PASS` (the pre-task total was 144; this task adds 4 + 1). Actual: 149, dev and fresh image, and `No schema errors found`.

- [ ] **Step 5: Regenerate types**

Run: `npm run gen:types && git diff --stat src/types/database.types.ts && grep -c get_max_lamport_clock src/types/database.types.ts`
Expected: one small diff, and the count is `0`. Then run the five gates from Global Constraints; all exit 0 (nothing in `src/` referenced the function).

- [ ] **Step 6: Verify on the CLI-default image**

Copy `supabase/config.toml`, `supabase/migrations/` and `supabase/tests/` to `$SCRATCH/fresh/supabase/`. In the copy's `config.toml` set `project_id = "hh-fresh"` and change the `[api]`, `[db]` (and `shadow_port`), `[studio]`, `[inbucket]`, `[analytics]` ports to free `55xxx` values. Do not copy `.temp`, so the CLI uses its default image. Then:

```bash
supabase db start --workdir $SCRATCH/fresh
docker ps --format '{{.Names}} {{.Image}}' | grep hh-fresh   # expect postgres:17.6.1.143 (or newer default)
supabase db lint --fail-on error --workdir $SCRATCH/fresh
supabase test db --workdir $SCRATCH/fresh 2>&1 | tail -3
supabase gen types --lang=typescript --local --schema public,graphql_public --workdir $SCRATCH/fresh > $SCRATCH/fresh-types.ts
```

Compare `$SCRATCH/fresh-types.ts` with the committed file using the same post-processing `npm run gen:types` applies (read `package.json`'s `gen:types` script and pipe through the same formatter); expect no diff. Then `supabase stop --no-backup --workdir $SCRATCH/fresh` (never without `--workdir`). Confirm `docker ps | grep -c hh-fresh` is `0` and the dev stack is still up (`supabase status -o env | grep -c API_URL` = `1`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261004130000_drop_get_max_lamport_clock.sql \
  supabase/migrations/20261004130100_accounts_update_owner.sql \
  supabase/tests/010_accounts_rls.sql supabase/tests/220_privileges.sql \
  src/types/database.types.ts
git commit -m "fix(db): drop get_max_lamport_clock; accounts update pins owner to the caller"
```

---

### Task 2: 2b-0 merge, production deploy (user), push

- [ ] **Step 1: Review**

Request a code review of `main..phase-2b0-security` (superpowers:requesting-code-review). Fix findings before continuing.

- [ ] **Step 2: Merge locally**

```bash
git switch main && git merge --ff-only phase-2b0-security && git log --oneline -3
```

- [ ] **Step 3: User deploys the migrations**

Ask the user to run, in their terminal, and paste the output:

```
! supabase migration list --linked
! supabase db push --dry-run
! supabase db push
```

Expected: the dry run lists exactly `20261004130000_drop_get_max_lamport_clock.sql` and `20261004130100_accounts_update_owner.sql`. Then ask the user to run this SQL in the production SQL editor and paste the result:

```sql
select
  (select count(*) from pg_proc where proname = 'get_max_lamport_clock') as lamport_fns,
  (select with_check from pg_policies where tablename = 'accounts' and policyname = 'accounts_update') as update_check;
```

Expected: `lamport_fns = 0`; `update_check` contains `owner_user_id IS NULL` and `auth.uid()`.

- [ ] **Step 4: Push and record**

Ask the user to run `! git push origin main`. This is a code push, so pre-push runs the full gate set. Then delete the branch (`git branch -d phase-2b0-security`) and add a line to the roadmap Resume state: "2b-0 merged at `<sha>`, deployed 2026-10-xx, verified by SQL". Commit with `docs(plans): 2b-0 merged and deployed`.

---

### Task 3: 2b branch; `Cents` core in `currency.ts`

**Files:**

- Modify: `src/lib/currency.ts`
- Modify: `src/lib/currency.test.ts`
- Create: `src/test/cents.ts`
- Modify: `src/lib/currency.md`, `src/lib/README.md` (remove the deleted helpers)

**Interfaces:**

- Produces (every later task uses these exact names):
  - `type Cents = number & { readonly [centsBrand]: true }`
  - `asCents(n: number): Cents`: throws `CurrencyError` code `"NOT_INTEGER"` unless `Number.isSafeInteger(n)`
  - `ZERO_CENTS: Cents`
  - `parsePHP(input: string | number): Cents`, `parsePHPSafe(...)` with `value: Cents`, `parsePHPUnbounded(input: string): Cents | null`
  - `sumCents(values: Iterable<Cents>): Cents`, `diffCents(a: Cents, b: Cents): Cents`, `absCents(c: Cents): Cents`, `negateCents(c: Cents): Cents`, `divideCents(c: Cents, divisor: number): Cents` (rounds; throws `RangeError` unless divisor is finite and > 0)
  - `formatPHPChartValue(value: unknown): string` (`"₱—"` for anything that is not a safe integer)
  - `formatPHP(cents: number)` and `formatPHPAxisTick(cents: number)` keep `number` until Task 7 flips them.
  - Test helper `cents(n: number): Cents` from `@/test/cents`.
- Deletes (callers are only `currency.test.ts`): `addAmounts`, `subtractAmounts`, `multiplyAmount`, `percentageOf`, `isValidAmount`, `formatNumeric`. `addAmounts` and `subtractAmounts` threw above the per-transaction max and on negatives, which is wrong for totals; `sumCents` and `diffCents` replace them.

- [ ] **Step 1: Branch**

Run: `git switch -c phase-2b-cents-boundaries && git log --oneline -1`
Expected: HEAD is the 2b-0 docs commit or later.

- [ ] **Step 2: Write the failing tests**

In `src/lib/currency.test.ts`, delete the `describe` blocks for the six deleted helpers, update the import line to drop them and add the new names, and append:

```ts
describe("asCents", () => {
  it("brands safe integers of any sign", () => {
    expect(asCents(150050)).toBe(150050);
    expect(asCents(-2500)).toBe(-2500);
    expect(asCents(0)).toBe(0);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "throws NOT_INTEGER for %s",
    (value) => {
      expect(() => asCents(value)).toThrow(CurrencyError);
      try {
        asCents(value);
      } catch (error) {
        expect(error instanceof CurrencyError && error.code).toBe("NOT_INTEGER");
      }
    }
  );

  it("ZERO_CENTS is zero", () => {
    expect(ZERO_CENTS).toBe(0);
  });
});

describe("cents arithmetic", () => {
  it("sumCents adds any number of signed amounts without a max", () => {
    expect(sumCents([asCents(999999999), asCents(999999999), asCents(-2)])).toBe(1999999996);
    expect(sumCents([])).toBe(0);
  });

  it("diffCents may go negative", () => {
    expect(diffCents(asCents(100), asCents(250))).toBe(-150);
  });

  it("absCents and negateCents", () => {
    expect(absCents(asCents(-2500))).toBe(2500);
    expect(negateCents(asCents(2500))).toBe(-2500);
  });

  it("divideCents rounds to a whole cent", () => {
    expect(divideCents(asCents(100000), 3)).toBe(33333);
    expect(divideCents(asCents(200), 3)).toBe(67);
    expect(Number.isInteger(divideCents(asCents(123457), 7))).toBe(true);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "divideCents rejects divisor %s",
    (divisor) => {
      expect(() => divideCents(asCents(100), divisor)).toThrow(RangeError);
    }
  );
});

describe("formatPHPChartValue", () => {
  it("formats integer cents like formatPHP", () => {
    expect(formatPHPChartValue(150050)).toBe("₱1,500.50");
  });

  it.each(["150050", 1.5, null, undefined, Number.NaN])("renders a dash for %s", (value) => {
    expect(formatPHPChartValue(value)).toBe("₱—");
  });
});

describe("parsers return branded cents", () => {
  it("parsePHPUnbounded returns null for amounts past the safe-integer range", () => {
    expect(parsePHPUnbounded("1e300")).toBeNull();
  });
});
```

Create `src/test/cents.ts`:

```ts
import { asCents, type Cents } from "@/lib/currency";

/** Fixture shorthand: `amount_cents: cents(12345)`. */
export const cents = (n: number): Cents => asCents(n);
```

- [ ] **Step 3: Run to verify RED**

Run: `npx vitest run src/lib/currency.test.ts`
Expected: FAIL (`asCents`, `sumCents`, ... are not exported).

- [ ] **Step 4: Implement**

In `src/lib/currency.ts`:

1. Move the `CurrencyError` class to directly below the `PESO_SIGN` constant. It must be declared before `ZERO_CENTS = asCents(0)` runs at module load (class declarations are not hoisted).
2. Below `CurrencyError`, add:

```ts
declare const centsBrand: unique symbol;

/** Validated integer cents. Any sign: debt reversals and balance deltas are negative. */
export type Cents = number & { readonly [centsBrand]: true };

/** The only number → Cents constructor. Import-restricted to the data layer (eslint.config.js). */
export function asCents(n: number): Cents {
  if (!Number.isSafeInteger(n)) {
    throw new CurrencyError(`Not a whole number of cents: ${n}`, "NOT_INTEGER");
  }
  return n as Cents;
}

export const ZERO_CENTS = asCents(0);
```

3. `parsePHP`: return type `Cents`; change both `return cents;` to `return asCents(cents);`.
4. `parsePHPUnbounded`: return type `Cents | null`; replace the last line with:

```ts
const cents = Math.round(pesos * 100);
return Number.isSafeInteger(cents) ? asCents(cents) : null;
```

5. `parsePHPSafe`: change `{ success: true; value: number }` to `{ success: true; value: Cents }`.
6. Delete `addAmounts`, `subtractAmounts`, `multiplyAmount`, `percentageOf`, `isValidAmount`, `formatNumeric` and their JSDoc.
7. Append:

```ts
export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const value of values) total += value;
  return asCents(total);
}

export function diffCents(a: Cents, b: Cents): Cents {
  return asCents(a - b);
}

export function absCents(cents: Cents): Cents {
  return asCents(Math.abs(cents));
}

export function negateCents(cents: Cents): Cents {
  return asCents(-cents);
}

/** Rounds to the nearest cent (half up), so averages never carry fractions into formatPHP. */
export function divideCents(cents: Cents, divisor: number): Cents {
  if (!Number.isFinite(divisor) || divisor <= 0) {
    throw new RangeError(`divideCents needs a positive divisor, got ${divisor}`);
  }
  return asCents(Math.round(cents / divisor));
}

/** For Recharts tooltip/label callbacks, whose values arrive untyped. */
export function formatPHPChartValue(value: unknown): string {
  return typeof value === "number" && Number.isSafeInteger(value)
    ? formatPHP(asCents(value))
    : `${PESO_SIGN}—`;
}
```

8. In `src/lib/currency.md` and `src/lib/README.md`, delete the sections for the six removed helpers and add one line each for `Cents`/`asCents` and the new helpers (name and one-sentence purpose).

- [ ] **Step 5: Run to verify GREEN, then the gates**

Run: `npx vitest run src/lib/currency.test.ts` → PASS. Then the five gates from Global Constraints. `tsc -p tsconfig.json` must stay at 0: the parsers now return `Cents`, which is assignable everywhere a `number` was expected.

- [ ] **Step 6: Commit**

```bash
git add src/lib/currency.ts src/lib/currency.test.ts src/test/cents.ts src/lib/currency.md src/lib/README.md
git commit -m "feat(currency): branded Cents, checked asCents, and rounding cents helpers"
```

---

### Task 4: Branded rows, entities, inputs and forms

The spec's "Supabase row mappers brand with `asCents`" is replaced by a type-level brand in `AppDatabase` (see Decisions & Deferrals): every `*_cents` column and `overpayment_amount` is `Cents` on the typed client's Row, Insert, Update and RPC returns. A prototype at `a9cfcdb` confirmed supabase-js select inference still works through the mapped type.

**Files:**

- Modify: `src/types/app-database.ts`
- Modify: `src/lib/dexie/db.ts` (`LocalTransaction.amount_cents`, `LocalAccount.initial_balance_cents`, `LocalBudget.amount_cents`, and the debt/payment Local types if declared there)
- Modify: `src/types/transactions.ts` (`:66`, `:103`, `:125`), `src/types/debt.ts` (every `amount_cents`, `original_amount_cents`, and `overpayment_amount?: number` at `:189`), `src/types/pdf-import.ts:118`, `src/lib/offline/types.ts:31`, `src/lib/offline/transfers.ts` (`:24`, `:35`, `:121`), `src/lib/offline/budgets.ts` (`amountCents: number` params at `:197`, `:215`, `:281`; the local `source` array type at `:345`)
- Create: `src/lib/validations/cents.ts`
- Modify: `src/lib/validations/transaction.ts`, the debt form schemas (`src/lib/debts/validation.ts`), and any other form schema with an amount field (find with `grep -rn "amount_cents\|_cents:" src/lib/validations src/lib/debts/validation.ts src/components/**/forms`)
- Modify: `src/components/ui/currency-input.tsx` (`value?: Cents`, `onChange?: (value: Cents) => void`)
- Modify: the construction sites the brand surfaces (at `a9cfcdb`: `offline/transactions.ts:68,114,183,412`, `offline/budgets.ts:223,294,370`, `debts/reversals.ts:168,363`, `csv-importer.ts:171`, `supabaseQueries.ts:1519`, `routes/drafts.tsx:635`, `CreateExternalDebtForm.tsx:76`, `CreateInternalDebtForm.tsx:93`)
- Modify: test fixtures (about 241 errors in 22 files at `a9cfcdb`; largest `debts/__tests__/crud.test.ts` 42, `reversals.test.ts` 38, `balance.test.ts` 21)

**Interfaces:**

- Consumes: Task 3's `Cents`, `asCents`, `ZERO_CENTS`, `negateCents`, `cents()`.
- Produces: `AppDatabase` with branded cents columns; `centsSchema: z.ZodType<Cents>` from `@/lib/validations/cents`; `CurrencyInput` props `value?: Cents`, `onChange?: (value: Cents) => void`.

- [ ] **Step 1: Brand `AppDatabase`**

Replace `src/types/app-database.ts` with:

```ts
import type { Cents } from "@/lib/currency";
import type { Database } from "@/types/database.types";

type Public = Database["public"];
type NonTransferView = Public["Views"]["transactions_non_transfer"];

// Every BIGINT money column is branded where rows enter the typed client.
type CentsColumn = `${string}_cents` | "overpayment_amount";
type BrandValue<V> = V extends number ? Cents : V;
type BrandRow<R> = { [K in keyof R]: K extends CentsColumn ? BrandValue<R[K]> : R[K] };
type BrandTable<T extends { Row: unknown; Insert: unknown; Update: unknown }> = Omit<
  T,
  "Row" | "Insert" | "Update"
> & { Row: BrandRow<T["Row"]>; Insert: BrandRow<T["Insert"]>; Update: BrandRow<T["Update"]> };
type BrandReturns<R> = R extends readonly (infer E)[] ? BrandRow<E>[] : R;
type BrandFunction<F extends { Returns: unknown }> = Omit<F, "Returns"> & {
  Returns: BrandReturns<F["Returns"]>;
};

type Tables = { [T in keyof Public["Tables"]]: BrandTable<Public["Tables"][T]> };
type Functions = { [F in keyof Public["Functions"]]: BrandFunction<Public["Functions"][F]> };

/** Postgres marks every view column nullable; the view is `select * from transactions where transfer_group_id is null`, so its row is the table's row (pgTAP 210 checks column parity). */
export type AppDatabase = Omit<Database, "public"> & {
  public: Omit<Public, "Tables" | "Views" | "Functions"> & {
    Tables: Tables;
    Functions: Functions;
    Views: Omit<Public["Views"], "transactions_non_transfer"> & {
      transactions_non_transfer: {
        Row: Tables["transactions"]["Row"];
        Relationships: NonTransferView["Relationships"];
      };
    };
  };
};

type SameKeys<A, B> = [keyof A] extends [keyof B]
  ? [keyof B] extends [keyof A]
    ? true
    : false
  : false;

// Fails tsc when `transactions` gains or loses a column that the view has not been recreated to match.
export const transactionsViewKeysMatchTable: SameKeys<
  NonTransferView["Row"],
  Public["Tables"]["transactions"]["Row"]
> = true;
```

Add `src/types/__tests__/app-database.test.ts` (vitest's `expectTypeOf` is checked by `tsc`, and is a no-op at runtime):

```ts
import { expectTypeOf, it } from "vitest";
import type { Cents } from "@/lib/currency";
import type { AppDatabase } from "@/types/app-database";

type Tables = AppDatabase["public"]["Tables"];

it("brands money columns and leaves other numbers alone", () => {
  expectTypeOf<Tables["transactions"]["Row"]["amount_cents"]>().toEqualTypeOf<Cents>();
  expectTypeOf<Tables["accounts"]["Row"]["initial_balance_cents"]>().toEqualTypeOf<Cents | null>();
  expectTypeOf<
    Tables["debt_payments"]["Row"]["overpayment_amount"]
  >().toEqualTypeOf<Cents | null>();
  expectTypeOf<Tables["accounts"]["Row"]["sort_order"]>().toEqualTypeOf<number | null>();
  expectTypeOf<
    AppDatabase["public"]["Functions"]["get_account_balances"]["Returns"][number]["cleared_count"]
  >().toEqualTypeOf<number>();
});
```

Run `npx tsc --noEmit -p tsconfig.json`; expect 0 errors (nothing consumes the brand yet).

- [ ] **Step 2: Shared form field schema**

Create `src/lib/validations/cents.ts`:

```ts
import { z } from "zod";
import type { Cents } from "@/lib/currency";

/**
 * A form field already holding cents (CurrencyInput emits Cents). z.custom keeps
 * input and output types equal, which react-hook-form's resolver needs; chain
 * .refine() for sign and range.
 */
export const centsSchema = z.custom<Cents>(
  (value) => typeof value === "number" && Number.isSafeInteger(value),
  { message: "Amount must be a whole number of cents" }
);
```

In `src/lib/validations/transaction.ts` replace the `amount_cents` field with:

```ts
    amount_cents: centsSchema
      .refine((cents) => cents > 0, "Amount must be positive")
      .refine((cents) => cents <= MAX_AMOUNT_CENTS, "Amount too large"),
```

(import `centsSchema` and `MAX_AMOUNT_CENTS`). Before editing, run `grep -rn "Amount must be an integer" src` and update any test that asserts the old integer message to the new one. Apply the same field shape to each debt and budget form schema that has an amount.

- [ ] **Step 3: `CurrencyInput` emits `Cents`**

In `src/components/ui/currency-input.tsx` change the props to `value?: Cents` and `onChange?: (value: Cents) => void` (import the type). `parsePHPUnbounded` already returns `Cents | null`. Keep `formatPHP(value)` calls as they are (`formatPHP` still takes `number` here).

- [ ] **Step 4: Brand the entity and input types**

Change each listed `amount_cents: number` / `original_amount_cents: number` / `initial_balance_cents: number` / `overpayment_amount?: number` / `amountCents: number` to `Cents` (add `import type { Cents } from "@/lib/currency";`). Do not touch `TransactionFilters.amountMin/amountMax` (Task 7) or percentage and count fields.

- [ ] **Step 5: Fix production construction sites**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'error TS' | grep -vE '\.test\.tsx?|__tests__'`
Fix each by bringing a branded value to the site, never by casting:

- A value from a form, `CurrencyInput` or a parser: the type change upstream fixes it (the form's data is `Cents` once its schema uses `centsSchema`).
- `debts/reversals.ts:152` `const reversalAmount = -originalPayment.amount_cents;` → `negateCents(originalPayment.amount_cents)`. `:363` takes `newAmount` from its `Cents`-typed input.
- `csv-importer.ts:171` → `mapping.amount !== null ? parseAmountOrZero(row[mapping.amount]) : ZERO_CENTS`, and make `parseAmountOrZero` return `Cents` (`ZERO_CENTS` on failure).
- `offline/budgets.ts` and `offline/transactions.ts`: their inputs are now `Cents`; spread objects type-check once the inputs are branded. A remaining `number` from arithmetic there is the data layer, so `asCents(expr)` is allowed.
- `supabaseQueries.ts:1519`: drop the local `ServerBudgetRow` cast if the typed row now already carries `Cents`; otherwise brand with `asCents`.
- `routes/drafts.tsx:635`: `CurrencyInput`'s `onChange` now gives `Cents`, so the error clears once Step 3 lands.

Re-run until production errors are 0.

- [ ] **Step 6: Migrate test fixtures**

Run the same command without the filter and fix the test errors by wrapping literals: `amount_cents: 12345` → `amount_cents: cents(12345)`, with `import { cents } from "@/test/cents";`. For a fixture built through a typed factory, wrap once in the factory's defaults. Never use `as Cents` in tests either; `cents()` runs the integer check.

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c 'error TS'`
Expected: `0`. Then all five gates.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(currency): brand cents on typed rows, entities, inputs and forms"
```

---

### Task 5: Sync-row schemas in front of realtime writes

**Files:**

- Create: `src/lib/validations/syncRows.ts`
- Create: `src/lib/validations/__tests__/syncRows.test.ts`
- Create: `src/lib/__tests__/realtime-sync.test.ts`
- Modify: `src/lib/realtime-sync.ts` (`SyncTableName` moves to `syncRows.ts`; `handleInsert`, `handleUpdate`, `mergeRecord`)
- Modify: `src/lib/dexie/db.ts` (`LocalTransaction.created_by_user_id` and `device_id` become optional)

**Interfaces:**

- Consumes: `asCents`, `LocalTransaction`, `LocalAccount`, `LocalCategory`, `reportError(error, { subsystem, operation, extra })` from `@/lib/sentry`.
- Produces: `type SyncTableName = "transactions" | "accounts" | "categories"`; `parseSyncRow(table: SyncTableName, record: unknown): SyncRowResult` where `SyncRowResult = { ok: true; row: LocalTransaction | LocalAccount | LocalCategory } | { ok: false; issues: z.ZodIssue[] }`.

Server columns that are nullable but required locally get the column's DB default (read from `information_schema` at `a9cfcdb`): accounts `color '#3B82F6'`, `icon 'building-2'`, `currency_code 'PHP'`, `initial_balance_cents 0`, `is_active true`, `sort_order 0`, `visibility 'household'`; categories `icon 'folder'`, `is_active true`, `sort_order 0`; transactions `tagged_user_ids '{}'`. Nullable timestamps default to the Unix epoch, so a row with no `updated_at` always loses last-write-wins to a local copy. Transactions `created_by_user_id` and `device_id` are NULL in real rows (3 of each in the local dev DB), so `LocalTransaction` makes them optional; the app type follows the database (2a rule).

- [ ] **Step 1: Make the two `LocalTransaction` fields optional**

In `src/lib/dexie/db.ts` change `created_by_user_id: string;` to `created_by_user_id?: string;` and `device_id: string;` to `device_id?: string;`. Run `npx tsc --noEmit -p tsconfig.json` and fix each fallout by narrowing (skip, or fall back where the code already has a fallback), not with `!`. Record the count in the ledger.

- [ ] **Step 2: Write the failing schema tests**

`src/lib/validations/__tests__/syncRows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseSyncRow } from "@/lib/validations/syncRows";

const transactionRow = {
  id: "t1",
  household_id: "h1",
  date: "2026-10-04",
  description: "Groceries",
  amount_cents: 123456,
  type: "expense",
  currency_code: "PHP",
  account_id: null,
  category_id: "c1",
  transfer_group_id: null,
  debt_id: null,
  internal_debt_id: null,
  status: "cleared",
  visibility: "household",
  created_by_user_id: null,
  tagged_user_ids: null,
  notes: null,
  import_key: null,
  device_id: "d1",
  created_at: "2026-10-04T01:00:00Z",
  updated_at: "2026-10-04T01:00:00Z",
};

describe("parseSyncRow", () => {
  it("accepts a server transaction and normalises nulls", () => {
    const result = parseSyncRow("transactions", transactionRow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toMatchObject({ amount_cents: 123456, tagged_user_ids: [] });
    expect(result.row).not.toHaveProperty("account_id", null);
    expect("account_id" in result.row ? result.row.account_id : undefined).toBeUndefined();
    expect(
      "created_by_user_id" in result.row ? result.row.created_by_user_id : undefined
    ).toBeUndefined();
  });

  it.each([
    ["fractional amount", { amount_cents: 12.5 }],
    ["string amount", { amount_cents: "123456" }],
    ["unknown type", { type: "transfer" }],
    ["missing id", { id: undefined }],
  ])("rejects a transaction with %s", (_label, patch) => {
    const result = parseSyncRow("transactions", { ...transactionRow, ...patch });
    expect(result.ok).toBe(false);
  });

  it("fills account defaults for nullable columns", () => {
    const result = parseSyncRow("accounts", {
      id: "a1",
      household_id: "h1",
      name: "Wallet",
      type: "cash",
      initial_balance_cents: null,
      currency_code: null,
      visibility: null,
      owner_user_id: null,
      color: null,
      icon: null,
      sort_order: null,
      is_active: null,
      created_at: null,
      updated_at: "2026-10-04T01:00:00Z",
    });
    expect(result).toEqual({
      ok: true,
      row: {
        id: "a1",
        household_id: "h1",
        name: "Wallet",
        type: "cash",
        initial_balance_cents: 0,
        currency_code: "PHP",
        visibility: "household",
        owner_user_id: undefined,
        color: "#3B82F6",
        icon: "building-2",
        sort_order: 0,
        is_active: true,
        created_at: "1970-01-01T00:00:00.000Z",
        updated_at: "2026-10-04T01:00:00Z",
      },
    });
  });

  it("accepts a category with a null parent", () => {
    const result = parseSyncRow("categories", {
      id: "c1",
      household_id: "h1",
      parent_id: null,
      name: "Food",
      color: "#22C55E",
      icon: null,
      sort_order: null,
      is_active: null,
      created_at: null,
      updated_at: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toMatchObject({ icon: "folder", updated_at: "1970-01-01T00:00:00.000Z" });
  });
});
```

Run: `npx vitest run src/lib/validations/__tests__/syncRows.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `syncRows.ts`**

```ts
import { z } from "zod";
import { asCents } from "@/lib/currency";
import type { LocalAccount, LocalCategory, LocalTransaction } from "@/lib/dexie/db";

export type SyncTableName = "transactions" | "accounts" | "categories";

const EPOCH = "1970-01-01T00:00:00.000Z";

const centsValue = z
  .number()
  .refine(Number.isSafeInteger, "Expected whole cents")
  .transform(asCents);
const optionalText = z
  .string()
  .nullish()
  .transform((value) => value ?? undefined);
const timestamp = z
  .string()
  .nullish()
  .transform((value) => value ?? EPOCH);
const visibility = z
  .enum(["household", "personal"])
  .nullish()
  .transform((value) => value ?? "household");
const isActive = z
  .boolean()
  .nullish()
  .transform((value) => value ?? true);
const sortOrder = z
  .number()
  .int()
  .nullish()
  .transform((value) => value ?? 0);

export const transactionRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  amount_cents: centsValue,
  type: z.enum(["income", "expense"]),
  currency_code: z.string(),
  account_id: optionalText,
  category_id: optionalText,
  transfer_group_id: optionalText,
  debt_id: optionalText,
  internal_debt_id: optionalText,
  status: z.enum(["pending", "cleared"]),
  visibility: z.enum(["household", "personal"]),
  created_by_user_id: optionalText,
  tagged_user_ids: z
    .array(z.string())
    .nullish()
    .transform((value) => value ?? []),
  notes: optionalText,
  import_key: optionalText,
  device_id: optionalText,
  created_at: z.string(),
  updated_at: z.string(),
}) satisfies z.ZodType<LocalTransaction, z.ZodTypeDef, unknown>;

export const accountRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  name: z.string(),
  type: z.enum(["bank", "investment", "credit_card", "cash", "e-wallet"]),
  initial_balance_cents: z
    .number()
    .nullish()
    .transform((value) => value ?? 0)
    .pipe(centsValue),
  currency_code: z
    .string()
    .nullish()
    .transform((value) => value ?? "PHP"),
  visibility,
  owner_user_id: optionalText,
  color: z
    .string()
    .nullish()
    .transform((value) => value ?? "#3B82F6"),
  icon: z
    .string()
    .nullish()
    .transform((value) => value ?? "building-2"),
  sort_order: sortOrder,
  is_active: isActive,
  created_at: timestamp,
  updated_at: timestamp,
}) satisfies z.ZodType<LocalAccount, z.ZodTypeDef, unknown>;

export const categoryRowSchema = z.object({
  id: z.string(),
  household_id: z.string(),
  parent_id: optionalText,
  name: z.string(),
  color: z.string(),
  icon: z
    .string()
    .nullish()
    .transform((value) => value ?? "folder"),
  sort_order: sortOrder,
  is_active: isActive,
  created_at: timestamp,
  updated_at: timestamp,
}) satisfies z.ZodType<LocalCategory, z.ZodTypeDef, unknown>;

export type SyncRowResult =
  | { ok: true; row: LocalTransaction | LocalAccount | LocalCategory }
  | { ok: false; issues: z.ZodIssue[] };

const schemas = {
  transactions: transactionRowSchema,
  accounts: accountRowSchema,
  categories: categoryRowSchema,
} as const;

export function parseSyncRow(table: SyncTableName, record: unknown): SyncRowResult {
  const result = schemas[table].safeParse(record);
  return result.success
    ? { ok: true, row: result.data }
    : { ok: false, issues: result.error.issues };
}
```

If `satisfies` reports a mismatch, the Local type and the schema disagree. Fix the schema to match the Local type (or, where the database allows NULL, make the Local field optional as in Step 1), never by widening with `.passthrough()`.

Run: `npx vitest run src/lib/validations/__tests__/syncRows.test.ts` → PASS.

- [ ] **Step 4: Write the failing realtime integration test**

`src/lib/__tests__/realtime-sync.test.ts` drives the real `RealtimeSync` through a fake channel and the real Dexie (fake-indexeddb via `src/test/setup.ts`):

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChangeHandler = (payload: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}) => Promise<void>;

const handlers = new Map<string, ChangeHandler>();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    channel: (name: string) => {
      const channel = {
        on: (_event: string, _filter: unknown, handler: ChangeHandler) => {
          handlers.set(name.replace("-changes", ""), handler);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/lib/dexie/deviceManager", () => ({
  getDeviceId: vi.fn().mockResolvedValue("this-device"),
}));
vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));

import { db } from "@/lib/dexie/db";
import { RealtimeSync } from "@/lib/realtime-sync";
import { reportError } from "@/lib/sentry";

const serverTransaction = {
  id: "t-remote",
  household_id: "h1",
  date: "2026-10-04",
  description: "Remote",
  amount_cents: 5000,
  type: "expense",
  currency_code: "PHP",
  account_id: null,
  category_id: null,
  transfer_group_id: null,
  debt_id: null,
  internal_debt_id: null,
  status: "cleared",
  visibility: "household",
  created_by_user_id: null,
  tagged_user_ids: null,
  notes: null,
  import_key: null,
  device_id: "other-device",
  created_at: "2026-10-04T01:00:00Z",
  updated_at: "2026-10-04T01:00:00Z",
};

describe("RealtimeSync row validation", () => {
  beforeEach(async () => {
    handlers.clear();
    vi.mocked(reportError).mockClear();
    await db.transactions.clear();
    await new RealtimeSync().initialize();
  });

  it("writes a valid INSERT with nulls normalised", async () => {
    await handlers.get("transactions")?.({ eventType: "INSERT", new: serverTransaction, old: {} });
    const stored = await db.transactions.get("t-remote");
    expect(stored).toMatchObject({ amount_cents: 5000, tagged_user_ids: [] });
    expect(stored?.account_id).toBeUndefined();
  });

  it("skips and reports an INSERT that fails its schema", async () => {
    await handlers.get("transactions")?.({
      eventType: "INSERT",
      new: { ...serverTransaction, amount_cents: 12.5 },
      old: {},
    });
    expect(await db.transactions.get("t-remote")).toBeUndefined();
    expect(reportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ subsystem: "realtime-sync", operation: "invalid-row:transactions" })
    );
  });

  it("skips an UPDATE that fails its schema and keeps the local row", async () => {
    await handlers.get("transactions")?.({ eventType: "INSERT", new: serverTransaction, old: {} });
    await handlers.get("transactions")?.({
      eventType: "UPDATE",
      new: { ...serverTransaction, amount_cents: "9999", updated_at: "2026-10-05T00:00:00Z" },
      old: {},
    });
    expect((await db.transactions.get("t-remote"))?.amount_cents).toBe(5000);
  });
});
```

Adjust the mock's `channel` shape to what `subscribeToTable` and `cleanup` call (read `realtime-sync.ts:229-270` and the cleanup method). Run → FAIL (the bad row is written today).

- [ ] **Step 5: Wire `parseSyncRow` into the three write paths**

In `src/lib/realtime-sync.ts`:

- Replace the local `type SyncTableName = ...` with `import { parseSyncRow, type SyncTableName } from "@/lib/validations/syncRows";` and `import type { ZodIssue } from "zod";`.
- Add a private method:

```ts
  private reportInvalidRow(tableName: SyncTableName, record: Record<string, unknown>, issues: ZodIssue[]) {
    console.warn(`[RealtimeSync] Skipped invalid ${tableName} row ${String(record.id)}`, issues);
    reportError(new Error(`Invalid ${tableName} row from server`), {
      subsystem: "realtime-sync",
      operation: `invalid-row:${tableName}`,
      extra: { id: record.id, issues },
    });
  }
```

- In `handleInsert`, `handleUpdate` and `mergeRecord`, parse first and write the parsed row:

```ts
const parsed = parseSyncRow(tableName, record);
if (!parsed.ok) {
  this.reportInvalidRow(tableName, record, parsed.issues);
  return;
}
```

then use `parsed.row` in place of `record`/`newRecord` for `table.add(...)`, `table.put(...)`, and for the `updated_at` comparison. `handleDelete` is unchanged (DELETE payloads carry only the key).

- In `fetchMissedChanges`, `maxSeen` keeps updating from the raw `record.updated_at` after `mergeRecord` returns. That is the "skip and still advance" decision: a bad row cannot hold the cursor.

Run the integration test → PASS, then all five gates.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validations/syncRows.ts src/lib/validations/__tests__/syncRows.test.ts \
  src/lib/__tests__/realtime-sync.test.ts src/lib/realtime-sync.ts src/lib/dexie/db.ts
git add -u src
git commit -m "feat(sync): validate realtime and catch-up rows before they reach Dexie"
```

---

### Task 6: RPC result schemas

**Files:**

- Create: `src/lib/validations/rpcResults.ts`
- Create: `src/lib/validations/__tests__/rpcResults.test.ts`
- Modify: `src/lib/supabaseQueries.ts` (remove `AccountBalanceDeltaRow` and `TransactionsFilterSummaryRow`; parse at `:233`, `:295`, `:670`, `:1288`)

**Interfaces:**

- Consumes: `asCents`, `Cents`.
- Produces: `parseAccountBalanceDeltas(data: unknown): AccountBalanceDelta[]` and `parseTransactionsFilterSummary(data: unknown): TransactionsFilterSummaryRow`, where `AccountBalanceDelta = { account_id: string; cleared_delta_cents: Cents; pending_delta_cents: Cents; cleared_count: number; pending_count: number }` and `TransactionsFilterSummaryRow = { txn_count: number; total_in_cents: Cents; total_out_cents: Cents }`. Both throw a `ZodError` on a malformed payload.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  parseAccountBalanceDeltas,
  parseTransactionsFilterSummary,
} from "@/lib/validations/rpcResults";

describe("parseAccountBalanceDeltas", () => {
  it("accepts signed deltas (live local shape)", () => {
    const rows = parseAccountBalanceDeltas([
      {
        account_id: "a1",
        cleared_delta_cents: 4954950,
        pending_delta_cents: -2500,
        cleared_count: 2,
        pending_count: 1,
      },
    ]);
    expect(rows[0]?.pending_delta_cents).toBe(-2500);
  });

  it("treats null data as no rows", () => {
    expect(parseAccountBalanceDeltas(null)).toEqual([]);
  });

  it("rejects fractional cents", () => {
    expect(() =>
      parseAccountBalanceDeltas([
        {
          account_id: "a1",
          cleared_delta_cents: 1.5,
          pending_delta_cents: 0,
          cleared_count: 0,
          pending_count: 0,
        },
      ])
    ).toThrow(ZodError);
  });
});

describe("parseTransactionsFilterSummary", () => {
  it("takes the single row and defaults an empty result to zeros", () => {
    expect(
      parseTransactionsFilterSummary([{ txn_count: 3, total_in_cents: 100, total_out_cents: 250 }])
    ).toEqual({
      txn_count: 3,
      total_in_cents: 100,
      total_out_cents: 250,
    });
    expect(parseTransactionsFilterSummary([])).toEqual({
      txn_count: 0,
      total_in_cents: 0,
      total_out_cents: 0,
    });
  });

  it("rejects a string total", () => {
    expect(() =>
      parseTransactionsFilterSummary([{ txn_count: 1, total_in_cents: "100", total_out_cents: 0 }])
    ).toThrow(ZodError);
  });
});
```

Run → FAIL (module missing).

- [ ] **Step 2: Implement `rpcResults.ts`**

```ts
import { z } from "zod";
import { asCents } from "@/lib/currency";

// BIGINT RPC columns arrive as JSON numbers (verified on the local stack, 2026-10-04).
const centsValue = z
  .number()
  .refine(Number.isSafeInteger, "Expected whole cents")
  .transform(asCents);
const count = z.number().int().nonnegative();

const accountBalanceDeltaSchema = z.object({
  account_id: z.string(),
  cleared_delta_cents: centsValue,
  pending_delta_cents: centsValue,
  cleared_count: count,
  pending_count: count,
});

const filterSummarySchema = z.object({
  txn_count: count,
  total_in_cents: centsValue,
  total_out_cents: centsValue,
});

export type AccountBalanceDelta = z.output<typeof accountBalanceDeltaSchema>;
export type TransactionsFilterSummaryRow = z.output<typeof filterSummarySchema>;

export function parseAccountBalanceDeltas(data: unknown): AccountBalanceDelta[] {
  return z.array(accountBalanceDeltaSchema).parse(data ?? []);
}

export function parseTransactionsFilterSummary(data: unknown): TransactionsFilterSummaryRow {
  const rows = z.array(filterSummarySchema).parse(data ?? []);
  return (
    rows[0] ?? filterSummarySchema.parse({ txn_count: 0, total_in_cents: 0, total_out_cents: 0 })
  );
}
```

Run → PASS.

- [ ] **Step 3: Use them in `supabaseQueries.ts`**

- Delete `interface AccountBalanceDeltaRow` and `interface TransactionsFilterSummaryRow`. Type `EMPTY_BALANCE_DELTA` as `Omit<AccountBalanceDelta, "account_id">` with `ZERO_CENTS` for the two delta fields.
- `:233` `const deltas = parseAccountBalanceDeltas(deltasResult.data);`
- `:295` `new Map(parseAccountBalanceDeltas(deltaRows).map((d) => [d.account_id, d]))`
- `:1288` `const balanceDeltas = parseAccountBalanceDeltas(balanceDeltasResult.data);`
- `:670-676` becomes:

```ts
const row = parseTransactionsFilterSummary(data);
return {
  count: row.txn_count,
  totalInCents: row.total_in_cents,
  totalOutCents: row.total_out_cents,
};
```

A `ZodError` is not a network error, so `isLikelyNetworkError` is false and it rethrows, which is the existing "non-network failures must be loud" path. `grep -n "as AccountBalanceDeltaRow\|as TransactionsFilterSummaryRow\|Number(row" src/lib/supabaseQueries.ts` must print nothing.

Run all five gates; existing `supabaseQueries` tests that mock RPC data with strings (if any) must be updated to the real JSON-number shape.

- [ ] **Step 4: Commit**

```bash
git add src/lib/validations/rpcResults.ts src/lib/validations/__tests__/rpcResults.test.ts src/lib/supabaseQueries.ts
git add -u src
git commit -m "feat(queries): parse RPC results with Zod instead of casting"
```

---

### Task 7: Branded producers; `formatPHP` takes `Cents`

Every displayed total must be produced as `Cents` by the data layer or derived with the Task 3 helpers. `formatPHP` stays `number` until the last step, so each domain commit is green; a scratch script measures what is left.

**Files (by domain; line numbers at `a9cfcdb`):**

- Accounts: `supabaseQueries.ts:151-154` (`AccountBalance`), `components/AccountBalance.tsx:6-8`, `AccountBalanceCard.tsx:15-17`, `accounts/AccountDetailPane.tsx:14-16,42`, `accounts/AccountListItem.tsx:7`, `routes/accounts/$accountId.tsx:97`
- Dashboard: `supabaseQueries.ts:1171-1194`, `offline/aggregates.ts:31-53`, `dashboard/SummaryCards.tsx:7-11`, `dashboard/MonthlyChart.tsx:17-25`, `dashboard/CategoryChart.tsx:14,24`, `dashboard/DashboardRail.tsx:8`, `dashboard/RecentTransactions.tsx:75`; the `!` at `supabaseQueries.ts:1355-1356`
- Analytics: `supabaseQueries.ts:790-799` (`AnalyticsTransactionRow`), `hooks/useAnalytics.ts:16-70` (money fields only; `percentChange` stays `number`), `processInsights` (`:358`), `analytics/AnalyticsDashboard.tsx:81-104`, `analytics/CategoryAnalyticsContent.tsx:76`, `analytics/InsightsSection.tsx:7-15`, `routes/analytics/categories.tsx:76`, `charts/YearOverYearChart.tsx:48-85`, `charts/BudgetProgressChart.tsx:8-10,64-84`
- Budgets and category totals: `supabaseQueries.ts:925-938,1436-1450`, `budgets/BudgetProgress.tsx:6-7`, `budgets/BudgetProgressBar.tsx:90-95`, `budgets/BudgetList.tsx:37`, `CategoryTotalCard.tsx:10-11`, `CategoryTotalsGroup.tsx:23`; the `!` at `supabaseQueries.ts:1040` and `:1616`
- Debts: `lib/debts/balance.ts` (return `Cents`), `debts/DebtBalanceDisplay.tsx:6`, `debts/DebtList.tsx:8`, `debts/DebtCard.tsx:15`, `debts/PaymentHistoryList.tsx:85,100`, `debts/forms/EditExternalDebtForm.tsx:113`, `TransactionFormDialog.tsx:449-501` (also replaces its two `balanceAfterPayment!`)
- Transactions: `lib/offline/reads.ts:319-320`, the `TransactionsFilterSummary` type, `transactions/TransactionDetailPane.tsx:8-9`, `routes/transactions.tsx:160-163`, `types/transactions.ts:152-153` with `validations/transactionsSearch.ts` (`optionalCents` transforms with `asCents`), `TransactionFilters.tsx:60-63`, `TransactionList.tsx:685,867`, `transfers/TransferList.tsx:57`, `routes/drafts.tsx:361,547`, `ui/currency-input.tsx:39-64`

**Interfaces:**

- Consumes: `Cents`, `ZERO_CENTS`, `sumCents`, `diffCents`, `absCents`, `divideCents`, `formatPHPChartValue`; `asCents` only inside `src/lib/{supabaseQueries.ts,offline/**,debts/**,validations/**}`.
- Produces: every money field on the listed interfaces typed `Cents`; `processInsights` exported from `useAnalytics.ts` for its test; `formatPHP(cents: Cents)`, `formatPHPAxisTick(cents: Cents)`.

Rewrite rules (apply them at every site; no casts):

| Pattern                                        | Becomes                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `rows.reduce((s, r) => s + r.amount_cents, 0)` | `sumCents(rows.map((r) => r.amount_cents))`                                                                |
| `a + b + c` of cents                           | `sumCents([a, b, c])`                                                                                      |
| `x += amount` on an accumulator                | accumulate into a `Cents` with `x = sumCents([x, amount])`, or collect values and `sumCents` once          |
| `a - b`                                        | `diffCents(a, b)`                                                                                          |
| `Math.abs(x)`                                  | `absCents(x)`                                                                                              |
| `x / n` for display                            | `divideCents(x, n)`                                                                                        |
| `0` as a money default                         | `ZERO_CENTS`                                                                                               |
| `Map<string, number>` of cents                 | `Map<string, Cents>`                                                                                       |
| Recharts `formatter`/`labelFormatter` callback | `formatPHPChartValue(value)`                                                                               |
| `map.get(key)!` after a `has` check            | `const group = map.get(key) ?? createGroup(); map.set(key, group);` (or the existing `if (!group) return`) |

- [ ] **Step 1: Measurement script**

Write `$SCRATCH/count-format.sh`:

```bash
#!/bin/bash
# Count tsc errors with formatPHP/formatPHPAxisTick taking Cents, then restore currency.ts.
set -u
f=src/lib/currency.ts
cp "$f" "$SCRATCH/currency.ts.bak"
sed -i '' -e 's/export function formatPHP(cents: number)/export function formatPHP(cents: Cents)/' \
  -e 's/export function formatPHPAxisTick(cents: number)/export function formatPHPAxisTick(cents: Cents)/' "$f"
npx tsc --noEmit -p tsconfig.json 2>&1 | grep 'error TS' > "$SCRATCH/format-errors.txt"
cp "$SCRATCH/currency.ts.bak" "$f"
echo "errors: $(grep -c . "$SCRATCH/format-errors.txt")"
cut -d'(' -f1 "$SCRATCH/format-errors.txt" | sort | uniq -c | sort -rn
```

Run it (`SCRATCH=<path> bash $SCRATCH/count-format.sh`) and record the starting count in the ledger. `git diff --quiet src/lib/currency.ts` must be true afterwards.

- [ ] **Step 2: Analytics, test first**

Export `processInsights` from `src/hooks/useAnalytics.ts` and add `src/hooks/__tests__/processInsights.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { processInsights } from "@/hooks/useAnalytics";
import type { AnalyticsTransactionRow } from "@/lib/supabaseQueries";
import { cents } from "@/test/cents";

const expense = (id: string, amount: number): AnalyticsTransactionRow => ({
  id,
  date: "2026-09-01",
  type: "expense",
  amount_cents: cents(amount),
  category_id: "c1",
  account_id: "a1",
  description: id,
  categories: { name: "Food" },
});

describe("processInsights", () => {
  it("average monthly spending is whole cents (was a fraction before 2b)", () => {
    const insights = processInsights(
      [expense("a", 100000), expense("b", 1)],
      new Date(2026, 6, 1),
      new Date(2026, 8, 30)
    );
    expect(Number.isInteger(insights.avgMonthlySpending)).toBe(true);
    expect(insights.avgMonthlySpending).toBe(33334); // 100001 / 3, rounded
  });
});
```

`AnalyticsTransactionRow.amount_cents` (`supabaseQueries.ts:794`) becomes `Cents` in this step. Run → FAIL (the result is `33333.67`). Then set `avgMonthlySpending = divideCents(sumCents(expenses.map((t) => t.amount_cents)), monthCount)`, brand the rest of the analytics domain using the rewrite rules, run the test → PASS, run the gates, and commit `fix(analytics): average monthly spending rounds to whole cents`.

- [ ] **Step 3: One commit per remaining domain**

For each of Accounts, Dashboard, Budgets and category totals, Debts, Transactions: change the producer and prop types to `Cents`, apply the rewrite rules, replace the listed `!` with guards, run the five gates, re-run `count-format.sh` (the domain's files must no longer appear), and commit as `refactor(<domain>): money totals are branded Cents`.

- [ ] **Step 4: Flip `formatPHP`**

Change `formatPHP(cents: number)` → `formatPHP(cents: Cents)` and `formatPHPAxisTick(cents: number)` → `formatPHPAxisTick(cents: Cents)` in `src/lib/currency.ts`. Inside `currency.ts`, `parsePHP`'s error messages call `formatPHP(cents)` on a raw number: wrap them as `formatPHP(asCents(cents))`. Run `npx tsc --noEmit -p tsconfig.json`: 0 errors (anything left is a missed site; fix it with the rules). Run all five gates and `npm run build && npm run size`.

- [ ] **Step 5: Commit**

```bash
git add -u src
git commit -m "feat(currency): formatPHP accepts only branded Cents"
```

---

### Task 8: `asCents` import restriction

**Files:**

- Modify: `eslint.config.js`
- Modify: `src/lib/__tests__/architecture-lint.test.ts`

**Interfaces:**

- Consumes: the existing `no-restricted-imports` block for `src/routes/**` and `src/components/**` (supabase import ban), and `srcTestFiles`.
- Produces: `asCents` importable only from `src/lib/currency.ts`, `src/lib/validations/**`, `src/lib/supabaseQueries.ts`, `src/lib/offline/**`, `src/lib/debts/**`, `src/lib/realtime-sync.ts`, and test files.

Flat config does not merge rule options: a second `no-restricted-imports` block matching `src/components/**` would replace the supabase ban there. The `asCents` pattern is therefore one shared constant, added to the existing block and to a new block for the rest of `src/`.

- [ ] **Step 1: Write the failing lint tests**

Append to `cases` in `architecture-lint.test.ts`:

```ts
  {
    rule: "no-restricted-imports",
    code: 'import { asCents } from "@/lib/currency";\nexport const total = asCents(1);\n',
    flagged: "src/hooks/probe.ts",
    allowed: "src/lib/offline/probe.ts",
  },
```

and add after the `describe.each`:

```ts
it("components keep both import bans (supabase and asCents)", async () => {
  const [result] = await eslint.lintText(
    'import { supabase } from "@/lib/supabase";\nimport { asCents } from "@/lib/currency";\nexport { supabase, asCents };\n',
    { filePath: "src/components/probe.tsx" }
  );
  const messages = (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-imports");
  expect(messages).toHaveLength(2);
});

it("formatPHP and the helpers stay importable everywhere", async () => {
  expect(
    await ruleIds(
      'import { formatPHP, sumCents } from "@/lib/currency";\nexport { formatPHP, sumCents };\n',
      "src/components/probe.tsx"
    )
  ).not.toContain("no-restricted-imports");
});
```

Run: `npx vitest run src/lib/__tests__/architecture-lint.test.ts` → FAIL.

- [ ] **Step 2: Configure**

In `eslint.config.js`, next to `srcTestFiles`:

```js
// The raw number → Cents constructor stays in the data layer (roadmap 4.4).
const restrictAsCents = {
  group: ["@/lib/currency", "**/lib/currency", "**/lib/currency.ts", "./currency", "../currency"],
  importNames: ["asCents"],
  message:
    "Derive money with the @/lib/currency helpers (sumCents, diffCents, absCents, divideCents, ZERO_CENTS) or a schema in src/lib/validations. asCents is for the data layer only.",
};

const asCentsAllowed = [
  "src/lib/currency.ts",
  "src/lib/validations/**",
  "src/lib/supabaseQueries.ts",
  "src/lib/offline/**",
  "src/lib/debts/**",
  "src/lib/realtime-sync.ts",
];
```

Add `restrictAsCents` to the existing routes/components block's `patterns` array (after the supabase entry). Then add a new block before `prettier`:

```js
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...srcTestFiles, ...asCentsAllowed, "src/routes/**", "src/components/**"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [restrictAsCents] }],
    },
  },
```

- [ ] **Step 3: Verify**

Run: `npx vitest run src/lib/__tests__/architecture-lint.test.ts` → PASS. `npm run lint` → 0 errors, 0 warnings (any hit is a Task 7 miss; fix it with a helper, not a disable). Then the other gates.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js src/lib/__tests__/architecture-lint.test.ts
git commit -m "build(lint): asCents is importable only from the data layer"
```

---

### Task 9: Reversal `payment_date` uses the local date

**Files:**

- Modify: `src/lib/debts/reversals.ts:169`
- Modify: `src/lib/debts/__tests__/reversals.test.ts`

**Interfaces:**

- Consumes: `format` from `date-fns`.
- Produces: reversal rows whose `payment_date` is the device's local calendar date.

- [ ] **Step 1: Write the failing test**

Add inside `describe("reverseDebtPayment")` in `reversals.test.ts` (same setup as its first test):

```ts
it("dates a reversal with the local calendar day, not the UTC day", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 4, 7, 30)); // 07:30 local; in Asia/Manila this is 2026-10-03 in UTC
  try {
    const debt = await createExternalDebt({
      name: "Date Debt",
      original_amount_cents: cents(100000),
      household_id: "h1",
    });
    const payment = await processDebtPayment({
      transaction_id: "txn-date",
      amount_cents: cents(50000),
      payment_date: "2026-10-01",
      debt_id: debt.id,
      household_id: "h1",
    });
    const result = await reverseDebtPayment({ payment_id: payment.payment.id });
    expect(result.reversal.payment_date).toBe("2026-10-04");
  } finally {
    vi.useRealTimers();
  }
});
```

(`cents` is imported from `@/test/cents` since Task 4.) The test fails only where the local offset is ahead of UTC, so run it with `TZ=Asia/Manila`:

Run: `TZ=Asia/Manila npx vitest run src/lib/debts/__tests__/reversals.test.ts -t "local calendar day"`
Expected: FAIL with `"2026-10-03"`. If `toFake: ["Date"]` breaks the file's async Dexie setup, fake only around the reversal call, as written.

- [ ] **Step 2: Fix**

```ts
    payment_date: format(new Date(), "yyyy-MM-dd"), // local calendar date (DATE column)
```

with `import { format } from "date-fns";`. Re-run under `TZ=Asia/Manila` → PASS, then the default-TZ full suite and the gates.

- [ ] **Step 3: Commit**

```bash
git add src/lib/debts/reversals.ts src/lib/debts/__tests__/reversals.test.ts
git commit -m "fix(debts): reversal payment_date is the local calendar date"
```

---

### Task 10: Acceptance and docs

- [x] **Step 1: Gates and measurements**

Run and record each result in this plan's "Acceptance results":

```bash
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.tests.json && npx tsc --noEmit -p tsconfig.strict.json
npm run lint
npx vitest run
npm run build && npm run size
npm audit --omit=dev --audit-level=high
PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke
grep -rn "as Cents" src | grep -v "src/lib/currency.ts"          # expect nothing
grep -rnE "\b(addAmounts|subtractAmounts|multiplyAmount|percentageOf|formatNumeric|isValidAmount)\b" src   # expect nothing
```

- [x] **Step 2: Full chromium E2E against the baseline**

Run the full chromium suite (`PW_TEST_HTML_REPORT_OPEN=never npx playwright test --project=chromium` after `npm run build`, or the repo's `test:e2e` script) and compare per test with `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt`. A spec passing in the baseline and failing here is a regression to fix. `settings.spec.ts` export tests may flip between skipped and passed (CLAUDE.md).

- [x] **Step 3: Screenshot pass**

With `npm run dev` and the acceptance user (`test@example.com`), capture and Read each screenshot, and state what it shows:

1. Analytics: Avg. Monthly Spending shows exactly two decimals.
2. Dashboard: summary cards, monthly chart with a tooltip hovered, category chart.
3. Accounts: list balances and an account detail (cleared and pending lines).
4. Debts: a debt with a payment and a reversal (reversal row and balance).
5. Transactions: header In/Out totals with an amount filter applied (the filter chip shows pesos).

- [x] **Step 4: Docs**

- CLAUDE.md "Money is integer cents" rule: add "typed `Cents` (`src/lib/currency.ts`); derive totals with `sumCents`/`diffCents`/`divideCents`; `asCents` only in the data layer".
- Roadmap: check off the Phase 2 items for 4.2 and 4.4 with the merge SHA; Resume state bullet for 2b done and "Next: 2c brainstorm".
- This plan: Progress checkboxes, "Acceptance results", and any new entries in Decisions & Deferrals.

Commit `docs(plans): Phase 2b acceptance results, decisions, roadmap state`.

- [ ] **Step 5: Finish the branch**

Use superpowers:finishing-a-development-branch. No migrations ship in 2b, so there is no deploy gate; the user pushes `main` with `! git push origin main`.

## Acceptance results

Measured 2026-10-04 at `df42f9d` (docs-only commits after it). Full log: `.superpowers/sdd/task-10-report.md`.

- tsc: `tsconfig.json`, `tsconfig.tests.json`, `tsconfig.strict.json` all exit 0.
- `npm run lint`: exit 0, no errors or warnings (only the pre-existing `eslint-env` notice for `scripts/generate-icons.js`).
- `npx vitest run`: exit 0, 84 files / 1072 tests passed.
- `npm run build`: exit 0. `npm run size`: 353.8 KB gz of the 355 KB budget (352.6 before 2b).
- `npm audit --omit=dev --audit-level=high`: exit 0, 0 vulnerabilities.
- Chromium smoke (`npm run test:e2e:smoke`): exit 0, 11/11 passed.
- `grep "as Cents"` outside `currency.ts`: one hit, the prose heading "Amount Stored as Cents" in `src/components/budgets/README.md:593`; no code. Dead-helper grep: no hits.
- Full chromium E2E: 37 passed / 32 failed / 25 skipped vs the baseline's 37/33/24. Per test, the only differences are in the serial `settings.spec.ts`: "export transactions CSV" failed in the baseline and passes now, and "export accounts CSV" passed in the baseline and is skipped now (the documented flip). No spec that passes in the baseline fails here.
- Screenshots (dev server, `test@example.com`, data created through the UI except the debt): Avg. Monthly Spending reads ₱1,976.22 (₱13,833.52 over May 1 to Oct 31, divided by 7); dashboard cards ₱100,000.00 / ₱13,234.57 / ₱86,765.43 / ₱148,024.49 with the Oct tooltip showing "Income: ₱100,000.00, Expenses: ₱13,234.57"; BPI Savings ₱97,999.99 with "Cleared ₱53,333.34 · Pending ₱44,666.65"; a ₱50,000.00 debt with a ₱2,500.00 payment and a reversed ₱1,200.00 payment shows Balance ₱47,500.00 in the transaction form, and its Dexie reversal row is -120000 cents dated 2026-10-04 (local) linked by `reverses_payment_id`; the transactions amount filter round-trips as `amountMin=100000&amountMax=500000` and reloads as ₱1,000.00 / ₱5,000.00 with header Out ₱13,234.57.
- Pre-existing issues seen during acceptance (not caused by 2b; see Decisions & Deferrals): debts have no route or creation UI; debt ids are `nanoid()`, so debt rows and debt-linked transactions never sync (server `debt_id` is `uuid`, and debt events send `actor_user_id`, which the `debts`/`debt_payments` tables lack: PGRST204); the transaction form lists debts by `household_id === user.id`; dev-mode realtime init logs "cannot add `postgres_changes` callbacks ... after `subscribe()`" (same on `main`).

## Decisions & Deferrals

- **`AppDatabase` brands money columns at the type level instead of `asCents` in each row mapper (decided 2026-10-04, while planning).** Why: it covers every typed `select` and RPC without per-site code, and a prototype at `a9cfcdb` showed supabase-js inference survives the mapped type (365 errors vs 366, `supabaseQueries.ts` 2 → 1). PostgREST serialises BIGINT as a JSON integer, so a type-level brand is sound for typed reads; runtime checks stay where data is untyped (realtime payloads, RPC results). Revisit: if a column ending in `_cents` is ever not integer cents.
- **Six dead helpers are deleted, not branded (decided 2026-10-04).** `addAmounts`, `subtractAmounts`, `multiplyAmount`, `percentageOf`, `isValidAmount`, `formatNumeric` had no callers outside `currency.test.ts`, and the first two threw above the per-transaction max and on negatives, which would break totals. This supersedes the spec's `formatNumeric(cents: Cents)` line. Revisit: never.
- **`ZERO_CENTS` and `diffCents`/`absCents` added to the helper family (decided 2026-10-04).** Why: the CSV importer's `0` fallback and the over/under-budget and net-income displays need them outside the `asCents` allow-list. Revisit: never.
- **`LocalTransaction.created_by_user_id` and `device_id` become optional (decided 2026-10-04).** Why: both columns are nullable and NULL in real rows (3 each in the local dev DB); a strict sync schema would otherwise skip them. The app type follows the database (2a rule). Revisit: if a migration makes them NOT NULL.
- **The four `supabaseQueries.ts` `!` and the two in `TransactionFormDialog.tsx` are fixed inside Task 7's domain commits**, since those lines are rewritten for `Cents` anyway. Revisit: never.
- **The `accounts_update` owner pin is defense in depth, not a live fix (found in Task 1, 2026-10-04).** The `valid_ownership` CHECK (household ⇔ owner NULL, personal ⇔ owner NOT NULL) already existed, and Postgres applies `accounts_select` to the new row on UPDATE, so the two `throws_ok` assertions passed before the migration (only `hasnt_function` was RED). The planning-time deferral about NULL-owner personal accounts was wrong (`valid_ownership` forbids them) and is removed. The pin still ships: it states the rule in the policy instead of relying on two other mechanisms. Revisit: never.
- **Avg. Monthly Spending month count stays as is in 2b (found in Task 7, 2026-10-04; open for the user).** `useAnalytics` counts months as `ceil(differenceInDays / 30)`, which gives 4 for a Jul 1 to Sep 30 quarter (and 7 for May 1 to Oct 31), so the average reads about 25% low. Pre-existing; 2b only made the division round to whole cents. The `processInsights` test uses Sep 29 as its end date because of it. Recommended: count calendar months with `differenceInCalendarMonths(end, start) + 1` in a separate fix. Revisit: when the user decides.
- **Bundle headroom is 1.2 KB (measured 2026-10-04).** `npm run size` reads 353.8 KB gz against the 355 KB budget, up from 352.6 before 2b. Revisit: before 2c adds eager code, or if the budget check fails.
- **`formatPHPAxisTick(cents: Cents)` receives Recharts `any` ticks, so the brand is unchecked there (accepted 2026-10-04).** Harmless: it formats only, with no `asCents` inside. Revisit: if Recharts types its tick formatter, or a tick ever comes from a non-cents axis.
- **Debt sync defects found in acceptance are out of 2b scope (found 2026-10-04).** Debts have no route or creation UI; ids are `nanoid()` rather than `crypto.randomUUID()`, so debt rows and debt-linked transactions never reach the server (`debt_id` is `uuid`); debt event payloads send `actor_user_id`, which `debts`/`debt_payments` lack (PGRST204); `TransactionFormDialog` lists debts by `household_id === user.id`. All are unchanged from `main`. Revisit: before any debts UI work (candidate for Phase 3 or its own spec).
- **A sync row that fails validation is skipped and the cursor advances (decided 2026-10-04).** Why: one bad row must not block the whole pull. That row stays absent from Dexie until the server updates it again; online reads still show it and Sentry gets the report. Revisit: if reports show a recurring invalid row.
- **Render paths throw (error boundary) instead of showing ₱NaN if a pre-2b Dexie row has a non-integer amount (decided 2026-10-04).** Why: no pre-2b write path could store one, so a throw means real corruption worth surfacing. Revisit: if Sentry shows a NOT_INTEGER from a render path, add a Dexie upgrade that validates rows with `parseSyncRow`.
- **Decided by the user on 2026-10-05 (post-review defaults).** (1) Avg. Monthly Spending switches to a calendar-month count (`differenceInCalendarMonths(end, start) + 1`) as a separate `fix(analytics)` commit after the 2b merge, restoring the `processInsights` test range to Jul 1 to Sep 30. (2) The debt sync defects found in Task 10 (`nanoid()` ids against `uuid` columns, `actor_user_id` rejected by PostgREST, no debt-creation UI, debts looked up by user instead of household) get their own spec before 2c; the id change needs a plan for rows already stored on devices. (3) The `asCents` allow-list narrows to `src/lib/currency.ts` and `src/lib/validations/**` at the start of 2c. (4) 2b merges to `main` locally by fast-forward; `main` is pushed only after the 2b-0 production deploy is verified.
