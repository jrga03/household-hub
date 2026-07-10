import { formatPHP, formatPHPAxisTick } from "@/lib/currency";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";

interface Props {
  data: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
  }>;
}

interface TooltipPayload {
  month: string;
  incomeCents: number;
  expenseCents: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: TooltipPayload;
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload;

  return (
    <div className="bg-card border rounded-lg p-3 shadow-lg">
      <p className="font-semibold mb-2">{data.month}</p>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-income" />
          <span className="text-sm">Income: {formatPHP(payload[0].value)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-expense" />
          <span className="text-sm">Expenses: {formatPHP(payload[1].value)}</span>
        </div>
      </div>
    </div>
  );
}

export function MonthlyChart({ data }: Props) {
  // Chart data stays in CENTS end to end; formatPHPAxisTick takes cents, so
  // there is no pesos/cents split between charts (mobile UX review, 100x trap)
  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-4">Monthly Trend</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ left: -10, right: 5, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatPHPAxisTick} tick={{ fontSize: 12 }} width={55} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          {/* Recharts stroke takes a CSS color, not a class. Use the raw
              vars (--income/--expense), NOT var(--color-income): the theme
              alias is substituted once at :root, so it would not re-resolve
              under a nested .dark; the raw vars flip with .dark (R40). */}
          <Line
            type="monotone"
            dataKey="incomeCents"
            stroke="var(--income)"
            strokeWidth={2}
            name="Income"
          />
          <Line
            type="monotone"
            dataKey="expenseCents"
            stroke="var(--expense)"
            strokeWidth={2}
            name="Expenses"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
