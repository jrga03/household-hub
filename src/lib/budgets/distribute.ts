/**
 * The lines Distribute money opens with, read from the budget, category and
 * month projections. Carryover is ignored: a line asks only for what is left
 * of the budget this month, in any account, so a second payday in the same
 * month asks only for the rest.
 */

import { isCreditCard } from "@/lib/accounts/events";
import { getAccount, type AccountRow } from "@/lib/accounts/projection";
import {
  canHoldMoneyIn,
  categoriesInUse,
  readCategoryList,
  type CategoryList,
  type CategoryRow,
} from "@/lib/categories/projection";
import { diffCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { sameOwnership } from "@/lib/events/ownership";
import { categoryMonth, readMonthView } from "./month";

/** After recording income, prefilled from the budgets; or the opening balance, blank. */
export type DistributeMode = "income" | "opening";

export interface DistributeLine {
  categoryId: string;
  /** Where the money ends up: the budget's funding account, or the source. */
  accountId: string;
  /** Null when left blank for the member to fill in. */
  amountCents: Cents | null;
  /** The budget in force this month; null for a category without one. */
  budgetCents: Cents | null;
  /** The budget's funding account is retired, so the line stays in the source. */
  fundingAccountRetired: boolean;
}

/** Distributed money can go to an account in use, not a card, seen by the same people as the source. */
export const canReceive = (account: AccountRow | undefined, source: AccountRow) =>
  account !== undefined &&
  !account.retired &&
  !isCreditCard(account) &&
  sameOwnership(account, source);

/** Categories in use the account can hold, in the Categories screen's order. */
export const categoriesHeldBy = (list: CategoryList, account: AccountRow): CategoryRow[] =>
  categoriesInUse(list).filter((category) => canHoldMoneyIn(category, account));

/**
 * In income mode, a line per budget in force for `month` ("yyyy-MM"),
 * prefilled with what is left of it, floored at zero; in opening mode, a
 * blank line per category, kept in the source. Only categories in use that
 * the source can hold, in the Categories screen's order.
 */
export async function readDistributeLines(
  sourceAccountId: string,
  month: string,
  mode: DistributeMode
): Promise<DistributeLine[]> {
  const source = await getAccount(sourceAccountId);
  if (!source) return [];
  const [categories, view, accounts] = await Promise.all([
    readCategoryList(),
    readMonthView(month, month),
    db.accounts.toArray(),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const inUse = categoriesHeldBy(categories, source);

  if (mode === "opening") {
    return inUse.map((category) => ({
      categoryId: category.id,
      accountId: source.id,
      amountCents: null,
      budgetCents: categoryMonth(view, category.id).budget?.amountCents ?? null,
      fundingAccountRetired: false,
    }));
  }

  return inUse.flatMap((category) => {
    const { budget, allocated } = categoryMonth(view, category.id);
    if (!budget) return [];
    const funding = accountById.get(budget.accountId);
    const left = diffCents(budget.amountCents, allocated);
    return [
      {
        categoryId: category.id,
        accountId: canReceive(funding, source) ? budget.accountId : source.id,
        amountCents: left > 0 ? left : ZERO_CENTS,
        budgetCents: budget.amountCents,
        fundingAccountRetired: funding?.retired === true,
      },
    ];
  });
}
