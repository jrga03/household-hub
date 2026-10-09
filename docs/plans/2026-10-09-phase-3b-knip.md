# Phase 3b Knip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Knip with a settled, commented ignore list, fix every finding outside it, and gate on an empty report in CI and pre-push.

**Architecture:** Task 1 adds the config first so every later task measures against `npm run knip`. Tasks 2-4 clear the report (dependencies, dead files, dead exports). Task 5 turns the empty report into a blocking gate in CI and pre-push. Each commit leaves lint, tests and tsc green.

**Tech Stack:** Knip 6.40.0, ESLint 9 flat config, vitest, GitHub Actions, npm 11, Node 26.

**Spec:** `docs/plans/2026-10-09-phase-3b-knip-design.md` (approved 2026-10-09).

## Global Constraints

- Branch `phase-3b-knip` from `main` at `20aa95d` or later.
- Ignore policy (spec section 3): every ignore entry carries a `//` comment with why and the revisit trigger; feature-deferred code by exact path; unused exports/types ignored by issue type only in `src/components/ui/**` and `src/types/database.types.ts`; `ignoreExportsUsedInFile: true`; everything else is fixed, not ignored; Knip runs with `--treat-config-hints-as-errors`.
- Fix rule for an unused export (Task 4): if the symbol has no reference anywhere in `src`, `tests`, `scripts` (check with `grep -rnw <name> src tests scripts`), delete it; if it is referenced only inside its own file, remove `export`. Re-run `npm run knip` after each file; a deletion may expose a newly unused symbol, which follows the same rule.
- `dotenv` and `@eslint/js` become explicit devDeps before `shadcn` is removed (`dotenv` resolves through `shadcn` today).
- IDs: `crypto.randomUUID()`; `nanoid` is banned in all of `src/` production code.
- No `any`. No `!` in production code. No blanket `eslint-disable`.
- Conventional Commits; never add Co-Authored-By or Claude Session lines. Stage files by name. If a commit is denied by a permission check, stop and report.
- Node 26: prefix commands with `source ~/.nvm/nvm.sh >/dev/null && nvm use 26 >/dev/null &&`.
- Gates: `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.tests.json`, `npm run lint -- --max-warnings=0`, `npx vitest run`, `npm run knip` (from Task 1; must be exit 0 from Task 4), `npm run build`, `npm run size`, `npm run test:e2e:smoke`.
- `git push` over SSH hangs from Claude's shell: the user pushes with `!`.

## File Structure

| File                                                 | Responsibility                                                |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `knip.jsonc` (new)                                   | Entries, workspaces, the commented ignore list                |
| `package.json`, `package-lock.json`                  | `knip` script and devDep; dependency adds and removals        |
| `src/lib/sync/eventCompactor.ts` + its test          | Snapshot ids from `crypto.randomUUID()`                       |
| `eslint.config.js`                                   | `restrictNanoid` in every `src` `no-restricted-imports` block |
| `src/lib/__tests__/architecture-lint.test.ts`        | Proves the nanoid ban covers `src/lib/sync` and `src/hooks`   |
| Deleted files (Task 3) and flagged exports (Task 4)  | Dead code removal                                             |
| `scripts/pre-push.mjs` + `scripts/pre-push.test.mjs` | Fifth check `knip`                                            |
| `.github/workflows/ci.yml`                           | Blocking `knip` job                                           |
| `CLAUDE.md`, `.husky/README.md`, roadmap             | Command, pre-push description, stack line, Phase 3 checkbox   |

## Progress

- [ ] Task 0: Branch
- [ ] Task 1: Knip config and script
- [ ] Task 2: Dependencies and the nanoid ban
- [ ] Task 3: Dead files
- [ ] Task 4: Dead exports and types
- [ ] Task 5: Blocking gate in CI and pre-push
- [ ] Task 6: Acceptance

---

### Task 0: Branch

- [ ] **Step 1:** Confirm a clean tree and the base.

Run: `git status -sb && git log --oneline -3`
Expected: `## main...origin/main` (ahead count allowed, no changes); top commit `20aa95d docs(plans): phase 3b spec review decisions` or later.

- [ ] **Step 2:** `git switch -c phase-3b-knip`

---

### Task 1: Knip config and script

**Files:**

- Create: `knip.jsonc`
- Modify: `package.json` (script `knip`, devDep `knip`)

**Interfaces:**

- Produces: `npm run knip` (exit non-zero while findings remain), used by every later task.

- [ ] **Step 1:** Install Knip pinned.

Run: `npm install --save-dev --save-exact knip@6.40.0`
Expected: `package.json` devDependencies gains `"knip": "6.40.0"`.

- [ ] **Step 2:** Add the script to `package.json` `scripts`, after `"lint:fix"`:

```json
    "knip": "knip --treat-config-hints-as-errors",
```

- [ ] **Step 3:** Create `knip.jsonc`:

```jsonc
{
  "$schema": "https://unpkg.com/knip@6/schema.json",
  "workspaces": {
    ".": {
      // Vite, Vitest, Playwright, Husky and lint-staged are auto-detected; these entries are not.
      "entry": ["src/sw.ts", "supabase/functions/*/index.ts", "scripts/*.{mjs,js,cjs}"],
      "ignore": [
        // One-off importer reading a local spreadsheet; xlsx is deliberately not installed.
        // Revisit: delete when the category seed no longer needs regenerating.
        "scripts/read-excel-categories.cjs",
        // Unrouted debts UI, kept to be routed. Revisit: debts UI spec (removes this entry).
        "src/components/debts/**",
        // Push notification client, kept to be routed. Revisit: push notifications spec.
        "src/components/NotificationSettings.tsx",
        "src/hooks/usePushNotifications.ts",
        // Kept for later use (3b decision 2026-10-09). Revisit: when mounted; delete if still unused at the next dead-code review.
        "src/components/CompactionMonitor.tsx",
        "src/components/ColumnMapper.tsx",
        "src/components/budgets/BudgetProgressBar.tsx",
        "src/hooks/useBudgetActuals.ts",
      ],
      // Installed by supabase/setup-cli in CI and Homebrew locally (pinned 2.109.1 in CI).
      "ignoreBinaries": ["supabase"],
      // Kept for planned table sorting and filtering. Revisit: when a table adopts it.
      "ignoreDependencies": ["@tanstack/react-table"],
    },
    "workers/push-notifier": {
      "entry": ["src/index.ts"],
      // The worker's node_modules is not installed in this repo; it is deployed by hand with wrangler.
      "ignoreBinaries": ["wrangler"],
      "ignoreDependencies": ["wrangler"],
    },
  },
  "ignoreIssues": {
    // Vendored shadcn/ui: keep the upstream component API whole.
    "src/components/ui/**": ["exports", "types"],
    // Generated by `npm run gen:types`.
    "src/types/database.types.ts": ["exports", "types"],
    // Parsing helpers that ColumnMapper (kept above) will drive. Revisit: with ColumnMapper.
    "src/lib/csv-importer.ts": ["exports", "types"],
  },
  "ignoreExportsUsedInFile": true,
}
```

- [ ] **Step 4:** Measure the baseline.

Run: `npm run knip -- --reporter compact; echo "exit=$?"`
Expected: `exit=1`. Unused files (7): `src/components/ui/dropdown-menu.tsx`, `src/hooks/useBudgets.ts`, `src/lib/types/offline.ts`, `src/types/{device,index,resolution}.ts`, `tests/e2e/fixtures/test-data.ts`. Unused dependencies: `@radix-ui/react-dropdown-menu`. Unused devDependencies: `axe-core`, `lighthouse`, `shadcn`. Unlisted: `@eslint/js`, `nanoid` (2 files), `dotenv`. Unused exports: 14 lines (no `csv-importer.ts`, no `useBudgetActuals.ts`; verified against this exact config on 2026-10-09). Unused types: 6 lines. Duplicate exports: `src/lib/supabase.ts`. No configuration hints. If the counts differ, record the difference under Decisions & Deferrals before continuing. If Knip prints a configuration hint for an `ignore` entry (for example a `useBudgetActuals.ts` export still reported), move that path to `ignoreIssues` with `["exports"]` and the same comment.

- [ ] **Step 5:** Gates: `npm run lint -- --max-warnings=0`, `npx vitest run`, both tsc programs. Expected: all exit 0.

- [ ] **Step 6:** Commit.

```bash
git add knip.jsonc package.json package-lock.json
git commit -m "build(knip): add knip config and script"
```

---

### Task 2: Dependencies and the nanoid ban

**Files:**

- Modify: `src/lib/sync/eventCompactor.ts:39,244`
- Modify: `src/lib/sync/__tests__/eventCompactor.test.ts:16,39,~394`
- Modify: `eslint.config.js:520-566`
- Modify: `src/lib/__tests__/architecture-lint.test.ts:73-78,162-180`
- Modify: `package.json`, `package-lock.json`

**Interfaces:**

- Consumes: `npm run knip` (Task 1).

- [ ] **Step 1: Failing tests.** In `eventCompactor.test.ts`, after the `idempotency_key` assertion (around line 394) add:

```ts
// Snapshot ids are server ids: transaction_events.id is a UUID column
expect(snapshot?.id).toMatch(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
);
```

In `architecture-lint.test.ts`, delete the nanoid row of `cases` (lines 73-78): its `allowed` path `src/lib/sync/probe.ts` must now be flagged. Then add, after the `"no-restricted-imports still bans nanoid in src/lib/debts alongside asCents"` test:

```ts
it.each([
  "src/lib/sync/probe.ts",
  "src/hooks/probe.ts",
  "src/components/probe.tsx",
  "src/lib/probe.ts",
])("no-restricted-imports bans nanoid in %s", async (filePath) => {
  const code = 'import { nanoid } from "nanoid";\nexport const id = nanoid();\n';
  expect(await ruleIds(code, filePath)).toContain("no-restricted-imports");
});
```

- [ ] **Step 2: Run them red.**

Run: `npx vitest run src/lib/sync/__tests__/eventCompactor.test.ts src/lib/__tests__/architecture-lint.test.ts`
Expected: FAIL. The snapshot id is a 21-character nanoid string; the nanoid ban test fails for `src/lib/sync/probe.ts`, `src/hooks/probe.ts`, `src/components/probe.tsx`, `src/lib/probe.ts`.

- [ ] **Step 3: Compactor.** In `eventCompactor.ts` delete `import { nanoid } from "nanoid";` (line 39) and change line 244 to:

```ts
      id: crypto.randomUUID(),
```

In `eventCompactor.test.ts` delete `import { nanoid } from "nanoid";` (line 16) and change line 39 to `id: crypto.randomUUID(),`.

- [ ] **Step 4: ESLint.** In `eslint.config.js`, add `paths: [restrictNanoid]` to every `src` `no-restricted-imports` block so the four blocks without it match the debts/offline block:

```js
      "no-restricted-imports": [
        "error",
        { paths: [restrictNanoid], patterns: [restrictSupabase, restrictAsCents, restrictWritableDb] },
      ],
```

```js
      "no-restricted-imports": [
        "error",
        { paths: [restrictNanoid], patterns: [restrictAsCents, restrictWritableDb] },
      ],
```

```js
      "no-restricted-imports": ["error", { paths: [restrictNanoid], patterns: [restrictWritableDb] }],
```

```js
      "no-restricted-imports": ["error", { paths: [restrictNanoid], patterns: [restrictAsCents] }],
```

(The last one is the `src/lib/sync/**` + `src/lib/dexie/**` block.)

- [ ] **Step 5: Run green.** Same command as Step 2. Expected: PASS. Then `npx vitest run src/lib/__tests__/architecture-lint.test.ts` once more to confirm the "components keep both import bans" test still sees exactly 2 messages (nanoid is not in that probe).

- [ ] **Step 6: Manifest.** Add the explicit devDeps first, then remove.

Run: `npm install --save-dev dotenv@^17.2.3 @eslint/js@^9.39.3 && npm uninstall shadcn axe-core lighthouse`
Then: `npm ls dotenv @eslint/js` shows both at top level as direct devDependencies, and `npm ls @axe-core/playwright @lhci/cli` still resolves both.

- [ ] **Step 7: Knip.** Run: `npm run knip -- --reporter compact`
      Expected: no `Unlisted dependencies`, no `Unused devDependencies`; anything newly unlisted from the `shadcn` removal must be listed explicitly (add it with `npm install --save-dev <pkg>` and record it under Decisions & Deferrals).

- [ ] **Step 8: Gates.** lint, full `npx vitest run`, both tsc programs. Expected: exit 0.

- [ ] **Step 9: Commit.**

```bash
git add src/lib/sync/eventCompactor.ts src/lib/sync/__tests__/eventCompactor.test.ts eslint.config.js src/lib/__tests__/architecture-lint.test.ts package.json package-lock.json
git commit -m "fix(deps): uuid snapshot ids, nanoid banned in src, explicit dev deps"
```

---

### Task 3: Dead files

**Files:**

- Delete: `src/components/ui/dropdown-menu.tsx`, `src/hooks/useBudgets.ts`, `src/lib/types/offline.ts`, `src/types/device.ts`, `src/types/index.ts`, `src/types/resolution.ts`, `tests/e2e/fixtures/test-data.ts`
- Modify: `package.json`, `package-lock.json` (remove `@radix-ui/react-dropdown-menu`)
- Modify: any README that names a deleted file (`src/types/README.md`, `src/hooks/README.md`, `src/components/README.md`, `src/lib/README.md` if present)

- [ ] **Step 1:** Confirm no importers.

Run: `grep -rn "ui/dropdown-menu\|hooks/useBudgets\"\|lib/types/offline\|types/device\|@/types\"\|types/resolution\|fixtures/test-data" src tests --include='*.ts' --include='*.tsx'`
Expected: no output.

- [ ] **Step 2:** Delete.

```bash
git rm src/components/ui/dropdown-menu.tsx src/hooks/useBudgets.ts src/lib/types/offline.ts src/types/device.ts src/types/index.ts src/types/resolution.ts tests/e2e/fixtures/test-data.ts
npm uninstall @radix-ui/react-dropdown-menu
```

- [ ] **Step 3:** Radix versions stay aligned (CLAUDE.md rule).

Run: `npm ls @radix-ui/react-dismissable-layer`
Expected: a single version.

- [ ] **Step 4:** Remove README lines that describe the deleted files.

Run: `grep -rn "dropdown-menu\|useBudgets\.ts\|offline\.ts\|device\.ts\|resolution\.ts\|types/index\|test-data" --include=README.md src tests`
Edit each hit out (keep surrounding structure).

- [ ] **Step 5:** `npm run knip -- --reporter compact`. Expected: no `Unused files`, no `Unused dependencies`. A file that becomes unused because its only importer was deleted follows the same rule (delete, after a grep shows no importers).

- [ ] **Step 6:** Gates: lint, vitest, both tsc. Expected: exit 0.

- [ ] **Step 7:** Commit.

```bash
git add -A src/components/ui src/hooks src/lib/types src/types tests/e2e/fixtures package.json package-lock.json
git add <each README edited>
git commit -m "refactor: delete unreferenced files and the dropdown-menu dependency"
```

---

### Task 4: Dead exports and types

**Files (each per the Global Constraints fix rule; reference counts measured 2026-10-09):**

- `src/components/TransactionFilters.tsx`: delete the `TransactionFilters` wrapper function and its doc comment (lines ~419-430); `TransactionFiltersPanel` stays.
- `src/hooks/useMediaQuery.ts`: delete `useIsDesktop`, `useBreakpoint`, then `Breakpoint` if it becomes unused.
- `src/lib/currency.ts`: delete `CURRENCY_CODE`.
- `src/lib/debts/__tests__/test-utils.ts`: delete `createTestPayments`, `wait`, `generateIdempotencyKey`, `createDateString`, `createTimestamp`.
- `src/lib/device-registration.ts`: delete `deactivateDevice`, `isDeviceActive`.
- `src/lib/dexie/deviceManager.ts`: delete the standalone `clearDeviceId` and `hasDeviceId` functions (lines ~559-580); the `deviceManager.clearDeviceId()` method used by `checkpoint-019.test.ts` stays.
- `src/lib/sync/lamportClock.ts`: delete `mergeLamportClock`.
- `src/lib/sync/retry.ts`: delete `sleep`; remove `sleep: vi.fn()...` from the `vi.mock("@/lib/sync/retry", ...)` factory in `src/lib/sync/__tests__/processor.test.ts:13-16`.
- `src/lib/validateColor.ts`: delete `validateColorOrThrow`.
- `src/types/accounts.ts`: delete `isValidAccountType`, `isValidAccountVisibility`, `getAccountTypeLabel`, `AccountInsert`, `AccountUpdate`.
- `src/types/categories.ts`: delete `CategoryInsert`, `CategoryUpdate`.
- `src/types/event.ts`: delete `TransactionEvent` (a duplicate of the one in `src/lib/dexie/db.ts`, which every caller uses).
- `src/types/sync.ts`: delete `LamportClock`, `EntityClockState`, `SyncQueueInsert`, `SyncQueueUpdate`, `SyncQueueFilters`.
- `src/types/transactions.ts`: delete `TransactionUpdate`, `TransferPair`.
- `src/lib/duplicate-detector.ts`: delete `DuplicateResolution`.
- `tests/e2e/fixtures/db-cleanup.ts`: delete `cleanupAll`, `getTestUserId`.
- `tests/e2e/fixtures/helpers.ts`: delete `createTestTransaction`, `waitForSync`.
- `src/lib/sync/serverColumns.ts` (`transactionColumnsMatchTable`) and `src/types/app-database.ts` (`transactionsViewKeysMatchTable`): compile-time assertions; keep exported, add `/** @public */` on the line above each.
- `src/lib/supabase.ts`: `untypedSupabase` is an intentional alias (16 references). Add `/** @alias */` above it.

- [ ] **Step 1:** Before each deletion, run `grep -rnw <symbol> src tests scripts` and confirm the only hits are the definition (and, for `sleep`, the processor test mock). If any other hit appears, stop and record it under Decisions & Deferrals instead of deleting.

- [ ] **Step 2:** Apply the edits above, one file at a time, running `npx tsc --noEmit -p tsconfig.json` after each `src` file and `npx tsc --noEmit -p tsconfig.tests.json` after each `tests` file.

- [ ] **Step 3:** Clear cascades: `npm run knip -- --reporter compact` and apply the fix rule to anything new, until the report is empty.

Run: `npm run knip; echo "exit=$?"`
Expected: `exit=0`, no output besides Knip's success line. If `@alias` does not silence the duplicate export in Knip 6.40.0, use `"ignoreIssues": { "src/lib/supabase.ts": ["duplicates"] }` with the comment `// untypedSupabase is a deliberate untyped alias of the typed client.` and record it under Decisions & Deferrals.

- [ ] **Step 4:** Gates: lint, full vitest, both tsc. Expected: exit 0.

- [ ] **Step 5:** Commit.

```bash
git add <each modified file by name> knip.jsonc
git commit -m "refactor: delete unused exports and types flagged by knip"
```

---

### Task 5: Blocking gate in CI and pre-push

**Files:**

- Modify: `scripts/pre-push.mjs:10-15`
- Test: `scripts/pre-push.test.mjs`
- Modify: `.github/workflows/ci.yml` (new job after `lint`)
- Modify: `CLAUDE.md` (stack line 3, Commands, pre-push line 47), `.husky/README.md:12`

- [ ] **Step 1: Failing test.** In `scripts/pre-push.test.mjs`, add `CHECKS` to the import from `./pre-push.mjs` and append:

```js
describe("CHECKS", () => {
  it("runs knip with config hints as errors", () => {
    expect(CHECKS.find((check) => check.name === "knip")).toEqual({
      name: "knip",
      command: "npm",
      args: ["run", "knip"],
    });
  });
});
```

- [ ] **Step 2:** Run: `npx vitest run scripts/pre-push.test.mjs`. Expected: FAIL (`undefined` does not equal the object).

- [ ] **Step 3:** Add to `CHECKS` in `scripts/pre-push.mjs`, after `tsc tests`:

```js
  { name: "knip", command: "npm", args: ["run", "knip"] },
```

- [ ] **Step 4:** Re-run Step 2. Expected: PASS.

- [ ] **Step 5: CI job.** In `.github/workflows/ci.yml`, after the `lint` job, add:

```yaml
# Dead code and dependency hygiene (roadmap 4.10); stale ignores fail too.
knip:
  runs-on: ubuntu-latest
  timeout-minutes: 10
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version-file: .nvmrc
        cache: "npm"
    - run: npm ci
    - name: Knip
      run: npm run knip
```

Also add `knip` to the `e2e` job's `needs:` list: `needs: [lint, knip, typecheck, unit-tests, build]`.

- [ ] **Step 6: Red checks (not committed).**
  1. Append `export const knipProbe = 1;` to `src/lib/utils.ts`. Run `npm run knip; echo "exit=$?"`. Expected: `exit=1`, reports `knipProbe`. Revert with `git checkout src/lib/utils.ts`.
  2. Add `"src/does-not-exist.ts"` to the root workspace `ignore` array. Run `npm run knip; echo "exit=$?"`. Expected: `exit=1` with a configuration hint naming that pattern. Revert with `git checkout knip.jsonc`.
     Record both outputs (one line each) in this plan's Acceptance results.

- [ ] **Step 7: Docs.**
  - `CLAUDE.md` line 3: `TanStack Router/Query/Table/Virtual` → `TanStack Router/Query/Virtual (Table installed, not yet used)`.
  - `CLAUDE.md` Commands, after `npm run lint`: `npm run knip               # unused files, exports, deps; stale ignores fail (knip.jsonc)`.
  - `CLAUDE.md` pre-push bullet: `runs lint (`--max-warnings=0`), `vitest run --allowOnly=false --silent`, the two tsc programs, and Knip in parallel.`
  - `.husky/README.md:12`: append `, and Knip` after `every tsc program`.

- [ ] **Step 8:** Gates: lint, full vitest, both tsc, `npm run knip`. Expected: exit 0. Then `node scripts/pre-push.mjs < /dev/null; echo "exit=$?"`. Expected: five `pre-push: pass` lines including `knip`, `exit=0`.

- [ ] **Step 9:** Commit.

```bash
git add scripts/pre-push.mjs scripts/pre-push.test.mjs .github/workflows/ci.yml CLAUDE.md .husky/README.md
git commit -m "ci(knip): blocking knip job and pre-push check"
```

---

### Task 6: Acceptance

- [ ] **Step 1:** `npm ci` (fresh install from the lockfile), then every gate: both tsc, `npm run lint -- --max-warnings=0`, `npx vitest run`, `npm run knip`, `npm run build`, `npm run size`. Expected: all exit 0; size within 0.1 KB of 374.7 KB (unused files were never bundled).
- [ ] **Step 2:** `supabase start` if not running, then `PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke`. Expected: 11/11 passed (the e2e fixtures changed in Tasks 3-4).
- [ ] **Step 3:** Record results under Acceptance results (exact counts and the size line), check off the roadmap item `- [ ] Knip in CI, blocking` in `docs/plans/2026-09-30-guardrails-roadmap.md`, and add a Resume state bullet.
- [ ] **Step 4:** Whole-branch review (superpowers:requesting-code-review), fixes, then merge to `main` by fast-forward. The user pushes; confirm the CI `knip` job and Security Checks are green and record run IDs.

## Acceptance results

(filled in Task 6)

## Decisions & Deferrals

- **`csv-importer.ts` exports are ignored, not deleted (planning, 2026-10-09).** Why: its only production importer is `ColumnMapper`, which the user chose to keep; deleting `parseCSV`, `mapRowToTransaction`, `batchProcess` and the rest would leave ColumnMapper with nothing to drive. Revisit: with ColumnMapper.
- **`read-excel-categories.cjs` is ignored and `xlsx` is not installed (spec review default, 2026-10-09).** Why: one-off script reading a hard-coded file in the user's Downloads folder. Revisit: delete when the category seed no longer needs regenerating.
- **`workers/push-notifier` is its own Knip workspace (verified 2026-10-09).** Knip 6.40.0 accepts it without npm workspaces; `web-push` then resolves against the worker's manifest. `wrangler` is ignored there because the worker's `node_modules` is not installed in this repo.
- **Nanoid ban stays off test files.** Why: tests are already outside every `no-restricted-imports` block; Knip's unlisted check catches a test importing `nanoid` once nothing lists it.
- **`e2e` CI job also needs `knip`.** Why: matches how it already waits on lint, typecheck, unit tests and build.
