import { sameOwnership, VISIBILITY_LABELS, type Ownership } from "@/lib/events/log";
import { getAccount, type AccountRow } from "@/lib/accounts/projection";
import { canHoldMoneyIn, getCategory, type CategoryRow } from "@/lib/categories/projection";

export function refuseRetired(record: { name: string; retired: boolean }): void {
  if (record.retired) throw new Error(`${record.name} is retired. Choose one in use.`);
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
