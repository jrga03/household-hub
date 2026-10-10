import { db } from "@/lib/dexie/db";
import type { Cents } from "@/lib/currency";
import type { LoggedEvent, Visibility } from "@/lib/events/log";
import { decodeAccountCreated, type AccountType } from "./events";

export interface AccountRow {
  id: string;
  householdId: string;
  visibility: Visibility;
  name: string;
  type: AccountType;
  startingBalanceCents: Cents;
  /** HLC of the event that last wrote this row; a later one wins. */
  hlc: string;
}

export async function projectAccountEvent(event: LoggedEvent): Promise<void> {
  const created = decodeAccountCreated(event);
  if (!created) return;
  const existing = await db.accounts.get(event.entityId);
  // Formatted HLCs sort as strings.
  if (existing && existing.hlc > event.hlc) return;
  await db.accounts.put({
    id: event.entityId,
    householdId: event.householdId,
    visibility: event.visibility,
    ...created,
    hlc: event.hlc,
  });
}

export async function listAccounts(): Promise<AccountRow[]> {
  const accounts = await db.accounts.toArray();
  return accounts.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
