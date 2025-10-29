import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPHP } from "@/lib/currency";
import { TrendingUp, Calendar, DollarSign } from "lucide-react";
import { format } from "date-fns";

interface Insights {
  avgMonthlySpending: number;
  largestTransactions: Array<{
    description: string;
    amount: number;
    date: string;
  }>;
  topCategories: Array<{
    name: string;
    amount: number;
  }>;
}

interface Props {
  insights: Insights;
}

export function InsightsSection({ insights }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Average Monthly Spending */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg. Monthly Spending</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatPHP(insights.avgMonthlySpending)}</div>
          <p className="text-xs text-muted-foreground mt-1">Per month on average</p>
        </CardContent>
      </Card>

      {/* Top Categories */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Top Spending Categories</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {insights.topCategories.slice(0, 3).map((cat) => (
              <div key={cat.name} className="flex justify-between text-sm">
                <span className="truncate">{cat.name}</span>
                <span className="font-medium">{formatPHP(cat.amount)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Largest Transaction */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Largest Transaction</CardTitle>
          <Calendar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {insights.largestTransactions[0] && (
            <div className="space-y-1">
              <div className="text-2xl font-bold">
                {formatPHP(insights.largestTransactions[0].amount)}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {insights.largestTransactions[0].description}
              </p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(insights.largestTransactions[0].date), "MMM d, yyyy")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
