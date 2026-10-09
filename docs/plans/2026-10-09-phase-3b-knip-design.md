# Phase 3b: Knip (Design)

**Date:** 2026-10-09
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md`, Phase 3 item "Knip in CI, blocking" (4.10; CI job list item 8).
**Branch:** `phase-3b-knip`, cut from `main` at `6d63d0c` or later

## Goal

Add Knip with a settled, commented ignore list, fix every finding outside that list, and gate on an empty report in CI and pre-push from the first commit that adds the gate.

## Background (measured on `main` at `6d63d0c`, 2026-10-09, Knip 6.40.0)

| Item                      | Measurement                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No config                 | 29 unused files, 35 unused exports, 15 unused exported types, 1 duplicate export; identical to the 2026-10-08 run.                                                                                                                                                                                                                                                                                                                   |
| Draft config              | Entries `src/sw.ts`, `workers/*/src/index.ts`, `supabase/functions/*/index.ts`, `scripts/*.{mjs,js,cjs}`: 23 unused files (the 6 missing entries resolved). New unlisted: `xlsx` (`scripts/read-excel-categories.cjs`), `web-push` (`workers/push-notifier`, its own `package.json`, not an npm workspace).                                                                                                                          |
| `ignoreExportsUsedInFile` | Unused exports 35 → 27, unused types 15 → 7.                                                                                                                                                                                                                                                                                                                                                                                         |
| Unused files (real)       | Debts UI `src/components/debts/**` (9 components + 2 barrels, about 1,250 lines, no tests, no route); push client `NotificationSettings` + `usePushNotifications` (about 380 lines); `CompactionMonitor`, `ColumnMapper`, `BudgetProgressBar`; `ui/dropdown-menu`; `hooks/useBudgets`; `lib/types/offline`; `types/{device,index,resolution}`; `tests/e2e/fixtures/test-data.ts`. Caller-less export: `hooks/useBudgetActuals` (3a). |
| Unused dependencies       | `@radix-ui/react-dropdown-menu`, `@tanstack/react-table`; devDeps `axe-core`, `lighthouse`, `shadcn`.                                                                                                                                                                                                                                                                                                                                |
| Unlisted                  | `nanoid` (resolves via `postcss`; used by `lib/sync/eventCompactor.ts:244` for snapshot event ids, while the server `transaction_events.id` is `UUID`), `dotenv` (resolves via `shadcn → @dotenvx/dotenvx`; used by `tests/e2e/fixtures/db-cleanup.ts`), `@eslint/js` (via `eslint`); binary `supabase`.                                                                                                                             |
| Runtime                   | About 3 s per run.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Bundle                    | 374.7 KB gz of 378. Unused files are not bundled, so deleting them should not move the size.                                                                                                                                                                                                                                                                                                                                         |

## 1. Dependencies

Order matters: `dotenv` resolves through `shadcn` today, so it becomes explicit before `shadcn` is removed.

- Add devDeps `dotenv` and `@eslint/js` at the versions currently resolved.
- `nanoid`: `eventCompactor.ts` and its test use `crypto.randomUUID()`. The `restrictNanoid` ESLint restriction (`eslint.config.js`, today only `src/lib/{debts,offline}`) applies to all of `src/`.
- Remove `shadcn` (CLI only; components stay vendored in `src/components/ui/`; use `npx shadcn@latest add` when needed), `axe-core`, `lighthouse` (`@axe-core/playwright` and `@lhci/cli` stay), `@radix-ui/react-dropdown-menu` with `src/components/ui/dropdown-menu.tsx`.
- Keep `@tanstack/react-table`: ignored, revisit when the tables adopt sorting and filtering.
- `supabase` goes in `ignoreBinaries` (installed by `supabase/setup-cli` in CI and by Homebrew locally).
- `xlsx` for `scripts/read-excel-categories.cjs`: the plan checks how the script is run (`scripts/README.md:48`) and either lists it as a devDep or ignores it with that reason.
- `workers/push-notifier` is configured as its own Knip workspace so `web-push` and `wrangler` are checked against its manifest. If Knip does not accept a directory that is not an npm workspace, fall back to a scoped `ignoreDependencies` entry; the plan verifies which.

## 2. Deletions and export cleanup

- Delete `ui/dropdown-menu.tsx`, `hooks/useBudgets.ts`, `lib/types/offline.ts`, `types/{device,index,resolution}.ts`, `tests/e2e/fixtures/test-data.ts`.
- Every unused export and exported type outside the ignore list is deleted (no callers anywhere) or un-exported (used inside its file). Examples: `csv-importer` helpers, `device-registration` (`deactivateDevice`, `isDeviceActive`), `deviceManager` (`clearDeviceId`, `hasDeviceId`), `retry.sleep`, `mergeLamportClock`, `debts/__tests__/test-utils` helpers, e2e fixture helpers, `scripts/pre-push.mjs` `CHECKS` (if still reported once scripts are entries), `src/types/*` Insert/Update aliases, the `supabase`/`untypedSupabase` duplicate export.
- Compile-time assertion constants (`transactionColumnsMatchTable`, `transactionsViewKeysMatchTable`) stay exported with a `/** @public */` tag.

## 3. Ignore policy (`knip.jsonc`)

1. Every ignore entry has a comment: why, and the revisit trigger.
2. Feature-deferred code is listed by exact path, no broad globs: the debts UI (revisit: debts UI spec), the push client (revisit: push spec), `CompactionMonitor`, `ColumnMapper`, `BudgetProgressBar`, `useBudgetActuals` (revisit: when each is used), `@tanstack/react-table`.
3. Vendored and generated code: unused exports and types are ignored by issue type in `src/components/ui/**` (shadcn) and `src/types/database.types.ts`; both stay analyzed for unused files.
4. `ignoreExportsUsedInFile: true`.
5. Everything else is fixed, not ignored.
6. Knip runs with `--treat-config-hints-as-errors`, so an ignore that no longer matches anything fails and gets deleted. Routing the debts UI therefore forces its ignore entry out in the same branch.

## 4. Gate

- `knip` pinned as a devDep; `"knip": "knip --treat-config-hints-as-errors"` in `package.json`.
- New blocking `knip` job in `.github/workflows/ci.yml` (`npm ci`, `npm run knip`), shaped like the `lint` job.
- Fifth entry in `scripts/pre-push.mjs` `CHECKS`, run in parallel with the others; docs-only pushes still skip.
- CLAUDE.md: `npm run knip` under Commands; the pre-push line lists Knip; the stack line no longer implies TanStack Table is in use.

## 5. Testing and gates

- Red check before merge: a temporary unused export makes `npm run knip` exit non-zero, and a temporary ignore for a path that does not exist fails as a config hint. Both reverted.
- Event compactor: snapshot event ids are UUIDs (existing test updated to assert the format).
- Per commit: lint, `vitest run`, tsc (app, tests), `npm run knip` once the config exists.
- Before merge: build, size (expected unchanged), chromium smoke (the e2e fixtures change), one live pre-push run with five checks passing.

## 6. Risks

- **Removing `shadcn` can drop other transitive packages** something imports by accident. Knip's unlisted check after the removal catches them; `npm ci` plus the full gate set confirms.
- **Knip upgrades add rules.** It is pinned; Dependabot bumps arrive as normal PRs that must pass the gate.
- **Ignored feature code still costs upkeep** (lint and type fixes each phase). Accepted until the debts and push specs land.

## 7. Out of scope

Routing the debts UI and its five deferred cross-device gaps (debts UI spec); routing push notifications, VAPID keys and the Worker deploy (push spec); mounting `CompactionMonitor`, `ColumnMapper`, `BudgetProgressBar`; the `push_subscriptions` table.

## 8. Decisions & Deferrals

- **Debts UI is kept and will be routed; 3b ignores it, and the debts UI spec is the next brainstorm (decided 2026-10-09).** Why: routing makes debts creatable, which reopens the five cross-device gaps the debt sync plan deferred to that spec (server `updated_at`, double reversal, debt-linked transaction delete FK, status re-derivation, name collisions) and needs a migration. Rejected: deleting it; routing it inside 3b; pausing 3b for the debts spec. Revisit: debts UI spec (removes the ignore entry).
- **Push notifications are kept and will be routed in their own spec, after the debts UI spec (decided 2026-10-09).** Why: needs VAPID keys and a deployed Worker. Revisit: push spec.
- **`CompactionMonitor`, `ColumnMapper`, `BudgetProgressBar`, `useBudgetActuals` are kept behind ignores (decided 2026-10-09).** Revisit: when each is used; if still unused at the next dead-code review, delete.
- **`@tanstack/react-table` is kept; the `shadcn` CLI devDep is removed (decided 2026-10-09).** Why: table sorting and filtering are planned; the CLI is run by hand and its install is heavy. Revisit: react-table when the tables adopt it.
- **`nanoid` is replaced by `crypto.randomUUID()` and banned in all of `src/` (decided 2026-10-09).** Why: unlisted (resolved through `postcss`) and the wrong id format for a `UUID` column.
- **Knip is blocking from day one, in CI and pre-push (decided 2026-10-09).** Why: this branch settles the ignore list and leaves an empty report, so a non-blocking period would observe nothing. Supersedes the roadmap's "non-blocking at first".
- **Unused files to delete were not individually confirmed** (`ui/dropdown-menu`, `useBudgets`, `lib/types/offline`, `types/{device,index,resolution}`, `tests/e2e/fixtures/test-data.ts`). Confirm at spec review.
