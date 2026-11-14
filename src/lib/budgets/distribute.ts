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
import { diffCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { sameOwnership } from "@/lib/events/ownership";
import { paydaysNamedOrInUse, readPaydays, type PaydayRow } from "@/lib/paydays/projection";
import type { Portion } from "./events";
import { hasPortionOn } from "./inForce";
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

/** The portions on the paydays, summed; null when none is on them. */
function portionsOn(portions: Portion[], paydayIds: string[]): Cents | null {
  const on = portions.filter((portion) => paydayIds.includes(portion.paydayId));
  return on.length > 0 ? sumCents(on.map((portion) => portion.amountCents)) : null;
}

/**
 * In income mode, a line per budget in force for `month` ("yyyy-MM") that
 * any payday pays or that has a portion on one of `paydayIds`. It asks for
 * what is left of the budget this month, capped by those portions, floored at
 * zero (ADR 0014); in opening mode, a
 * blank line per category, kept in the source. Only categories in use that
 * the source can hold, in the Categories screen's order.
 */
export async function readDistributeLines(
  sourceAccountId: string,
  month: string,
  mode: DistributeMode,
  paydayIds: string[] = []
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
    const onPaydays = portionsOn(budget.portions, paydayIds);
    if (budget.portions.length > 0 && onPaydays === null) return [];
    const funding = accountById.get(budget.accountId);
    const left = diffCents(budget.amountCents, allocated);
    const asked = onPaydays !== null && onPaydays < left ? onPaydays : left;
    return [
      {
        categoryId: category.id,
        accountId: canReceive(funding, source) ? budget.accountId : source.id,
        amountCents: asked > 0 ? asked : ZERO_CENTS,
        budgetCents: budget.amountCents,
        fundingAccountRetired: funding?.retired === true,
      },
    ];
  });
}

export interface PaydayChoices {
  paydays: PaydayRow[];
  /** The first payday with money left this month; null when there is none. */
  preselectedPaydayId: string | null;
}

/**
 * The paydays in use, plus retired ones a budget in force still names; and
 * the first one in order whose portions, with
 * the earlier paydays' portions, ask a budget the source can hold for more
 * than was allocated to it this month.
 */
export async function readPaydayChoices(
  sourceAccountId: string,
  month: string
): Promise<PaydayChoices> {
  const [allPaydays, source, categories, view] = await Promise.all([
    readPaydays(),
    getAccount(sourceAccountId),
    readCategoryList(),
    readMonthView(month, month),
  ]);
  const budgets = (source ? categoriesHeldBy(categories, source) : []).flatMap((category) => {
    const { budget, allocated } = categoryMonth(view, category.id);
    return budget ? [{ portions: budget.portions, allocated }] : [];
  });
  const paydays = paydaysNamedOrInUse(allPaydays, budgets);
  const paidSoFar: string[] = [];
  for (const payday of paydays) {
    paidSoFar.push(payday.id);
    const moneyLeft = budgets.some(
      (budget) =>
        hasPortionOn(budget, payday.id) &&
        (portionsOn(budget.portions, paidSoFar) ?? ZERO_CENTS) > budget.allocated
    );
    if (moneyLeft) return { paydays, preselectedPaydayId: payday.id };
  }
  return { paydays, preselectedPaydayId: null };
}

export interface AccountTotal {
  accountId: string;
  amountCents: Cents;
}

/**
 * How much the lines send to each account other than the source, in the
 * order the accounts first appear, then what stays in the source. Blank
 * lines count as zero; accounts with a zero total are left out.
 */
export function summarizeByAccount(
  lines: Pick<DistributeLine, "accountId" | "amountCents">[],
  sourceAccountId: string
): AccountTotal[] {
  const totals = new Map<string, Cents>();
  for (const line of lines) {
    const sum = sumCents([
      totals.get(line.accountId) ?? ZERO_CENTS,
      line.amountCents ?? ZERO_CENTS,
    ]);
    totals.set(line.accountId, sum);
  }
  const rows = [...totals].map(([accountId, amountCents]) => ({ accountId, amountCents }));
  return [
    ...rows.filter((row) => row.accountId !== sourceAccountId),
    ...rows.filter((row) => row.accountId === sourceAccountId),
  ].filter((row) => row.amountCents > 0);
}
