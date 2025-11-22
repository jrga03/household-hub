/**
 * Spending Trends Chart Component
 *
 * Interactive bar chart showing spending trends over time by category.
 * Features:
 * - Responsive sizing with ResponsiveContainer
 * - Interactive tooltips with custom formatting
 * - Category color mapping
 * - Click-through to filter transactions
 * - Stacked bars for multi-category comparison
 *
 * @example
 * <SpendingTrendsChart
 *   data={monthlySpendingData}
 *   onBarClick={(month, category) => filterTransactions(month, category)}
 * />
 */

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

export interface SpendingDataPoint {
  month: string; // "Jan 2024", "Feb 2024", etc.
  [category: string]: string | number; // Dynamic category keys with amounts in cents
}

interface SpendingTrendsChartProps {
  data: SpendingDataPoint[];
  categories?: string[]; // Category names to display
  categoryColors?: Record<string, string>; // Category ID -> color mapping
  onBarClick?: (month: string, category: string) => void;
  height?: number;
}

export function SpendingTrendsChart({
  data,
  categories = [],
  categoryColors = {},
  onBarClick,
  height = 400,
}: SpendingTrendsChartProps) {
  // Custom tooltip with PHP formatting
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="rounded-lg border bg-background p-3 shadow-lg">
        <p className="mb-2 font-semibold">{label}</p>
        <div className="space-y-1">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div className="h-3 w-3 rounded" style={{ backgroundColor: entry.color }} />
              <span className="flex-1">{entry.name}:</span>
              <span className="font-mono font-semibold">{formatPHP(entry.value)}</span>
            </div>
          ))}
        </div>
        {payload.length > 1 && (
          <div className="mt-2 border-t pt-2">
            <div className="flex justify-between text-sm font-semibold">
              <span>Total:</span>
              <span className="font-mono">
                {formatPHP(payload.reduce((sum: number, entry: any) => sum + entry.value, 0))}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Handle bar click
  const handleBarClick = (data: any, category: string) => {
    if (onBarClick && data?.month) {
      onBarClick(data.month, category);
    }
  };

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border bg-muted/30"
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">No spending data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <YAxis
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          tickFormatter={(value) => `₱${(value / 100).toLocaleString()}`}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0, 0, 0, 0.1)" }} />
        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
        {categories.map((category, index) => (
          <Bar
            key={category}
            dataKey={category}
            fill={categoryColors[category] || `hsl(${index * 60}, 70%, 50%)`}
            radius={[4, 4, 0, 0]}
            cursor="pointer"
            onClick={(data) => handleBarClick(data, category)}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
