import { sameOwnership, VISIBILITY_LABELS, type Ownership } from "@/lib/events/ownership";
import { isCreditCard } from "@/lib/accounts/events";
import { getAccount, type AccountRow } from "@/lib/accounts/projection";
import { canHoldMoneyIn, getCategory, type CategoryRow } from "@/lib/categories/projection";

export function refuseRetired(record: { name: string; retired: boolean }): void {
  if (record.retired) throw new Error(`${record.name} is retired. Choose one in use.`);
}

const conjunction = new Intl.ListFormat("en", { type: "conjunction" });

/** Only a retired record that nothing ever used can be deleted; `history` says what used it. */
export function refuseDelete(record: { name: string; retired: boolean }, history: string[]): void {
  if (!record.retired) throw new Error(`Retire ${record.name} before deleting it.`);
  if (history.length > 0) {
    throw new Error(`${record.name} has ${conjunction.format(history)}, so it stays retired.`);
  }
}

export async function requireAccount(accountId: string): Promise<AccountRow> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("That account no longer exists.");
  return account;
}

export async function requireCategory(categoryId: string): Promise<CategoryRow> {
  const category = await getCategory(categoryId);
  if (!category) throw new Error("That category no longer exists.");
  return category;
}

/** The category, once it's on this device and holds money in the account's visibility. */
export async function requireCategoryFor(
  categoryId: string,
  account: AccountRow
): Promise<CategoryRow> {
  const category = await requireCategory(categoryId);
  if (!canHoldMoneyIn(category, account)) {
    throw new Error(
      `Choose a ${VISIBILITY_LABELS[account.visibility]} category for ${account.name}.`
    );
  }
  return category;
}

/** A record moves only to an account in use of its own visibility (ADR 0002). */
export function checkMove(account: AccountRow, record: Ownership): void {
  if (!sameOwnership(account, record)) {
    const visibility = VISIBILITY_LABELS[record.visibility];
    throw new Error(
      `Choose a ${visibility} account. To move it to a ${VISIBILITY_LABELS[account.visibility]} one, remove it and add it there.`
    );
  }
  refuseRetired(account);
}

/** The card, once it's on this device and seen by the same people as the account. */
export async function requireCardFor(cardId: string, account: AccountRow): Promise<AccountRow> {
  const card = await getAccount(cardId);
  if (!card || !isCreditCard(card)) throw new Error("That card no longer exists.");
  if (!sameOwnership(card, account)) {
    throw new Error(`Choose a ${VISIBILITY_LABELS[account.visibility]} card for ${account.name}.`);
  }
  return card;
}

/** Money goes into a Card Payment only where the card's bill is paid from. */
export async function refusePaidElsewhere(card: AccountRow, account: AccountRow): Promise<void> {
  if (card.payingAccountId === account.id) return;
  const paying = card.payingAccountId === null ? undefined : await getAccount(card.payingAccountId);
  throw new Error(
    `${card.name} is paid from ${paying?.name ?? "another account"}. Choose a card paid from ${account.name}.`
  );
}
