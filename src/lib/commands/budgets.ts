import { sameOwnership, VISIBILITY_LABELS } from "@/lib/events/log";
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
import { listBudgets } from "@/lib/budgets/projection";
import type { CategoryRow } from "@/lib/categories/projection";
import { getCategory } from "@/lib/categories/projection";
import type { Cents } from "@/lib/currency";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";
import { refuseRetired, requireAccount } from "./records";

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

async function requireCategory(categoryId: string): Promise<CategoryRow> {
  const category = await getCategory(categoryId);
  if (!category) throw new Error("That category no longer exists.");
  return category;
}

/** The funding account shares the category's visibility and owner, and holds envelopes (ADR 0007). */
async function checkFundingAccount(accountId: string, category: CategoryRow): Promise<void> {
  const account = await requireAccount(accountId);
  if (!sameOwnership(account, category)) {
    throw new Error(
      `Choose a ${VISIBILITY_LABELS[category.visibility]} account to fund ${category.name}.`
    );
  }
  if (isCreditCard(account)) throw new Error("A credit card can't fund a budget.");
  refuseRetired(account);
}

/** Whether the month already has this budget, from its own version or an earlier one. */
async function alreadyInForce(details: BudgetDetails): Promise<boolean> {
  const current = budgetInForce(await listBudgets(), details.categoryId, details.fromMonth);
  if (details.amountCents === null) return current === null;
  return current?.amountCents === details.amountCents && current.accountId === details.accountId;
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
  // A re-sent unchanged set would carry a later HLC and undo another device's change.
  if (await alreadyInForce(details)) return;

  const id = await budgetId(details.categoryId, details.fromMonth);
  await appendBudgetEvent(actor, { ...category, id }, BUDGET_SET, { ...details });
  requestSync();
}
