# Phase 3a: Lint Depth (Design)

**Date:** 2026-10-08
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md`, Phase 3 items "Type-aware rules…", "`no-non-null-assertion` cleanup…", "`noUncheckedIndexedAccess` repo-wide…" and "Exit criterion…" (4.7, 4.8). Knip (4.10) is Phase 3b, with its own spec.
**Branches:** `deps-pr11` (section 0), then `phase-3a-lint-depth`, both cut from `main` at `1f1f3b3` or later

## Goal

Land the pending dependency group (Dependabot PR #11) on a budget set on purpose, then make every promise in `src` owned (awaited, or voided with a catch), remove production `!`, turn on `noUncheckedIndexedAccess` for the whole program, and end with every lint rule at `error` and zero warnings enforced by `--max-warnings=0`.

## Background (measured on `main` at `1f1f3b3`, 2026-10-08)

| Item                                 | Measurement                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-floating-promises`               | 30 production (`useKeyboardShortcuts` 5, `TransactionList` 3, `App`, `usePrefetchTransactionData`, `useSelectedItem`, `__root`, `sw` 2 each, rest 1), 6 in tests. Roadmap said 73.                                                                                                                                                          |
| `no-misused-promises`                | 51 production: 40 `voidReturnAttribute` (async JSX handlers), 11 `voidReturnArgument` (async callbacks where void is expected). Top files: `routes/drafts` 7, `lib/sync/autoSync` 6, `routes/budgets/index` 4, `routes/settings` 4. Roadmap said 54.                                                                                        |
| `no-non-null-assertion`              | 20 production (`lib/offline/transfers` 10, `lib/offline/reads` 4, `lib/csv-exporter` 2, 4 files with 1). Tests are exempt (197). Roadmap said 44.                                                                                                                                                                                           |
| `noUncheckedIndexedAccess` repo-wide | 111 errors: 4 production (`sw.ts` 2, `lib/csv-importer.ts` 2), 107 in tests. Phase 1b's strict program absorbed the rest. Roadmap said 309.                                                                                                                                                                                                 |
| Other lint                           | One existing warning (`@tanstack/query/no-rest-destructuring`). `jsx-a11y` recommended is already wired.                                                                                                                                                                                                                                    |
| Type-aware lint cost                 | Full `src` run with `projectService`: 27 s.                                                                                                                                                                                                                                                                                                 |
| Strict program references            | `tsconfig.strict.json` is used by `.github/workflows/ci.yml`, `scripts/pre-push.mjs`, `scripts/agent-stop-check.sh`, `.husky/README.md` and `CLAUDE.md`.                                                                                                                                                                                    |
| PR #11                               | Grouped minor/patch bump of 38 packages (incl. `@tanstack/react-query` ^5.104.1, `recharts` ^3.10.1, `eslint-plugin-react-hooks` ^7.1.1). CI on `60e9ad8` fails: `CategoryChart.tsx:107` reads `categoryId` on recharts' `PieSectorDataItem`; `TransactionFilters.tsx:73` calls setState synchronously in an effect (new react-hooks rule). |
| Bundle                               | 363,502 B gz of 363,520 (355 KB): 18 B headroom.                                                                                                                                                                                                                                                                                            |

## 0. Dependabot PR #11 (branch `deps-pr11`)

- Merge the Dependabot head into a local branch from `main`; when `main` contains it, GitHub closes the PR.
- `CategoryChart.tsx`: read the clicked category from the sector's `payload` (recharts 3.10 passes `PieSectorDataItem`), keeping the click-through to the category view.
- `TransactionFilters.tsx:73`: remove the synchronous setState in the effect, either by deriving the value during render or by moving the update into the event that triggers it, whichever the code's intent supports.
- Run lint over all of `src` to catch any other new react-hooks 7.1 reports; fix them in the same branch.
- Bundle: measure after the fixes; set `BUDGET_KB` in `scripts/check-bundle-size.mjs` to the measured size rounded up to the next whole KB plus 3. Record the before/after bytes and the reason (dependency bump, not app growth) in the roadmap's Decisions & Deferrals.
- Gates: the three tsc programs, lint, vitest, build, size, smoke; a browser check that a pie slice click still opens its category.

## 1. Type-aware rules

- Add `parserOptions.projectService: true` (with `tsconfigRootDir`) to the `src/**/*.{ts,tsx}` block in `eslint.config.js`.
- Enable `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-misused-promises` (default options, including `checksVoidReturn.attributes`) on `src/**`, tests included: a floating promise in a test is a skipped assertion.
- Enable `@typescript-eslint/no-non-null-assertion` on production files only (`srcTestFiles` ignored).
- All three land at `warn` and flip to `error` in the exit commit (section 4).

## 2. Fix policy, one commit per area

Order by risk: `lib/sync` + `lib/offline` (autoSync's 6 first), `hooks`, `routes`, `components`, `sw.ts` and the remaining files.

- **Async JSX handlers** (`voidReturnAttribute`): `onClick={() => void run()}` where `run` owns its errors. If `run` does not already catch, add a `catch` that shows `toast.error` with a user-facing message and calls `reportError` from `src/lib/sentry.ts`.
- **Async callbacks where void is expected** (`voidReturnArgument`, e.g. listeners, timers): same shape; the callback body catches and reports.
- **Floating promises**: `await` inside an async flow; deliberate fire-and-forget becomes `void p.catch(…)` with a report, never a bare `void p`.
- **Non-null assertions**: the Phase 1b guard policy. UI and parser sites skip or render nothing; data-layer sites (`lib/offline/transfers`, `lib/offline/reads`) throw a clear error where a missing value means corrupt data.
- **Tests**: floating promises are awaited.

## 3. `noUncheckedIndexedAccess` repo-wide

- Move the flag into `tsconfig.json`; fix the 4 production errors with guards and the 107 test errors (tests may use `!` after asserting length, per CLAUDE.md).
- Delete `tsconfig.strict.json` and its step in `.github/workflows/ci.yml`, `scripts/pre-push.mjs`, `scripts/agent-stop-check.sh` (and its cache key), `.husky/README.md` and the CLAUDE.md command line and strict-program wording.

## 4. Exit criterion

- Flip the three rules to `error`; `npm run lint` reports 0 problems (the existing `no-rest-destructuring` warning fixed).
- Add `--max-warnings=0` to the CI `lint` job and the Stop hook (`scripts/agent-stop-check.sh`). `npm run lint` itself stays plain so pre-commit `eslint --fix` behavior is unchanged.

## 5. Testing and gates

- Unit tests for the sync path: an `autoSync` trigger whose `processQueue` rejects is caught and reported, with no unhandled rejection.
- Per commit: lint, `vitest run`, tsc (app, tests; strict until section 3 removes it), build, size.
- Before merge: smoke; full chromium E2E compared per test against `docs/plans/2026-10-02-phase-1b-e2e-baseline.txt` (the ultrawide dashboard layout test is a known flake); pre-commit timing on a typical staged set of 5-10 files, recorded.

## 6. Risks

- **New catches change error UX** (toasts where a rejection used to be silent). The per-area review checks each message.
- **Type-aware lint is slower.** Pre-commit lints only staged files, but `projectService` loads the program. If a typical commit's pre-commit exceeds about 15 s, record it and decide in review; do not tune mid-task.
- **PR #11 touches 38 packages.** Gate it fully on its own branch before 3a starts.

## 7. Out of scope

Knip and dead-code removal (3b, including the unrouted `components/debts/*` UI and push notifications); the 2c-2 deferrals (inline-key ban gaps, triple invalidation); `exactOptionalPropertyTypes` (dropped by the roadmap).

## 8. Decisions & Deferrals

- **Order: PR #11, then 3a, then 3b (decided 2026-10-08).** Why: 3a should lint against current dependencies, and react-hooks 7.1 adds rules right before the zero-warning gate. Rejected: PR #11 after 3a; one Phase 3 branch with Knip deletions inside.
- **Every misused-promise site is fixed; the rule keeps default strength (decided 2026-10-08).** Why: async UI handlers that reject leave the user with no feedback; each site gets an explicit owner. Rejected: `checksVoidReturn.attributes: false`; a shared `runAsync` helper.
- **Budget becomes measured size + 3 KB after PR #11 (decided 2026-10-08).** Why: the bump is dependency growth, and an 18 B ceiling would block every later change. Rejected: trimming to stay under 355 KB first; holding back the bundle-growing packages. Revisit: when the initial chunk is next reduced (lazy routes), lower the ceiling with it.
- **Phase 3 re-measured (2026-10-08):** floating 30 / misused 51 / non-null 20 production, `noUncheckedIndexedAccess` 4 production + 107 tests (roadmap said 73 / 54 / 44 / 309).
