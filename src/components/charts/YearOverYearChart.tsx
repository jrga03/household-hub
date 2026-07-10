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
import { formatPHP, formatPHPAxisTick } from "@/lib/currency";

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
  // Chart data stays in CENTS end to end; formatPHPAxisTick takes cents, so
  // there is no pesos/cents split between charts (mobile UX review, 100x trap)
  const chartData = [
    {
      period: "Previous Year",
      income: data.previousYear.income,
      expenses: data.previousYear.expenses,
    },
    {
      period: "Current Year",
      income: data.currentYear.income,
      expenses: data.currentYear.expenses,
    },
  ];

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatPHPAxisTick} tick={{ fontSize: 12 }} width={55} />
          <Tooltip
            formatter={(value: number) => formatPHP(value)}
            contentStyle={{ borderRadius: "8px" }}
          />
          <Legend />
          {/* Recharts fill takes a CSS color, not a class. Use the raw
              vars (--income/--expense), NOT var(--color-income): the theme
              alias is substituted once at :root, so it would not re-resolve
              under a nested .dark; the raw vars flip with .dark (R40). */}
          <Bar dataKey="income" fill="var(--income)" name="Income" />
          <Bar dataKey="expenses" fill="var(--expense)" name="Expenses" />
        </BarChart>
      </ResponsiveContainer>

      {/* Percentage Change Summary */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-1">
          <p className="text-muted-foreground">Income Change</p>
          <p
            className={`text-lg font-semibold ${data.percentChange.income >= 0 ? "text-income" : "text-expense"}`}
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
            className={`text-lg font-semibold ${data.percentChange.expenses <= 0 ? "text-income" : "text-expense"}`}
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
