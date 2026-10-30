import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { Button } from "@/components/app/Button";
import { EmptyState } from "@/components/app/EmptyState";
import { Fact, Facts } from "@/components/app/Facts";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import { useAccountNames } from "@/hooks/useAccounts";
import { useBudgets } from "@/hooks/useBudgets";
import { useCategoryTransactions } from "@/hooks/useTransactions";
import { budgetInForce } from "@/lib/budgets/inForce";
import { diffCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { VIEW_VISIBILITY, type FinanceView } from "@/lib/finances/view";
import { monthsEnding } from "@/lib/reports/period";
import type { SpendingGrid } from "@/lib/reports/spending";
import { transactionLabel } from "@/lib/transactions/events";
import { formatMonth, parseLocalDate } from "@/lib/utils/dates";
import { MonthBars, type MonthBar } from "./MonthBars";

const BAR_MONTHS = 12;

/** One category in Reports' pane: its Spending over the period and its months. */
export function CategoryDetail({
  categoryId,
  categoryName,
  grid,
  from,
  end,
  periodMonths,
  periodLabel,
  spent,
  thinHistory,
  view,
}: {
  categoryId: string;
  categoryName: string;
  grid: SpendingGrid;
  /** The period's first and last months, "yyyy-MM". */
  from: string;
  end: string;
  periodMonths: string[];
  periodLabel: string;
  spent: Cents;
  /** Fewer than two months with spending, so the bars wait. */
  thinHistory: boolean;
  view: FinanceView;
}) {
  const budgets = useBudgets();
  const accounts = useAccountNames();
  const visibility = VIEW_VISIBILITY[view];
  const transactions = useCategoryTransactions(categoryId, from, end, visibility);
  const budget = budgets && budgetInForce(budgets, categoryId, end);
  const endSpent = grid.get(end)?.get(categoryId)?.spent ?? ZERO_CENTS;
  const bars = monthsEnding(end, BAR_MONTHS).map((month): MonthBar => ({
    month,
    cents: grid.get(month)?.get(categoryId)?.spent ?? ZERO_CENTS,
    tone: month === end ? "primary" : periodMonths.includes(month) ? "chart" : "chart-muted",
    link: { to: "/transactions", search: { month, category: categoryId, visibility } },
  }));

  return (
    <div className="space-y-6">
      <Facts>
        <Fact term={`Spending, ${periodLabel}`}>
          <Money kind="balance" cents={spent} />
        </Fact>
        {budget !== undefined && (
          <Fact term={`Budget, ${formatMonth(end, "MMM yyyy")}`}>
            {budget === null ? (
              "No budget"
            ) : (
              <>
                <Money kind="balance" cents={budget.amountCents} />
                {endSpent > budget.amountCents && (
                  <>
                    {" · "}
                    <span className="text-shortfall">
                      <Money kind="balance" cents={diffCents(endSpent, budget.amountCents)} /> over
                    </span>
                  </>
                )}
              </>
            )}
          </Fact>
        )}
      </Facts>
      {thinHistory ? (
        <p className="text-body text-muted-foreground">
          Months show once a second month has spending.
        </p>
      ) : (
        <MonthBars bars={bars} label={`${categoryName} by month`} />
      )}
      <Button asChild variant="outline" size="sm">
        <Link to="/transactions" search={{ from, to: end, category: categoryId, visibility }}>
          Open in Transactions
        </Link>
      </Button>
      {transactions &&
        (transactions.length === 0 ? (
          <EmptyState className="py-0">
            Nothing in {categoryName} in {periodLabel}.
          </EmptyState>
        ) : (
          <ul aria-label={`${categoryName} in ${periodLabel}`} className="-mx-4 divide-y border-y">
            {transactions.map((transaction) => (
              <li key={transaction.id}>
                <ListRow
                  link={{ to: "/transactions", search: { open: transaction.id } }}
                  label={transactionLabel(transaction)}
                  detail={[
                    format(parseLocalDate(transaction.date), "MMM d"),
                    accounts?.get(transaction.accountId),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  amount={<Money kind={transaction.type} cents={transaction.amountCents} />}
                />
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
