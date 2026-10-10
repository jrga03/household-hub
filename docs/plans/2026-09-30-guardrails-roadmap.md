# Household Hub: AI Guardrails Design

**Status:** Master roadmap. Each phase gets its own design spec in `docs/plans/`
**Date:** 2026-09-30 (revision 2)
**Scope:** Tooling, lint rules, type checks, database tests, and Claude Code hooks that make the repo's architectural rules enforceable instead of documented.

All counts in this document were measured on `main` at `c7d19c7` on 2026-09-30.

## 1. Problem

Most of the rules that protect data integrity in this repo live only in CLAUDE.md: every mutation goes through the local outbox, money is integer cents, transfers are excluded from analytics, query keys stay consistent. CLAUDE.md is 539 lines, and a rule in a long document is easy for an agent (or a tired human) to miss. It also drifts: it points at `src/lib/dexie.ts`, but the schema lives in `src/lib/dexie/db.ts`.

The repo already has bugs caused by exactly this:

| Incident                                  | Rule broken                                                            | Status today                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IMP-01, DEBT-04 (2026-07-02 review)       | Entity writes must go through the outbox                               | Still live: `src/routes/import.tsx:234` and `:271` write `db.transactions` with no sync-queue item, so CSV imports never reach Supabase. These are the only two direct Dexie entity writes outside the offline layer. `src/hooks/useTransfers.ts:42` also inserts transactions straight into Supabase from a live form path and needs triage |
| DATA-06                                   | Prefetch and hook must share one key and fetch function                | Fixed for accounts/categories only; 60 inline `queryKey` arrays and 40 inline invalidations remain, including near-duplicate roots (`transaction`/`transactions`, `account-balance`/`account-balances`)                                                                                                                                      |
| E2E fixture `budgets.notes` (error 42703) | Code must match the real schema                                        | `budgets` has no `notes` column; `tests/e2e/fixtures/db-cleanup.ts:59` filters on it. Supabase types were last generated 2025-10-23, migrations run to 2026-07-10, the client is untyped, and nothing under `tests/` is type-checked (`tsconfig.json` includes only `src`, Playwright transpiles without checking)                           |
| E2E suite red (40 failures per browser)   | The E2E suite is the only check for offline and multi-device behaviour | Auth specs fail and cascade into every authenticated spec; the fixture drift above is part of the cause. A red suite is not a guardrail                                                                                                                                                                                                      |
| Money parsed ad hoc                       | Amounts are validated integer cents                                    | `components/ui/currency-input.tsx:91`, `lib/debts/validation.ts:397`, `routes/drafts.tsx:461`, and `routes/transactions.tsx:49-50` each parse pesos on their own                                                                                                                                                                             |

## 2. Principle

Enforce each rule at the cheapest layer that can hold it, in this order:

1. **Schema / type system**: the wrong code does not compile, or the wrong query cannot be expressed.
2. **Lint rule**: the wrong code fails on commit and in CI.
3. **Test**: an invariant the type system cannot express is asserted by a test that enumerates the surface.
4. **Agent hook**: Claude sees the failure before saying "done".
5. **CLAUDE.md**: only for what 1 to 4 cannot express.

A custom rule is only written when it maps to a bug that already shipped. Every lint message says why the rule exists and what to do instead, so the error itself teaches the fix. Where a rule can be a type, it is a type first and a lint rule second: money becomes a branded `Cents`, Dexie writes hide behind a read-only facade, transfer exclusion becomes a database view.

## 3. Current baseline

Already in place and kept as is: strict `tsconfig` (with `noUncheckedSideEffectImports`), ESLint flat config with `no-explicit-any: error`, Prettier with `eslint-config-prettier`, Husky pre-commit (`lint-staged`: eslint --fix, prettier) and verify-only pre-push (lint, `vitest run`), CI running lint, unit tests, build (`tsc -b`), bundle-size budget, and an E2E job gated on credentials. `src/lib/dexie/db.upgrade.test.ts` already exercises Dexie upgrades. `src/lib/sync/processor.ts` already maps entities with a `Record<EntityType, string>`, so a new entity type fails to compile until the processor handles it. `.claude/settings.json` is committed and holds the statusLine config.

Gaps found during review: `tests/` is outside every tsconfig, there are no pgTAP tests (`supabase/tests` does not exist), no Dependabot or `npm audit`, no runtime validation of imported or fetched rows, and `@types/node` is only present transitively.

Type-aware linting was measured at 6.3s against a 6.4s baseline `npm run lint`, so speed is not a constraint on this repo.

## 4. Design

### 4.1 Typed Supabase schema and database checks

**Goal:** a nonexistent column fails `tsc`; a broken policy or migration fails CI.

- Add script `"gen:types": "supabase gen types --lang=typescript --local > src/types/database.types.ts"`.
- Type the client: `createClient<Database>(url, key, ...)` in `src/lib/supabase.ts`.
- Regenerate now and fix the resulting type errors. Expect some; eleven months of migrations have not been reflected.
- Add `tsconfig.tests.json` (extends the base, includes `tests/**/*.ts` and `playwright.config.ts`, adds `@types/node` as an explicit devDependency). The `typecheck` CI job runs it. Fixture helpers import `Database`, which is what finally surfaces `budgets.notes` at compile time. Without this file the import changes nothing, because Playwright never type-checks.
- Add a CI job `database` that runs `supabase db start` (Postgres only, no Auth/Storage/Realtime containers), then in order: `supabase db lint`, `supabase test db`, `npm run gen:types`, `git diff --exit-code src/types/database.types.ts`. On CLI 2.118 `gen types --local` introspects Postgres directly, so the database container is enough. Verify on the first CI run; fall back to `supabase start` if it is not.
- pgTAP tests under `supabase/tests/` (`supabase test new <name>`), one file per table: household rows are visible to every authenticated household member, personal rows only to `owner_user_id`, `sync_queue` rows only to their device, and anon sees nothing. RLS is the only thing separating household data from personal data, and today nothing tests it.

### 4.2 Runtime validation at boundaries

Generated types are compile-time only. Rows that enter at runtime are parsed with Zod (already a dependency) in `src/lib/validations/`:

- CSV and PDF import rows, before they become `LocalTransaction`.
- RPC results (`transactions_filter_summary`) and any `select` that feeds arithmetic.
- Realtime payloads in `src/lib/realtime-sync.ts`.

Each schema `.transform()`s money fields into `Cents` (4.4) so the brand is applied exactly once, at the edge.

### 4.3 Query key factory

**Goal:** one module owns every key shape, so invalidation can never target a typo.

New file `src/lib/query-keys.ts`:

```ts
export const queryKeys = {
  transactions: {
    all: ["transactions"] as const,
    list: (filters: TransactionFilters) => ["transactions", "list", filters] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    balance: (id: string) => ["accounts", "balance", id] as const,
    balances: () => ["accounts", "balances"] as const,
  },
  // categories, budgets, debts, transfers, sync-queue, dashboard, analytics, offline, search
};
```

Rules:

- Hierarchical keys (`["accounts", "balance", id]` instead of a sibling `"account-balance"` root) so `invalidateQueries({ queryKey: queryKeys.accounts.all })` clears everything under an entity.
- Extend the existing `accountsQueryOptions` pattern: each entity exports `xQueryOptions()` built on `queryKeys`, and both hooks and prefetch use it.
- Components call hooks (`useTransactions(filters)`), never `useQuery` with a raw key.

Enforcement:

- Add `@tanstack/eslint-plugin-query` with `flat/recommended-strict`. The strict set adds `prefer-query-options`, which enforces the `xQueryOptions` pattern above rather than leaving it as convention.
- Ban array literals as keys outside `query-keys.ts`:

```js
"no-restricted-syntax": ["error", {
  selector: "Property[key.name='queryKey'] > ArrayExpression",
  message: "Use queryKeys from @/lib/query-keys. Inline keys drift (see DATA-06) and break invalidation.",
}]
```

Migration touches 60 inline keys and 40 inline invalidations. Merging the near-duplicate roots changes cache identity, so each entity migrates in its own commit with its tests.

### 4.4 Money: branded `Cents`

**Goal:** a peso string cannot reach a storage field without passing through `parsePHP`.

```ts
// src/lib/currency.ts
declare const centsBrand: unique symbol;
export type Cents = number & { readonly [centsBrand]: true };

export function parsePHP(input: string): Cents; // validates NaN, sign, max, then brands
export function formatPHP(cents: Cents): string;
export function asCents(n: number): Cents; // boundary-only constructor
```

- `amount_cents` on every entity type becomes `Cents`. Anything that builds an entity from user input must call `parsePHP`; anything that builds it from a row must go through a Zod schema (4.2) or `asCents`.
- Arithmetic on `Cents` yields `number`. The signed-ledger helpers in `src/lib/debts/balance.ts` re-brand their results with `asCents` at the single point where a sum becomes a stored amount.
- `asCents` may be imported only from `src/lib/validations/**`, `src/lib/supabaseQueries.ts`, `src/lib/offline/**`, and `src/lib/debts/balance.ts` (`no-restricted-imports` with `importNames: ["asCents"]` everywhere else).

Lint as the second layer, scoped to `src/**` with ignores for `src/lib/currency.ts`, `src/lib/supabaseQueries.ts` (bigint coercion of RPC output), and tests:

```js
selector: "CallExpression[callee.name=/^(parseFloat|Number)$/]",
message: "Amounts are branded Cents. Parse user input with parsePHP from @/lib/currency, which validates NaN, sign, and range in one place.",
```

Note that `parsePHP` is itself `Math.round(parseFloat(s) * 100)`, so the value of the rule is centralised validation and the brand, not float precision. Five known sites: `currency-input.tsx:91`, `debts/validation.ts:397`, `drafts.tsx:461`, `transactions.tsx:49` and `:50`.

### 4.5 Entity writes: outbox only

**Goal:** an entity write that does not enqueue a sync item cannot be expressed outside the offline layer.

**Type layer.** `src/lib/dexie/db.ts` keeps exporting the writable `db` but it becomes importable only from `src/lib/offline/**`, `src/lib/debts/**`, `src/lib/sync/**`, `src/lib/dexie/**`, and tests (`no-restricted-imports` pattern). Everyone else imports `readDb`, typed as the same tables narrowed with `Pick<Table, "get" | "bulkGet" | "where" | "orderBy" | "filter" | "toArray" | "count" | "each" | "toCollection">`. Known gap: `where()` still returns a `Collection` that exposes `modify()` and `delete()`; the invariant test below is what closes it.

**Lint layer**, same file set minus the allowlisted directories:

```js
{
  selector: "CallExpression[callee.object.object.name='db'][callee.object.property.name=/^(transactions|accounts|categories|budgets|debts|internalDebts|debtPayments)$/][callee.property.name=/^(add|put|update|delete|bulkAdd|bulkPut|bulkUpdate|bulkDelete|clear)$/]",
  message: "Entity writes must go through src/lib/offline/* so the sync-queue item is written in the same Dexie transaction. A direct write never syncs (see IMP-01).",
},
{
  selector: "CallExpression[callee.property.name=/^(insert|upsert|update|delete)$/][callee.object.callee.property.name='from']",
  message: "Supabase entity writes belong to the sync processor (src/lib/sync). Writing from a hook or component skips the outbox, the event log, and offline support.",
}
```

The second selector is allowlisted for `src/lib/sync/**` and `src/lib/debts/sync.ts`. `src/hooks/useTransfers.ts:42` matches it today and is triaged in Phase 0: if `TransferForm` really goes straight to Supabase, it is routed through `src/lib/offline/transfers.ts`.

**Test layer.** `src/lib/offline/outbox.invariant.test.ts`, table-driven over every exported mutation in `src/lib/offline/*` and `src/lib/debts/*` (fake-indexeddb is already a devDependency). For each mutation: (a) calling it adds at least one `syncQueue` row; (b) when `db.syncQueue.bulkAdd` rejects inside the transaction, the entity table is unchanged, which proves the write and the enqueue share one transaction. (Stubbing `buildSyncQueueItem` does not prove this: queue items are built before the transaction opens.) A new exported mutation that is missing from the table fails the test via an exhaustiveness check over the module's exports.

**Dexie schema snapshot.** Extend `db.upgrade.test.ts` with a snapshot of each version's `stores()` argument, so editing an already-shipped version fails a test instead of corrupting upgrades in the field.

### 4.6 Data access and transfer exclusion

**Data access rule.** Routes and components do not import the Supabase client; they use hooks.

```js
"no-restricted-imports": ["error", { patterns: [{
  group: ["**/lib/supabase"],
  message: "Fetch through a hook or @/lib/supabaseQueries so reads get the Dexie offline fallback.",
}] }]
```

`patterns` rather than `paths`, so a relative `../lib/supabase` cannot bypass it. Applies to `src/routes/**` and `src/components/**`. One current violation: `src/routes/analytics/index.tsx:13`.

**Transfer exclusion moves to the schema.** Postgres 17 (per `supabase/config.toml`) supports invoker-rights views, so RLS still applies:

```sql
create view transactions_non_transfer
  with (security_invoker = true) as
  select * from transactions where transfer_group_id is null;
```

Analytics, budget-actual, and dashboard reads switch to the view. `.from("transactions")` is then restricted to `src/lib/supabaseQueries.ts`, `src/lib/sync/**`, `src/lib/debts/**`, and `src/lib/realtime-sync.ts`:

```js
selector: "CallExpression[callee.property.name='from'] > Literal[value='transactions']",
message: "Read transactions through src/lib/supabaseQueries.ts. Analytics and budgets read the transactions_non_transfer view so transfers can never leak into totals.",
```

Four call sites outside that set today, all in `src/hooks/useAnalytics.ts` and `src/hooks/useTransfers.ts`. A unit test over the analytics and budget query builders asserts they call `.from("transactions_non_transfer")`, so the exclusion is checked structurally rather than by reading for `.is("transfer_group_id", null)`.

**Flat config caveat:** `no-restricted-syntax` options do not merge across config objects; a later object with options replaces the earlier array entirely (severity-only overrides keep options). All selectors for a given file set must live in one array, so these go into a single `architectureRules` object in `eslint.config.js`, split into the smallest number of blocks the differing `ignores` allow.

### 4.7 Type-aware lint rules

Enable `parserOptions.projectService: true` on the `src/**` block and add:

| Rule                                       | Count (src, with tests)         | Why it matters here                                                                                                                                |
| ------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typescript-eslint/no-floating-promises`  | 73                              | An un-awaited promise in the sync path fails silently. 20 are in `supabaseQueries.ts`, 6 in `useSyncQueueOperations.ts`, 6 in `authStore.test.ts`. |
| `@typescript-eslint/no-misused-promises`   | 54                              | Mostly async handlers passed to `onClick`; rejections go unhandled.                                                                                |
| `@typescript-eslint/no-non-null-assertion` | 44 outside tests, 99 with tests | `!` is where generated code asserts things it has not checked. Test files are excluded from this rule; assertions in tests are normal.             |
| `jsx-a11y` recommended                     | 10                              | Plugin is already installed but not wired into the config.                                                                                         |

Intentional fire-and-forget calls are marked with `void`, which makes the intent visible in review. Measured cost is nil (see section 3), so the type-aware rules run everywhere lint runs, including pre-commit.

### 4.8 Stricter tsconfig

| Flag                         | Errors | Plan                                                                                                                                                                                                            |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noImplicitOverride`         | 2      | Enable now                                                                                                                                                                                                      |
| `verbatimModuleSyntax`       | 10     | Enable now (mostly `import type` fixes)                                                                                                                                                                         |
| `noUncheckedIndexedAccess`   | 309    | Scoped now, repo-wide in Phase 3                                                                                                                                                                                |
| `exactOptionalPropertyTypes` | 95     | Dropped. The errors are `value: undefined` props into `CategorySelect` and `DatePicker`, which is prop plumbing rather than data integrity, and the flag has the worst third-party interop of any strict option |

A flag cannot be scoped per directory inside one program, but a second program can: `tsconfig.strict.json` extends the base, sets `noUncheckedIndexedAccess`, and includes only `src/lib/sync`, `src/lib/offline`, and `src/lib/debts`. The `typecheck` job runs it from Phase 1. Caveat: files those directories import transitively are checked too, so the first run sets the real count. Measured distribution for the repo-wide flag: `TransactionList` 59, `lib/offline` 51, `lib/pdf-parsers` 41, then test files; `lib/sync` has 10 and `lib/debts` 12. Phase 3 clears the biggest buckets first.

### 4.9 Claude Code hooks

Merged into the committed `.claude/settings.json` (which already holds `statusLine`):

```json
{
  "statusLine": { "type": "command", "command": ".claude/statusline.sh", "padding": 0 },
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
          { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/agent-bash-guard.sh" }
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

All scripts parse stdin with `node -e` rather than `jq`, so a fresh clone needs nothing beyond Node. Command hooks default to a 600s timeout, so none is set.

**Stop hook**, `scripts/agent-stop-check.sh`:

```bash
#!/bin/bash
# Lint + typecheck what changed on this branch. Blocks the stop once per
# distinct working-tree state: Claude gets one chance to fix each failure,
# and an unfixable failure cannot loop because the tree hash stops changing.
set -u
input=$(cat)
session=$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).session_id||"nosession"))')

base=$(git merge-base origin/main HEAD 2>/dev/null || git merge-base main HEAD 2>/dev/null || echo HEAD)
changed=$( { git diff --name-only --diff-filter=ACMR "$base"; git ls-files --others --exclude-standard; } \
  | grep -E '\.(ts|tsx)$' | sort -u)
[ -z "$changed" ] && exit 0

# Phase 3 exit criterion adds --max-warnings=0 here (see section 5).
output=$(npx eslint $changed 2>&1 && npx tsc --noEmit -p tsconfig.json 2>&1)
[ $? -eq 0 ] && exit 0

marker="${TMPDIR:-/tmp}/household-hub-stop-${session}"
current=$(cat $changed | git hash-object --stdin)
if [ -f "$marker" ] && [ "$(cat "$marker")" = "$current" ]; then
  exit 0   # same tree as the last block: no progress, let the stop through
fi
printf '%s' "$current" > "$marker"
echo "$output" | tail -40 >&2
exit 2
```

- Exit 2 blocks the stop; the hooks reference confirms stderr reaches Claude as a system reminder, so it fixes errors in-session.
- The diff is taken against the merge-base with `main`, not `HEAD`, because a mid-session commit empties `git diff HEAD` and lint-staged never runs `tsc`.
- `--diff-filter=ACMR` keeps deleted files out of the eslint argument list.
- The loop guard is self-contained. It does not read `stop_hook_active`: the hooks guide documents that field as "already continuing because of a prior block" while the hooks reference documents it as "at least one Stop hook is configured", and under the second meaning the guide's early-exit fires on every run and checks nothing. The reference also states there is no cap on consecutive blocks.
- Only runs when TS files changed. Full `tsc` takes about 5s on this repo.
- Unit tests stay out of the hook (too slow); pre-push and CI still run them.
- Output is truncated to 40 lines to keep token cost down.

**PostToolUse per-file lint**, `scripts/agent-lint-file.sh`: reads `tool_input.file_path`, and if it is a `.ts`/`.tsx` under `src/`, runs `npx eslint` on that one file and exits 2 with the output on failure. Feedback lands seconds after the edit instead of at the end of the turn, and it is the cheap path for most fixes; the Stop hook remains the backstop for cross-file type errors.

**PreToolUse Bash guard**, `scripts/agent-bash-guard.sh`: reads `tool_input.command` and exits 2 with a reason when it matches `git push.*(--force|-f)\b`, `supabase db (reset|push).*--linked`, `supabase db push`, or `rm -rf` on a path outside the session scratchpad. Hooks can tighten permissions but not loosen them, so this only ever adds a refusal.

**SessionStart context**, `scripts/agent-session-start.sh`: returns `git status -sb`, `git log --oneline -10`, and the newest file under `docs/plans/` as `hookSpecificOutput.additionalContext`. This is the resume-after-gap reconciliation done by the harness instead of relying on the agent to remember to do it.

### 4.10 Dead code: Knip

Add `knip`. It auto-detects Vite, Vitest, Playwright, Husky, and lint-staged, and `src/routeTree.gen.ts` is reachable from `main.tsx`, so the only explicit entries are `src/sw.ts`, `workers/**`, and `supabase/functions/**`. The 2026-07-02 review already removed one unreachable subsystem (Phase B stack); Knip keeps that from building up again. Run it in CI as a non-blocking job at first, then make it blocking once the ignore list is settled.

### 4.11 Dependencies

- `.github/dependabot.yml`: npm, weekly, grouped minor/patch updates, separate PRs for majors.
- CI job `audit`: `npm audit --audit-level=high`. The recent `supabase-js` bump to drop a vulnerable `ws` shows this is live risk, not hypothetical.
- Pin Node via the existing `.nvmrc` and add `"packageManager"` to `package.json` so CI and hooks resolve the same npm.

### 4.12 CLAUDE.md

Trim to roughly 200 lines, done last:

- Remove every rule that a type, lint rule, or test now enforces (outbox, money parsing, query keys, Supabase import, transfer exclusion). Replace with one line: "Architecture rules are enforced in `eslint.config.js`, the branded types in `src/lib/currency.ts`, and the invariant tests; read the error message."
- Fix stale pointers (`src/lib/dexie.ts` is `src/lib/dexie/db.ts`) and add `scripts/check-doc-paths.mjs`: extract every `src/...`, `docs/...`, `scripts/...` path mentioned in CLAUDE.md and fail if the file does not exist. Runs in the `lint` job.
- Move the Phase B/C roadmap, performance budgets, and long doc references into `docs/` and link them.
- Keep: stack summary, commands, directory map, known infrastructure issues, and rules no tool can check (timezone handling for month boundaries, LWW semantics).
- Add a state-bucket table: server data in TanStack Query, persistent local data in Dexie, shared UI state in Zustand, filters in URL search params, form state in React Hook Form.

### 4.13 CI changes

Split the single `ci` job so failures are readable, and add the new checks:

1. `lint` (architecture and type-aware rules, doc path check)
2. `typecheck` (`tsc --noEmit -p tsconfig.json`, `-p tsconfig.tests.json`, `-p tsconfig.strict.json`)
3. `unit-tests`
4. `build` + bundle size
5. `database` (`supabase db start`, `db lint`, pgTAP, type drift; 4.1)
6. `e2e-smoke` (`test:e2e:smoke` on chromium against the local stack, unconditional; the full matrix stays behind credentials)
7. `audit` (4.11)
8. `knip` (non-blocking at first)

## 5. Rollout

New rules land as `warn` when they have existing violations, then flip to `error` once the count reaches zero. No blanket `eslint-disable`; any disable needs a trailing reason comment. `--max-warnings=0` is off in the Stop hook and in CI until Phase 3's exit criterion is met, then it turns on in both and stays on.

### Phase 0: Fix live bugs

Specified in `docs/plans/2026-09-30-phase-0-live-bugs-design.md`, which supersedes the items below where they differ.

- [x] Make `src/routes/import.tsx` a layout (`<Outlet />` + redirect) so `/import/pdf` renders the PDF wizard instead of the retired CSV page; delete the CSV-only page, store, and `DuplicateResolver`. The CSV writes at `:234`/`:271` go with it; CSV import is rebuilt on the draft pipeline later
- [x] Route transfer creation through the outbox: `TransferForm` calls `useTransfers.ts:42`, which inserts straight into Supabase. Add `createOfflineTransfer` to `src/lib/offline/transfers.ts` (only read helpers exist there today)
- [x] Fix `cleanupTestBudgets` (no `notes` column; key E2E budgets by category and month instead) and the auth specs; get `test:e2e:smoke` green on chromium (outcome: A, smoke 11/11 on chromium after Task 8b; see Task 8 notes)
- [x] Fix the five ad hoc money parses per site (not all through `parsePHP`: `transactions.tsx:49-50` parse URL params that are already cents)

### Phase 0.5: Remaining Supabase writes onto the outbox

Added 2026-09-30. `src/lib/supabaseQueries.ts` has 15 direct writes from live hooks; Phase 0 did not clear them (see the Phase 0 design's Decisions & Deferrals).

- [x] Transactions: `useUpdateTransaction`, `useDeleteTransaction`, `useSetTransactionStatus`, `useToggleTransactionStatus` through `src/lib/offline/transactions.ts`, with enqueue-then-drain-and-invalidate
- [x] Accounts: create and deactivate through `src/lib/offline/accounts.ts`
- [x] Categories: create and deactivate through `src/lib/offline/categories.ts`
- [x] Budgets: insert, upsert, delete through `src/lib/offline/budgets.ts` (0.5b: `budgets.month_key` is a generated column, so the outbox update payload must omit it)
- [ ] Phase 1 lands the Supabase-write selector as `error` (Phase 0.5 complete 2026-10-01)
- Approach (decided 2026-09-30): outbox mutations fetch the single row from Supabase and store it locally when it is missing from IndexedDB ("fetch on miss"), then apply the change and enqueue. Offline, the UI only shows local rows, so a missing row and no network cannot coincide.

### Follow-ups recorded 2026-09-30

- Supabase-write selector allowlist: `src/lib/dexie/deviceManager.ts` and `src/lib/device-registration.ts` (device registry/heartbeat, not household data; see the Phase 0.5a design Decisions & Deferrals).
- Transfer delete: the server already deletes both legs (`20260702120000_security_hardening.sql`), but `deleteOfflineTransaction` removes only the chosen leg locally until the realtime echo; consider deleting both legs locally.
- `CurrencyInput` hardcodes `aria-label="Amount in Philippine Pesos"`, overriding visible field labels (Phase 1 jsx-a11y; update `tests/e2e/budgets.spec.ts` locator with it).

### Future: full local copy (deferred 2026-09-30)

IndexedDB is not a full mirror: the reconnection catch-up pulls only rows changed since its cursor, and a fresh device starts with the last 24 hours (`src/lib/realtime-sync.ts` `fetchLatestChanges`). Offline reads on a fresh device therefore miss older data. Backfill every transaction, account, category, and budget on first login (paginated, storage-quota aware, with progress UI). Revisit: after Phase 0.5, or sooner if offline reads of older data are reported missing.

### Phase 1: Cheap wins

Split 2026-10-01 into 1a and 1b. Counts re-measured at `913efac`; 1a is specified in `docs/plans/2026-10-01-phase-1a-cheap-wins-design.md`, which supersedes the items below where they differ.

**Phase 1a** (merged 2026-10-01 at `0db3d4d`):

- [x] Wire `jsx-a11y` recommended into `eslint.config.js`; fix 7 sites (9 hits), plus the `CurrencyInput` `aria-label` follow-up
- [x] Enable `noImplicitOverride` and `verbatimModuleSyntax`; fix 10 errors (2 + 8)
- [x] Add the Dexie-write, Supabase-write, money, and `.from("transactions")` rules as aliased `arch/*` rules, and the data-access import rule, all as `error`. Supabase-write allowlist: `src/lib/sync/**`, `src/lib/dexie/deviceManager.ts`, `src/lib/device-registration.ts` (`debts/sync.ts` no longer writes). Move the 3 raw transactions reads and the analytics route's Supabase import first
- [x] Add `tsconfig.tests.json` (with explicit `@types/node`); fix 4 errors; run in CI
- [x] Add the four hooks (4.9) and merge them into the existing `.claude/settings.json`
- [x] Dependabot config, `packageManager`, `.nvmrc` in CI, audit gate (the existing Security Checks job: production deps blocking, plus a report-only full audit), non-breaking `npm audit fix`

**Phase 1b** (own spec and branch, after 1a merges):

- [x] Add `tsconfig.strict.json` (`noUncheckedIndexedAccess` over sync, offline, debts) and fix all 190 errors it reports, transitive files included; run in CI (merged 2026-10-02 at `3dba7e6`; also reworked pre-push and the Stop hook, see the 1b plan)

### Phase 2: Contracts

Split 2026-10-02 into 2a (schema: `gen:types`, typed client, `database` CI job, pgTAP, transfer view, CI split), 2b (branded `Cents`, Zod boundaries), and 2c (`readDb` facade, outbox invariant and Dexie snapshot tests, query keys). Counts re-measured at `ccc6263`; see the 2a design. Each sub-phase gets its own spec and branch; 2b and 2c depend on 2a's generated types, not on each other.

- [x] `gen:types` script, regenerate, type the Supabase client, fix errors (2a, merged 2026-10-04 at `127eeea`)
- [x] `database` CI job: `db lint`, pgTAP RLS tests, type drift check (2a, merged 2026-10-04 at `127eeea`)
- [x] Zod schemas at the import, RPC, and realtime boundaries (4.2) (2b, merged locally 2026-10-05 at `70fc25d`, push pending the 2b-0 deploy; import paths already build amounts through `parsePHP`/`parsePHPSafe`, so CSV rows got no schema, per the 2b spec)
- [x] Branded `Cents` and `asCents` import restriction (4.4) (2b, merged locally 2026-10-05 at `70fc25d`, push pending the 2b-0 deploy)
- [x] `readDb` facade, outbox invariant test, Dexie schema snapshot test (4.5) (2c-1, merged locally 2026-10-07; spec/plan `docs/plans/2026-10-07-phase-2c1-data-guards*`)
- [x] `transactions_non_transfer` view, move analytics and budget reads to it, unit test asserting the view is used (2a, merged 2026-10-04 at `127eeea`) (4.6)
- [x] `src/lib/query-keys.ts` + `@tanstack/eslint-plugin-query` strict; migrate one entity per commit; then enable the inline-key ban as `error` (2c-2, merged locally 2026-10-07; spec/plan `docs/plans/2026-10-07-phase-2c2-query-keys*`)
- [x] Split CI jobs (4.13) (2a, merged 2026-10-04 at `127eeea`)

### Phase 3: Depth

- [x] Type-aware rules as `warn`; clear floating/misused promises starting in `src/lib/sync` and `src/hooks/useSyncQueueOperations.ts`; flip to `error` (3a, merged locally 2026-10-08; spec/plan `docs/plans/2026-10-08-phase-3a-lint-depth*`)
- [x] `no-non-null-assertion` cleanup outside tests; flip to `error` (3a, merged locally 2026-10-08; spec/plan `docs/plans/2026-10-08-phase-3a-lint-depth*`)
- [x] `noUncheckedIndexedAccess` repo-wide, biggest buckets first (`TransactionList`, `lib/offline`, `lib/pdf-parsers`) (3a, merged locally 2026-10-08; spec/plan `docs/plans/2026-10-08-phase-3a-lint-depth*`)
- [x] Exit criterion: every rule is at `error` and `npm run lint` reports zero warnings. Then add `--max-warnings=0` to the Stop hook and the CI `lint` job (3a, merged locally 2026-10-08; spec/plan `docs/plans/2026-10-08-phase-3a-lint-depth*`)
- [x] Knip in CI, blocking

### Phase 4: Docs

- [ ] Trim CLAUDE.md, fix stale paths, add `check-doc-paths.mjs` (4.12)

## 6. Costs and risks

- **Query key migration changes cache identity.** A missed call site will show stale data rather than fail loudly. Mitigation: one entity per commit, and the inline-key ban turned on right after migration so nothing reintroduces the old keys.
- **Branded `Cents` touches every amount field.** Arithmetic returns `number`, so each helper that produces a stored amount needs one `asCents`. Mitigation: brand storage fields and form inputs first, let `tsc` list the re-brand points, and keep `asCents` import-restricted so the list cannot grow silently.
- **Regenerated types may surface many errors at once.** Some will be real schema drift worth knowing about; budget time for it.
- **The read-only Dexie facade does not close `where().modify()`.** The outbox invariant test is what covers that path; keep its export enumeration exhaustive.
- **Outbox rule allowlist is directory-based.** A new legitimate writer outside those directories needs a config change, which is intended: it forces the question "does this enqueue a sync item?"
- **The Stop hook rests on hook semantics that the two official pages describe differently.** The diff-hash guard sidesteps `stop_hook_active` entirely. Verify the guard once with a deliberately failing file before relying on it, and re-check the hooks reference when Claude Code is upgraded.
- **`supabase db start` may not be enough for `gen types --local` or pgTAP on the CI runner.** First run tells; the fallback is `supabase start`, which costs about a minute more.
- **The transfer view changes analytics query plans.** `security_invoker` views inline into the underlying table with RLS applied, so the existing compound indexes still apply; confirm with `EXPLAIN` on the month-aggregate queries after the switch.

## 7. Out of scope

Mutation testing (Stryker), duplication detection (jscpd), and faster linters (oxlint/Biome). Revisit after Phase 3 if tests or lint speed become the bottleneck.

## 8. Decisions & Deferrals

Confirmed in review on 2026-09-30:

- **Stop hook loop guard is a diff-hash marker file, not `stop_hook_active`.** Why: the hooks guide and hooks reference define that field differently, and under the reference's meaning the guide's script is a no-op. Revisit: if the two pages converge on the guide's meaning, the field can become a second guard, never the only one.
- **`--max-warnings=0` is off until the Phase 3 exit criterion, then on for good.** Why: rules land as `warn` while violations exist, and the flag would turn every warning into a blocked stop. Revisit: at the Phase 3 exit criterion (all rules `error`, zero warnings); it does not come off again.
- **`exactOptionalPropertyTypes` is dropped.** Why: the 95 errors are React prop plumbing, and the flag has poor third-party interop. Revisit: only if a data bug is traced to an optional field holding an explicit `undefined`.
- **Branded `Cents` and the `readDb` facade land in Phase 2, ahead of the lint-only approach.** Why: the type layer is the cheapest enforcement per section 2, and the lint selectors have documented holes. Revisit: never; the lint rules stay as the second layer.
- **pgTAP RLS tests and `supabase db lint` go in the `database` job.** Why: RLS is the household/personal boundary and is untested today. Revisit: if the job exceeds five minutes, move pgTAP to a nightly run and keep drift plus lint on every push.
- **E2E fixture and auth fixes are in Phase 0, not a separate effort.** Why: a red E2E suite means the offline and multi-device rules have no guardrail at all. Revisit: if the auth failure is environmental rather than code, log it under Known Infrastructure Issues and keep the fixture fix in Phase 0.
- **Test files are excluded from `no-non-null-assertion`.** Why: assertions in tests are normal and doubling the cleanup buys nothing. Revisit: never.
- **`tsconfig.strict.json` runs over sync, offline, and debts from Phase 1.** Why: those directories are where an unchecked `arr[0]` corrupts data, and a scoped program enforces it eleven months before the repo-wide flip. Revisit: delete the file once Phase 3 turns the flag on repo-wide.
- **Dependabot plus `npm audit --audit-level=high` in Phase 1.** Why: a vulnerable transitive dependency already shipped once. Revisit: if update PR volume becomes noise, widen the grouping, do not remove the audit.
- **`database` job uses `supabase db start`, not the full stack.** Why: type generation and pgTAP only need Postgres, and the full stack costs about a minute more per run. Revisit: on the first CI run; fall back to `supabase start` if either step needs Auth or PostgREST.
- **Transfer exclusion becomes a `security_invoker` view.** Why: it moves the rule from a comment on every query to the schema, and a test can assert the view is used. Revisit: if `EXPLAIN` shows the view defeats the month-aggregate indexes.
- **Hand-written `queryKeys` object, not `@lukemorales/query-key-factory`.** Why: no new dependency; the existing `xQueryOptions` pattern already covers co-locating key and fetch function, and the plugin's `prefer-query-options` now enforces it. Revisit if key/fetch drift keeps happening.
- **Directory-scoped lint rules instead of `eslint-plugin-boundaries`.** Why: the codebase has no feature-slice layering; five restricted rules cover the known incidents. Revisit if a `features/` structure is adopted.
- **Mutation testing, jscpd, oxlint deferred.** Why: cost outweighs benefit at current size. Revisit after Phase 3.
- **Phase 0.5a/0.5b pushed without a device check (decided 2026-10-01).** Why: the user could not test on a phone at the time. Revisit: on the next phone session, check (1) switching an account personal to household, (2) recreating an archived account name (should be rejected with "Choose another name"), (3) adding/editing a budget and seeing it on a second device or browser.

- **Phase 1 split into 1a (guardrails) and 1b (`tsconfig.strict.json`) (decided 2026-10-01).** Why: the strict program reports 190 errors once transitive imports are counted (`TransactionList` 59), and the user chose to fix all of them rather than filter to scope; a separate branch keeps the cheap guardrails from waiting on UI-heavy fixes. Consequence: Phase 3's `noUncheckedIndexedAccess` buckets shrink. Revisit: 1b spec. The rest of the 1a decisions (aliased `arch/*` rules, prod-only audit gate, reads moved into `supabaseQueries.ts`) are in the 1a design's Decisions & Deferrals.
- **Node 26 before Phase 1b, straight to `main` (decided 2026-10-02).** `.nvmrc` = `26` is the single pin (`.node-version` deleted; CI, nvm, Cloudflare Workers Builds and Pages all read `.nvmrc`), `engines` `>=26`, `@types/node` ^26, `packageManager` npm@11.19.1. Why: 22 is in maintenance; 26 becomes LTS 2026-10-28 (before 1b merges) and is supported to 2029-04; Cloudflare docs list any Node version as overridable via `.nvmrc`; Node only runs at build time here. Two Node 26 effects handled: vitest forks run with `--no-experimental-webstorage` (Node 25+'s own `localStorage` global shadowed jsdom's and failed all 1012 tests), and npm 11 blocks install scripts by default, so `allowScripts` approves `canvas` (only `scripts/generate-icons.js` needs it) and denies the rest (build and tests pass without them). Revisit: if the first Cloudflare build on 26 fails, check its log for the Node version actually used.
- **Phase 1b design choices (decided 2026-10-02; spec `docs/plans/2026-10-02-phase-1b-strict-tsconfig-design.md`, plan `docs/plans/2026-10-02-phase-1b-strict-tsconfig.md`).** Fix style: narrowing guards in production (UI/parser sites skip or render nothing; sync/debt sites throw a clear error where a missing value means corrupt data), `!` only in tests, no new `!` in production, no helper module. Verification: TDD for guards that add observable behavior, existing unit tests plus chromium smoke, a screenshot pass (transactions table and cards, dashboard charts with tooltip hover, analytics, PDF import preview), and the full chromium E2E compared against `main` (a spec passing on main and failing on the branch is a regression). Enforcement: CI step, Stop hook (plus cache key), and a reworked pre-push (`scripts/pre-push.mjs`: lint, vitest `--allowOnly=false`, all three tsc programs in parallel, skip pushes touching only `*.md`/`docs/**`, grouped failure output; fix `.husky/README.md`). Revisit: 1b spec.
- **Phase 2 split into 2a/2b/2c (decided 2026-10-02).** Why: re-measured at `ccc6263`, `Cents` alone reports 114 errors in 34 files when only `formatPHP` is branded, and `readDb` plus query keys would push a single app-side branch past 1b's 190; the typed client is only 26 errors, so the schema work stands on its own. 2b and 2c both need 2a's generated `Database` types (rows enter as `number`, so the brand is applied where rows enter). Revisit: 2a spec.

- **Phase 2b split into 2b-0 and 2b; brand covers storage and display (decided 2026-10-04; spec `docs/plans/2026-10-04-phase-2b-cents-boundaries-design.md`).** 2b-0 drops the uncalled `get_max_lamport_clock` and pins `owner_user_id` in `accounts_update` WITH CHECK, deployed by the user before its merge is pushed. 2b brands entity amounts and `formatPHP` with `Cents`, makes `asCents` import-restricted with a runtime integer check, and skips-and-reports sync rows that fail Zod. Re-measured at `59c086f`: 366 errors / 58 files with the full brand (production 94 / 35). Why and revisit conditions: the spec's Decisions & Deferrals.

- **Dependabot alerts stay off for now (deferred by the user 2026-10-06).** The repo has Dependabot alerts disabled (API 403) and no code scanning (404), so `npm audit` in Security Checks is the only vulnerability gate; the `seroval` critical surfaced only as a red Security Checks run. Revisit: the user enables alerts in Settings → Code security.

- **Bundle budget has 18 B of headroom after 2c-2 (noted 2026-10-07).** 363,502 B gz against 363,520 (355 KB); query builders and the invalidation map cost about 30 B net. Why it matters: the next phase that adds runtime code will trip `npm run size`. Revisit: at the start of that phase, decide to raise `BUDGET_KB` or trim (e.g. lazy-load a route chunk), not mid-task.

- **Bundle budget 355 → 378 KB after Dependabot PR #11 (decided by the user 2026-10-08).** Initial chunk 363,502 → 383,354 B gz (355.0 → 374.4 KB). Source-map attribution: react-dom 19.2 → 19.3 (+29 KB minified, about 9-10 KB gz), react-hook-form 7.66 → 7.89 (+10 KB minified, about 3 KB gz), then supabase auth-js; no module moved from a lazy chunk into the initial one. Budget = ceil(measured) + 3. Rejected: pinning React to 19.2; trimming first. Revisit: when the initial chunk is next reduced (lazy routes), lower the ceiling with it.
- **Pre-existing: transactions "Clear" leaves URL filters (found 2026-10-08).** After typing a search and clicking Clear in the filters panel, the search box empties but `search=` and `categoryId` stay in the URL and the list stays filtered; identical on `main`. Revisit: its own fix (not Phase 3a).

## Resume state (2026-10-01)

- Phases 0, 0.5a, and 0.5b are merged and pushed (`main` = `913efac`). Per-phase specs and plans: `docs/plans/2026-09-30-phase-0-live-bugs*`, `docs/plans/2026-09-30-phase-0.5a-outbox-writes*`, `docs/plans/2026-10-01-phase-0.5b-budget-outbox*`.
- Phase 1a: merged to `main` at `0db3d4d` (fast-forward, 2026-10-01); push pending (run from the user's terminal, SSH). Acceptance at `0db3d4d`: tsc (both programs) exit 0, lint 0/0, vitest 75 files / 1012 tests, build ok, bundle 352.5 KB gz (budget 355; `main` before 1a was 352.2), production audit 0 vulnerabilities. E2E smoke 11 passed was measured at `330fab9`; later commits touched only hooks, the lint test, and docs. Live hooks: PreToolUse guard and PostToolUse lint verified in-session; SessionStart context and the Stop hook are not yet seen in a fresh session. Next: Phase 1b brainstorm (`tsconfig.strict.json`, 190 errors).
- Node 26 bump (2026-10-02) committed on `main` after 1a. Acceptance on Node 26.10.0 / npm 11.19.1 after a clean `npm ci`: tsc (both programs) 0, lint 0 errors, vitest 75 files / 1012 tests, build ok, bundle 352.5 KB gz, production audit 0, chromium smoke 11 passed. Strict program re-measured at `a407b78`: still 190 errors, same distribution. SessionStart hook context confirmed in a fresh session (2026-10-02). 1a + Node 26 pushed 2026-10-02 (origin at `49e1203`); the user reported the Cloudflare deployment built with no errors (the Node version shown in the build log was not checked).
- Phase 1 counts were re-measured at `913efac` (table in the 1a design). The section 4.7 type-aware counts (73/54/44) are still from `c7d19c7`; re-measure before Phase 3.
- The section 4.4 money-selector message ("use parsePHP") is superseded: per the Phase 0 design's Decisions & Deferrals it must point at `parsePHP`/`parsePHPSafe`/`parsePHPUnbounded` and at route search schemas (`src/lib/validations/transactionsSearch.ts`), since URL amount params are already cents.
- Unverified: the four device checks in the Decisions entry above; the full (non-smoke) E2E suite and non-chromium browsers since Phase 0.
- Test hygiene seen on the last push: `npx vitest run` passes (72 files / 918 tests) but prints heavy stderr from older suites (`[Debt Sync] Unexpected error adding to sync queue: Not authenticated` repeated, plus processor error-path logs). Not a failure; worth a cleanup item if Phase 1 adds a "pristine test output" gate.
- Phase 1b: merged to `main` at `3dba7e6` (fast-forward, 2026-10-02) and pushed with `c4bce2e` (origin `main` = `c4bce2e`). One push attempt failed `unit tests` under pre-push's parallel load (22.1s vs ~15s normally); the failing test was not identified (output truncated) and did not reproduce in 12 local runs. `c4bce2e` adds `--silent` so the next failure prints a readable summary; when it recurs, name the test and log it under CLAUDE.md Known infrastructure issues. Acceptance: tsc (three programs) 0, lint 0/0, vitest 76 files / 1028 tests, build ok, bundle 352.6 KB gz, prod audit 0, chromium smoke 11/11, full chromium E2E identical to the `main` baseline (37/33/24; one `settings.spec.ts` flake), screenshots read, live pre-push verified (full checks on a code push, skip on a docs-only push). Details and deferrals: `docs/plans/2026-10-02-phase-1b-strict-tsconfig.md`. CLAUDE.md rewritten to 73 lines. Next: Phase 2 (Contracts) brainstorm. Every Phase 2 count in sections 4.1-4.6 and 4.13 is from `c7d19c7` and about 80 commits stale: re-measure on current `main` before asking scope questions. Phase 2 has eight items, so expect a 2a/2b split like Phase 1. Remote branch `phase-1b-strict-tsconfig` deleted 2026-10-02 (via `gh api`, which works from Claude's shell over HTTPS, unlike SSH `git push`).
- Phase 2 brainstorm (2026-10-02): split into 2a/2b/2c (Decisions & Deferrals). 2a spec written: `docs/plans/2026-10-02-phase-2a-schema-contracts-design.md` (baselines re-measured at `ccc6263`; `gen types --local` works on CLI 2.109.1; typed client = 26 errors; `db lint` found `check_budget_thresholds` failing on every call). Next: user reviews the 2a spec, then the 2a implementation plan (writing-plans), then branch `phase-2a-schema-contracts`. 2b and 2c get their own brainstorms after 2a merges.
- Phase 2a plan written (2026-10-02): `docs/plans/2026-10-02-phase-2a-schema-contracts.md`, 10 tasks. Planning ran every pgTAP file against the local stack (110 assertions, 14 files, all passing with the two migrations applied in a rolled-back transaction) and found: `categories.color` should become NOT NULL (4 of the 26 typed-client errors), a known `accounts_insert` gap (owner not pinned), and that analytics has no Dexie fallback. The local DB now has a committed `tests` schema from that run (test-only, outside `public`). Next: execute the plan (Task 0 cuts `phase-2a-schema-contracts`).
- Phase 2a complete on branch `phase-2a-schema-contracts` (2026-10-04; merged to `main` at `127eeea` by fast-forward and pushed, PR #9 marked merged, branch deleted; CI run 37191846296 green). Plan: `docs/plans/2026-10-02-phase-2a-schema-contracts.md` (Progress, Acceptance results, Decisions & Deferrals). Beyond the spec it added: explicit table grants and privilege parity (CI's newer Supabase image has no default grants), Playwright 1.63 (1.56's installer hangs on Node 26), E2E fixture users created on local stacks only, budget alerts limited to household rows, `accounts_insert` owner pin, and no PUBLIC EXECUTE on new functions. The eight migrations were deployed to production on 2026-10-04 (pre-flight: 0 null colours) and verified by SQL and an app check. Next: the 2b brainstorm (branded `Cents`, Zod boundaries; carry `get_max_lamport_clock` hardening and the `accounts_update` owner pin).
- Phase 2b inputs (2026-10-04): branded `Cents` (4.4) and Zod at the PDF-draft, RPC (`get_account_balances`, `transactions_filter_summary`) and realtime boundaries (4.2); the analytics "Avg. Monthly Spending" fractional-cents bug (`useAnalytics.ts` divides cents by `monthCount`); the debt-reversal UTC `payment_date` (moved to 2b by the 2a spec); `get_max_lamport_clock(text)` hardening (SECURITY DEFINER, no `search_path`, EXECUTE for PUBLIC/anon); the `accounts_update` `owner_user_id` pin; and the pre-existing `!` in `supabaseQueries.ts` totals code. 2a measured `formatPHP(cents: Cents)` alone at 114 errors in 34 files (at `ccc6263`, before 2a); re-measure on current `main`. Rows now enter typed by `AppDatabase` (`src/types/app-database.ts`), so the brand is applied where rows enter. 2c (`readDb`, outbox invariant test, Dexie snapshot, query keys) follows; it does not depend on 2b. The 2a SDD ledger is archived at `.superpowers/sdd/phase-2a/`.
- Phase 2b brainstorm (2026-10-04): spec `docs/plans/2026-10-04-phase-2b-cents-boundaries-design.md` (2b-0 security migrations on `phase-2b0-security`, then 2b on `phase-2b-cents-boundaries`). Next: user reviews the spec, then the implementation plan (writing-plans), with a fresh `.superpowers/sdd/progress.md`.
- Phase 2b plan written (2026-10-04): `docs/plans/2026-10-04-phase-2b-cents-boundaries.md`, 11 tasks (0-2 are 2b-0, deployed by the user before its push; 3-10 are 2b). Planning changed two spec points: money columns are branded at the type level in `AppDatabase` (prototype at `a9cfcdb`: supabase-js inference survives), and six dead `currency.ts` helpers are deleted. It also confirmed that the household switch already clears `owner_user_id` on the server (`processor.ts:335-339`). Next: execute Task 0 (branch `phase-2b0-security`).
- Phase 2b acceptance (2026-10-04, branch `phase-2b-cents-boundaries`): tsc (three programs) 0, lint 0, vitest 84 files / 1072 tests, build ok, bundle 353.8 KB gz of 355 (352.6 before 2b), prod audit 0, chromium smoke 11/11, full chromium E2E matches the 1b baseline per test (37/32/25; only the documented `settings.spec.ts` serial flip), screenshots read. 2b-0 is merged to `main` at `02bf830`; its production deploy is with the user. Open for the user: the Avg. Monthly Spending month count (recommended: calendar months, as a separate fix). Debt sync defects found in acceptance (nanoid ids, `actor_user_id`, no debts route) are pre-existing and deferred. Details: the 2b plan's Acceptance results and Decisions & Deferrals. Next: 2b merge, then 2c brainstorm.
- Phase 2b merged to `main` locally (2026-10-05, fast-forward at `70fc25d`; branch deleted). Final whole-branch review: ready to merge after two `currency.ts` fixes (`90ce154`); gates at the merged tree: tsc (three programs) 0, lint 0, vitest 84 files / 1078 tests. Not pushed: `main` is 25 commits ahead of origin (`0c8b6fe`) and includes the 2b-0 migrations, so the user runs the 2b-0 production deploy (`supabase migration list --linked`, `db push --dry-run`, `db push`, SQL check) before `git push origin main`. Decisions taken 2026-10-05 are in the 2b plan's Decisions & Deferrals. Next, in order: 2b-0 deploy and push; `fix(analytics)` calendar-month count; debt sync defects spec; then the 2c brainstorm (start by narrowing the `asCents` allow-list).
- 2b-0 deployed to production (2026-10-05): `migration list --linked` showed only the two 2b-0 files pending, the dry run listed exactly those two, `db push` applied both, and the SQL check returned `lamport_fns = 0` and `update_check = ((household_id = get_user_household_id()) AND ((owner_user_id IS NULL) OR (owner_user_id = auth.uid())))`. Next: push `main`, confirm CI, then the `fix(analytics)` calendar-month count.
- Pushed and fixed (2026-10-05): `main` pushed at `3b6b9f8` (pre-push all five gates passed); CI runs `CI` 37270744806 and `Security Checks` 37270744801 both completed success. Production app not checked after this push. `fix(analytics)` calendar-month count merged to local `main` by fast-forward at `3effa6f` (not pushed): `differenceInCalendarMonths(end, start) + 1`; two tests (Jul 1 to Sep 30 = 33334; the analytics page's six-month range divides by 6, was 7, so every user's average read about 14% low). Review: ready to merge; Minor, not done: no year-boundary or reversed-range test, and a partial first month counts as a whole month (only reachable through FilterPanel custom dates). Next: push `3effa6f` (user) and confirm its CI, then the debt sync defects spec (brainstorm), then 2c.
- Pushed and spec'd (2026-10-06): `main` pushed at `5885b18` (pre-push five gates passed; `fix(analytics)` `3effa6f` now on origin). CI 37401860495 success; Security Checks 37401860477 failed on a new advisory, `seroval <=1.6.2` critical (GHSA-p6vx-979v-rg4c, GHSA-jp82-f5mq-hwhp), transitive via `@tanstack/router-core`. Fixed in `d9417fb` with an `overrides` pin `seroval ^1.6.8` (lock diff 3 lines; `npm audit fix` was rejected: it re-resolved 85 versions). Gates for `d9417fb`: prod audit exit 0, vitest 1079 passed, build exit 0, chromium smoke 11/11. Not pushed. Debt sync defects spec written: `docs/plans/2026-10-06-debt-sync-defects-design.md` (scope widened to end-to-end sync: the queue payload is the event envelope, writes are non-atomic, and debts have no pull path; decisions in its section 9). Next: user pushes `d9417fb` and later commits, confirm Security Checks green; user reviews the debt spec; then its implementation plan (writing-plans) on branch `debt-sync-defects`; then the 2c brainstorm.
- Pushed and approved (2026-10-06): `main` pushed at `25c4ca4` (pre-push five gates passed; includes the seroval override `d9417fb`). CI 37402924384 and Security Checks 37402924374 both completed success. The user approved the debt sync defects spec (`docs/plans/2026-10-06-debt-sync-defects-design.md`). Next: write the implementation plan (writing-plans) at `docs/plans/2026-10-06-debt-sync-defects.md` with per-task checkboxes, Task 0 cutting branch `debt-sync-defects`; then the 2c brainstorm.
- Debt sync plan written (2026-10-06): `docs/plans/2026-10-06-debt-sync-defects.md`, 14 tasks (0-13), Task 0 cuts `debt-sync-defects`. Planning found three points beyond the spec, listed in the plan's Decisions Needed with recommendations: the server cannot delete a transaction that has debt payments (`debt_payments.transaction_id` FK, no `ON DELETE`; recommended defer to the debts UI spec), a debt adjustment that cannot be prepared now fails the whole transaction edit (recommended), and unlinking a debt never reversed its payment (recommended fix in this branch). It also adds strictly increasing queue `created_at` (same-millisecond ties fell back to random UUID order). Next: user reviews the plan and answers Decisions Needed, then execution; then the 2c brainstorm (first item: narrow the `asCents` allow-list; the plan's nanoid ESLint block must then carry `restrictAsCents`).
- Debt sync defects done (2026-10-06): branch `debt-sync-defects` executed (subagent-driven, every task reviewed, whole-branch review "ready after fixes", fixes applied) and merged to `main` locally by fast-forward; not pushed. Gates at `1679bcf`: tsc three programs 0, lint 0, vitest 1131 passed + 1 skipped (env-gated local-stack integration test, which passes: 6 synced, 0 failed, server balance = local), build ok, bundle 354.6 KB gz of 355, chromium smoke 11/11. The integration test found a production bug: since `fe32b81` (2026-09-30) every edit of a device-created transaction failed to sync (`PGRST204` on `owner_user_id`, not a server column); fixed in the processor (`src/lib/sync/serverColumns.ts`) and stranded edits are requeued once at startup (user decisions). Cross-device debt gaps (server `updated_at`, double reversal, FK cascade, status re-derivation, name collisions) are deferred to the debts UI spec: plan's Decisions & Deferrals. Next: user pushes `main` (pre-push runs all gates), confirm CI, then the production SQL check (debt row counts, `pg_publication_tables`) and, on the phone, confirm Sync Issues show no new owner_user_id failures; then the 2c brainstorm (first item: narrow the `asCents` allow-list; the nanoid ESLint block must then also carry `restrictAsCents`).
- Pushed and green (2026-10-06): `main` pushed at `69e036a` (pre-push five gates passed). CI 37456454335 and Security Checks 37456454318 both completed success. Next: production SQL check (debt row counts, `pg_publication_tables`), phone check that Sync Issues show no new `owner_user_id` failures, then the 2c brainstorm.
- Production check (2026-10-06): `supabase_realtime` publishes no tables (realtime is inert in production; catch-up is the only cross-device path). Debt row counts (aliased re-run): debts 0, internal_debts 0, debt_payments 0, matching the spec expectation; rollout check closed. Next: 2c brainstorm.
- Phase 2c brainstorm (2026-10-07): split into 2c-1 (data-layer guards: `asCents` allow-list to `currency.ts` + `validations/**`, read-only `readDb` facade with writers relocated into the data layer, exhaustive outbox invariant test, Dexie schema-history fixture) and 2c-2 (query keys; re-measured at 33 `queryKey` sites / 15 invalidations / 12 files / 16 roots). 2c-1 spec: `docs/plans/2026-10-07-phase-2c1-data-guards-design.md` (decisions in its section 9). Next: user reviews the spec, then the 2c-1 implementation plan (writing-plans) on branch `phase-2c1-data-guards`; 2c-2 brainstorm after 2c-1 merges.
- Phase 2c-1 plan written (2026-10-07): `docs/plans/2026-10-07-phase-2c1-data-guards.md`, 9 tasks (0-8), Task 0 cuts `phase-2c1-data-guards`. Planning confirmed the two relocated modules compile clean under the strict program and found no `resolveJsonModule`, so the schema history fixture is a typed `.ts` module (plan Decisions & Deferrals). Next: user reviews the plan, then execution.
- Phase 2c-1 done (2026-10-07): branch `phase-2c1-data-guards` executed subagent-driven (every task reviewed; user-approved strengthening of the outbox invariant test; whole-branch review "ready after fixes", fixes applied) and merged to `main` locally by fast-forward; not pushed. Gates at `23226e6`: tsc three programs 0, lint 0, vitest 1218 passed + 1 skipped, build ok, bundle 354.7 KB gz, chromium smoke 11/11. Guards: `asCents` only in `currency.ts` + `validations/**`; read-only `readDb` outside `src/lib/{offline,debts,sync,dexie}` (writable `db`/`HouseholdHubDB` lint-restricted); realtime, import drafts and the event compactor relocated into the data layer; Dexie schema history frozen; exhaustive outbox invariant test (every written synced row must be queued, atomically). Deferred: dynamic-import/raw-Dexie bypasses, `confirmDrafts` two-transaction marking (plan Decisions & Deferrals). Next: user pushes `main`, confirm CI; then the 2c-2 brainstorm (query keys: 33 `queryKey` sites, 15 invalidations, 16 roots).
- Pushed and green (2026-10-07): `main` pushed at `1d2d492` (pre-push five gates passed). CI 37581203696 and Security Checks 37581203716 both completed success. Next: 2c-2 brainstorm (query keys).
- Phase 2c-2 brainstorm (2026-10-07): spec `docs/plans/2026-10-07-phase-2c2-query-keys-design.md` (decisions in its section 9). Scope is the key refactor plus invalidation fixes: `query-keys.ts` factory with merged roots (`transaction` → `transactions.detail`, `account-balance(s)` → `accounts.balances`), `xQueryOptions` for all 14 queries, `afterOutboxWrite(entity)` resolving through a typed `invalidatesAfterWrite` map (fixes balances/dashboard/budgets/category totals/analytics staying stale after transaction writes), processor invalidates the drained entity types, 10 dead invalidations deleted, plugin strict + `arch/no-inline-query-keys` at `error`. Re-measured: 14 query definitions / 13 roots, 25 plugin reports. Next: user reviews the spec, then the 2c-2 plan (writing-plans) on branch `phase-2c2-query-keys`.
- Phase 2c-2 plan written (2026-10-07): `docs/plans/2026-10-07-phase-2c2-query-keys.md`, 12 tasks (0-11), Task 0 cuts `phase-2c2-query-keys`. Planning found the duplicate-name hook tests seed the cache under `["accounts"]`/`["categories"]` (must move with the merged list keys), and added a per-task builder-identity test so each refactor task has a red step. Next: user reviews the plan, then execution.
- Phase 2c-2 done (2026-10-07): branch `phase-2c2-query-keys` executed subagent-driven (12 tasks, Task 9 run before Task 6 for bundle headroom; Task 7 committed by the user 9 B over budget, Task 8 brought it back under; whole-branch review "ready after fixes", fixes `916f645` + `b7b9ef4` re-reviewed) and merged to `main` locally by fast-forward; not pushed. `query-keys.ts` owns every key; 14 `xQueryOptions` builders; writes and the processor name entities and `invalidatesAfterWrite` decides staleness (transaction writes now refresh balances, dashboard, budgets, category totals, analytics); plugin strict + `arch/no-inline-query-keys` at error. Gates: tsc 0/0/0, lint 0, vitest 1278+1, size 355.0 KB (18 B headroom), smoke 11/11, full chromium E2E per-test equal to baseline except a layout test flaky on `main` too (logged in CLAUDE.md); browser check showed Accounts balances stale on `main`, fresh on the branch. Deferrals in the plan. Next: user pushes `main`, confirm CI; then Phase 3 (type-aware rules) brainstorm.
- Pushed and green (2026-10-08): `main` pushed at `c631a13` (pre-push five gates passed); CI 37713991787 and Security Checks 37713991744 both success. Open: Dependabot grouped PR #11 (38 minor/patch updates) fails CI on `60e9ad8`: recharts types drop `categoryId` from `PieSectorDataItem` (`CategoryChart.tsx:107`) and the newer `eslint-plugin-react-hooks` flags a synchronous setState in an effect. Next: Phase 3 brainstorm (type-aware rules); decide there whether PR #11 lands first.
- Phase 3 brainstorm (2026-10-08): split into PR #11 (Dependabot group, fix recharts `PieSectorDataItem` and react-hooks setState-in-effect, then budget = measured + 3 KB), 3a (type-aware promise rules at default strength with every site fixed, production non-null cleanup, `noUncheckedIndexedAccess` repo-wide and `tsconfig.strict.json` deleted, all rules `error` with `--max-warnings=0` in CI and the Stop hook) and 3b (Knip, incl. the unrouted debts UI and push notifications). Re-measured: floating 30 / misused 51 / non-null 20 production, NUIA 4 production + 107 tests. Spec: `docs/plans/2026-10-08-phase-3a-lint-depth-design.md`. Next: user reviews the spec, then the plan.
- Phase 3a plan written (2026-10-08): `docs/plans/2026-10-08-phase-3a-lint-depth.md`, Part A (A0-A2, branch `deps-pr11`: re-apply PR #11 versions with npm, fix recharts pie click and react-hooks render-time state, budget) and Part B (B0-B8, branch `phase-3a-lint-depth`). Planning verified that `projectService` rejects the lint test's probe paths, so that test runs without type information; bare `void` is allowed only for router `navigate`, `prefetchQuery` and infinite-page fetches. Next: user reviews the plan, then execution.
- Phase 3a done (2026-10-08): Part A (Dependabot PR #11, budget 378 KB) pushed at `b5daff0`; Part B branch `phase-3a-lint-depth` executed subagent-driven (B1-B7 reviewed, fix rounds on B5 and B7; whole-branch review "ready after fixes", fixes re-reviewed) and merged to `main` locally by fast-forward; not pushed. Type-aware promise rules and `no-non-null-assertion` at `error`, `--max-warnings=0` in CI, pre-push and the Stop hook; `noUncheckedIndexedAccess` repo-wide and `tsconfig.strict.json` deleted. Gates: lint 0, vitest 1280+1, tsc 0/0, size 374.7 KB of 378, full chromium E2E per-test equal to baseline (known flakes only), pre-commit ~5.7 s. Deferrals in the 3a plan. Next: user pushes `main`, confirm CI; then 3b (Knip) brainstorm.
- Pushed (2026-10-08): `main` at `c8202b3` (pre-push four gates passed); CI 37764812546 and Security Checks 37764812564 both success (Part A on `b5daff0`: 37752239257 / 37752239226 success). Dependabot closed PR #11 itself. Next: the 3b brainstorm (Knip in CI, blocking). Knip input measured 2026-10-08 with `npx -y knip@latest --no-exit-code --reporter compact` (no config): 29 unused files, of which `workers/**`, `supabase/functions/**` and `scripts/*` are missing entries rather than dead code, and the real candidates are the unrouted `src/components/debts/**` UI (forms, list, cards, `PaymentHistoryList`), `NotificationSettings` + `usePushNotifications`, `CompactionMonitor`, `ColumnMapper`, `BudgetProgressBar`, `ui/dropdown-menu`, `hooks/useBudgets`, `lib/types/offline`, `types/{device,index,resolution}`; 35 unused exports, 15 unused exported types; unused deps `@radix-ui/react-dropdown-menu`, `@tanstack/react-table`; unused devDeps `axe-core`, `lighthouse`, `shadcn`; unlisted `nanoid` (used by `lib/sync/eventCompactor.ts`), `dotenv` (e2e fixtures), `@eslint/js`; unlisted binary `supabase`. Also caller-less: `src/hooks/useBudgetActuals.ts` (3a). Deleting product code (debts UI, push notifications) is a user decision, not lint cleanup.
- Phase 3b brainstorm (2026-10-09): spec `docs/plans/2026-10-09-phase-3b-knip-design.md` (decisions in its section 8). Re-measured at `6d63d0c` with Knip 6.40.0: counts unchanged from 2026-10-08; with the missing entries configured, 23 unused files; with `ignoreExportsUsedInFile`, 27 exports / 7 types. Scope: dependency fixes (`nanoid` → `crypto.randomUUID()` with the ban widened to `src/`; `dotenv`, `@eslint/js` listed; `shadcn` CLI, `axe-core`, `lighthouse`, `@radix-ui/react-dropdown-menu` removed; `@tanstack/react-table` kept), dead files and exports fixed, a commented `knip.jsonc` ignore list (debts UI, push client, `CompactionMonitor`, `ColumnMapper`, `BudgetProgressBar`, `useBudgetActuals` kept for later use) with `--treat-config-hints-as-errors`, and Knip blocking from day one in CI and pre-push. After 3b: the debts UI spec (route + the five deferred cross-device gaps), then a push notifications spec. Next: user reviews the spec, then the 3b plan (writing-plans) on branch `phase-3b-knip`.
- Phase 3b plan written (2026-10-09): `docs/plans/2026-10-09-phase-3b-knip.md`, 7 tasks (0-6), Task 0 cuts `phase-3b-knip`; Task 1's `knip.jsonc` was run against `main` during planning (7 files / 1 dep / 4 unlisted / 14 export lines / 6 type lines / 1 duplicate, no config hints). Planning found that `workers/push-notifier` works as a Knip workspace without npm workspaces, and that `csv-importer.ts`'s unused helpers are ColumnMapper's companion, so they are ignored rather than deleted (plan Decisions & Deferrals). Spec review accepted the defaults (delete the seven files, ignore the `xlsx` script). Next: user reviews the plan, then execution.
- Phase 3b done (2026-10-09): `phase-3b-knip` executed subagent-driven and fast-forwarded to `main` locally; not pushed. Knip 6.40.0 pinned, `knip.jsonc` with a commented ignore list, `npm run knip` (`--treat-config-hints-as-errors`) exit 0 and blocking in CI (`knip` job, `e2e` needs it) and pre-push (fifth check). `nanoid` gone from `src` (compactor snapshot ids are `crypto.randomUUID()`, lint ban covers all `src` blocks); `dotenv`, `@eslint/js` explicit; `shadcn`, `axe-core`, `lighthouse`, `@radix-ui/react-dropdown-menu` removed; 7 dead files and ~40 dead exports/types deleted. Gates: lint 0, vitest 1282+1, tsc 0/0, size 374.6 KB of 378, smoke 11/11. Deferrals in the 3b plan. Next: user pushes `main`, confirm CI; then the debts UI spec.
- Pushed (2026-10-09): `main` at `2b07737`; CI 37903120158 (incl. new `knip` job) and Security Checks 37903120195 both success. Next: the debts UI spec.
- Debts UI brainstorm (2026-10-10): spec `docs/plans/2026-10-10-debts-ui-design.md` (decisions in its section 7). External debts only; internal debts get their own spec next, before push notifications. Two branches: `debts-sync-gaps` (one migration: server `updated_at` triggers, `transaction_id` nullable `ON DELETE SET NULL`, unique `reverses_payment_id`, name uniqueness dropped; processor 23505 rule, deterministic reconcile after pull, status re-derivation, delete coalescing), deployed to production before `debts-ui` (`/debts` + `/debts/$debtId` mirroring accounts, Knip ignore removed in the routing commit). Next: user reviews the spec, then the plan (writing-plans).
- Debts UI plan written (2026-10-10): `docs/plans/2026-10-10-debts-ui.md`, 16 tasks: Part A (0-7, branch `debts-sync-gaps`, ends with the user's production deploy and push) and Part B (8-15, branch `debts-ui`). Planning revised the spec (recorded in both docs): server-set `created_at` on payment inserts and `updated_at` on debt inserts (the shared catch-up cursor would otherwise skip late offline rows), keeper by smallest `id`, local ledger rows keep `transaction_id`, reconcile skips transactions missing from Dexie and reverses pulled orphans, routes follow `/analytics`. Found out of scope: `accounts.tsx` has no `<Outlet />`, so `/accounts/$accountId` never renders. Next: user answers the plan's Decisions Needed, then execution.
