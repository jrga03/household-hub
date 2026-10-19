import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { canHoldMoneyIn, type CategoryRow } from "@/lib/categories/projection";
import { db } from "@/lib/dexie/db";
import type { LoggedEvent } from "@/lib/events/log";
import { sameOwnership, type Ownership } from "@/lib/events/ownership";
import type { EntityProjection } from "@/lib/events/projector";
import {
  BUDGET_ENTITY,
  BUDGET_VERSIONS,
  decodeBudgetSet,
  describeBudgetEvent,
  type BudgetDetails,
} from "./events";

/** One month's version of a category's budget; a cleared one is kept, since it ends the earlier one. */
export interface BudgetRow extends BudgetDetails, Ownership {
  id: string;
  householdId: string;
}

/**
 * Every set stands alone, so the latest HLC wins. The earliest set fixes the
 * category, month, visibility and owner; a later one naming others is ignored.
 */
function applyBudgetEvent(budget: BudgetRow | null, event: LoggedEvent): BudgetRow | null {
  const details = decodeBudgetSet(event);
  if (!details) return budget;
  if (!budget) {
    return {
      id: event.entityId,
      householdId: event.householdId,
      visibility: event.visibility,
      ownerUserId: event.ownerUserId,
      ...details,
    };
  }
  const sameVersion =
    details.categoryId === budget.categoryId && details.fromMonth === budget.fromMonth;
  if (!sameVersion || !sameOwnership(event, budget)) return budget;
  return { ...budget, amountCents: details.amountCents, accountId: details.accountId };
}

export const budgetProjection: EntityProjection<BudgetRow> = {
  entityType: BUDGET_ENTITY,
  table: db.budgets,
  versions: BUDGET_VERSIONS,
  // No set depends on another: discarding one refused set leaves the rest.
  isCreation: () => false,
  fold: applyBudgetEvent,
  describe: describeBudgetEvent,
};

/** A funding account holds the category's money and isn't a card (ADR 0007); retirement is checked apart. */
export const canFundBudget = (account: AccountRow, category: CategoryRow) =>
  canHoldMoneyIn(category, account) && !isCreditCard(account);

export const getBudget = (id: string) => db.budgets.get(id);

export const listBudgets = () => db.budgets.toArray();
