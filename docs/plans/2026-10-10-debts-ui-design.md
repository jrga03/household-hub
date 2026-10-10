# Debts UI (Design)

**Date:** 2026-10-10
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md`, the debts UI spec after Phase 3b.
**Inputs:** the five cross-device gaps deferred in `docs/plans/2026-10-06-debt-sync-defects.md` (Decisions & Deferrals) and the 3b decision to route `src/components/debts/**` (`docs/plans/2026-10-09-phase-3b-knip-design.md`, section 8).
**Branches:** `debts-sync-gaps` (migration and data layer), then `debts-ui` (routes), both cut from `main` at `f8bf960` or later. `debts-ui` is cut after `debts-sync-gaps` is merged and its migration is deployed to production.

## Goal

Make external debts creatable and viewable from the app, and close the five cross-device gaps that become reachable once they are.

## Background (measured on `main` at `f8bf960`, 2026-10-10)

- No route imports `src/components/debts/**` (11 files, 1271 lines). `knip.jsonc` ignores the directory.
- Debts already half-ship. The transaction form links a transaction to an active external debt (`TransactionFormDialog.tsx`, `activeExternalDebtsQueryOptions`). Catch-up pulls `debts`, `internal_debts` and `debt_payments`, parents first (`src/lib/sync/realtime.ts`). `debt_payments` is insert-only in catch-up.
- The form has no internal-debt selector, so only external debts can receive payments.
- Production debt row counts are 0 (2026-10-06). Realtime publishes no tables in production; catch-up is the only cross-device path.
- `autoSync` pushes (drains the outbox) and then pulls (`autoSync.ts:291` onward).
- The processor already treats a 23505 on a `_pkey` as "already synced" (`processor.ts:311`).
- `transactions` has no `deleted_at`; deletes are hard.
- `debt_payments` is append-only by RLS (SEC-06: SELECT and INSERT policies only). `debt_payments.transaction_id` is `NOT NULL REFERENCES transactions(id)` with no `ON DELETE` action.
- `debts` and `internal_debts` have partial unique indexes on `(household_id, LOWER(name)) WHERE status = 'active'`, and no BEFORE UPDATE trigger on `updated_at`. `update_updated_at_column()` exists (`20251024001500_create_transactions.sql:212`).
- `nextDebtStatus` never changes an `archived` debt and moves `active` and `paid_off` back and forth by balance.
- Bundle: 374.6 KB gz of 378. Routes are auto code-split.

## 1. Migration (`debts-sync-gaps`)

One migration, followed by `npm run gen:types` in the same commit.

- **Gap 1, server `updated_at`:** add BEFORE INSERT OR UPDATE triggers on `debts` and `internal_debts` that call `update_updated_at_column()`. The server owns `updated_at`, so a late or skewed client value cannot sort below another device's catch-up mark. A queued status update also cannot move it behind the payment trigger's `NOW()`.
- **Server `created_at` on `debt_payments` (added at planning, 2026-10-10):** a BEFORE INSERT trigger sets `created_at = now()`. Catch-up pulls payments on `created_at` with one shared cursor, so a payment pushed late from an offline device would otherwise sort below another device's mark and never reach it, and reconcile assumes every device eventually sees every payment.
- **Gap 5, transaction delete:** drop `NOT NULL` on `debt_payments.transaction_id` and re-create its foreign key with `ON DELETE SET NULL`. Referential actions bypass RLS, so clients still cannot UPDATE or DELETE ledger rows. Every `debt_payments` trigger is BEFORE or AFTER INSERT only (checked at planning), so the SET NULL fires none of them.
- **Gap 2, double reversal:** add a partial unique index `debt_payments_reverses_payment_id_unique` on `debt_payments(reverses_payment_id) WHERE reverses_payment_id IS NOT NULL`.
- **Gap 4b, name collisions:** drop `idx_debts_household_name_unique` and `idx_internal_debts_household_name_unique`.

pgTAP covers each change:

- An authenticated client still cannot UPDATE or DELETE a `debt_payments` row.
- Deleting a linked transaction keeps the payment and its reversal, with `transaction_id` null.
- A second reversal of one payment fails with 23505.
- Two active debts in one household can share a name.
- An insert or update sets `updated_at` (debts) and an insert sets `created_at` (payments) to the server's time even when the client sends an older value.

Production deploy (by the user, before `debts-sync-gaps` is pushed):

1. Debt row counts, expected 0.
2. `supabase migration list --linked`.
3. `db push --dry-run`, which should list only this migration.
4. `db push`.
5. SQL check of the new index, the FK action and the triggers.

## 2. Client data layer (`debts-sync-gaps`)

- **Reversal conflict (gap 2):** a `debt_payment` insert that fails with 23505 and whose message names `debt_payments_reverses_payment_id_unique` means the payment is already reversed. The processor deletes the local reversal row and completes the queue item; no Sync Issue is raised. Any other 23505 keeps today's handling. The next pull brings the winning reversal.
- **Reconcile pass (gap 2), `src/lib/debts/reconcile.ts`:** runs after each catch-up, over the transactions whose `transactions` or `debt_payments` rows changed in that pull.
  - The expected ledger for transaction T is exactly one live payment of T's amount to T's `debt_id`, and none when T is unlinked. When T is not in Dexie, reconcile skips it: it may not have been pulled yet, and a local delete already reversed its payments.
  - A live payment is a non-reversal payment that no reversal points at.
  - The keeper is the matching live payment with the smallest `id` (revised at planning: a device's own rows keep their client `created_at` while other devices hold the server's, so `created_at` is not the same on every device). Every other live payment for T is reversed with reason `reconcile`, through the outbox.
  - A pulled live payment whose `transaction_id` is null lost its transaction to a delete that raced an edit; reconcile reverses it.
  - Reconcile only writes reversals; it never creates payments. When live payments exist but none matches the expected one, it reports through `reportError` and leaves the ledger unchanged.
  - Reconcile skips any T that has `queued` or `syncing` outbox items for T or its payments. The local edit has not settled yet, and a later pull reconciles it.
  - Every device picks the same keeper, so concurrent runs reverse the same payments, and the unique index plus the 23505 rule collapse the duplicates.
- **Status re-derivation (gap 4a):** after reconcile, call `updateMultipleDebtStatuses` for every debt whose payments changed in the pull or in reconcile. It writes only when the status changes, and `archived` is never touched. Two devices writing the same value is harmless under last-write-wins.
- **Transaction delete, local side (gap 5, revised at planning):** local ledger rows keep their `transaction_id`. Nulling locally would modify existing ledger rows without queue items, which the outbox invariant test forbids. The cost is cosmetic: the deleting device's history shows the old transaction reference instead of "Transaction deleted". `DebtPayment.transaction_id` becomes `string | null`.
- **Delete while sync is pending (gap 3):** if a debt's only outbox item is its own create and that item is still `queued`, deleting the debt removes the row and the item in one Dexie transaction, and nothing is sent. Otherwise `validateDebtDeletion` keeps its guard: an item that is `syncing`, any other pending debt item, or any pending payment item.
- **Names:** `isDebtNameUnique` stays as the same-device check on create and rename. The server no longer enforces uniqueness.

## 3. UI (`debts-ui`)

- **Routes:**
  - `/debts` uses `<PageShell variant="split">`. `DebtList` in Main has an Active / Paid off / Archived filter. A summary aside shows the total owed and total paid, visible at `@[1100px]`.
  - `/debts/$debtId` shows `DebtBalanceDisplay`, `DebtProgressBar`, Record payment, Edit, Archive or Unarchive, Delete, and `PaymentHistoryList`.
  - The file structure follows `/analytics`: `debts.tsx` is a layout route rendering `<Outlet />`, with `debts/index.tsx` and `debts/$debtId.tsx`. (`accounts.tsx` renders no `<Outlet />`, so `/accounts/$accountId` never shows its page; found at planning, out of scope.)
- **Nav:** "Debts" in the Core Financial section after Accounts, in `AppSidebar` and `MobileNav`.
- **Reads:** `debtsListQueryOptions()` (external debts with balances) and `debtDetailQueryOptions(debtId)` (the debt, its balance and its payments). Both sit in `supabaseQueries.ts` next to `activeExternalDebtsQueryOptions`, with keys under `queryKeys.debts`. Both read Dexie, which is the debts source of truth, so they work offline as is.
- **Writes:**
  - `CreateExternalDebtForm` and `EditExternalDebtForm` open in a Dialog. Each write calls `afterOutboxWrite(queryClient, userId, "debt")`; today they only call `onSuccess`.
  - Archive, unarchive and delete call the existing `crud.ts` functions and invalidate the same way.
  - Record payment opens `TransactionFormDialog` with a new `defaultDebtId` prop. A payment remains a transaction linked to a debt.
- **Delete affordance:** shown only for a debt with no payment history. While section 2's guard applies, Delete is disabled and the guard's message from `validateDebtDeletion` is shown under it.
- **Payment history:** a payment whose `transaction_id` is null reads "Transaction deleted". A non-null link keeps today's "Transaction #abcd1234" text even when this device deleted it: Dexie caches transactions on demand, so a missing row does not prove a delete. Dates are parsed with `parseLocalDate`.
- **Errors:** write failures show a Sonner toast and call `reportError`; validation errors stay inline in the forms.
- **Knip:** the commit that first imports `src/components/debts/**` from a route also deletes that ignore entry.
  - `CreateInternalDebtForm.tsx` gets an exact-path ignore with "Revisit: internal debts spec".
  - If Knip flags the barrel files (`index.ts`, `forms/index.ts`), delete them and import files directly. Delete any other component that is still unused.
  - Re-run `npm run knip` after every change; config hints only appear once the report is otherwise empty.
- **Roadmap:** add an internal debts spec (route `CreateInternalDebtForm`, add an internal-debt selector to the transaction form) after this spec and before the push notifications spec.

## 4. Testing and gates

- **pgTAP:** section 1.
- **Vitest:**
  - The 23505 rule, including that a 23505 on another constraint still fails.
  - Reconcile scenarios:
    - two devices edit one transaction;
    - an unlinked transaction with a live payment, and a pulled orphan payment;
    - a transaction with pending outbox items is skipped;
    - no matching payment reports and writes nothing;
    - two reconcile runs over the same pull write each reversal once.
  - Status re-derivation after a pull.
  - Nulled links on transaction delete.
  - Delete coalescing, both when allowed and when blocked.
  - Route component tests for list, filter, detail and the Delete affordance.
  - The outbox invariant test must pass with the new reconcile writes.
- **Integration (env-gated, local stack):** extend the existing test with a two-device double reversal; the server balance must equal the local one on both devices after sync.
- **E2E smoke (chromium):** create a debt, record a payment, see the balance and progress update.
- **Gates per branch:** lint 0, vitest, tsc (both programs), `npm run knip` exit 0, build, `npm run size` within 378 KB, chromium smoke, and full chromium E2E compared per test with the baseline (`debts-ui` only).

## 5. Risks

- **Reconcile reverses a payment the user meant to keep.** It acts only on transactions with no pending local items, only when more than one live payment exists or the links disagree, and it keeps the payment matching the transaction's current state. Every reversal stays visible in payment history.
- **The bundle has 3.4 KB of headroom.** Debts routes are code-split, but shared imports can land in the main chunk. The plan measures after each UI task and stops at the budget.
- **The migration changes a constraint on an append-only table.** Production has 0 debt rows, and pgTAP proves the RLS posture is unchanged.

## 6. Out of scope

- Internal debts UI and the internal-debt transaction selector (next spec).
- Push notifications (spec after that).
- The processor's transient-parent-failure fix (deferred in the debt sync plan).
- Insert-time server timestamps.
- Realtime publication.
- Soft-deleting transactions.

## 7. Decisions & Deferrals

- **External debts only; internal debts get their own spec next, before push notifications (decided 2026-10-10).** Why: the transaction form links external debts only, and covering both doubles UI and test scope. Revisit: internal debts spec (removes the `CreateInternalDebtForm.tsx` ignore).
- **Two branches, migration deployed first (decided 2026-10-10).** Why: the UI must not make debts creatable before the constraints it depends on exist; this follows 2b-0 then 2b. Rejected: one branch; UI behind a flag first.
- **Gap 5: `transaction_id` nullable with `ON DELETE SET NULL` (decided 2026-10-10).** Why: the local delete already writes a reversal, so the ledger keeps both amounts and loses only the link. Rejected: blocking the delete (mistakes become permanent); soft-deleting transactions (cross-cutting).
- **Gap 2: unique reversal index, the 23505 rule and a deterministic reconcile (decided 2026-10-10).** Rejected: index plus a mismatch warning (manual cleanup); index only (balance stays wrong).
- **Gap 4a: re-derive status after pull (decided 2026-10-10).** Why: follows from reconcile; idempotent across devices.
- **Gap 4b: drop server name uniqueness and keep the client check (decided 2026-10-10).** Why: with client-generated ids, server uniqueness on a display name turns an offline create into a stranded sync item and strands its payments. Rejected: auto-rename on 23505; Sync Issue with manual rename.
- **Gap 1: server-set `updated_at` on update for both debt tables (decided 2026-10-10).**
- **Gap 3: coalesce delete with an unsent create; keep the guard otherwise (decided 2026-10-10, recommended default).** Why: the common case is deleting a debt created by mistake while offline. Revisit: if users report Delete stuck on "waiting for sync".
- **Layout mirrors accounts: `/debts` split plus `/debts/$debtId`; nav in Core Financial after Accounts; Record payment reuses `TransactionFormDialog` (decided 2026-10-10).** Rejected: a single page with a sheet (no deep link); a tab under Accounts.
- **Revised at planning (2026-10-10, recommended defaults; see the plan's Decisions Needed):** server-set `created_at` on payment inserts and `updated_at` on debt inserts; keeper by smallest `id`; local ledger rows keep their `transaction_id`; reconcile skips transactions missing from Dexie and reverses pulled orphans; layout route per `/analytics`. Why: each fixes a way devices could disagree or the outbox invariant would break, found while reading the code.
