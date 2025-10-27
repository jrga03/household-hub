import { formatPHP } from "@/lib/currency";
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
  income: number;
  expense: number;
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
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span className="text-sm">Income: {formatPHP(payload[0].value * 100)}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-sm">Expenses: {formatPHP(payload[1].value * 100)}</span>
        </div>
      </div>
    </div>
  );
}

export function MonthlyChart({ data }: Props) {
  // Convert cents to pesos for better Y-axis display
  const chartData = data.map((d) => ({
    ...d,
    income: d.incomeCents / 100,
    expense: d.expenseCents / 100,
  }));

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Monthly Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis tickFormatter={(value) => `₱${value.toLocaleString()}`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} name="Income" />
          <Line
            type="monotone"
            dataKey="expense"
            stroke="#ef4444"
            strokeWidth={2}
            name="Expenses"
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
