import { db } from "@/lib/dexie/db";
import type { Cents } from "@/lib/currency";
import type { LoggedEvent, Visibility } from "@/lib/events/log";
import { decodeAccountCreated, type AccountType } from "./events";

export interface AccountRow {
  id: string;
  householdId: string;
  visibility: Visibility;
  /** Set only on a Personal account: the member it belongs to. */
  ownerUserId: string | null;
  name: string;
  type: AccountType;
  startingBalanceCents: Cents;
  /** HLC of the event that last wrote this row; a later one wins. */
  hlc: string;
  /** HLC of the earliest create, whose visibility, owner and household are fixed (ADR 0002). */
  createdHlc: string;
}

export async function projectAccountEvent(event: LoggedEvent): Promise<void> {
  const created = decodeAccountCreated(event);
  if (!created) return;
  const existing = await db.accounts.get(event.entityId);
  const fixedAtCreation = {
    householdId: event.householdId,
    visibility: event.visibility,
    ownerUserId: event.ownerUserId,
    createdHlc: event.hlc,
  };
  if (!existing) {
    await db.accounts.put({ id: event.entityId, ...fixedAtCreation, ...created, hlc: event.hlc });
    return;
  }
  // Formatted HLCs sort as strings.
  if (event.hlc < existing.createdHlc) {
    await db.accounts.put({ ...existing, ...fixedAtCreation });
  } else if (event.hlc > existing.hlc) {
    await db.accounts.put({ ...existing, ...created, hlc: event.hlc });
  }
}

export async function listAccounts(): Promise<AccountRow[]> {
  const accounts = await db.accounts.toArray();
  return accounts.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
