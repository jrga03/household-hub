# Phase 1a: Cheap Wins (Design)

**Date:** 2026-10-01
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 1)
**Branch:** `phase-1a-cheap-wins`

## Goal

Turn the architecture rules that Phases 0 to 0.5 made true into checks that fail: lint rules for outbox writes, money parsing, data access, and raw transactions reads; jsx-a11y; two stricter tsconfig flags; a type-checked `tests/` tree; Claude Code hooks; Dependabot and an audit gate. Phase 1 is split: 1a (this spec) lands the guardrails, 1b lands `tsconfig.strict.json` and its fixes on a separate branch and spec.

## Background (measured on `main` at `913efac`, 2026-10-01)

The roadmap's Phase 1 counts were measured at `c7d19c7`, before Phases 0 to 0.5 changed about 60 files. Re-measured:

| Item                                      | Roadmap | Now                  | Sites                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jsx-a11y recommended                      | 10      | 9 hits, 7 sites      | `TransferForm.tsx:91,116,141` (label-has-associated-control); `dashboard/CategoryChart.tsx:123`, `routes/categories.tsx:103` (click-events-have-key-events + no-static-element-interactions each); `TransactionFormDialog.tsx:315` (no-autofocus); `ui/category-selector.tsx:166` (role-has-required-aria-props) |
| `noImplicitOverride`                      | 2       | 2                    | `ErrorBoundary.tsx:30,38`                                                                                                                                                                                                                                                                                        |
| `verbatimModuleSyntax`                    | 10      | 8                    | `AccountFormDialog.tsx` (2), `AuthProvider.tsx`, `dexie/db.ts`, `supabaseQueries.ts`, `authStore.ts` (2), `types/accounts.ts`                                                                                                                                                                                    |
| Dexie entity-write selector               | n/a     | 0 outside allowlist  | 171 hits, all in `lib/{offline,debts,dexie}` or test files                                                                                                                                                                                                                                                       |
| Supabase-write selector                   | n/a     | 0 outside allowlist  | `sync/processor.ts:341,358`, `dexie/deviceManager.ts:312,345,502`, `device-registration.ts:158`                                                                                                                                                                                                                  |
| Money selector                            | 5       | 0 outside ignores    | only `currency.ts`, `supabaseQueries.ts`                                                                                                                                                                                                                                                                         |
| Supabase import in routes/components      | 1       | 1                    | `routes/analytics/index.tsx:13` (accounts and categories lists for the filter panel)                                                                                                                                                                                                                             |
| `.from("transactions")` outside allowlist | 4       | 3                    | `hooks/useAnalytics.ts:107,169`, `hooks/useTransfers.ts:42`, all reads                                                                                                                                                                                                                                           |
| `tsconfig.tests.json` errors              | n/a     | 4                    | with the new flags and `allowJs`: 2 TS6133, 1 TS2345 (`debts/*.spec.ts`), 1 TS1484 (`fixtures/helpers.ts`); without `allowJs`, 2 TS7016 for `scripts/supabase-lifecycle.mjs`                                                                                                                                     |
| `tsconfig.strict.json` errors             | unknown | 190                  | Phase 1b                                                                                                                                                                                                                                                                                                         |
| `npm run lint` baseline                   | n/a     | 0 errors, 0 warnings |                                                                                                                                                                                                                                                                                                                  |
| `npm audit --omit=dev --audit-level=high` | n/a     | fails                | 1 critical: `seroval` (transitive, non-breaking fix)                                                                                                                                                                                                                                                             |
| `npm audit --audit-level=high`            | n/a     | fails                | 21 high, 3 critical; all but the `@lhci/cli`/`lighthouse` chain fix non-breaking                                                                                                                                                                                                                                 |

Other facts the design relies on:

- `src/lib/debts/sync.ts` no longer writes to Supabase (it only reads the session and the local queue), so it leaves the Supabase-write allowlist the roadmap listed.
- `src/lib/realtime-sync.ts` writes entity tables through `getTable()` (`:105`), which no selector can see. That is correct (it mirrors server echoes and must not enqueue), but Phase 2's `readDb` facade must allowlist it.
- `src/lib/import-drafts.ts` calls `.modify()` on `importSessions` and `event-compactor.ts`/`realtime-sync.ts` write `events`/`meta`; none are entity tables.
- Supabase `rpc` calls in `src/` are all reads (`get_account_balances`, `transactions_filter_summary`).
- ESLint 9.39.3 exposes core rules via `builtinRules` from `eslint/use-at-your-own-risk`. A prototype confirmed two aliases of `no-restricted-syntax` coexist and can be disabled independently per file.

## 1. Lint: one aliased rule per invariant

The roadmap (section 4.6) put every selector in one `no-restricted-syntax` array split into blocks by `ignores`. Options do not merge across flat config objects, and the four selectors have four different allowlists, so that would mean about seven blocks each repeating the right subset. Instead, `eslint.config.js` defines a local plugin that registers the core rule under four names:

```js
import { builtinRules } from "eslint/use-at-your-own-risk";

const restrictedSyntax = builtinRules.get("no-restricted-syntax");
const arch = {
  rules: {
    "no-direct-dexie-writes": restrictedSyntax,
    "no-direct-supabase-writes": restrictedSyntax,
    "no-ad-hoc-money-parse": restrictedSyntax,
    "no-raw-transactions-from": restrictedSyntax,
  },
};
```

Each rule is its own config object after the main `src/**` block, so its `files`/`ignores` stand alone and an `eslint-disable` names the specific invariant. Test files (`src/**/*.test.{ts,tsx}`, `src/**/__tests__/**`, `src/test/**`) are ignored by all four.

| Rule                             | Selector                                                                      | Not applied to                                                                                  | Message (gist)                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `arch/no-direct-dexie-writes`    | roadmap 4.5 Dexie selector                                                    | `src/lib/{offline,debts,sync,dexie}/**`                                                         | Entity writes go through `src/lib/offline/*` so the sync-queue item is written in the same Dexie transaction; a direct write never syncs (IMP-01)                                                               |
| `arch/no-direct-supabase-writes` | roadmap 4.5 Supabase selector                                                 | `src/lib/sync/**`, `src/lib/dexie/deviceManager.ts`, `src/lib/device-registration.ts`           | Supabase entity writes belong to the sync processor; writing elsewhere skips the outbox and offline support                                                                                                     |
| `arch/no-ad-hoc-money-parse`     | `CallExpression[callee.name=/^(parseFloat\|Number)$/]`                        | `src/lib/currency.ts`, `src/lib/supabaseQueries.ts`                                             | Parse pesos with `parsePHP`/`parsePHPSafe`/`parsePHPUnbounded` from `@/lib/currency`; URL amount params are already cents, validate them in a route search schema (`src/lib/validations/transactionsSearch.ts`) |
| `arch/no-raw-transactions-from`  | `CallExpression[callee.property.name='from'] > Literal[value='transactions']` | `src/lib/supabaseQueries.ts`, `src/lib/sync/**`, `src/lib/debts/**`, `src/lib/realtime-sync.ts` | Read transactions through `src/lib/supabaseQueries.ts`, which owns transfer exclusion (and, from Phase 2, the `transactions_non_transfer` view)                                                                 |

Plus core `no-restricted-imports` on `src/routes/**` and `src/components/**` with `patterns: [{ group: ["**/lib/supabase"], ... }]` ("Fetch through a hook or `@/lib/supabaseQueries` so reads get the Dexie offline fallback").

All five land as `error`. The money message follows the Phase 0 decision (not only `parsePHP`).

### Code moves that make `error` possible

- The analytics query in `useAnalytics.ts` (both the current and previous-year reads) and the transfers query in `useTransfers.ts` move into `supabaseQueries.ts` as exported functions; the hooks call them. No query text or behaviour changes; the hooks' query keys stay as they are (Phase 2 owns key changes).
- `routes/analytics/index.tsx` stops importing `supabase` and uses `useAccounts()` and `useCategories()` (top-level categories filtered in the route). This also fixes a live DATA-06 recurrence: the route cached its own fetch under the shared `["accounts"]` and `["categories"]` keys (all accounts including archived, parents-only categories), so visiting Analytics poisoned every other picker until the stale time ran out. The filter panel now lists active accounts in `sort_order`, like every other picker.

### Proof each rule fires

`src/lib/__tests__/architecture-lint.test.ts` runs ESLint's Node API (`new ESLint()` + `lintText(code, { filePath })`) against the real config: for each `arch/*` rule and the import rule, one violating snippet at a path outside the allowlist (expects the rule ID) and the same snippet at an allowlisted path (expects none). This catches a glob typo that silently disables a rule and the `use-at-your-own-risk` export moving in a future ESLint.

## 2. jsx-a11y

`jsxA11y.flatConfigs.recommended` scoped to `src/**/*.tsx`, as `error`. Fixes:

- `TransferForm.tsx`: associate the three labels with their controls (`htmlFor`/`id`, or the shadcn `FormLabel`/`FormControl` pattern if the form uses it).
- `CategoryChart.tsx:123`, `routes/categories.tsx:103`: interactive `div`s become `button` elements (or get `role`, `tabIndex`, and a key handler where a button would break layout).
- `TransactionFormDialog.tsx:315`: drop `autoFocus`, or replace it with Radix `onOpenAutoFocus` focusing the field, which is the dialog-correct way.
- `ui/category-selector.tsx:166`: add the ARIA props the role requires (e.g. `aria-controls`/`aria-expanded` for `combobox`).
- Recorded follow-up: `CurrencyInput` stops hardcoding `aria-label="Amount in Philippine Pesos"`, so the visible `FormLabel` names the field (fall back to the generic label only when no label is passed). Update the `tests/e2e/budgets.spec.ts` locator in the same commit.

## 3. TypeScript

- `tsconfig.json`: add `noImplicitOverride` and `verbatimModuleSyntax`; fix the 2 + 8 errors (`override` on `ErrorBoundary` members, `import type`).
- `tsconfig.tests.json`: extends `./tsconfig.json`, `compilerOptions.types: ["node"]`, includes `tests/**/*.ts` and `playwright.config.ts`. `allowJs: true` so `scripts/supabase-lifecycle.mjs` is typed by inference instead of needing a declaration file. Add `@types/node` as an explicit devDependency at the major already installed transitively (24). Fix the 4 errors.
- CI: a `Typecheck tests` step in the existing `ci` job runs `npx tsc --noEmit -p tsconfig.tests.json`. (`npm run build` already type-checks `src` via `tsc -b`. The job split is Phase 2.)

## 4. Claude Code hooks

As roadmap section 4.9, merged into `.claude/settings.json` next to `statusLine`, with scripts under `scripts/` that parse stdin with `node -e`:

- `agent-stop-check.sh`: section 4.9's script, plus: when a changed file is under `tests/` or is `playwright.config.ts`, also run `npx tsc --noEmit -p tsconfig.tests.json`. It caches a pass per tree hash, so unchanged turns skip the checks.
- `agent-lint-file.sh`: `tool_input.file_path` under `src/` ending `.ts`/`.tsx` → `npx eslint <file>`; exit 2 with the output on failure.
- `agent-bash-guard.mjs` (Node, not bash, so the matching is a pure function with a Vitest test in `scripts/agent-bash-guard.test.mjs`): exit 2 with a reason for `git push` with `--force`/`-f`/`--force-with-lease`, `supabase db push`, `supabase db (reset|push) ... --linked`, and `rm -rf`/`rm -fr` whose target is `/`, `~`, `$HOME`, a path starting `..`, or an absolute path outside `$CLAUDE_PROJECT_DIR` and `${TMPDIR:-/tmp}`. It is quote-aware and matches `push` only as the git subcommand.
- `agent-session-start.sh`: `git status -sb`, `git log --oneline -10`, and every `docs/plans/` path touched by the most recent plans commit, returned as `hookSpecificOutput.additionalContext`.

**Verification:** each script runs directly with crafted stdin JSON, one passing and one failing case each, exit codes shown. The Stop hook is run against a deliberately broken file twice: the first run exits 2, the second (same tree) exits 0, which is the loop guard section 6 asks to verify. A live check in a fresh Claude session follows, since hook config is read at session start.

## 5. Dependencies and CI

- `.github/dependabot.yml`: `npm` weekly with minor and patch grouped and majors as separate PRs; `github-actions` monthly.
- `package.json`: `"packageManager": "npm@10.9.8"`. Both workflows switch `setup-node` from `node-version: "22"` to `node-version-file: .nvmrc` (`v22`).
- New `audit` job in `ci.yml`: blocking `npm audit --omit=dev --audit-level=high`; a second step `npm audit --audit-level=high` with `continue-on-error: true` so dev-dependency advisories stay visible (superseded: consolidated into the existing Security Checks job, see Decisions & Deferrals "One audit gate").
- Run `npm audit fix` (non-breaking only, never `--force`) as the last task, lockfile in its own commit, gated on the full acceptance run because it bumps `vite` and `vitest`. The `lighthouse` 13 major is left to Dependabot.

## 6. Task order

Each task is one commit and leaves `tsc`, lint, and unit tests green.

0. Roadmap update (counts, 1a/1b split, Decisions) and this spec
1. tsconfig flags
2. Move the three transactions reads and the analytics route's Supabase import
3. `arch` plugin, the four rules, the import rule, and `architecture-lint.test.ts`
4. jsx-a11y wiring and fixes, `CurrencyInput` label, budgets E2E locator
5. `tsconfig.tests.json`, `@types/node`, 4 fixes, CI step
6. Hook scripts, settings merge, scripted verification
7. Dependabot, `packageManager`, `.nvmrc` in CI, `audit` job (superseded: consolidated into the existing Security Checks job, see Decisions & Deferrals "One audit gate")
8. `npm audit fix` lockfile

Execution: subagent-driven development with a reviewer per task and a final whole-branch review on the strongest model. Reviewer claims are checked against current code before acting on them.

## 7. Acceptance

Quoted output for each in the completion message:

- `npx tsc --noEmit -p tsconfig.json` and `-p tsconfig.tests.json`: exit 0
- `npm run lint`: 0 errors, 0 warnings (baseline)
- `npx vitest run`: all pass; file and test counts reported against 72 / 918
- `npm run build`, `npm run size`: exit 0
- `PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke` (chromium): 11 passed
- Each hook script case: expected exit code
- `npm audit --omit=dev --audit-level=high`: exit 0

Not verified by this phase: the device checks pending from 0.5a/0.5b, the full E2E suite, non-chromium browsers, and the hooks on CI (they are local-only).

## Phase 1b (separate spec)

`tsconfig.strict.json` (base + `noUncheckedIndexedAccess`, including `src/lib/{sync,offline,debts}`) and all 190 errors it reports, transitive files included: `TransactionList.tsx` 59, `lib/offline` tests 66, `pdf-parsers/bdo-credit-card.ts` 18, `lib/sync` 10, `lib/debts` 12, and the rest in ones and twos. Plus a CI step. Needs its own brainstorm on fix style (guards vs `.at()` vs restructuring) and how to smoke-test the UI files it touches.

## Decisions & Deferrals

- **Aliased core rule per invariant, not one `no-restricted-syntax` array (decided 2026-10-01).** Why: four allowlists would need about seven blocks repeating selector subsets; aliases keep each rule's scope independent and name the invariant in errors and disables. Cost: depends on `eslint/use-at-your-own-risk`, guarded by `architecture-lint.test.ts`. Revisit: if ESLint removes `builtinRules`, copy the selectors into local rules.
- **`src/lib/debts/sync.ts` is not on the Supabase-write allowlist.** Why: it no longer writes; an unused allowlist entry hides future writes. Revisit: never.
- **The three `.from("transactions")` reads move into `supabaseQueries.ts` now (decided 2026-10-01).** Why: lets the rule land as `error` with no temporary allowlist; Phase 2's view switch then edits one file. Revisit: never.
- **Audit gate is production-only; the full audit is report-only (decided 2026-10-01).** Why: the `@lhci/cli`/`lighthouse` chain has no non-breaking fix, and dev-only advisories do not ship to users. Revisit: when Dependabot's lighthouse 13 PR merges, consider making the full audit blocking.
- **`tsconfig.strict.json` moves to Phase 1b and fixes all 190 errors, transitive files included (decided 2026-10-01).** Why: the user chose full enforcement over a filtered scope; splitting keeps the guardrails from waiting on UI-heavy fixes. Consequence: Phase 3's `noUncheckedIndexedAccess` buckets shrink by `TransactionList` and `bdo-credit-card`. Revisit: 1b spec.
- **Analytics route uses the shared account and category hooks (decided 2026-10-01, found while planning).** Why: its private queries reused the shared keys with a different fetch (DATA-06 recurrence). Cost: the filter lists active accounts only, ordered by `sort_order`. Revisit: never.
- **Bash guard is a Node module, not a bash script.** Why: command parsing in bash regex is fragile and untestable; a pure function gets a unit test. Revisit: never.
- **Deferred: pristine unit-test output gate.** `npx vitest run` passes but prints heavy stderr from older suites. Revisit: after Phase 1b.
- **Note for Phase 2: `realtime-sync.ts` writes entity tables via `getTable()`.** The `readDb` facade must allowlist it.
- **One audit gate, in Security Checks (decided 2026-10-01).** Why: `.github/workflows/security-check.yml` already ran a blocking `npm audit --audit-level=high --omit=dev` (the roadmap baseline said there was no audit, which was wrong; that workflow also runs Lighthouse CI, so `@lhci/cli` is used in CI). The new ci.yml job was removed and the report-only full audit was added to the existing job. Revisit: never.
- **Deferred: `tests/e2e/debts/debt-reversals.spec.ts` "remove debt link" test is dead.** Why: the app's debt picker is a Radix Select (`value="none"`), so `select[name="debt_id"]` never matches and the test always skips; the `selectOption` fix in Task 5 only satisfies the type check. Revisit: when the debts E2E specs are reworked; rewrite against the Radix combobox.
- **Stop hook caches passes per tree state (decided 2026-10-01, final review).** Why: the full check cost about 8s on every turn, including turns with no edits. The hash covers changed files and the lint/type configs. Revisit: never.
- **Deferred: Bash guard false negatives.** `bash -c "..."`, `xargs rm -rf`, `find ... -exec rm -rf`, `rm -rf $PWD`/`$(pwd)/..`, `rm -rf .git` are not caught. The guard is best-effort; Claude Code's permission prompts are the primary control. Revisit: if one of these is ever attempted in practice.
- **Deferred: lint selector gaps.** `db.table("x").add()`, `Number.parseFloat`, `window.Number`, and unary `+` are not caught. Revisit: Phase 2 (`readDb` facade and branded `Cents` close them at the type layer).
- **Deferred: remaining dev-only audit advisories.** These are the `@lhci/cli`/`lighthouse` chain, `vitest`/`@vitest/mocker` (needs a vitest major), and `qs`. The full audit is report-only, and the production gate is clean. Revisit: when Dependabot's major PRs for lighthouse/vitest land.
- **Deferred: Analytics parent-category filter likely shows nothing (pre-existing, found by the final review).** `FilterPanel` offers top-level categories, but `fetchAnalyticsTransactions` filters `category_id = <parent id>` while transactions carry child ids. Not confirmed against live data. Not a regression: the old route behaved the same. Revisit: next analytics work; fix by expanding a parent to its child ids with `.in`.
