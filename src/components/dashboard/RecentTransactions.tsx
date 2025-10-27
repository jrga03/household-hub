import { formatPHP } from "@/lib/currency";
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { TransactionWithRelations } from "@/types/transactions";

interface Props {
  transactions: TransactionWithRelations[];
}

export function RecentTransactions({ transactions }: Props) {
  if (!transactions || transactions.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>
        <div className="text-center py-8 text-muted-foreground">No transactions yet</div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Recent Transactions</h3>
        <Link to="/transactions">
          <Button variant="ghost" size="sm">
            View All
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {transactions.map((transaction) => (
          <div
            key={transaction.id}
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              {transaction.category && (
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: transaction.category.color }}
                />
              )}
              <div>
                <p className="font-medium">{transaction.description}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{format(new Date(transaction.date), "MMM d")}</span>
                  {transaction.account && (
                    <>
                      <span>•</span>
                      <span>{transaction.account.name}</span>
                    </>
                  )}
                  {transaction.category && (
                    <>
                      <span>•</span>
                      <span>{transaction.category.name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="text-right">
              <p
                className={`font-mono font-semibold ${
                  transaction.type === "income" ? "text-green-600" : "text-red-600"
                }`}
              >
                {transaction.type === "income" ? "+" : "-"}
                {formatPHP(transaction.amount_cents)}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{transaction.status}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
