import {
  asCents,
  formatPHP,
  isAmount,
  MAX_AMOUNT_CENTS,
  sumCents,
  type Cents,
} from "@/lib/currency";
import type { LoggedEvent } from "@/lib/events/log";
import type { EventVersions } from "@/lib/events/versions";
import { isLocalMonth, monthLabel } from "@/lib/utils/dates";
import { uuidV5 } from "@/lib/utils/uuid";

export const BUDGET_ENTITY = "budget";
export const BUDGET_SET = "budget.set";

export const BUDGET_VERSIONS = {
  [BUDGET_SET]: { current: 2, upcasts: { 1: (payload) => ({ ...payload, portions: [] }) } },
} satisfies EventVersions;

/** The part of a budget one payday pays for (ADR 0014). */
export interface Portion {
  paydayId: string;
  amountCents: Cents;
}

/** One version of a category's budget: it stands from its month until a later one replaces it. */
export interface BudgetDetails {
  categoryId: string;
  /** The first month it applies to, "yyyy-MM". */
  fromMonth: string;
  /** Null clears the budget from this month. */
  amountCents: Cents | null;
  /** The funding account; null when cleared. */
  accountId: string | null;
  /** One per payday, adding up to the amount; empty when any payday pays it, or when cleared. */
  portions: Portion[];
}

/** Derived from the category and month, so two devices setting the same month make one record. */
export const budgetId = (categoryId: string, fromMonth: string) =>
  uuidV5(categoryId, `budget:${fromMonth}`);

type DetailsCheck = { details: BudgetDetails; problem: null } | { details: null; problem: string };

const rejected = (problem: string): DetailsCheck => ({ details: null, problem });

/** The portions, or the problem: each names a payday once, is more than zero, and they add up to the amount. */
function checkPortions(input: unknown, amountCents: Cents): Portion[] | string {
  if (input === undefined) return [];
  if (!Array.isArray(input)) return "Portions must be a list.";
  const portions: Portion[] = [];
  for (const portion of input as unknown[]) {
    if (typeof portion !== "object" || portion === null) return "Portions must be a list.";
    const { paydayId, amountCents: portionCents } = portion as Record<string, unknown>;
    if (typeof paydayId !== "string" || paydayId === "") return "Choose a payday for each portion.";
    if (!isAmount(portionCents)) return "Each portion must be more than zero.";
    if (portions.some((seen) => seen.paydayId === paydayId)) {
      return "Give each payday one portion.";
    }
    portions.push({ paydayId, amountCents: asCents(portionCents) });
  }
  const total = sumCents(portions.map((portion) => portion.amountCents));
  if (portions.length > 0 && total !== amountCents) {
    return `The portions add up to ${formatPHP(total)}, not the budget’s ${formatPHP(amountCents)}.`;
  }
  return portions;
}

/**
 * Validates a budget from a form or from another device's event. An amount of
 * 0 or none clears it, so its funding account is dropped. Whether the category
 * and account exist, are in use and fit is checked by the command.
 */
export function checkBudgetDetails(input: Record<string, unknown>): DetailsCheck {
  const { categoryId, fromMonth, amountCents, accountId, portions } = input;
  if (typeof categoryId !== "string" || categoryId === "") return rejected("Choose a category.");
  if (!isLocalMonth(fromMonth)) return rejected("Choose a month.");
  if (amountCents == null || amountCents === 0) {
    return {
      details: { categoryId, fromMonth, amountCents: null, accountId: null, portions: [] },
      problem: null,
    };
  }
  if (!isAmount(amountCents)) {
    return rejected(
      `A budget must be more than zero and at most ${formatPHP(asCents(MAX_AMOUNT_CENTS))}. Enter 0 to clear it.`
    );
  }
  if (typeof accountId !== "string" || accountId === "") {
    return rejected("Choose the account that funds it.");
  }
  const checked = checkPortions(portions, asCents(amountCents));
  if (typeof checked === "string") return rejected(checked);
  return {
    details: {
      categoryId,
      fromMonth,
      amountCents: asCents(amountCents),
      accountId,
      portions: checked,
    },
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
