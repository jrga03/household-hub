# Phase 3a Lint Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land Dependabot PR #11 on a deliberate bundle budget, then make every promise in `src` owned, remove production `!`, enable `noUncheckedIndexedAccess` for the whole program, and finish with every lint rule at `error` and `--max-warnings=0`.

**Architecture:** Part A (branch `deps-pr11`) applies PR #11's version bumps on top of current `main`, fixes the two breaks, and resets `BUDGET_KB`. Part B (branch `phase-3a-lint-depth`) turns on type-aware lint at `warn`, fixes sites one area per task under a fixed policy, folds the strict tsconfig into the base, and flips everything to `error`.

**Tech Stack:** TypeScript 5.9, typescript-eslint 8 (`projectService`), ESLint 9 flat config, React 19, TanStack Router/Query, recharts 3, vitest.

**Spec:** `docs/plans/2026-10-08-phase-3a-lint-depth-design.md` (approved 2026-10-08).

## Global Constraints

- Part A must not start Part B; Part B branches from `main` after Part A merges.
- Fix policy (spec section 2, refined in Decisions below):
  - Async JSX handler: `onX={() => void run()}`; `run` catches, shows `toast.error(...)` and calls `reportError(error, { subsystem, operation })` from `@/lib/sentry`.
  - Async callback where void is expected (listeners, timers): a stable sync wrapper `() => void run()`, same ownership; `removeEventListener` must receive the same wrapper reference it was added with.
  - Floating promise: `await` inside an async flow; otherwise `void p.catch((error) => reportError(error, {...}))`. A bare `void p` is allowed only for APIs that resolve on failure by contract: TanStack Router `navigate`, `queryClient.prefetchQuery`, `fetchNextPage` / `fetchPreviousPage`, and a `useQuery` result's `refetch` (no `throwOnError` anywhere in `src`).
  - Non-null `!` in production: narrow with a guard. UI and parser code skips or renders nothing; data-layer code throws `new Error("<what is missing>")` where a missing value means corrupt data.
  - Tests: floating promises are awaited; tests may use `!` after asserting length.
- No `any`. No blanket `eslint-disable`; a disable needs a trailing `-- reason`.
- Conventional Commits; never add Co-Authored-By or Claude Session lines. Stage files by name. If a commit is denied by a permission check, stop and report.
- Node 26: prefix commands with `source ~/.nvm/nvm.sh >/dev/null && nvm use 26 >/dev/null &&`.
- Gates: `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.tests.json`, `npx tsc --noEmit -p tsconfig.strict.json` (until Task B6 deletes it), `npm run lint`, `npx vitest run`, `npm run build`, `npm run size`, `npm run test:e2e:smoke`.
- Warning count command (Part B): `npx eslint src -f json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);const c={};for(const f of r)for(const m of f.messages)c[m.ruleId]=(c[m.ruleId]||0)+1;console.log(JSON.stringify(c))})'`. Expected after each task: B1 `no-floating-promises` 36, `no-misused-promises` 51, `no-non-null-assertion` 20 (plus `no-rest-destructuring` 1); the task's sites then drop to 0.

## File Structure

| File                                                                                                               | Responsibility                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `package.json`, `package-lock.json`                                                                                | PR #11 versions; `@tanstack/eslint-plugin-query` already present |
| `src/components/dashboard/CategoryChart.tsx`, `src/components/TransactionFilters.tsx`                              | recharts 3.10 click typing; no setState in effect                |
| `scripts/check-bundle-size.mjs`                                                                                    | `BUDGET_KB`                                                      |
| `eslint.config.js`                                                                                                 | `projectService`, three type-aware/non-null rules                |
| `src/lib/__tests__/architecture-lint.test.ts`                                                                      | ESLint instance without type information for probe paths         |
| `src/lib/sync/autoSync.ts`, `src/lib/sync/__tests__/autoSync.test.ts`                                              | Listener wrappers, reported sync failures                        |
| ~45 files under `src/` (lists in Tasks B2-B5)                                                                      | Site fixes                                                       |
| `tsconfig.json`; deleted `tsconfig.strict.json`                                                                    | Flag repo-wide                                                   |
| `.github/workflows/ci.yml`, `scripts/pre-push.mjs`, `scripts/agent-stop-check.sh`, `.husky/README.md`, `CLAUDE.md` | Strict program removed; `--max-warnings=0`                       |

## Progress

- [x] Task A0: Branch and baseline (`deps-pr11`)
- [x] Task A1: Apply PR #11 versions and fix the breaks
- [x] Task A2: Budget, browser check, merge
- [ ] Task B0: Branch and baseline (`phase-3a-lint-depth`)
- [ ] Task B1: Type-aware rules at `warn`
- [ ] Task B2: Sync and offline
- [ ] Task B3: Hooks
- [ ] Task B4: Routes
- [ ] Task B5: Components, app shell, workers and tests
- [ ] Task B6: `noUncheckedIndexedAccess` repo-wide; delete the strict program
- [ ] Task B7: Exit: `error` and `--max-warnings=0`
- [ ] Task B8: Acceptance, docs, merge

---

### Task A0: Branch and baseline (`deps-pr11`)

- [ ] **Step 1:** `git status -sb` (expect `main`, clean), `git switch -c deps-pr11`.
- [ ] **Step 2:** Baselines:

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npm run build >/dev/null 2>&1 && npm run size 2>&1 | grep TOTAL
for f in dist/assets/index-*.js; do node -e "console.log(process.argv[1], require('zlib').gzipSync(require('fs').readFileSync(process.argv[1])).length)" $f; done
```

Expected: 97 + 1 files, 1278 + 1 tests; 355.0 KB; largest chunk 363,502 B.

---

### Task A1: Apply PR #11 versions and fix the breaks

**Files:** `package.json`, `package-lock.json`, `src/components/dashboard/CategoryChart.tsx:107`, `src/components/TransactionFilters.tsx:68-76`, plus any file the new react-hooks rules flag.

PR #11's branch predates `main`'s `package.json` changes (2c-2 added `@tanstack/eslint-plugin-query`), so its commit is not merged. Its versions are applied with npm instead; Dependabot closes the PR once `main` satisfies it.

- [ ] **Step 1: List the bumps.** `gh pr diff 11 -- package.json | grep -E '^[-+]\s+"' ` and record each `name: from → to` pair in the task report (38 packages across `dependencies` and `devDependencies`).
- [ ] **Step 2: Apply.** Edit each range in `package.json` to PR #11's new range, then `npm install`. Check `git diff package.json` contains only those range changes, and `npm ls @radix-ui/react-dismissable-layer` shows one version (CLAUDE.md rule). Commit: `build(deps): apply the minor-and-patch group from Dependabot PR #11`.
- [ ] **Step 3: See the breaks.** `npx tsc --noEmit -p tsconfig.json` (expect `CategoryChart.tsx(107,…) TS2339 categoryId`), `npm run lint` (expect `TransactionFilters.tsx:73` "Calling setState synchronously within an effect", possibly others). Record every report.
- [ ] **Step 4: CategoryChart.** Read the installed `Pie` `onClick` type (`grep -n "onClick" node_modules/recharts/types/polar/Pie.d.ts`). Use the sector index, which is typed and maps back to `data`:

```tsx
onClick={canHover ? (_sector, index) => handleCategoryClick(data[index]?.categoryId ?? null) : undefined}
```

If the installed signature has no index parameter, use the sector's `payload` narrowed to `CategorySlice` with a type guard instead (`typeof payload === "object" && payload !== null && "categoryId" in payload`).

- [ ] **Step 5: TransactionFilters.** Replace the effect at lines 68-76 with React's "adjust state when a prop changes" pattern, keeping its semantics (only resync when `filters.search` changes and differs from the input), and drop the `eslint-disable` line:

```tsx
// Resync the input when the search filter changes from outside (URL, clear
// button). Adjusting state during render replaces the old effect.
const [lastFilterSearch, setLastFilterSearch] = useState(filters.search);
if (filters.search !== lastFilterSearch) {
  setLastFilterSearch(filters.search);
  if ((filters.search ?? "") !== searchInput) setSearchInput(filters.search ?? "");
}
```

Remove `useEffect` from the import if now unused.

- [ ] **Step 6: Other new reports.** Fix any further react-hooks 7.1 reports from Step 3 by the same rule (derive in render or move into the event handler); list each in the report. If a fix needs a design choice, stop and report NEEDS_CONTEXT.
- [ ] **Step 7: Gates.** tsc (app, tests, strict), `npm run lint` (0 errors; the pre-existing `no-rest-destructuring` warning may remain), `npx vitest run` (all pass; fix any test broken by a bumped package and list it), `npm run build`. Commit: `fix(deps): recharts 3.10 pie click and react-hooks 7.1 render-time state`.

---

### Task A2: Budget, browser check, merge

- [ ] **Step 1: Measure.** `npm run build >/dev/null && npm run size`, plus the per-chunk byte command from A0. Record bytes.
- [ ] **Step 2: Budget.** If over 355 KB, set `BUDGET_KB` in `scripts/check-bundle-size.mjs` to `Math.ceil(measuredKB) + 3` and update its comment: `// gzip regression ceiling; reset to measured + 3 KB after Dependabot PR #11 (2026-10-08, was 355)`. If under, leave it. Commit: `build(size): bundle budget follows the 2026-10 dependency group`.
- [ ] **Step 3: Smoke.** `PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e:smoke` → 11 passed.
- [ ] **Step 4: Browser check** (controller): on the dashboard, click a slice of "Spending by Category"; the app navigates to `/transactions` filtered by that category. Type in the transactions search box, then clear filters; the input empties. Screenshot both, read them, state what they show.
- [ ] **Step 5: Review** the branch (task reviewer), then `git switch main && git merge --ff-only deps-pr11 && git branch -d deps-pr11`. Record bytes and the budget in the roadmap Decisions & Deferrals. Ask the user to push; confirm CI; confirm PR #11 closed (`gh pr view 11 --json state`), and close it with a comment pointing at the merge commit if Dependabot has not.

---

### Task B0: Branch and baseline (`phase-3a-lint-depth`)

- [ ] **Step 1:** `git switch -c phase-3a-lint-depth` from the post-A `main`.
- [ ] **Step 2:** Record vitest counts, tsc 0/0/0, `npm run lint` result, size.

---

### Task B1: Type-aware rules at `warn`

**Files:** `eslint.config.js` (the `src/**/*.{ts,tsx}` block at ~line 327, and the test-file block), `src/lib/__tests__/architecture-lint.test.ts:6-9`

- [ ] **Step 1: Probe instance first.** `projectService` cannot type a probe path that is not on disk (`was not found by the project service`). Change the test's ESLint construction so the `arch/*` cases keep working:

```ts
// Probe paths are not on disk, so the project service cannot type them; the
// type-aware rules are covered by `npm run lint` over real files instead.
eslint = new ESLint({
  overrideConfig: [
    {
      files: ["src/**/*.{ts,tsx}"],
      languageOptions: { parserOptions: { projectService: false } },
      rules: {
        "@typescript-eslint/no-floating-promises": "off",
        "@typescript-eslint/no-misused-promises": "off",
      },
    },
  ],
});
```

- [ ] **Step 2: Rules.** In the `src/**/*.{ts,tsx}` block's `parserOptions` add `projectService: true, tsconfigRootDir: import.meta.dirname,`. In its `rules` add:

```js
      // Every promise has an owner (roadmap 4.7). warn until Phase 3a's exit commit.
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
```

In the existing block for `src/test/**/*.ts`, `src/**/*.test.ts`, `src/**/*.spec.ts` (~line 283) add `"@typescript-eslint/no-non-null-assertion": "off"`. Check that block also covers `*.test.tsx` and `__tests__`; if not, add `"@typescript-eslint/no-non-null-assertion": "off"` in a block with `files: srcTestFiles`.

- [ ] **Step 3: Verify.** `npx vitest run src/lib/__tests__/architecture-lint.test.ts` (all pass); `npm run lint` exits 0 (warnings only); the warning count command prints `no-floating-promises` 36, `no-misused-promises` 51, `no-non-null-assertion` 20, `no-rest-destructuring` 1 (record actual; if different, list the extra sites for the area tasks). Time `npx eslint src/lib/sync/autoSync.ts src/routes/drafts.tsx src/components/TransactionList.tsx` and record seconds (pre-commit cost signal).
- [ ] **Step 4: Commit** `feat(lint): type-aware promise rules and no-non-null-assertion at warn`.

---

### Task B2: Sync and offline

**Sites:** `src/lib/sync/autoSync.ts:184,187,190` (listeners), `:261` (interval), `:372-374` (module listeners), `src/lib/sync/realtime.ts:278`, `src/lib/offline/transfers.ts:63,74-82`, `src/lib/offline/reads.ts:43,46,61,64`.

- [ ] **Step 1: Failing test** (append to `src/lib/sync/__tests__/autoSync.test.ts`; add `vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }))` beside the other mocks and `import { reportError } from "@/lib/sentry";`):

```ts
describe("AutoSyncManager error ownership", () => {
  let manager: AutoSyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFailedCount).mockResolvedValue(0);
    manager = new AutoSyncManager();
    manager.start("user-1");
  });

  afterEach(() => {
    manager.stop();
    restoreNavigatorOnLine();
  });

  it("reports a rejected drain instead of only logging it", async () => {
    const failure = new Error("drain blew up");
    vi.mocked(syncProcessor.processQueue).mockRejectedValueOnce(failure);

    await trigger(manager);

    expect(reportError).toHaveBeenCalledWith(failure, { subsystem: "sync", operation: "autoSync" });
  });

  it("an online event starts a drain without leaking a rejection", async () => {
    vi.mocked(syncProcessor.processQueue).mockRejectedValueOnce(new Error("offline again"));

    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(reportError).toHaveBeenCalled());
  });
});
```

Run → FAIL (`reportError` not called).

- [ ] **Step 2: autoSync.** In `triggerSync`'s catch add `reportError(error, { subsystem: "sync", operation: "autoSync" });` after the `console.error` (import from `@/lib/sentry`). Make the three handlers synchronous so they are valid listeners and keep their names (tests call them directly):

```ts
  private handleOnline = (): void => {
    console.log("[AutoSync] Online - triggering sync");
    void this.triggerSync();
  };
```

(same shape for `handleVisibilityChange` and `handleFocus`, keeping their guards). `triggerSync` never rejects (it catches), so `void` is owned. Interval at `:261`: `void this.triggerSync();`. Lines 372-374: read them; apply the same wrapper rule (a stable sync function that voids an owned promise).

- [ ] **Step 3: realtime.ts:278.** Read the site; wrap per the callback rule; the inner promise's errors go to `reportError(error, { subsystem: "realtime", operation: "<name>" })` if not already owned.
- [ ] **Step 4: transfers.ts.** Replace the get-after-set and the `!` mapping:

```ts
let group = transferGroups.get(leg.transfer_group_id);
if (!group) {
  group = { expense: null, income: null };
  transferGroups.set(leg.transfer_group_id, group);
}
```

```ts
return Array.from(transferGroups.values())
  .flatMap(({ expense, income }) =>
    // Only complete transfer pairs are shown
    expense && income
      ? [
          {
            id: expense.id,
            date: expense.date,
            amount_cents: expense.amount_cents,
            transfer_group_id: expense.transfer_group_id,
            description: expense.description,
            from_account: expense.account,
            to_account: income.account,
            from_account_name: expense.account?.name || "Unknown",
            to_account_name: income.account?.name || "Unknown",
          },
        ]
      : []
  )
  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
```

- [ ] **Step 5: reads.ts.** Hoist each optional filter into a const before the closure, e.g.:

```ts
  const { dateFrom, dateTo, amountMin, amountMax } = filters ?? {};
  if (dateFrom) rows = rows.filter((t) => t.date >= dateFrom);
  if (dateTo) rows = rows.filter((t) => t.date <= dateTo);
  ...
  if (amountMin !== undefined) rows = rows.filter((t) => t.amount_cents >= amountMin);
  if (amountMax !== undefined) rows = rows.filter((t) => t.amount_cents <= amountMax);
```

- [ ] **Step 6:** `npx vitest run src/lib/sync src/lib/offline src/hooks/useTransfers.test.tsx` → PASS; full `npx vitest run`; tsc app + strict; warning count shows 0 for these files. Commit `fix(sync): every sync and offline promise has an owner; no non-null in the data layer`.

---

### Task B3: Hooks

**Sites:** `src/hooks/useKeyboardShortcuts.ts:99,102,105,108,111` (router `navigate`: `void`), `usePrefetchTransactionData.ts:26,27` (`prefetchQuery`: `void`), `useSelectedItem.ts:23,32` (`navigate`: `void`), `useOnlineStatus.ts:18` (listener), `usePushNotifications.ts:78`, `useServiceWorker.ts:32` (`registration.update()`), `useStorageQuota.ts:56,59`, `useSyncProcessor.ts:185` (`syncIssuesManager.logSyncFailure`).

- [ ] **Step 1:** For each non-contract site, read the callee: if it can reject, catch with `reportError(error, { subsystem: "<hook name>", operation: "<call>" })` (and a toast only where the user started the action). Listener sites use a stable wrapper. Examples:

```ts
void registration
  .update()
  .catch((error) => reportError(error, { subsystem: "pwa", operation: "swUpdate" }));
```

```ts
useEffect(() => {
  void checkQuota().catch((error) =>
    reportError(error, { subsystem: "storage", operation: "checkQuota" })
  );
  const onChange = () =>
    void checkQuota().catch((error) =>
      reportError(error, { subsystem: "storage", operation: "checkQuota" })
    );
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}, [checkQuota]);
```

(shape only; keep each effect's real event names and deps).

- [ ] **Step 2:** full `npx vitest run`; tsc app; warning count 0 for `src/hooks`. Commit `fix(hooks): promises in hooks are awaited, voided by contract, or reported`.

---

### Task B4: Routes

**Sites:** `src/routes/drafts.tsx:234` (floating), `:303,309,384,386,535,588,590` (JSX), `budgets/index.tsx:140,156,162,171`, `settings.tsx:150,160,170,212`, `index.tsx:69,86`, `transfers.tsx:94` (JSX), `__root.tsx:42` (`syncIssuesManager.loadFromStorage()`), `:67` (`register()`), `signup.tsx:16` (`navigate`: `void`), `transactions.tsx:101` (`navigate`: `void`).

- [ ] **Step 1:** JSX sites: `onClick={() => void handleX()}` (or `onSubmit`, matching the prop). Read each handler; if it has no catch, add:

```ts
    } catch (error) {
      reportError(error, { subsystem: "ui", operation: "<handler name>" });
      toast.error(error instanceof Error ? error.message : "<Action> failed. Please try again.");
    }
```

using Sonner's `toast` (already imported in most routes). Keep existing catches; do not double-toast.

- [ ] **Step 2:** `__root.tsx` sites: `void loadFromStorage().catch((error) => reportError(error, { subsystem: "sync-issues", operation: "loadFromStorage" }))`; `register()` same with `operation: "registerServiceWorker"` (read what `register` is first).
- [ ] **Step 3:** full vitest (route tests in `src/__tests__/` must still pass); tsc app; warning count 0 for `src/routes`. Commit `fix(routes): async handlers own their errors`.

---

### Task B5: Components, app shell, workers and tests

**Sites:** JSX: `AccountFormDialog.tsx:141`, `CategoryFormDialog.tsx:139`, `NotificationSettings.tsx:124,134,143`, `PWAInstallPrompt.tsx:250`, `SyncIssueItem.tsx:160,174`, `SyncIssuesPanel.tsx:135`, `TransactionFormDialog.tsx:279`, `TransactionList.tsx:508,512,516`, `budgets/BudgetForm.tsx:83`, `debts/forms/CreateExternalDebtForm.tsx:113`, `CreateInternalDebtForm.tsx:115`, `EditExternalDebtForm.tsx:105,135`, `layout/AppSidebar.tsx:304`, `layout/MobileNav.tsx:242`, `sync/SyncQueueViewer.tsx:252`, `transfers/TransferForm.tsx:89`. Floating: `TransactionList.tsx:176,253` (`fetchNextPage`/`fetchPreviousPage`: `void`), `:718` (`handleDelete`), `dashboard/CategoryChart.tsx:63` (`navigate`: `void`), `pdf-import/PDFImportPage.tsx:140`, `AuthProvider.tsx:11` (`initialize()`), `App.tsx:29` (`initSync()`), `:33` (`realtimeSync.cleanup()`), `lib/pdf-worker/pdf.worker.ts:121`, `sw.ts:200` (`client.focus()`), `:242` (`self.skipWaiting()`). Callbacks: `App.tsx:40,59`. Non-null: `ColumnMapper.tsx:121`, `debts/PaymentHistoryList.tsx:50`, `lib/csv-exporter.ts:108,111`, `lib/duplicate-detector.ts:82`, `main.tsx:14`. Tests: `src/stores/__tests__/authStore.test.ts:308,330,331,344,345,362` (await).

- [ ] **Step 1:** Apply the policy per site (Global Constraints). Specific shapes:
  - `main.tsx:14` (`document.getElementById("root")!`): `const rootElement = document.getElementById("root"); if (!rootElement) throw new Error("#root element missing from index.html");`
  - `sw.ts`: `void client.focus().catch(() => {})` is not allowed; use `.catch((error) => console.error("[SW] focus failed", error))` (the service worker has no Sentry); `self.skipWaiting()` → `void self.skipWaiting()` only if the installed type is `Promise<void>` and it is inside `install`/`message` handling where the browser owns the outcome; otherwise `event.waitUntil(self.skipWaiting())`.
  - `pdf.worker.ts:121`: catch and `postMessage` the error to the main thread in the worker's existing error-message shape (read the file first).
  - CSV/duplicate/ColumnMapper/PaymentHistoryList: guards that skip the row or render nothing.
- [ ] **Step 2:** full vitest, tsc app + tests + strict, `npm run lint` warning count: 0 for the three type-aware rules everywhere. Commit `fix(ui): async handlers and app shell own their errors; no production non-null`.

---

### Task B6: `noUncheckedIndexedAccess` repo-wide; delete the strict program

**Files:** `tsconfig.json`, `tsconfig.strict.json` (delete), `.github/workflows/ci.yml:38-42`, `scripts/pre-push.mjs:15`, `scripts/agent-stop-check.sh:25,43`, `.husky/README.md:74`, `CLAUDE.md:15,40`, `src/sw.ts`, `src/lib/csv-importer.ts`, ~30 test files.

- [ ] **Step 1:** Add `"noUncheckedIndexedAccess": true` to `tsconfig.json` `compilerOptions` (beside `noFallthroughCasesInSwitch`). Run `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"` → expect about 111.
- [ ] **Step 2:** Fix `sw.ts` (2) and `lib/csv-importer.ts` (2) with guards (skip the row / ignore the message).
- [ ] **Step 3:** Fix test files: after `expect(arr).toHaveLength(n)` (or an equivalent length assertion), `arr[0]!` is allowed; where no length assertion exists, add one first. Never weaken an assertion to pass.
- [ ] **Step 4:** Delete `tsconfig.strict.json`; remove the CI step and its comment (`ci.yml` lines 38-42), the `tsc strict` entry in `scripts/pre-push.mjs` `CHECKS` (and fix `scripts/pre-push.test.mjs` if it counts checks), `tsconfig.strict.json` from `agent-stop-check.sh` line 25's hash input and line 43's command, the strict mention in `.husky/README.md:74`, and in `CLAUDE.md` the `tsconfig.strict.json` command line and the phrase "under the strict program" (the `!` rule now applies to all production code).
- [ ] **Step 5:** `npx tsc --noEmit -p tsconfig.json` 0, `tsconfig.tests.json` 0, `node --test scripts/pre-push.test.mjs` (or however that test runs; read its header) passes, full vitest. Commit `feat(ts): noUncheckedIndexedAccess repo-wide; drop the scoped strict program`.

---

### Task B7: Exit: `error` and `--max-warnings=0`

**Files:** `eslint.config.js`, `.github/workflows/ci.yml:21`, `scripts/agent-stop-check.sh:40-41`, the `no-rest-destructuring` site.

- [ ] **Step 1:** Fix the `@tanstack/query/no-rest-destructuring` warning (find it with `npx eslint src | grep rest-destructuring`; destructure the fields used instead of `...rest`).
- [ ] **Step 2:** Flip the three rules to `"error"` and drop "warn until" from their comment.
- [ ] **Step 3:** CI lint step: `run: npm run lint -- --max-warnings=0`. Stop hook: `npx eslint --max-warnings=0 $changed` and delete the "Phase 3 exit criterion adds…" comment.
- [ ] **Step 4:** `npm run lint -- --max-warnings=0` exits 0 with 0 problems. Commit `feat(lint): type-aware rules at error; zero warnings enforced`.

---

### Task B8: Acceptance, docs, merge

- [ ] **Step 1: Gates:** tsc app/tests, `npm run lint -- --max-warnings=0`, vitest, build, size, smoke.
- [ ] **Step 2: Full chromium E2E** compared per test against `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt` (the ultrawide dashboard layout test is a logged flake).
- [ ] **Step 3: Pre-commit timing:** stage 5-10 changed `src` files on a scratch edit, time `npx lint-staged --no-stash` (or the hook), record, revert.
- [ ] **Step 4: Browser spot check:** trigger one converted handler failure path if reachable offline (e.g. save a budget while the local stack is stopped) and confirm a toast appears instead of nothing; screenshot and read.
- [ ] **Step 5: Whole-branch review**; fix Critical/Important; re-review fixes.
- [ ] **Step 6: Docs:** fill Acceptance results, tick Progress, roadmap: tick the four Phase 3 items covered, Resume bullet, Decisions & Deferrals.
- [ ] **Step 7: Merge:** `git switch main && git merge --ff-only phase-3a-lint-depth && git branch -d phase-3a-lint-depth`; ask the user to push; confirm CI.

## Acceptance results

Not run yet.

## Decisions & Deferrals

Planning decisions (2026-10-08):

- **PR #11's versions are re-applied with npm, not merged.** Why: its branch predates 2c-2's `package.json` changes, so a merge conflicts in the lockfile; applying the same ranges on current `main` gives an equivalent result Dependabot recognises.
- **Bare `void` is allowed for APIs that resolve on failure by contract** (TanStack Router `navigate`, `queryClient.prefetchQuery`, `fetchNextPage` / `fetchPreviousPage`). Why: they never reject, so a catch would be dead code; this refines the spec's "never a bare `void p`" for exactly these calls.
- **`architecture-lint.test.ts` lints probe paths without type information.** Why: `projectService` rejects files that are not on disk (verified 2026-10-08); the type-aware rules are covered by `npm run lint` over real files.
- **autoSync handlers become synchronous wrappers over `triggerSync`, which owns its errors.** Why: listeners must return void; keeping the handler names keeps the existing tests' direct calls.
- **Sites in files Knip lists as unused are fixed anyway.** Why: they must pass lint at `error` until 3b decides to delete them.

Execution decisions (2026-10-08):

- **PR #11 changes 34 package ranges, not 38** (the plan's count included lockfile-only entries); `package.json` matches the PR's diff exactly.
- **The router plugin's regenerated `routeTree.gen.ts` is committed with Part A** (`de48360`); otherwise every build dirties the tree.
- **`allowScripts` pin follows canvas 3.2.3** (Phase 1b already allows canvas for `scripts/generate-icons.js`).
- **New warning to clear in Part B:** `react-hooks/incompatible-library` at `TransactionFormDialog.tsx:111` (`form.watch`) from react-hooks 7.1; Task B5 converts it (e.g. `useWatch`) so Task B7's zero-warning exit holds.

From the spec (section 8), unchanged: order PR #11 → 3a → 3b; every misused-promise site fixed at default strength; budget = measured + 3 KB.
