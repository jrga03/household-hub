import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { formatPHP } from "@/lib/currency";

interface YearOverYear {
  currentYear: { income: number; expenses: number };
  previousYear: { income: number; expenses: number };
  change: { income: number; expenses: number };
  percentChange: { income: number; expenses: number };
}

interface Props {
  data: YearOverYear;
}

export function YearOverYearChart({ data }: Props) {
  const chartData = [
    {
      period: "Previous Year",
      income: data.previousYear.income / 100,
      expenses: data.previousYear.expenses / 100,
    },
    {
      period: "Current Year",
      income: data.currentYear.income / 100,
      expenses: data.currentYear.expenses / 100,
    },
  ];

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis />
          <Tooltip
            formatter={(value: number) => formatPHP(value * 100)}
            contentStyle={{ borderRadius: "8px" }}
          />
          <Legend />
          <Bar dataKey="income" fill="#10b981" name="Income" />
          <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
        </BarChart>
      </ResponsiveContainer>

      {/* Percentage Change Summary */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <p className="text-muted-foreground">Income Change</p>
          <p
            className={`text-lg font-semibold ${data.percentChange.income >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {data.percentChange.income >= 0 ? "+" : ""}
            {data.percentChange.income.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {formatPHP(Math.abs(data.change.income))}{" "}
            {data.change.income >= 0 ? "increase" : "decrease"}
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground">Expense Change</p>
          <p
            className={`text-lg font-semibold ${data.percentChange.expenses <= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {data.percentChange.expenses >= 0 ? "+" : ""}
            {data.percentChange.expenses.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground">
            {formatPHP(Math.abs(data.change.expenses))}{" "}
            {data.change.expenses >= 0 ? "increase" : "decrease"}
          </p>
        </div>
      </div>
    </div>
  );
}
