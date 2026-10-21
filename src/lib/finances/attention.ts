/**
 * Home's Needs attention feed: what is short, then what is close, then what
 * waits for review, most urgent first. Derived from the Finances overview and
 * the review counts, so it changes nothing and needs no events.
 */

import { isCreditCard } from "@/lib/accounts/events";
import type { AccountType } from "@/lib/accounts/events";
import { budgetStatus } from "@/lib/budgets/progress";
import { diffCents, type Cents } from "@/lib/currency";
import { REVIEW_KINDS, type ReviewCounts, type ReviewKind } from "@/lib/review/count";

export interface BudgetLine {
  categoryId: string;
  name: string;
  budget: Cents;
  spent: Cents;
}

export interface AttentionInput {
  budgets: BudgetLine[];
  balances: { account: { id: string; name: string; type: AccountType }; balance: Cents }[];
  review: ReviewCounts;
}

export type AttentionItem =
  | { kind: "over"; categoryId: string; name: string; budget: Cents; spent: Cents; over: Cents }
  | { kind: "short"; accountId: string; name: string; balance: Cents }
  | { kind: "close"; categoryId: string; name: string; budget: Cents; left: Cents }
  | { kind: "review"; review: ReviewKind; count: number };

export function attentionFeed({ budgets, balances, review }: AttentionInput): AttentionItem[] {
  const over = budgets
    .filter((line) => budgetStatus(line.budget, line.spent) === "over")
    .map((line) => ({ ...line, kind: "over" as const, over: diffCents(line.spent, line.budget) }))
    .sort((a, b) => b.over - a.over);

  const short = balances
    .filter(({ account, balance }) => !isCreditCard(account) && balance < 0)
    .sort((a, b) => a.balance - b.balance)
    .map(({ account, balance }) => ({
      kind: "short" as const,
      accountId: account.id,
      name: account.name,
      balance,
    }));

  const close = budgets
    .filter((line) => budgetStatus(line.budget, line.spent) === "close")
    .map(({ categoryId, name, budget, spent }) => ({
      kind: "close" as const,
      categoryId,
      name,
      budget,
      left: diffCents(budget, spent),
    }))
    // Compared by share spent without dividing cents: the least left for its size first.
    .sort((a, b) => a.left * b.budget - b.left * a.budget);

  const toReview = REVIEW_KINDS.filter((kind) => review[kind] > 0).map((kind) => ({
    kind: "review" as const,
    review: kind,
    count: review[kind],
  }));

  return [...over, ...short, ...close, ...toReview];
}
