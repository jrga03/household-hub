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

const LEGACY_DATABASE_NAME = "HouseholdHubDB";
const DATABASE_NAME = "household-hub";

export interface MetaRow {
  key: "deviceId" | "clock" | "pullCursor";
  value: string | number;
}

export class HouseholdHubDB extends Dexie {
  events!: Table<StoredEvent, string>;
  accounts!: Table<AccountRow, string>;
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
  }
}

export const db = new HouseholdHubDB();

export async function openLocalDatabase(): Promise<void> {
  await Promise.all([Dexie.delete(LEGACY_DATABASE_NAME), db.open()]);
}

openLocalDatabase().catch((error: unknown) => {
  reportError(error, { subsystem: "dexie-db", operation: "open" });
});
