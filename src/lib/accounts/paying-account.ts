import type { Ownership } from "@/lib/events/log";
import { isCreditCard } from "./events";
import type { AccountRow } from "./projection";

/** A card's Paying Account must be seen by exactly the people who see the card (ADR 0002). */
export const canPay = (paying: AccountRow, card: Ownership) =>
  !isCreditCard(paying) &&
  paying.visibility === card.visibility &&
  paying.ownerUserId === card.ownerUserId;

/** Accounts a card's bill can be paid from: in use, not a card, and seen by the same people. */
export const payingAccountChoices = (accounts: AccountRow[], card: Ownership) =>
  accounts.filter((account) => !account.retired && canPay(account, card));
