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
- [ ] Budgets: insert, upsert, delete through `src/lib/offline/budgets.ts` (0.5b: `budgets.month_key` is a generated column, so the outbox update payload must omit it)
- [ ] Then flip the Phase 1 Supabase-write selector from `warn` to `error`
- Approach (decided 2026-09-30): outbox mutations fetch the single row from Supabase and store it locally when it is missing from IndexedDB ("fetch on miss"), then apply the change and enqueue. Offline, the UI only shows local rows, so a missing row and no network cannot coincide.

### Follow-ups recorded 2026-09-30

- Supabase-write selector allowlist: `src/lib/dexie/deviceManager.ts` and `src/lib/device-registration.ts` (device registry/heartbeat, not household data; see the Phase 0.5a design Decisions & Deferrals).
- Transfer delete removes both legs through the outbox (today only the chosen leg is deleted; the server unlinks the other).
- `CurrencyInput` hardcodes `aria-label="Amount in Philippine Pesos"`, overriding visible field labels (Phase 1 jsx-a11y; update `tests/e2e/budgets.spec.ts` locator with it).

### Future: full local copy (deferred 2026-09-30)

IndexedDB is not a full mirror: the reconnection catch-up pulls only rows changed since its cursor, and a fresh device starts with the last 24 hours (`src/lib/realtime-sync.ts` `fetchLatestChanges`). Offline reads on a fresh device therefore miss older data. Backfill every transaction, account, category, and budget on first login (paginated, storage-quota aware, with progress UI). Revisit: after Phase 0.5, or sooner if offline reads of older data are reported missing.

### Phase 1: Cheap wins

- [ ] Wire `jsx-a11y` recommended into `eslint.config.js`; fix 10 violations
- [ ] Enable `noImplicitOverride` and `verbatimModuleSyntax`; fix 12 errors
- [ ] Add the Dexie-write, money, data-access, and `.from("transactions")` selectors (4.4 to 4.6) as `error`, and the Supabase-write selector as `warn` until Phase 0.5b is done
- [ ] Add `tsconfig.tests.json` (with explicit `@types/node`) and `tsconfig.strict.json`; run both in CI
- [ ] Add the four hooks (4.9) and merge them into the existing `.claude/settings.json`
- [ ] Dependabot config and `audit` job (4.11)

### Phase 2: Contracts

- [ ] `gen:types` script, regenerate, type the Supabase client, fix errors
- [ ] `database` CI job: `db lint`, pgTAP RLS tests, type drift check
- [ ] Zod schemas at the import, RPC, and realtime boundaries (4.2)
- [ ] Branded `Cents` and `asCents` import restriction (4.4)
- [ ] `readDb` facade, outbox invariant test, Dexie schema snapshot test (4.5)
- [ ] `transactions_non_transfer` view, move analytics and budget reads to it, unit test asserting the view is used (4.6)
- [ ] `src/lib/query-keys.ts` + `@tanstack/eslint-plugin-query` strict; migrate one entity per commit; then enable the inline-key ban as `error`
- [ ] Split CI jobs (4.13)

### Phase 3: Depth

- [ ] Type-aware rules as `warn`; clear floating/misused promises starting in `src/lib/sync` and `src/hooks/useSyncQueueOperations.ts`; flip to `error`
- [ ] `no-non-null-assertion` cleanup outside tests; flip to `error`
- [ ] `noUncheckedIndexedAccess` repo-wide, biggest buckets first (`TransactionList`, `lib/offline`, `lib/pdf-parsers`)
- [ ] Exit criterion: every rule is at `error` and `npm run lint` reports zero warnings. Then add `--max-warnings=0` to the Stop hook and the CI `lint` job
- [ ] Knip in CI, blocking

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
