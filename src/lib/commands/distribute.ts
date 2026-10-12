import { UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import { sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { appendTogether } from "@/lib/events/log";
import type { Actor } from "./accounts";
import { addAllocation } from "./allocations";
import { addTransfer } from "./transfers";

export interface DistributeLineInput {
  categoryId: string;
  /** Where the money ends up; the source keeps it as a plain allocation. */
  accountId: string;
  amountCents: Cents;
}

export interface DistributeInput {
  sourceAccountId: string;
  /** The records' date, the member's local date "yyyy-MM-dd". */
  date: string;
  lines: DistributeLineInput[];
}

function totalsByAccount(lines: DistributeLineInput[]): Map<string, Cents> {
  const totals = new Map<string, Cents>();
  for (const line of lines) {
    totals.set(
      line.accountId,
      sumCents([totals.get(line.accountId) ?? ZERO_CENTS, line.amountCents])
    );
  }
  return totals;
}

/**
 * Splits the source's Unassigned across categories as one change: one
 * transfer of Unassigned into each other account (its lines' total), then an
 * allocation per line in its account. Lines without an amount are left out;
 * whatever isn't distributed stays in Unassigned, and asking for more than it
 * holds is allowed, like Move money.
 */
export function distributeMoney(
  actor: Actor,
  { sourceAccountId, date, lines }: DistributeInput
): Promise<void> {
  const funded = lines.filter((line) => line.amountCents > 0);
  if (funded.length === 0) {
    return Promise.reject(new Error("Enter an amount on at least one line."));
  }
  return appendTogether(async () => {
    for (const [accountId, amountCents] of totalsByAccount(funded)) {
      if (accountId === sourceAccountId) continue;
      await addTransfer(actor, {
        date,
        amountCents,
        fromAccountId: sourceAccountId,
        toAccountId: accountId,
        envelope: UNASSIGNED_ENVELOPE,
        description: "Distribute money",
      });
    }
    for (const line of funded) {
      await addAllocation(actor, {
        date,
        accountId: line.accountId,
        from: UNASSIGNED_ENVELOPE,
        to: { kind: "category", id: line.categoryId },
        amountCents: line.amountCents,
      });
    }
  });
}
