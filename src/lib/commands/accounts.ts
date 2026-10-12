import { isVisibility, VISIBILITY_LABELS, type Ownership } from "@/lib/events/log";
import { requestSync } from "@/lib/sync/triggers";
import {
  ACCOUNT_CREATED,
  ACCOUNT_EDITED,
  ACCOUNT_ENTITY,
  ACCOUNT_RETIRED,
  ACCOUNT_UNRETIRED,
  ACCOUNT_VERSIONS,
  checkAccountDetails,
  isCreditCard,
  type AccountChangeType,
  type AccountDetails,
} from "@/lib/accounts/events";
import { payingAccountChoices } from "@/lib/accounts/paying-account";
import { getAccount, listAccounts, type AccountRow } from "@/lib/accounts/projection";
import type { Cents } from "@/lib/currency";
import { appenderFor } from "./append";

export interface Actor {
  householdId: string;
  userId: string;
}

export interface AccountDetailsInput {
  name: string;
  type: string;
  startingBalanceCents: Cents;
  /** Required for a credit card; left out for every other type. */
  payingAccountId?: string | null;
}

export interface NewAccountInput extends AccountDetailsInput {
  /** Household unless the member deliberately chooses Personal; fixed once created. */
  visibility?: string;
}

const appendAccountEvent = appenderFor(ACCOUNT_ENTITY, ACCOUNT_VERSIONS);

function checkedDetails(input: AccountDetailsInput): AccountDetails {
  const { details, problem } = checkAccountDetails({ ...input });
  if (problem !== null) throw new Error(problem);
  return details;
}

/** Checked against this device's accounts; the picker offers the same choices. */
async function checkPayingAccount(details: AccountDetails, card: Ownership): Promise<void> {
  if (details.payingAccountId === null) return;
  const paying = await getAccount(details.payingAccountId);
  if (!paying || payingAccountChoices([paying], card).length === 0) {
    throw new Error(
      `Choose a ${VISIBILITY_LABELS[card.visibility]} account in use, other than a credit card, to pay this card from.`
    );
  }
}

/** Works offline: the account shows at once and syncs when the device can reach the server. */
export async function createAccount(actor: Actor, input: NewAccountInput): Promise<{ id: string }> {
  const details = checkedDetails(input);
  const visibility = input.visibility ?? "household";
  if (!isVisibility(visibility)) throw new Error("Choose Household or Personal.");
  const ownerUserId = visibility === "personal" ? actor.userId : null;
  await checkPayingAccount(details, { visibility, ownerUserId });

  const id = crypto.randomUUID();
  await appendAccountEvent(actor, { id, visibility, ownerUserId }, ACCOUNT_CREATED, { ...details });
  requestSync();
  return { id };
}

async function requireAccount(accountId: string): Promise<AccountRow> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("That account no longer exists.");
  return account;
}

/**
 * Appends a change to an existing account. The event carries the account's own
 * visibility and owner, so RLS shows it to the same people as the account.
 */
async function appendAccountChange(
  actor: Actor,
  account: AccountRow,
  eventType: AccountChangeType,
  payload: Record<string, unknown>
): Promise<void> {
  await appendAccountEvent(actor, account, eventType, payload);
  requestSync();
}

/**
 * Name, type, starting balance and a card's Paying Account; visibility is fixed
 * at creation, and so is being a credit card. The later edit wins across devices.
 */
export async function editAccount(
  actor: Actor,
  accountId: string,
  input: AccountDetailsInput
): Promise<void> {
  const details = checkedDetails(input);
  const account = await requireAccount(accountId);
  if (isCreditCard(account) && !isCreditCard(details)) {
    throw new Error("A credit card can't become another type of account.");
  }
  if (!isCreditCard(account) && isCreditCard(details)) {
    throw new Error("An account can't become a credit card. Add the card as a new account.");
  }
  await checkPayingAccount(details, account);
  await appendAccountChange(actor, account, ACCOUNT_EDITED, { ...details });
}

const conjunction = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * Hides the account from the main list; it stays under Retired. A card in use
 * must pay from somewhere else first. Retired cards don't block, so a card and
 * its bank can be retired together.
 */
export async function retireAccount(actor: Actor, accountId: string): Promise<void> {
  const account = await requireAccount(accountId);
  const cards = (await listAccounts()).filter(
    (card) => isCreditCard(card) && card.payingAccountId === account.id
  );
  if (cards.length > 0) {
    const names = conjunction.format(cards.map((card) => card.name));
    const verb = cards.length === 1 ? "is" : "are";
    const pronoun = cards.length === 1 ? "it" : "them";
    throw new Error(
      `${names} ${verb} paid from ${account.name}. Choose another paying account for ${pronoun} first.`
    );
  }
  await appendAccountChange(actor, account, ACCOUNT_RETIRED, {});
}

/** A card comes back only once its Paying Account is in use, so no card in use pays from a retired one. */
export async function unretireAccount(actor: Actor, accountId: string): Promise<void> {
  const account = await requireAccount(accountId);
  const paying =
    account.payingAccountId === null ? null : await getAccount(account.payingAccountId);
  if (paying?.retired) {
    throw new Error(
      `${account.name} is paid from ${paying.name}, which is retired. Unretire ${paying.name} first.`
    );
  }
  await appendAccountChange(actor, account, ACCOUNT_UNRETIRED, {});
}
