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
import { readPaydays, type PaydayRow } from "@/lib/paydays/projection";
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
    const portions = budget.portions.filter((portion) => paydayIds.includes(portion.paydayId));
    if (budget.portions.length > 0 && portions.length === 0) return [];
    const funding = accountById.get(budget.accountId);
    const left = diffCents(budget.amountCents, allocated);
    const onPaydays = sumCents(portions.map((portion) => portion.amountCents));
    const asked = portions.length > 0 && onPaydays < left ? onPaydays : left;
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
  preselected: string | null;
}

/**
 * The household's paydays, and the first one in order whose portions, with
 * the earlier paydays' portions, ask a budget in use for more than was
 * allocated to it this month.
 */
export async function readPaydayChoices(month: string): Promise<PaydayChoices> {
  const [paydays, categories, view] = await Promise.all([
    readPaydays(),
    readCategoryList(),
    readMonthView(month, month),
  ]);
  const budgets = categoriesInUse(categories).flatMap((category) => {
    const { budget, allocated } = categoryMonth(view, category.id);
    return budget ? [{ portions: budget.portions, allocated }] : [];
  });
  const paidSoFar = new Set<string>();
  const hasMoneyLeft = (payday: PaydayRow) => {
    paidSoFar.add(payday.id);
    return budgets.some(
      ({ portions, allocated }) =>
        portions.some((portion) => portion.paydayId === payday.id) &&
        sumCents(
          portions
            .filter((portion) => paidSoFar.has(portion.paydayId))
            .map((portion) => portion.amountCents)
        ) > allocated
    );
  };
  return { paydays, preselected: paydays.find(hasMoneyLeft)?.id ?? null };
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
