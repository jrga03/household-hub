# Debt Sync Defects (Design)

**Date:** 2026-10-06
**Roadmap:** `docs/plans/2026-09-30-guardrails-roadmap.md` (between Phase 2b and 2c; decision 2 of 2026-10-05 in the 2b plan's Decisions & Deferrals)
**Branch:** `debt-sync-defects`, cut from `main` at `5885b18` or later

## Goal

Make debts, internal debts, and debt payments round-trip between devices through the same outbox and pull paths as every other entity, and repair any debt rows already stored on devices. No debts route or UI: that is a later spec.

## Background (measured on `main` at `5885b18`, 2026-10-06)

| Item                 | Measurement                                                                                                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDs                  | `nanoid()` in `debts/crud.ts:45,84`, `payments.ts:94`, `reversals.ts:157`, `events.ts:142,202,266`. Server `id`, `debt_id`, `internal_debt_id`, `reverses_payment_id`, `transactions.debt_id` are `uuid`, so every insert fails `invalid input syntax for type uuid` (non-retryable: the item fails permanently). |
| Queue payload        | `debts/sync.ts:98-113` queues the event envelope (`id` = event id, `entity_type`, `entity_id`, `op`, `payload`, `idempotency_key`, clocks, `actor_user_id`, ...). `processor.ts:309-312` inserts it as the row. `actor_user_id` (PGRST204) is only the first unknown column.                                      |
| Atomicity            | `createExternalDebt` (`crud.ts:55-58`): `db.debts.add`, then `createDebtEvent`, then `addDebtEventToSyncQueue`, each separate. `createOfflineTransaction` calls `processDebtPayment` (`offline/transactions.ts:110`) outside its own transaction.                                                                 |
| Pull                 | `realtime-sync.ts:193,533` and `SyncTableName` (`validations/syncRows.ts:5`) cover only `transactions`, `accounts`, `categories`. Debts never reach a second device.                                                                                                                                              |
| Realtime publication | Local `supabase_realtime` publication has no tables (`pg_publication_tables` empty). Production unknown. Catch-up (`fetchLatestChanges`, one `syncHighWaterMark` on `updated_at`) is the path that actually delivers rows.                                                                                        |
| Household lookup     | `TransactionFormDialog.tsx:118` calls `listDebts(user.id, ...)`; rows are written with `DEFAULT_HOUSEHOLD_ID`, so the picker is always empty. The constant is redefined per module (`offline/transactions.ts`, `offline/syncQueue.ts`, ...).                                                                      |
| UI                   | No route mounts `components/debts/forms/*`. With the empty picker, no user path can create a debt: device stores and production tables are expected to hold zero debt rows (production count unverified).                                                                                                         |
| Server events        | `transaction_events.entity_type` CHECK allows only `transaction`, `account`, `category`, `budget`: debt events cannot sync as events.                                                                                                                                                                             |
| Server triggers      | `update_debt_on_payment` bumps the parent debt's `updated_at` on each payment; `validate_debt_payment_overpayment` sets the overpayment flags server-side; `debt_payments` has `created_at` only (append-only ledger).                                                                                            |
| `buildSyncQueueItem` | Reads `db.meta`, the Lamport clock and the device id (`offline/syncQueue.ts`), and needs a `userId`: it cannot run inside a Dexie `upgrade()` or transaction zone.                                                                                                                                                |

## 1. IDs

`debts/crud.ts`, `payments.ts`, `reversals.ts`, and `events.ts` generate ids with `crypto.randomUUID()`. `nanoid` stays only in `import-drafts.ts` and `event-compactor.ts` (local-only ids). An ESLint `no-restricted-imports` entry bans `nanoid` under `src/lib/debts/**` and `src/lib/offline/**`, with a message pointing at `crypto.randomUUID()`.

## 2. Write path: standard outbox

Every debt mutation follows `offline/accounts.ts`: build the queue item(s) first, outside any transaction, then write the row, its local `db.events` entry, and the queue item(s) in one `db.transaction("rw", ...)`.

- The queue payload is the row in server shape: the columns of `Database["public"]["Tables"][T]["Insert"]` for `debts`, `internal_debts`, `debt_payments`. No envelope, no `actor_user_id`.
- `addDebtEventToSyncQueue` and `getCurrentUserId` (`debts/sync.ts`) are deleted. Debt write functions take `userId` as a parameter, like the other offline modules.
- Debt events stay a local audit log in `db.events` (ids now UUIDs); they are never queued.
- `createOfflineTransaction` with `debt_id` or `internal_debt_id` builds both queue items, then writes the transaction row, the payment row and both items in one transaction, transaction item first (`debt_payments.transaction_id` references `transactions`). `handleTransactionEdit` and `handleTransactionDelete` (reversals) do the same with their reversal rows.
- The processor is unchanged: `getTableName` already maps `debt`, `internal_debt`, `debt_payment`.

## 3. Legacy repair: `repairLegacyDebtIds(userId)`

A one-shot job, run when the sync engine starts after sign-in, guarded by `db.meta` key `debtIdRepair` = `"done"`. Not a Dexie version bump, because building queue items needs auth and async metadata.

1. Read `debts`, `internalDebts`, `debtPayments`; map each non-UUID id to a new `crypto.randomUUID()`.
2. Build a fresh `create` queue item for every debt, internal debt and payment row (all of them, not just re-keyed ones), in that order, payments by `created_at`.
3. In one rw transaction over `debts`, `internalDebts`, `debtPayments`, `transactions`, `events`, `syncQueue`, `meta`:
   - re-key rows (delete old key, add new);
   - rewrite references: `debtPayments.debt_id`, `internal_debt_id`, `reverses_payment_id`; `transactions.debt_id`, `internal_debt_id`; `events.entity_id`;
   - delete every queue item whose `entity_type` is `debt`, `internal_debt` or `debt_payment`, whatever its status (all are envelope-shaped and can never succeed);
   - add the fresh queue items from step 2;
   - in `transaction` queue items with status `queued` or `failed`, rewrite re-keyed debt ids in the payload, and reset `failed` items whose payload referenced a re-keyed id to `queued`, `retry_count` 0, no `next_retry_at`;
   - set the flag.

If the transaction throws, nothing is written and the flag stays unset; the job runs again at the next start. A second run after success is a no-op (flag set). With zero debt rows the job only deletes stale debt queue items and sets the flag. Re-enqueuing a create for a row that somehow already exists on the server is harmless: `syncCreate` treats a `23505` primary-key duplicate as synced (`processor.ts:315-319`).

## 4. Pull path

- `SyncTableName` adds `debts`, `internal_debts`, `debt_payments`; `parseSyncRow` gets a Zod schema for each, with money columns branded `Cents` inside `validations/**`.
- Catch-up covers six tables in FK order: `accounts`, `categories`, `debts`, `internal_debts`, `transactions`, `debt_payments`.
- `debts`, `internal_debts`: filter and order on `updated_at`, merged by the existing last-write-wins `mergeRecord`.
- `debt_payments`: filter and order on `created_at`, merged insert-if-absent (rows are immutable; a reversal is a new row). Catch-up takes a per-table cursor column; the shared `syncHighWaterMark` stays one value (both columns are server timestamps).
- Realtime subscriptions are added for the three tables, with `debt_payments` handled as insert-only. Whether production publishes them is checked in acceptance; changing the publication is out of scope.

## 5. Household lookup

`DEFAULT_HOUSEHOLD_ID` moves to one export, `src/lib/household.ts`, imported by the offline modules, `syncQueue.ts` and debts. `TransactionFormDialog` calls `listDebts(DEFAULT_HOUSEHOLD_ID, "external", { status: "active" })` with query key `["debts", DEFAULT_HOUSEHOLD_ID, "external", "active"]`.

## 6. Testing

Unit (vitest, fake-indexeddb):

- Each debt mutation (create external, create internal, update, payment, reversal) writes row, event and queue item together; a throw forced inside the transaction leaves none of them.
- Queue payloads are typed against the generated `Insert` types, so an extra key is a compile error; a runtime test asserts the key set for each entity.
- A transaction with `debt_id` enqueues the transaction item before the payment item.
- `repairLegacyDebtIds`: re-key, every reference rewrite, debt queue rebuild, failed transaction item reset, no-op second run, flag unset when the transaction throws, zero-row case.
- Pull: merge for the three tables, insert-if-absent for payments, invalid row skipped and reported.

Integration (local stack): create an external debt, pay it from a transaction, reverse the payment, run the processor, then check the server rows by SQL and that the server balance equals `calculateDebtBalance`.

No new E2E (no UI). Gates: the three tsc programs, lint, `npx vitest run`, build, `npm run size`, chromium smoke.

## 7. Rollout

No migration. Branch `debt-sync-defects`, merged to `main` locally by fast-forward, pushed by the user. After the push, a production SQL check: `count(*)` on `debts`, `internal_debts`, `debt_payments` (expected 0), and `pg_publication_tables` for `supabase_realtime`.

## 8. Out of scope

- Debts route, list and creation UI (own spec).
- Adding debt tables (or any tables) to the `supabase_realtime` publication.
- Syncing debt events to the server.
- Multi-household (`DEFAULT_HOUSEHOLD_ID` stays; DECISIONS #61).

## 9. Decisions & Deferrals

- **Scope is end-to-end sync without UI (decided 2026-10-06).** Why: fixing only the four listed defects would still leave the envelope payload, non-atomic writes and no pull, so debts would not round-trip. Revisit: n/a.
- **Debts move to the standard outbox; the processor is not special-cased (decided 2026-10-06).** Why: one payload shape in the only module that writes to Supabase, and atomic writes; the 2c outbox invariant test then covers debts. Rejected: unwrapping the envelope in the processor, and a server RPC for debt events.
- **Legacy non-UUID rows are re-keyed, not deleted (decided 2026-10-06).** Why: no data loss if anyone did create debts; the job is cheap when there are none. Runs post-sign-in because queue items need auth. Revisit: remove the job once telemetry or a release cycle shows it has run everywhere.
- **Realtime publication not changed (deferred 2026-10-06).** Why: local publication is empty and production's is unknown; catch-up already delivers rows. Revisit: when the production check shows which tables are published, or when cross-device latency matters.
- **Catch-up first run still looks back only 24 hours (deferred 2026-10-06).** Why: pre-existing behavior for all tables, and there are no server debt rows yet. Revisit: with the debts UI spec or 2c's `readDb` work.
