import { isCreditCard } from "@/lib/accounts/events";
import { listAccounts } from "@/lib/accounts/projection";
import { listAllocations } from "@/lib/allocations/projection";
import { listBudgets } from "@/lib/budgets/projection";

/** The opening checklist's steps, each ticked off from the data rather than by the member. */
export interface OpeningSteps {
  startingBalances: boolean;
  distributed: boolean;
  budgets: boolean;
  /** The account Distribute opens on: the first that holds envelopes and has a starting balance. */
  distributeAccountId: string | null;
}

export async function readOpeningSteps(): Promise<OpeningSteps> {
  const [accounts, allocations, budgets] = await Promise.all([
    listAccounts(),
    listAllocations(),
    listBudgets(),
  ]);
  const funded = accounts.filter((account) => account.startingBalanceCents > 0);
  return {
    startingBalances: funded.length > 0,
    // Distribute always allocates out of Unassigned; a transfer alone only moves Unassigned between accounts.
    distributed: allocations.some((allocation) => allocation.from.kind === "unassigned"),
    budgets: budgets.some((budget) => budget.amountCents !== null),
    distributeAccountId: funded.find((account) => !isCreditCard(account))?.id ?? null,
  };
}
