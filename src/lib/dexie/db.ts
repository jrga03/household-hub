/**
 * Local IndexedDB store: the device's replica of the event log, the
 * projections screens read, and sync bookkeeping (ADR 0001).
 *
 * The pre-re-architecture database lived under a different name and held the
 * row outbox; it is deleted on startup so old devices start from an empty
 * store (there is no production data to migrate).
 *
 * @module dexie/db
 */

import Dexie, { type Table } from "dexie";
import { reportError } from "@/lib/sentry";
import type { StoredEvent } from "@/lib/events/log";
import type { AccountRow } from "@/lib/accounts/projection";
import type { AllocationRow } from "@/lib/allocations/projection";
import type { BudgetRow } from "@/lib/budgets/projection";
import type { DraftRow, ImportRow } from "@/lib/import/drafts";
import type { CategoryRow, GroupRow } from "@/lib/categories/projection";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";

const LEGACY_DATABASE_NAME = "HouseholdHubDB";
const DATABASE_NAME = "household-hub";

export interface MetaRow {
  key:
    | "deviceId"
    | "clock"
    | "pullCursor"
    | "householdId"
    | "leftHouseholdIds"
    | `statementPassword:${string}`
    | `importCard:${string}`;
  value: string | number | string[] | null;
}

export class HouseholdHubDB extends Dexie {
  events!: Table<StoredEvent, string>;
  accounts!: Table<AccountRow, string>;
  categoryGroups!: Table<GroupRow, string>;
  categories!: Table<CategoryRow, string>;
  transactions!: Table<TransactionRow, string>;
  allocations!: Table<AllocationRow, string>;
  transfers!: Table<TransferRow, string>;
  budgets!: Table<BudgetRow, string>;
  imports!: Table<ImportRow, string>;
  drafts!: Table<DraftRow, string>;
  meta!: Table<MetaRow, MetaRow["key"]>;

  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores({});
    this.version(2).stores({
      events: "id, [pushed+hlc]",
      accounts: "id",
      meta: "key",
    });
    // Projections rebuild one entity from its own events.
    this.version(3)
      .stores({ events: "id, [pushed+hlc], entityId" })
      .upgrade((transaction) =>
        transaction
          .table("accounts")
          .toCollection()
          .modify((account: Record<string, unknown>) => {
            account.retired ??= false;
            account.payingAccountId ??= null;
            delete account.hlc;
            delete account.createdHlc;
          })
      );
    // A push the server refused waits for the member: retried or discarded, never resent on its own.
    this.version(4)
      .stores({ events: "id, [pushState+hlc], entityId" })
      .upgrade((transaction) =>
        transaction
          .table("events")
          .toCollection()
          .modify((event: Record<string, unknown>) => {
            event.pushState = event.pushed === 1 ? "pushed" : "waiting";
            delete event.pushed;
          })
      );
    this.version(5).stores({ categoryGroups: "id", categories: "id" });
    this.version(6).stores({ transactions: "id, [date+recordedHlc]" });
    this.version(7).stores({ allocations: "id, [date+recordedHlc]" });
    this.version(8).stores({ transfers: "id, [date+recordedHlc]" });
    this.version(9).stores({ budgets: "id" });
    // Drafts stay on this device, outside the event log (ADR 0008).
    this.version(10).stores({
      transactions: "id, [date+recordedHlc], importKey",
      imports: "id",
      drafts: "id, importId",
    });
  }
}

export const db = new HouseholdHubDB();

export async function openLocalDatabase(): Promise<void> {
  await Promise.all([Dexie.delete(LEGACY_DATABASE_NAME), db.open()]);
}

openLocalDatabase().catch((error: unknown) => {
  reportError(error, { subsystem: "dexie-db", operation: "open" });
});
