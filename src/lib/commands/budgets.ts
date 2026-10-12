import { VISIBILITY_LABELS } from "@/lib/events/log";
import { requestSync } from "@/lib/sync/triggers";
import { isCreditCard } from "@/lib/accounts/events";
import {
  BUDGET_ENTITY,
  BUDGET_SET,
  BUDGET_VERSIONS,
  budgetId,
  checkBudgetDetails,
  type BudgetDetails,
} from "@/lib/budgets/events";
import { budgetInForce } from "@/lib/budgets/inForce";
import { canFundBudget, getBudget, listBudgets } from "@/lib/budgets/projection";
import type { CategoryRow } from "@/lib/categories/projection";
import type { Cents } from "@/lib/currency";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";
import { refuseRetired, requireAccount, requireCategory } from "./records";

export interface BudgetInput {
  categoryId: string;
  /** "yyyy-MM": the budget stands from this month until a later one replaces it. */
  fromMonth: string;
  /** 0 or null clears it from this month. */
  amountCents: Cents | null;
  /** The funding account; ignored when clearing. */
  accountId: string | null;
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

/**
 * Whether the month's own version already says this, or a clear meets no
 * budget at all. A set matching an earlier month's budget is still recorded:
 * it pins this month to that amount.
 */
async function alreadySet(id: string, details: BudgetDetails): Promise<boolean> {
  const own = await getBudget(id);
  if (own) return own.amountCents === details.amountCents && own.accountId === details.accountId;
  return (
    details.amountCents === null &&
    budgetInForce(await listBudgets(), details.categoryId, details.fromMonth) === null
  );
}

/**
 * Sets a category's budget from a month on, or clears it with 0. Two devices
 * setting the same month write the same record, and the later set wins.
 * Works offline; the budget is seen by the same people as its category.
 */
export async function setBudget(actor: Actor, input: BudgetInput): Promise<void> {
  const { details, problem } = checkBudgetDetails({ ...input });
  if (problem !== null) throw new Error(problem);
  const category = await requireCategory(details.categoryId);
  refuseRetired(category);
  if (details.accountId !== null) await checkFundingAccount(details.accountId, category);
  const id = await budgetId(details.categoryId, details.fromMonth);
  // A re-sent unchanged set would carry a later HLC and undo another device's change.
  if (await alreadySet(id, details)) return;

  await appendBudgetEvent(actor, { ...category, id }, BUDGET_SET, { ...details });
  requestSync();
}
