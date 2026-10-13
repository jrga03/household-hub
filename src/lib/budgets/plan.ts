import { parsePHPSafe, ZERO_CENTS, type Cents } from "@/lib/currency";
import type { Budget } from "./inForce";

export type PlanChange =
  | { kind: "unchanged" }
  /** A zero amount with no account clears the budget. */
  | { kind: "set"; amountCents: Cents; accountId: string | null }
  | { kind: "problem"; message: string };

/**
 * What typing `text` into a category's Plan amount does to the budget in force
 * that month. A new or changed budget keeps its funding account while that
 * can still fund it, else takes the first account that can.
 */
export function planChange(
  text: string,
  inForce: Budget | null,
  fundingChoices: { id: string }[]
): PlanChange {
  const trimmed = text.trim();
  const parsed = parsePHPSafe(trimmed === "" ? "0" : trimmed);
  if (!parsed.success) return { kind: "problem", message: parsed.error.message };
  const amountCents = parsed.value;

  if (amountCents === 0) {
    return inForce
      ? { kind: "set", amountCents: ZERO_CENTS, accountId: null }
      : { kind: "unchanged" };
  }
  if (inForce?.amountCents === amountCents) return { kind: "unchanged" };

  const keeps = fundingChoices.some((account) => account.id === inForce?.accountId);
  const accountId = keeps ? inForce?.accountId : fundingChoices[0]?.id;
  if (!accountId) return { kind: "problem", message: "No account can fund it yet." };
  return { kind: "set", amountCents, accountId };
}
