/**
 * Category Breakdown Chart Component
 *
 * Interactive donut/pie chart showing spending distribution by category.
 * Features:
 * - Donut chart with center label showing total
 * - Interactive tooltips with percentages
 * - Category color mapping
 * - Click-through to filter by category
 * - Hover highlighting
 *
 * @example
 * <CategoryBreakdownChart
 *   data={categorySpending}
 *   onCategoryClick={(categoryId) => filterByCategory(categoryId)}
 * />
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatPHP } from "@/lib/currency";

export interface CategoryData {
  id: string;
  name: string;
  value: number; // Amount in cents
  color?: string;
}

interface CategoryBreakdownChartProps {
  data: CategoryData[];
  onCategoryClick?: (categoryId: string) => void;
  height?: number;
  innerRadius?: number; // For donut chart (0 = pie chart, 60-80 = donut)
}

// Tooltip types
interface TooltipPayloadEntry {
  name: string;
  value: number;
  payload: { color: string };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  total: number;
}

// Custom tooltip component
function CustomTooltip({ active, payload, total }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const entry = payload[0];
  const percentage = ((entry.value / total) * 100).toFixed(1);

  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-3 w-3 rounded" style={{ backgroundColor: entry.payload.color }} />
        <span className="font-semibold">{entry.name}</span>
      </div>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <span>Amount:</span>
          <span className="font-mono font-semibold">{formatPHP(entry.value)}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Percentage:</span>
          <span className="font-mono font-semibold">{percentage}%</span>
        </div>
      </div>
    </div>
  );
}

// Center label types
interface CenterLabelProps {
  innerRadius: number;
  total: number;
}

// Center label component for donut chart
function CenterLabel({ innerRadius, total }: CenterLabelProps) {
  if (innerRadius === 0) return null;

  return (
    <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground">
      <tspan x="50%" dy="-0.5em" fontSize="14" className="fill-muted-foreground">
        Total
      </tspan>
      <tspan x="50%" dy="1.5em" fontSize="20" fontWeight="bold">
        {formatPHP(total)}
      </tspan>
    </text>
  );
}

export function CategoryBreakdownChart({
  data,
  onCategoryClick,
  height = 400,
  innerRadius = 70,
}: CategoryBreakdownChartProps) {
  // Calculate total for percentages
  const total = data.reduce((sum, item) => sum + item.value, 0);

  // Handle slice click
  const handleClick = (entry: CategoryData) => {
    if (onCategoryClick) {
      onCategoryClick(entry.id);
    }
  };

  // Custom label for slices
  interface LabelEntry {
    value: number;
  }
  const renderLabel = (entry: LabelEntry) => {
    const percentage = ((entry.value / total) * 100).toFixed(0);
    return `${percentage}%`;
  };

  // Empty state
  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border bg-muted/30"
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">No category data available</p>
      </div>
    );
  }

  // Default colors if not provided
  const dataWithColors = data.map((item, index) => ({
    ...item,
    color: item.color || `hsl(${index * (360 / data.length)}, 70%, 50%)`,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={dataWithColors}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={renderLabel}
          outerRadius={120}
          innerRadius={innerRadius}
          fill="#8884d8"
          dataKey="value"
          nameKey="name"
          onClick={handleClick}
          cursor="pointer"
          animationDuration={1000}
        >
          {dataWithColors.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.color}
              stroke="transparent"
              className="hover:opacity-80 transition-opacity"
            />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip total={total} />} />
        <Legend
          verticalAlign="bottom"
          height={36}
          wrapperStyle={{ fontSize: 12 }}
          iconType="circle"
        />
        <CenterLabel innerRadius={innerRadius} total={total} />
      </PieChart>
    </ResponsiveContainer>
  );
}
