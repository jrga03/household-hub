# Faster git hooks

Status: built 2026-10-20 on `perf/198-faster-pre-push`. Issue: #198. Build in its own worktree session, one PR.

## Context

Measured 2026-10-20 on `main` (`5fcb99c`, 12 cores, worktrees `prototype-194` and `agent-ae52e66c35b04cb33` present).

- Pre-commit: about 5 s per commit. `eslint` on one file 4.2 s (type-aware project load), `prettier` 0.6 s.
- Pre-push: 96 s and failing. ESLint and Vitest scan `.claude/worktrees/**`: 159 failed tests and 6 lint errors, none from `main`. In the hook, lint took 66 s (23 s alone without worktrees) and unit tests 96 s.
- With `.claude/**` excluded: Vitest 91 s wall (import 31 %, environment 24 %, tests 41 %); ESLint cold 23.3 s, `--cache` warm 3.9 s; `tsc` src 1.5 s, tests 0.3 s; Knip 1.9 s.
- Slowest test files: `src/lib/transactions/money.test.ts` 36.6 s (2885 tests), `src/lib/categories/projection.test.ts` 25.9 s (1686 tests), `src/lib/__tests__/architecture-lint.test.ts` 10.2 s. Each of the first two runs 4 cases of `orders()` over 6 events (720 orders each); one worker runs a whole file.
- Every one of the 115 test files loads jsdom.
- One excluded run had 1 failed test, not identified; probably the known "under 50 ms" flake.

## Decisions & Deferrals

- **Pre-push is the target; pre-commit stays as it is.** Why: 95 s vs 5 s. Revisit: if pre-commit's 5 s is felt.
- **Ignore `.claude/**` in ESLint global ignores and Vitest `exclude`.** Why: it is a correctness bug (other checkouts fail this one's push) and the largest win. Revisit: never.
- **Budget: warm pre-push 30 s or less** on `main` with worktrees present. Warm means an earlier run filled the ESLint cache. Revisit: never.
- **Pre-push keeps the full suite.** Why: changed-only misses breaks in importers until CI. Revisit: if the budget is missed after this plan (fallback: `vitest --changed origin/main` and ESLint on changed files).
- **Split the permutation files by case, keeping every order.** Each case becomes a sibling file (`money.cards.test.ts`, `money.allocations.test.ts`, `money.transfers.test.ts`, …) with shared setup in a sibling fixtures module; the same for `categories/projection.test.ts`. Why: workers run files in parallel, and "same rows for every permutation" stays proven on every push. Rejected: sampling orders locally. Revisit: never.
- **Pre-push ESLint uses `--cache --cache-strategy content --cache-location node_modules/.cache/eslint/`.** Type-aware results can go stale when an imported file changes type; CI lints cold and stays the gate. Worktrees are safe: each checkout has its own `node_modules` (or gets its own `node_modules/.cache` from the relative path), entries key on absolute paths, and the cache clears on config or ESLint version change. Revisit: if a stale cached pass reaches CI more than once.
- **`node` is the default test environment; jsdom by glob.** Vitest `projects`: jsdom for `**/*.test.tsx`, `src/hooks/**` and `src/components/**`; everything else `node`. A `.ts` test that fails under `node` gets an explicit entry in the jsdom globs. Rejected: per-file `@vitest-environment` comments. Revisit: never.
- **`.ts` tests that need the DOM are named `*.dom.test.ts`** (`lib/__tests__/households`, `lib/sync/engine`, `stores/__tests__/authStore`, `stores/__tests__/navStore`; they need `window` or `localStorage`). Why: the name carries the reason and new files need no config edit. Built first as a named list in #199, renamed in the #200 PR. A `@vitest-environment` comment is wrong here: it changes the environment but keeps the node project's setup file. Revisit: never.
- **Fixtures live beside their tests as `*.fixtures.ts`** and lint as test files (`srcTestFiles`). Why: test-only helpers must not get production lint rules. Revisit: never.
- **Defer a shared `LoggedEvent` test builder.** The money and category fixtures, and about seven other test files, each build events and HLCs by hand. Why: outside #198. Tracked in #200. Revisit: when the next test file copies it.
- [x] **Re-time pre-push on `main` after merge.** Done 2026-10-20 on `bc2dd06` with the real worktrees: warm 21.7 s, cold 23.4 s, both pass (comment on PR #199). Why: the first table is from a worktree with a fake leaked worktree.
- **Leave `architecture-lint.test.ts` (10 s) as it is.** Why: under budget after the splits. Revisit: if the warm pre-push is over 30 s.
- **Keep run-all, report-all.** Pre-push does not stop the other checks at the first failure. Why: one push shows every failure. Revisit: never.
- **Acceptance: a quoted `node scripts/pre-push.mjs` run** in the PR, with before (96 s total, Vitest 91 s, lint 23 s) and after timings per check. Revisit: never.

## Tasks

- [x] Add `.claude/**` to the ESLint global ignores and Vitest `exclude`; confirm `npx eslint .` and `npx vitest run` in `main` no longer list worktree paths.
- [x] Add the ESLint cache flags to the `lint` check in `scripts/pre-push.mjs` only (`npm run lint` and CI stay cold).
- [x] Move Vitest to `projects` (`node` default, jsdom globs); move any `.ts` test that fails under `node` into the jsdom globs.
- [x] Split `src/lib/transactions/money.test.ts` by its 4 cases with a fixtures module; the test count stays 2885.
- [x] Split `src/lib/categories/projection.test.ts` by its 4 cases; the test count stays 1686.
- [x] Update the CLAUDE.md "Git hooks" section: per-checkout ESLint cache, `.claude/**` ignored by lint and tests, two Vitest projects.
- [x] Run `node scripts/pre-push.mjs` twice (cold, then warm) with worktrees present; quote both in the PR. Warm must be 30 s or less.

## Result

Measured 2026-10-20 in the `perf-198` worktree, with a fake `.claude/worktrees/leak-check` holding a failing test and a lint error.

| Check      | Before (`main`)            | Cold       | Warm   |
| ---------- | -------------------------- | ---------- | ------ |
| lint       | 23 s (66 s with worktrees) | 17.8 s     | 1.9 s  |
| unit tests | 91 s (96 s with worktrees) | 21.2 s     | 18.5 s |
| tsc src    | 1.5 s                      | 1.0 s      | 1.0 s  |
| tsc tests  | 0.3 s                      | 0.4 s      | 0.4 s  |
| knip       | 1.9 s                      | 3.2 s      | 1.6 s  |
| total wall | 96 s, failing              | about 21 s | 18.5 s |

On `main` (`bc2dd06`) after merge, with the real worktrees, cold then warm: lint 19.6 s, 2.1 s; unit tests 23.4 s, 21.6 s; tsc src 1.0 s, 1.2 s; tsc tests 0.4 s, 0.6 s; knip 2.3 s, 1.4 s; wall 23.4 s, 21.7 s.
