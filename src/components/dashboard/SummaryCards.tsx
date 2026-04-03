import { formatPHP } from "@/lib/currency";
import { TrendingUp, TrendingDown, Wallet, ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Props {
  summary: {
    totalIncomeCents: number;
    totalExpenseCents: number;
    netAmountCents: number;
    accountCount: number;
    totalBalanceCents: number;
    previousMonthIncomeCents: number;
    previousMonthExpenseCents: number;
    transactionCount: number;
  };
}

export function SummaryCards({ summary }: Props) {
  const incomeChange =
    summary.previousMonthIncomeCents > 0
      ? ((summary.totalIncomeCents - summary.previousMonthIncomeCents) /
          summary.previousMonthIncomeCents) *
        100
      : 0;

  const expenseChange =
    summary.previousMonthExpenseCents > 0
      ? ((summary.totalExpenseCents - summary.previousMonthExpenseCents) /
          summary.previousMonthExpenseCents) *
        100
      : 0;

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {/* Total Income */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-start gap-2">
          <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-lg shrink-0">
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground">Total Income</p>
            <h3 className="text-lg sm:text-2xl font-bold font-mono truncate">
              {formatPHP(summary.totalIncomeCents)}
            </h3>
          </div>
        </div>
        {Math.abs(incomeChange) > 0.01 && (
          <div
            className={`text-xs mt-2 flex items-center gap-1 ${
              incomeChange > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {incomeChange > 0 ? "+" : ""}
            {incomeChange.toFixed(1)}% from last month
          </div>
        )}
      </Card>

      {/* Total Expenses */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-start gap-2">
          <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-lg shrink-0">
            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground">Total Expenses</p>
            <h3 className="text-lg sm:text-2xl font-bold font-mono truncate">
              {formatPHP(summary.totalExpenseCents)}
            </h3>
          </div>
        </div>
        {Math.abs(expenseChange) > 0.01 && (
          <div
            className={`text-xs mt-2 flex items-center gap-1 ${
              expenseChange > 0 ? "text-red-600" : "text-green-600"
            }`}
          >
            {expenseChange > 0 ? "+" : ""}
            {expenseChange.toFixed(1)}% from last month
          </div>
        )}
      </Card>

      {/* Net Amount */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-start gap-2">
          <div
            className={`p-2 rounded-lg shrink-0 ${
              summary.netAmountCents >= 0
                ? "bg-blue-100 dark:bg-blue-900/20"
                : "bg-orange-100 dark:bg-orange-900/20"
            }`}
          >
            <ArrowUpDown
              className={`h-4 w-4 ${
                summary.netAmountCents >= 0
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-orange-600 dark:text-orange-400"
              }`}
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground">Net Amount</p>
            <h3
              className={`text-lg sm:text-2xl font-bold font-mono truncate ${
                summary.netAmountCents >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatPHP(summary.netAmountCents)}
            </h3>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {summary.transactionCount}{" "}
          {summary.transactionCount === 1 ? "transaction" : "transactions"} this month
        </p>
      </Card>

      {/* Total Balance */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-start gap-2">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-lg shrink-0">
            <Wallet className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground">Total Balance</p>
            <h3 className="text-lg sm:text-2xl font-bold font-mono truncate">
              {formatPHP(summary.totalBalanceCents)}
            </h3>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Across {summary.accountCount} {summary.accountCount === 1 ? "account" : "accounts"}
        </p>
      </Card>
    </div>
  );
}
