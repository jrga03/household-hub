import { db } from "@/lib/dexie/db";
import type { LoggedEvent, Visibility } from "@/lib/events/log";
import {
  ACCOUNT_CREATED,
  decodeAccountDetails,
  decodeAccountRetirement,
  isCreditCard,
  type AccountDetails,
} from "./events";
import { canPay } from "./paying-account";

export interface AccountRow extends AccountDetails {
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
  const details = decodeAccountDetails(event);
  if (!account) {
    if (!details || event.eventType !== ACCOUNT_CREATED) return null;
    // The earliest create fixes visibility, owner and household (ADR 0002).
    return {
      id: event.entityId,
      householdId: event.householdId,
      visibility: event.visibility,
      ownerUserId: event.ownerUserId,
      ...details,
      retired: false,
    };
  }
  // Changes carry the account's own visibility and owner; anything else isn't a change to this account.
  if (event.visibility !== account.visibility || event.ownerUserId !== account.ownerUserId) {
    return account;
  }
  if (details) {
    // A card stays a card and nothing else becomes one, as the earliest create decided.
    return isCreditCard(details) === isCreditCard(account) ? { ...account, ...details } : account;
  }
  const retired = decodeAccountRetirement(event);
  return retired === null ? account : { ...account, retired };
}

/**
 * Folds an account's events in HLC order, so the row is the same whatever order
 * they arrived in. With no create left (one was discarded), there is no row.
 */
export async function projectAccount(accountId: string, history: LoggedEvent[]): Promise<void> {
  const account = [...history].sort(byHlc).reduce<AccountRow | null>(applyAccountEvent, null);
  if (account) await db.accounts.put(account);
  else await db.accounts.delete(accountId);
}

export const getAccount = (id: string) => db.accounts.get(id);

export interface AccountListItem extends AccountRow {
  /** A card's Paying Account, once this device holds it; null for every other type. */
  payingAccount: AccountRow | null;
}

/**
 * Resolves Paying Accounts when read rather than when projected, so a card
 * whose Paying Account arrives later shows it as soon as it does. A retired
 * Paying Account still resolves, so the card can say so.
 */
async function listByRetirement(retired: boolean): Promise<AccountListItem[]> {
  const accounts = await db.accounts.toArray();
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const payingAccountOf = (card: AccountRow) => {
    const paying = card.payingAccountId === null ? undefined : byId.get(card.payingAccountId);
    return paying && canPay(paying, card) ? paying : null;
  };
  return accounts
    .filter((account) => account.retired === retired)
    .map((account) => ({ ...account, payingAccount: payingAccountOf(account) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export const listAccounts = () => listByRetirement(false);

export const listRetiredAccounts = () => listByRetirement(true);
