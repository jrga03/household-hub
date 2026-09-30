# Phase 0: Fix Live Bugs (Design)

**Date:** 2026-09-30
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md` (Phase 0)
**Branch:** `phase-0-live-bugs`

## Goal

Clear every known violation of the rules that Phase 1 turns into lint errors, and fix the two live data-loss bugs behind them. When this phase is done, the Phase 1 Dexie-write, Supabase-write, and money selectors can land as `error` with zero violations.

## 1. Offline transfer creation

**Bug:** `TransferForm` calls `useCreateTransfer` (`src/hooks/useTransfers.ts:42`), which inserts both legs straight into Supabase. Transfers fail offline and skip the outbox and event log.

**Design:**

- Add `createOfflineTransfer(input, userId)` to `src/lib/offline/transfers.ts`. It validates that `from_account_id !== to_account_id` and that `validateAmount(amount_cents)` passes, then builds two `TransactionInput` legs sharing one `crypto.randomUUID()` `transfer_group_id`: an `expense` on the source account and an `income` on the destination, same amount, date, status, and visibility. Descriptions keep today's defaults (`Transfer to <name>` / `Transfer from <name>`) when the user leaves the field empty.
- It delegates to `createOfflineTransactionsBatch`, which already writes all rows and all sync-queue items in one Dexie `rw` transaction. No new write path.
- `useCreateTransfer`'s `mutationFn` calls `createOfflineTransfer` and throws on `success: false`. Its three existing invalidations (`transactions`, `transfers`, `accounts`) stay.
- Sync: the processor pushes the legs as two ordinary `transaction` creates. The server trigger `check_transfer_integrity()` validates whichever leg arrives second against the first, so order does not matter.

## 2. CSV import through the outbox

**Bug:** `src/routes/import.tsx:234` (`db.transactions.update`) and `:271` (`db.transactions.bulkAdd`) write Dexie directly. No sync-queue item is created, and new rows lack `id`, `household_id`, and `device_id` (the file's own TODO says it "will fail in production").

**Design:**

- New rows: each batch of 100 maps `Partial<Transaction>` to `TransactionInput` and calls `createOfflineTransactionsBatch(inputs, userId)`. `status` comes from the parser (which defaults to `"pending"`, `csv-importer.ts:177`); `visibility` defaults to `"household"` because the CSV has no such column; `import_key` comes from `addImportKey`. A `success: false` result counts the whole batch as failed, matching today's catch block.
- Replaced rows: `updateOfflineTransaction(existing.id, updateData, userId)` per row.
- `userId` comes from `useAuthStore`. If it is missing, the import aborts with a toast before writing anything.
- Delete the stale TODO and NOTE comments about enrichment.

## 3. Money parsing

The five ad hoc sites need different fixes. Two of them already hold cents, so a blanket switch to `parsePHP` would multiply them by 100.

| Site                                      | Input                                                                              | Fix                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/ui/currency-input.tsx:91` | User pesos; must commit over-max values so the schema's `.max()` shows "too large" | New `parsePHPUnbounded(input: string): number \| null` in `src/lib/currency.ts`: strips `₱`, commas, spaces; returns `null` for NaN or negative; skips the max check                                                                                                                                                      |
| `src/lib/debts/validation.ts:397`         | User pesos, returns `null` when invalid                                            | `parsePHPSafe`                                                                                                                                                                                                                                                                                                            |
| `src/routes/drafts.tsx:461`               | User pesos from `e.target.value`                                                   | `parsePHPSafe`; on error keep the previous value. Fixes negative and empty input being stored                                                                                                                                                                                                                             |
| `src/routes/transactions.tsx:49`, `:50`   | URL params already in cents                                                        | Replace the hand-written `validateSearch` with one `z.object` schema. `amountMin`/`amountMax`: `z.coerce.number().int().min(0).max(MAX_AMOUNT_CENTS).optional().catch(undefined)`. `excludeTransfers` keeps its default of `true` unless the param is the string `"false"`. Every other field keeps its current behaviour |

## 4. E2E fixtures and auth

- **Budgets fixture.** `budgets` has no `notes` column (error `42703`), has `UNIQUE(household_id, category_id, month)`, and cascades on category delete. `budgets.spec.ts` creates its own `[E2E] Budget Category` through the admin client and budgets against it, and stops filling a notes field. `cleanupTestBudgets` deletes budgets whose `category_id` belongs to a category named like `[E2E]%`, so a leaked budget can no longer block the next run on the same category and month.
- **Auth specs.** One time-boxed investigation using systematic debugging, starting from the Playwright trace of `Authentication > should sign up/sign in` (fails in about 5s). The known port mismatch in `scripts/supabase-lifecycle.mjs` (54321 vs 54331) is a lead to check first, not an assumed cause. If the cause is code or config, fix it; the exit criterion is `test:e2e:smoke` passing on chromium. If it is environmental, log it under Known Infrastructure Issues in CLAUDE.md and close Phase 0 without a green smoke suite.

## 5. Testing

TDD for sections 1 to 3; each test is written and seen failing first.

- `src/lib/offline/transfers.test.ts`: `createOfflineTransfer` writes two rows with the same `transfer_group_id`, opposite types, equal amounts, and two `create` sync-queue items. With `buildSyncQueueItem` stubbed to throw, both `transactions` and `syncQueue` are unchanged. Same-account input and invalid amounts are rejected before any write.
- `TransferForm.test.tsx`: update mocks so the form asserts on `createOfflineTransfer`, not the Supabase client.
- CSV import: importing N valid rows produces N `create` queue items with `import_key` set; a replaced row produces one `update` queue item. Test the import logic in a module extracted from `import.tsx` if the route component is impractical to test directly.
- `currency.test.ts`: `parsePHPUnbounded` accepts over-max values, rejects NaN and negatives, strips formatting.
- Search schema: `?amountMin=abc` yields `undefined`, `?amountMin=50000` yields `50000`, missing `excludeTransfers` yields `true`.
- Verification before merge: `npm run lint`, `npx vitest run`, `npm run build` all exit 0, plus the E2E outcome from section 4.

## 6. Sequencing

One commit per item, in this order: money (smallest, no dependencies), CSV import, transfer, E2E. Check off the matching roadmap items as each lands.

- [ ] Money parsing (section 3)
- [ ] CSV import through the outbox (section 2)
- [ ] Offline transfer creation (section 1)
- [ ] E2E budgets fixture (section 4)
- [ ] E2E auth investigation and outcome (section 4)

## Out of scope

- Lint rules, branded `Cents`, and the `readDb` facade (Phases 1 and 2).
- Grouping transfer legs into a single sync item.
- CSV rows that carry a `transfer_group_id` keep today's pass-through behaviour.

## Decisions & Deferrals

- **Transfers sync as two ordinary queue items, not one grouped `transfer` item.** Why: no processor changes, sync badges keep working per leg, and the server trigger accepts either leg first; the cost is a brief half-transfer on the server, which analytics ignores because the lone leg still has `transfer_group_id`. Revisit: if a permanent leg-2 failure is ever seen in practice.
- **Money parses are fixed per site, not all through `parsePHP`.** Why: `transactions.tsx:49-50` parse cents, and `currency-input.tsx` must commit over-max values. Consequence for Phase 1: the money lint message must point at both `parsePHP`/`parsePHPSafe` and route search schemas, not only `parsePHP`. Revisit: when Phase 2 brands `Cents`.
- **URL search params validated with Zod in `validateSearch`.** Why: `src/routes/README.md` already documents this pattern, and it is the first step of Phase 2's validation at boundaries. Revisit: never.
- **E2E auth work is time-boxed with an environmental fallback.** Why: the root cause is unknown, and the data-loss fixes should not wait on it. Revisit: if logged as environmental, when the infrastructure entry is picked up.
- **Specs live in `docs/plans/`, not `docs/superpowers/specs/`.** Why: repo convention. Revisit: never.
