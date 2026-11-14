import { VISIBILITY_LABELS } from "@/lib/events/ownership";
import { requestSync } from "@/lib/sync/triggers";
import { isCreditCard } from "@/lib/accounts/events";
import {
  BUDGET_ENTITY,
  BUDGET_SET,
  BUDGET_VERSIONS,
  budgetId,
  checkBudgetDetails,
  type BudgetDetails,
  type Portion,
} from "@/lib/budgets/events";
import { budgetInForce, hasPortionOn } from "@/lib/budgets/inForce";
import { canFundBudget, getBudget, listBudgets } from "@/lib/budgets/projection";
import type { CategoryRow } from "@/lib/categories/projection";
import type { Cents } from "@/lib/currency";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";
import { requirePayday } from "./paydays";
import { refuseRetired, requireAccount, requireCategory } from "./records";

export interface BudgetInput {
  categoryId: string;
  /** "yyyy-MM": the budget stands from this month until a later one replaces it. */
  fromMonth: string;
  /** 0 or null clears it from this month. */
  amountCents: Cents | null;
  /** The funding account; ignored when clearing. */
  accountId: string | null;
  /** One per payday, adding up to the amount; left out or empty when any payday pays it. */
  portions?: Portion[];
}

const appendBudgetEvent = appenderFor(BUDGET_ENTITY, BUDGET_VERSIONS);

/** The funding account shares the category's visibility and owner, and holds envelopes (ADR 0007). */
async function checkFundingAccount(accountId: string, category: CategoryRow): Promise<void> {
  const account = await requireAccount(accountId);
  if (isCreditCard(account)) throw new Error("A credit card can't fund a budget.");
  if (!canFundBudget(account, category)) {
    throw new Error(
      `Choose a ${VISIBILITY_LABELS[category.visibility]} account to fund ${category.name}.`
    );
  }
  refuseRetired(account);
}

const samePortions = (a: Portion[], b: Portion[]) =>
  a.length === b.length &&
  a.every((portion, index) => {
    const other = b[index];
    return other?.paydayId === portion.paydayId && other.amountCents === portion.amountCents;
  });

/**
 * Whether the month's own version already says this, or a clear meets no
 * budget at all. A set matching an earlier month's budget is still recorded:
 * it pins this month to that amount.
 */
async function alreadySet(id: string, details: BudgetDetails): Promise<boolean> {
  const own = await getBudget(id);
  if (own) {
    return (
      own.amountCents === details.amountCents &&
      own.accountId === details.accountId &&
      samePortions(own.portions, details.portions)
    );
  }
  return (
    details.amountCents === null &&
    budgetInForce(await listBudgets(), details.categoryId, details.fromMonth) === null
  );
}

/**
 * Sets a category's budget from a month on, or clears it with 0. Two devices
 * setting the same month write the same record, and the later set wins.
 * Works offline; the budget is seen by the same people as its category.
 * `currentMonth` is "yyyy-MM".
 */
export async function setBudget(
  actor: Actor,
  input: BudgetInput,
  currentMonth: string
): Promise<void> {
  const { details, problem } = checkBudgetDetails({ ...input });
  if (problem !== null) throw new Error(problem);
  const category = await requireCategory(details.categoryId);
  refuseRetired(category);
  if (details.accountId !== null) await checkFundingAccount(details.accountId, category);
  // Only an earlier month's budget may keep a portion it had on a retired payday, so history can still change.
  const had =
    details.fromMonth < currentMonth
      ? budgetInForce(await listBudgets(), details.categoryId, details.fromMonth)
      : null;
  for (const portion of details.portions) {
    const payday = await requirePayday(portion.paydayId);
    if (!had || !hasPortionOn(had, payday.id)) refuseRetired(payday);
  }
  const id = await budgetId(details.categoryId, details.fromMonth);
  // A re-sent unchanged set would carry a later HLC and undo another device's change.
  if (await alreadySet(id, details)) return;

  await appendBudgetEvent(actor, { ...category, id }, BUDGET_SET, { ...details });
  requestSync();
}
