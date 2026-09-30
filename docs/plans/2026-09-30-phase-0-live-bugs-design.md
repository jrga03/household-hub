# Phase 0: Fix Live Bugs (Design)

**Date:** 2026-09-30
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 0)
**Branch:** `phase-0-live-bugs`

## Goal

Clear every known violation of the rules that Phase 1 turns into lint errors, and fix the live bugs behind them: transfers that bypass the outbox, and a PDF Import link that opens the retired CSV page. When this phase is done, the Phase 1 Dexie-write, Supabase-write, and money selectors can land as `error` with zero violations.

## 1. Offline transfer creation

**Bug:** `TransferForm` calls `useCreateTransfer` (`src/hooks/useTransfers.ts:42`), which inserts both legs straight into Supabase. Transfers fail offline and skip the outbox and event log.

**Design:**

- Add `createOfflineTransfer(input, userId)` to `src/lib/offline/transfers.ts`. It validates that `from_account_id !== to_account_id` and that `validateAmount(amount_cents)` passes, then builds two `TransactionInput` legs sharing one `crypto.randomUUID()` `transfer_group_id`: an `expense` on the source account and an `income` on the destination, same amount and date, `status: "pending"` and `visibility: "household"` (the server column defaults today's insert relies on). Descriptions keep today's defaults (`Transfer to <name>` / `Transfer from <name>`) when the user leaves the field empty.
- It delegates to `createOfflineTransactionsBatch`, which already writes all rows and all sync-queue items in one Dexie `rw` transaction. No new write path.
- `useCreateTransfer`'s `mutationFn` calls `createOfflineTransfer` and throws on `success: false`. Its three existing invalidations (`transactions`, `transfers`, `accounts`) stay.
- Sync: the processor pushes the legs as two ordinary `transaction` creates. The server trigger `check_transfer_integrity()` validates whichever leg arrives second against the first, so order does not matter.

## 2. Import route: restore PDF import, retire the old CSV page

**Bug (verified 2026-09-30):** `src/routes/import.tsx` is the parent of `/import/pdf` but its component (`ImportPage`, the old CSV wizard) renders no `<Outlet>`. A probe test mounting the real `/import` component over a stub child at `/import/pdf` rendered "Import Transactions" and never mounted the child. Every PDF Import entry point (`AppSidebar.tsx:139`, `MobileNav.tsx:76`, the keyboard shortcut in `useKeyboardShortcuts.ts:111`) therefore opens the CSV page, whose write path (`import.tsx:234` `db.transactions.update`, `:271` `db.transactions.bulkAdd`) bypasses the outbox. Same defect class as the earlier `/analytics` fix (see the comment in `src/routes/analytics.tsx`).

The CSV page was meant to be disabled (the redirect guard, per IMP-01..03 in `docs/reviews/2026-07-02-architecture-review.md`), and its planned future is a rebuild on the draft pipeline (`createImportSession` then `confirmDrafts`, which already writes through `createOfflineTransactionsBatch` at `src/lib/import-drafts.ts:258`), not a repair.

**Design:**

- `src/routes/import.tsx` becomes a layout route: the existing `beforeLoad` redirect from `/import` to `/import/pdf`, and a component that returns `<Outlet />`.
- Delete what only the old CSV page used: `src/stores/importStore.ts` and `src/stores/__tests__/importStore.test.ts`, and `src/components/DuplicateResolver.tsx`.
- Keep `src/lib/csv-importer.ts` (and its tests) and `src/components/ColumnMapper.tsx`: the draft-pipeline rebuild reuses CSV parsing and column mapping.
- Update the READMEs that list the deleted modules (`src/components/README.md`, `src/stores/README.md`).

## 3. Money parsing

The five ad hoc sites need different fixes. Two of them already hold cents, so a blanket switch to `parsePHP` would multiply them by 100.

| Site                                      | Input                                                                              | Fix                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/currency-input.tsx:91` | User pesos; must commit over-max values so the schema's `.max()` shows "too large" | New `parsePHPUnbounded(input: string): number \| null` in `src/lib/currency.ts`: strips `₱`, commas, spaces; returns `null` for NaN or negative; skips the max check                                                                                                                                                                                        |
| `src/lib/debts/validation.ts:397`         | User pesos, returns `null` when invalid                                            | `parsePHPSafe`                                                                                                                                                                                                                                                                                                                                              |
| `src/routes/drafts.tsx:461`               | User pesos from `e.target.value`                                                   | `parsePHPSafe`; on error keep the previous value. Fixes negative input being stored; empty stays `0` so the field can be cleared                                                                                                                                                                                                                            |
| `src/routes/transactions.tsx:49`, `:50`   | URL params already in cents                                                        | Replace the hand-written `validateSearch` with one `z.object` schema. `amountMin`/`amountMax`: `z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS).optional().catch(undefined)`. `excludeTransfers` is `false` only for boolean `false` or the string `"false"`, otherwise `true` (see the bug note below). Every other field keeps its current behaviour |

**Bug found while tracing (verified 2026-09-30):** the "include transfers" toggle cannot turn exclusion off. `TransactionFilters` navigates with boolean `excludeTransfers: false`; TanStack's default search parser round-trips `?excludeTransfers=false` as a boolean; the hand-written check compares against the string `"false"`, so it returns `true`. A probe router navigating with `{ excludeTransfers: false }` landed on `?excludeTransfers=true`. The schema above fixes it.

## 4. E2E fixtures and auth

- **Budgets fixture.** `budgets` has no `notes` column (error `42703`), has `UNIQUE(household_id, category_id, month)`, and cascades on category delete. `budgets.spec.ts` creates its own `[E2E] Budget Category` through the admin client and budgets against it, and stops filling a notes field. `cleanupTestBudgets` deletes budgets whose `category_id` belongs to a category named like `[E2E]%`, so a leaked budget can no longer block the next run on the same category and month.
- **Auth specs.** One time-boxed investigation using systematic debugging, starting from the Playwright trace of `Authentication > should sign up/sign in` (fails in about 5s). The known port mismatch in `scripts/supabase-lifecycle.mjs` (54321 vs 54331) is a lead to check first, not an assumed cause. If the cause is code or config, fix it; the exit criterion is `test:e2e:smoke` passing on chromium. If it is environmental, log it under Known Infrastructure Issues in CLAUDE.md and close Phase 0 without a green smoke suite.

## 5. Testing

TDD for sections 1 to 3; each test is written and seen failing first.

- `src/lib/offline/transfers.test.ts`: `createOfflineTransfer` writes two rows with the same `transfer_group_id`, opposite types, equal amounts, and two `create` sync-queue items. With `buildSyncQueueItem` stubbed to throw, both `transactions` and `syncQueue` are unchanged. Same-account input and invalid amounts are rejected before any write.
- `src/hooks/useTransfers.test.tsx`: `useCreateTransfer` calls `createOfflineTransfer` and never the Supabase client, and rejects when it returns `success: false`. (`TransferForm.test.tsx` mocks the whole hook, so it is unaffected.)
- `src/routes/import.test.tsx`: a memory router with the real `/import` route options over a stub child renders the child at `/import/pdf`, and `/import` redirects to `/import/pdf`.
- `currency.test.ts`: `parsePHPUnbounded` accepts over-max values, rejects NaN and negatives, strips formatting.
- Search schema: `?amountMin=abc` yields `undefined`, `?amountMin=50000` yields `50000`, missing `excludeTransfers` yields `true`, boolean `false` and string `"false"` yield `false`.
- Verification before merge: `npm run lint`, `npx vitest run`, `npm run build` all exit 0, plus the E2E outcome from section 4.

## 6. Sequencing

One commit per item, in this order: import route (live user-facing bug, smallest), money, transfer, E2E. Check off the matching roadmap items as each lands.

- [x] Import route layout and CSV page retirement (section 2)
- [x] Money parsing (section 3)
- [x] Offline transfer creation (section 1)
- [x] E2E budgets fixture (section 4)
- [x] E2E auth investigation and outcome (section 4)
- [x] Radix upgrade so dialog pickers accept pointer input (Task 8b)

## Out of scope

- Lint rules, branded `Cents`, and the `readDb` facade (Phases 1 and 2).
- Grouping transfer legs into a single sync item.
- Rebuilding CSV import on the draft pipeline, and IMP-02/IMP-03.

## Decisions & Deferrals

- **Transfers sync as two ordinary queue items, not one grouped `transfer` item.** Why: no processor changes, sync badges keep working per leg, and the server trigger accepts either leg first; the cost is a brief half-transfer on the server, which analytics ignores because the lone leg still has `transfer_group_id`. Revisit: if a permanent leg-2 failure is ever seen in practice.
- **Money parses are fixed per site, not all through `parsePHP`.** Why: `transactions.tsx:49-50` parse cents, and `currency-input.tsx` must commit over-max values. Consequence for Phase 1: the money lint message must point at both `parsePHP`/`parsePHPSafe` and route search schemas, not only `parsePHP`. Revisit: when Phase 2 brands `Cents`.
- **The old CSV page is deleted, not routed through the outbox.** Why: its future is a rebuild on the draft pipeline, which already writes through the outbox, so repairing `handleImport` fixes code that will be replaced, and IMP-02/03 would still block it. Git history keeps the old page. Revisit: when CSV import is prioritised; rebuild via `createImportSession`/`confirmDrafts` and fix IMP-02/03 then.
- **`csv-importer.ts` and `ColumnMapper` are kept although nothing imports `ColumnMapper` after this phase.** Why: the rebuild reuses them. Revisit: when Knip lands (roadmap Phase 3), add both to its ignore list with a pointer to this entry.
- **URL search params validated with Zod in `validateSearch`.** Why: `src/routes/README.md` already documents this pattern, and it is the first step of Phase 2's validation at boundaries. Revisit: never.
- **E2E auth work is time-boxed with an environmental fallback.** Why: the root cause is unknown, and the data-loss fixes should not wait on it. Revisit: if logged as environmental, when the infrastructure entry is picked up.
- **Specs live in `docs/plans/`, not `docs/superpowers/specs/`.** Why: repo convention. Revisit: never.
- **Radix `@radix-ui/*` upgrade is added to this branch as Task 8b (decided 2026-09-30).** Why: Task 8 found two copies of `@radix-ui/react-dismissable-layer` (dialog 1.1.15, popover/select/menu/tooltip 1.1.11, split introduced in `1c5b5f3`), so the category picker inside the transaction and budget dialogs ignores mouse and touch. Upgrading all `@radix-ui/*` together is the fix; `resolve.dedupe` breaks the build. Revisit: never; success is one `dismissable-layer` version in `npm ls` and chromium smoke green.
- **E2E scripts build before running (decided 2026-09-30).** Why: Playwright's preview served a `dist/` from 2026-07-13, so E2E tested stale code. Revisit: if build time makes local E2E iteration painful, switch to a dev-server `webServer` instead.
- **E2E transaction cleanup is per-test, not a global `[E2E]` wipe.** Why: `fullyParallel: true` lets one test's `afterEach` delete a sibling's row mid-test. Revisit: never.
