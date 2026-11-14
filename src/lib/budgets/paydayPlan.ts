import { addCentsTo, sumCents, type Cents } from "@/lib/currency";
import type { Budget } from "./inForce";

export interface PaydayPlanLine {
  categoryId: string;
  /** The portion on this payday, or the whole budget for any payday. */
  amountCents: Cents;
  accountId: string;
}

export interface PaydayPlanSection {
  /** Null for the budgets any payday pays. */
  paydayId: string | null;
  lines: PaydayPlanLine[];
  total: Cents;
  /** The total split by funding account, in the order the lines name them. */
  byAccount: Map<string, Cents>;
}

function section(paydayId: string | null, lines: PaydayPlanLine[]): PaydayPlanSection {
  const byAccount = new Map<string, Cents>();
  for (const { accountId, amountCents } of lines) addCentsTo(byAccount, accountId, amountCents);
  return { paydayId, lines, total: sumCents(lines.map((line) => line.amountCents)), byAccount };
}

/**
 * What each payday pays this month, in payday order, then what any payday
 * pays. A budget in portions shows under each of its paydays with that portion.
 * `budgets` are by category ID, in the order to list them.
 */
export function paydayPlan(
  paydayIds: string[],
  budgets: [categoryId: string, budget: Budget][]
): PaydayPlanSection[] {
  const onPayday = (paydayId: string) =>
    budgets.flatMap(([categoryId, { accountId, portions }]) =>
      portions
        .filter((portion) => portion.paydayId === paydayId)
        .map(({ amountCents }) => ({ categoryId, amountCents, accountId }))
    );
  const anyPayday = budgets
    .filter(([, budget]) => budget.portions.length === 0)
    .map(([categoryId, { amountCents, accountId }]) => ({ categoryId, amountCents, accountId }));

  return [
    ...paydayIds.map((paydayId) => section(paydayId, onPayday(paydayId))),
    section(null, anyPayday),
  ];
}
