/**
 * Local IndexedDB store. Empty until the event log (#15) defines its tables.
 *
 * The pre-re-architecture database lived under a different name and held the
 * row outbox; it is deleted on startup so old devices start from an empty
 * store (there is no production data to migrate).
 *
 * @module dexie/db
 */

import Dexie from "dexie";
import { reportError } from "@/lib/sentry";

const LEGACY_DATABASE_NAME = "HouseholdHubDB";
const DATABASE_NAME = "household-hub";

export class HouseholdHubDB extends Dexie {
  constructor() {
    super(DATABASE_NAME);
    this.version(1).stores({});
  }
}

export const db = new HouseholdHubDB();

export async function openLocalDatabase(): Promise<void> {
  await Promise.all([Dexie.delete(LEGACY_DATABASE_NAME), db.open()]);
}

openLocalDatabase().catch((error: unknown) => {
  reportError(error, { subsystem: "dexie-db", operation: "open" });
});
