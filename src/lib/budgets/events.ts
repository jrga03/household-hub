import { asCents, formatPHP, MAX_AMOUNT_CENTS, type Cents } from "@/lib/currency";
import type { LoggedEvent } from "@/lib/events/log";
import type { EventVersions } from "@/lib/events/versions";
import { isLocalMonth, monthLabel } from "@/lib/utils/dates";
import { uuidV5 } from "@/lib/utils/uuid";

export const BUDGET_ENTITY = "budget";
export const BUDGET_SET = "budget.set";

export const BUDGET_VERSIONS = {
  [BUDGET_SET]: { current: 1, upcasts: {} },
} satisfies EventVersions;

/** One version of a category's budget: it stands from its month until a later one replaces it. */
export interface BudgetDetails {
  categoryId: string;
  /** The first month it applies to, "yyyy-MM". */
  fromMonth: string;
  /** Null clears the budget from this month. */
  amountCents: Cents | null;
  /** The funding account; null when cleared. */
  accountId: string | null;
}

/** Derived from the category and month, so two devices setting the same month make one record. */
export const budgetId = (categoryId: string, fromMonth: string) =>
  uuidV5(categoryId, `budget:${fromMonth}`);

type DetailsCheck = { details: BudgetDetails; problem: null } | { details: null; problem: string };

const rejected = (problem: string): DetailsCheck => ({ details: null, problem });

/**
 * Validates a budget from a form or from another device's event. An amount of
 * 0 or none clears it, so its funding account is dropped. Whether the category
 * and account exist, are in use and fit is checked by the command.
 */
export function checkBudgetDetails(input: Record<string, unknown>): DetailsCheck {
  const { categoryId, fromMonth, amountCents, accountId } = input;
  if (typeof categoryId !== "string" || categoryId === "") return rejected("Choose a category.");
  if (!isLocalMonth(fromMonth)) return rejected("Choose a month.");
  if (amountCents == null || amountCents === 0) {
    return {
      details: { categoryId, fromMonth, amountCents: null, accountId: null },
      problem: null,
    };
  }
  if (
    typeof amountCents !== "number" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 0 ||
    amountCents > MAX_AMOUNT_CENTS
  ) {
    return rejected(`A budget can be at most ${formatPHP(asCents(MAX_AMOUNT_CENTS))}.`);
  }
  if (typeof accountId !== "string" || accountId === "") {
    return rejected("Choose the account that funds it.");
  }
  return {
    details: { categoryId, fromMonth, amountCents: asCents(amountCents), accountId },
    problem: null,
  };
}

/** What a set sets, or null for any other event or a broken payload. */
export function decodeBudgetSet(event: LoggedEvent): BudgetDetails | null {
  return event.eventType === BUDGET_SET ? checkBudgetDetails(event.payload).details : null;
}

/** "Set budget: ₱8,000.00 from October 2026", or "Clear budget from October 2026". */
export function describeBudgetEvent(event: LoggedEvent): string {
  const details = decodeBudgetSet(event);
  if (!details) return "Change budget";
  const from = monthLabel(details.fromMonth);
  return details.amountCents === null
    ? `Clear budget from ${from}`
    : `Set budget: ${formatPHP(details.amountCents)} from ${from}`;
}
