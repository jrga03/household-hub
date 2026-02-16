/**
 * Income vs Expenses Chart Component
 *
 * Interactive area chart comparing income and expenses over time.
 * Features:
 * - Dual area series (income in green, expenses in red)
 * - Net cash flow visualization
 * - Responsive sizing
 * - Interactive tooltips
 * - Gradient fills
 *
 * @example
 * <IncomeExpensesChart
 *   data={monthlyData}
 *   onPointClick={(month) => navigateToMonth(month)}
 * />
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { formatPHP } from "@/lib/currency";

export interface IncomeExpenseDataPoint {
  month: string; // "Jan 2024"
  income: number; // Amount in cents
  expenses: number; // Amount in cents
  net: number; // income - expenses (in cents)
}

interface IncomeExpensesChartProps {
  data: IncomeExpenseDataPoint[];
  onPointClick?: (month: string) => void;
  height?: number;
  showNetLine?: boolean;
}

// Tooltip types
interface IncomeExpenseTooltipPayload {
  dataKey: string;
  value: number;
}

interface IncomeExpenseTooltipProps {
  active?: boolean;
  payload?: IncomeExpenseTooltipPayload[];
  label?: string;
}

// Custom tooltip component
function CustomTooltip({ active, payload, label }: IncomeExpenseTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const income = payload.find((p) => p.dataKey === "income")?.value || 0;
  const expenses = payload.find((p) => p.dataKey === "expenses")?.value || 0;
  const net = income - expenses;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <p className="mb-2 font-semibold">{label}</p>
      <div className="space-y-1 text-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-500" />
            <span>Income:</span>
          </div>
          <span className="font-mono font-semibold text-green-600">{formatPHP(income)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-500" />
            <span>Expenses:</span>
          </div>
          <span className="font-mono font-semibold text-red-600">{formatPHP(expenses)}</span>
        </div>
        <div className="mt-2 border-t pt-2">
          <div className="flex items-center justify-between gap-4 font-semibold">
            <span>Net:</span>
            <span className={`font-mono ${net >= 0 ? "text-green-600" : "text-red-600"}`}>
              {net >= 0 ? "+" : ""}
              {formatPHP(Math.abs(net))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function IncomeExpensesChart({
  data,
  onPointClick,
  height = 400,
  showNetLine = true,
}: IncomeExpensesChartProps) {
  // Handle point click
  const handleClick = (nextState: Record<string, unknown>) => {
    if (onPointClick && (nextState as Record<string, unknown>)?.activeLabel) {
      onPointClick((nextState as Record<string, unknown>).activeLabel as string);
    }
  };

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border bg-muted/30"
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">No income/expense data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
        onClick={handleClick}
      >
        <defs>
          <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expensesGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <YAxis
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickFormatter={(value) => `₱${(value / 100).toLocaleString()}`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        {showNetLine && <ReferenceLine y={0} stroke="#888" strokeDasharray="3 3" />}
        <Area
          type="monotone"
          dataKey="income"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#incomeGradient)"
          name="Income"
          animationDuration={1000}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#expensesGradient)"
          name="Expenses"
          animationDuration={1000}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
