# Phase 1b: Strict tsconfig (Design)

**Date:** 2026-10-02
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 1b, sections 4.8 and 4.13)
**Branch:** `phase-1b-strict-tsconfig`, cut from `main` after `cc952b5` (Node 26) is pushed

## Goal

Add `tsconfig.strict.json`, a second TypeScript program with `noUncheckedIndexedAccess` over `src/lib/{sync,offline,debts}`, fix every error it reports (transitive files included), and enforce it in CI, the Stop hook, and a reworked pre-push hook.

## Background (measured on `main` at `a407b78`, 2026-10-02)

The strict program reports 190 errors (102 TS18048, 69 TS2532, 12 TS2322, 7 TS2345), the same count and distribution as at `913efac`. Measured with a throwaway config identical to section 1's.

| Bucket                                | Errors | Shape                                                                                                                                                                                 |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/TransactionList.tsx`      | 59     | 55 cascade from `const transaction = transactions[virtualRow.index]` in the table map (`:611`) and card map (`:754`); 4 from `virtualItems[0]`/`[len-1]` (`:171-172`, `:293`, `:298`) |
| lib test files (offline, sync, debts) | 83     | 75 are `expect(rows[0].field)` after a length assertion; 4 `db.syncQueue.update` args; 4 misc                                                                                         |
| `lib/pdf-parsers/bdo-credit-card.ts`  | 18     | `sorted[0]`, `byX[0]`, `prev`/`curr` in a pairwise loop, `split("/")` parts in `convertBDODate`, regex captures in `parseTransactionLine`                                             |
| scattered production (13 files)       | 30     | `events[0].x` (`event-compactor.ts:244-253`), `outstanding[0].status` (`debts/sync.ts:176`), `split("T")[0]`, Recharts `payload[0]`, `Record<id, …>` lookups                          |

Production files with errors: `supabaseQueries.ts` 6, `MonthlyChart.tsx` 3, `event-compactor.ts` 3, `dates.ts` 2, `sync/idempotency.ts` 2, `duplicate-detector.ts` 2, `useAnalytics.ts` 2, `PreviewStep.tsx` 2, and one each in `pdf-import-duplicates.ts`, `debts/sync.ts`, `debts/reversals.ts`, `csv-exporter.ts`, `PDFImportPage.tsx`, `CategoryChart.tsx`, `AnalyticsDashboard.tsx`.

Pre-push today runs `npm run lint` (7s) then `npx vitest run` (15s) serially, with no type check. Lint, vitest, and the two existing tsc programs in parallel took 16s (12 cores). Since 2026-09-01, 25 of 79 commits are `docs(...)`.

## 1. The strict program

`tsconfig.strict.json` extends `tsconfig.json`, sets `noUncheckedIndexedAccess: true`, and includes `src/lib/sync`, `src/lib/offline`, `src/lib/debts`, and `src/vite-env.d.ts` (for `import.meta.env` types). Files those directories import are checked too; that is how `TransactionList.tsx` and the bdo parser enter scope. It is committed unwired at the start of the branch so `npx tsc --noEmit -p tsconfig.strict.json` is the progress counter.

## 2. Fix rules

- **UI render sites:** `if (!x) return null` inside the virtualizer maps. `virtualItems[0]`/`[len-1]` become `virtualItems[0]?.index ?? -1` / `virtualItems.at(-1)?.index ?? -1` (and `?.start ?? 0`). Recharts tooltip `payload[n]`: guard and render nothing.
- **Parser:** a regex miss on any capture in `parseTransactionLine` returns `null` (already its "not a transaction" result). `convertBDODate` throws an `Error` naming the input when a `/` part is missing, since its callers pass regex-validated dates. Grouping loops guard `sorted[0]`/`byX[0]` with an early return for empty input and narrow `prev`/`curr`.
- **Data integrity (sync, debts, event-compactor, idempotency):** where a missing value means corrupt state, throw an `Error` that names what is missing. Where empty input is legitimate (compacting zero events), return early.
- **Record lookups** (`budgetsByCategory[id]`, etc.): read into a local, then guard or initialize.
- **Tests:** `!` after the existing length or definedness assertion (`expect(rows[0]!.status)`).
- **No new `!` in production code and no new helper module.** Phase 3 adds `no-non-null-assertion` for `src/`; these files arrive clean.

Each site's handling is chosen while fixing it; a site that matches none of these rules is noted in the plan with its chosen handling.

## 3. Pre-push hook

`.husky/pre-push` runs `node scripts/pre-push.mjs`, which:

1. Reads the pushed ref ranges from stdin. If every file changed in every range matches `*.md` or `docs/**`, prints `docs-only push, checks skipped` and exits 0. A new remote branch (remote sha all zeros) is measured from `git merge-base origin/main <local sha>`. A deleted ref, or any range it cannot classify, runs the full checks.
2. Otherwise runs in parallel: `npm run lint`, `npx vitest run --allowOnly=false`, and `npx tsc --noEmit` for `tsconfig.json`, `tsconfig.tests.json`, and `tsconfig.strict.json` (the strict program is added in the wiring commit, section 5).
3. Prints one line per check with status and seconds. On failure, prints each failing check's output as its own block, then exits 1.

The docs-only classification is a pure exported function with a unit test. `.husky/README.md` is corrected (it still says pre-push runs ESLint fixes).

## 4. Stop hook

`scripts/agent-stop-check.sh`:

- Does not exit early when the branch deletes `.ts`/`.tsx` files; a deletion-only branch runs the type checks (lint has no files to lint and is skipped).
- Adds `.nvmrc` and the running `node -v` to the cache key.
- Adds `tsconfig.strict.json` to the cache key and `npx tsc --noEmit -p tsconfig.strict.json` to the check chain (wiring commit).

`node_modules` changes without a lockfile change stay outside the cache key (hashing about 1,400 packages per turn is not worth it).

## 5. Wiring (one commit, when the count is 0)

- `ci.yml`: a "Typecheck strict" step after "Typecheck tests".
- Stop hook and pre-push: add the strict program as above.

## 6. Task order

1. E2E baseline: full chromium suite on `main` (Node 26), `PW_TEST_HTML_REPORT_OPEN=never npm run test:e2e -- --project=chromium --reporter=list`; record pass/fail per spec.
2. Branch; commit `tsconfig.strict.json` (unwired). Count: 190.
3. Pre-push rework (section 3, without the strict program) with its unit test.
4. Stop hook gaps (section 4, without the strict program).
5. lib production sites. Planning found every guard here sits behind an existing check, so none adds reachable behavior; `parseLocalDate` gets a characterization test (see the plan's Decisions & Deferrals).
6. `bdo-credit-card.ts`, TDD for the `convertBDODate` throw (the `parseTransactionLine` guard is unreachable: every regex group is required).
7. Scattered UI and hooks (charts, analytics, PDF import, `useAnalytics`, `supabaseQueries`).
8. `TransactionList.tsx`.
9. Test files.
10. Wiring (section 5). Count: 0.
11. Acceptance (section 7).

Every commit passes tsc (both existing programs), lint, and vitest, and its message records the remaining strict count.

## 7. Acceptance

- `tsc` exit 0 for all three programs; lint 0 errors, 0 warnings; vitest all passing; build ok; bundle within 355 KB gz (352.5 before 1b); production audit 0.
- Chromium smoke 11/11.
- Screenshot pass on chromium, each screenshot read and described: transactions list (table and card presentations), dashboard charts with a tooltip hovered, analytics, PDF import preview step.
- Full chromium E2E compared per spec with the step-1 baseline: a spec that passes on `main` and fails on the branch is a regression and blocks merge.
- Pre-push: a docs-only push skips; a push with a deliberate type error in a strict-scoped file fails with grouped output (verified locally, then reverted).
- Not verified by this phase: non-chromium browsers, the Cloudflare build on Node 26 (verified by the user after pushing `cc952b5`).

## Decisions & Deferrals

- **Fix style: narrowing guards in production, `!` only in tests (decided 2026-10-02).** Why: guards make the runtime behavior explicit per site (the virtualizer can report an index past the loaded rows during page swaps); a throwing helper would blank the list from inside render; `!` in production defeats the flag where it was enabled and would be redone in Phase 3. Revisit: never.
- **Data-integrity sites throw instead of skipping (decided 2026-10-02).** Why: a silent skip in sync or debt code hides corrupt state. Revisit: if a throw surfaces in production for a legitimate state, change that site to an early return with a test.
- **Verification includes a full chromium E2E diff against `main` (decided 2026-10-02).** Why: no unit or smoke test reaches the charts or analytics. Cost: the suite has pre-existing failures, so the comparison is per spec, not by total. Revisit: never.
- **Pre-push mirrors CI's gates in parallel and skips docs-only pushes (decided 2026-10-02).** Why: type errors were caught only after a push; parallel runs keep it at about the vitest time; a third of commits are docs. Revisit: if a docs-only push ever breaks CI, widen the classifier's definition of code.
- **Stop hook: fix the deletion-only skip, add Node version to the cache key, leave `node_modules` out (decided 2026-10-02).** Why: the Node 26 bump made the runtime a real input; hashing `node_modules` costs more than the gap. Revisit: if a stale pass is traced to a `node_modules` change.
- **Strict config committed unwired, enforcement in one commit at 0 (decided 2026-10-02).** Why: the count is visible in the repo throughout, and every commit stays green. Revisit: never.
- **Node 26 landed on `main` before 1b (decided 2026-10-02).** See the roadmap's Decisions & Deferrals. Why here: a runtime change inside the branch would confound the E2E comparison.
