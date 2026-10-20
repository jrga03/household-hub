// PROTOTYPE (#194): money helpers shared by the Home variants.
import { ArrowLeftRight, Info } from "lucide-react";
import { format } from "date-fns";
import { diffCents, formatPHP, sumCents, type Cents } from "@/lib/currency";
import { parseLocalDate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";
import {
  ACCOUNTS,
  BUDGET_GROUPS,
  budgetStatus,
  type Account,
  type BudgetCategory,
  type Row,
} from "../fixtures";

/** formatPHP with a true minus sign (U+2212). */
export const formatSigned = (cents: Cents) => formatPHP(cents).replace(/^-/, "−");

export const CATEGORIES: BudgetCategory[] = BUDGET_GROUPS.flatMap((group) => group.categories);

export const OVER = CATEGORIES.filter((category) => budgetStatus(category) === "over");

export const CASH_ON_HAND = sumCents(
  ACCOUNTS.filter((account) => account.kind !== "credit card").map((account) => account.balance)
);

export const STATUS_COUNTS = {
  fine: CATEGORIES.filter((category) => budgetStatus(category) === "fine").length,
  close: CATEGORIES.filter((category) => budgetStatus(category) === "close").length,
  over: OVER.length,
};

/** Spent over budget, as a positive amount. */
export const overBy = (category: BudgetCategory): Cents =>
  diffCents(category.spent, category.budget ?? category.spent);

export const percentSpent = (category: BudgetCategory) =>
  category.budget ? Math.min(100, Math.round((category.spent / category.budget) * 100)) : 0;

/** A balance: a credit card shows what is owed, uncolored; a negative pocket is short. */
export function Balance({ account, className }: { account: Account; className?: string }) {
  const card = account.kind === "credit card";
  return (
    <span
      className={cn(
        "shrink-0 text-right tabular-nums",
        !card && account.balance < 0 && "text-shortfall",
        className
      )}
    >
      {card && <span className="text-muted-foreground">Owed </span>}
      {formatSigned(account.balance)}
    </span>
  );
}

/** A row's amount: income +green, expense −neutral, transfer muted and unsigned, pending muted. */
export function RowAmount({ row, className }: { row: Row; className?: string }) {
  const sign = row.kind === "income" ? "+" : row.kind === "expense" ? "−" : "";
  return (
    <span
      className={cn(
        "shrink-0 text-right tabular-nums",
        row.kind === "income" && "text-income",
        (row.kind === "transfer" || row.pending) && "text-muted-foreground",
        className
      )}
    >
      {sign}
      {formatPHP(row.amount)}
    </span>
  );
}

export function RowIcons({ row }: { row: Row }) {
  return (
    <>
      {row.kind === "transfer" && (
        <ArrowLeftRight
          className="size-4 shrink-0 text-muted-foreground"
          role="img"
          aria-label="Transfer"
        />
      )}
      {row.pending && (
        <Info className="size-4 shrink-0 text-muted-foreground" role="img" aria-label="Pending" />
      )}
    </>
  );
}

export const rowDetail = (row: Row) =>
  row.kind === "transfer"
    ? `${row.account} → ${row.toAccount ?? ""}`
    : [row.category ?? "No category", row.account].join(" · ");

export const shortDate = (date: string) => format(parseLocalDate(date), "MMM d");
