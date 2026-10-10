import { db } from "@/lib/dexie/db";
import type { LoggedEvent, Visibility } from "@/lib/events/log";
import {
  decodeAccountCreated,
  decodeAccountEdited,
  decodeAccountRetirement,
  type NewAccount,
} from "./events";

export interface AccountRow extends NewAccount {
  id: string;
  householdId: string;
  visibility: Visibility;
  /** Set only on a Personal account: the member it belongs to. */
  ownerUserId: string | null;
  /** Hidden from the main list, kept under Retired; resolved apart from the details. */
  retired: boolean;
}

// Formatted HLCs sort as strings; the event id keeps the order total.
const byHlc = (a: LoggedEvent, b: LoggedEvent) =>
  a.hlc < b.hlc ? -1 : a.hlc > b.hlc ? 1 : a.id < b.id ? -1 : 1;

function applyAccountEvent(account: AccountRow | null, event: LoggedEvent): AccountRow | null {
  const created = decodeAccountCreated(event);
  if (!account) {
    if (!created) return null;
    // The earliest create fixes visibility, owner and household (ADR 0002).
    return {
      id: event.entityId,
      householdId: event.householdId,
      visibility: event.visibility,
      ownerUserId: event.ownerUserId,
      ...created,
      retired: false,
    };
  }
  // Changes carry the account's own visibility and owner; anything else isn't a change to this account.
  if (event.visibility !== account.visibility || event.ownerUserId !== account.ownerUserId) {
    return account;
  }
  const details = created ?? decodeAccountEdited(event);
  if (details) return { ...account, ...details };
  const retired = decodeAccountRetirement(event);
  return retired === null ? account : { ...account, retired };
}

/** Folds an account's events in HLC order, so the row is the same whatever order they arrived in. */
export async function projectAccount(history: LoggedEvent[]): Promise<void> {
  const account = [...history].sort(byHlc).reduce<AccountRow | null>(applyAccountEvent, null);
  if (account) await db.accounts.put(account);
}

export const getAccount = (id: string) => db.accounts.get(id);

async function listByRetirement(retired: boolean): Promise<AccountRow[]> {
  const accounts = await db.accounts.filter((account) => account.retired === retired).toArray();
  return accounts.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export const listAccounts = () => listByRetirement(false);

export const listRetiredAccounts = () => listByRetirement(true);
