import { formatPHP } from "@/lib/currency";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { useNavigate } from "@tanstack/react-router";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

// Type alias (not interface) so it keeps the implicit index signature that
// recharts' ChartDataInput requires
type CategorySlice = {
  categoryId: string | null;
  categoryName: string;
  color: string;
  amountCents: number;
  percentOfTotal: number;
};

interface Props {
  data: CategorySlice[];
}

interface TooltipPayload {
  categoryName: string;
  amountCents: number;
  percentOfTotal: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
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
      <p className="font-semibold">{data.categoryName}</p>
      <p className="text-sm">{formatPHP(data.amountCents)}</p>
      <p className="text-xs text-muted-foreground">{data.percentOfTotal.toFixed(1)}% of total</p>
    </div>
  );
}

export function CategoryChart({ data }: Props) {
  const navigate = useNavigate();

  // On touch devices the first tap fires onClick, making the tooltip
  // unreachable — so slice navigation is hover-capable only; legend rows stay
  // the navigation path everywhere (review R18)
  const canHover = useMediaQuery("(hover: hover)");

  const handleCategoryClick = (categoryId: string | null) => {
    // Uncategorized spending has no real category id to filter by
    if (!categoryId) return;

    // Navigate to transactions page filtered by category
    navigate({
      to: "/transactions",
      search: { categoryId: categoryId },
    });
  };

  if (!data || data.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
        <div className="text-center py-12 text-muted-foreground">
          No spending data for this month
        </div>
      </Card>
    );
  }

  // Without slice navigation, the legend is the only click-through on touch —
  // render every category there; hover-capable keeps the compact top 5
  const legendItems = canHover ? data.slice(0, 5) : data;
  const hiddenCount = data.length - legendItems.length;

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
      {/* Container queries: this card renders in the dashboard rail and the
          analytics grid, so it adapts to its host width, not the viewport */}
      <div className="@container">
        <div className="flex flex-col @[600px]:flex-row items-center gap-4">
          {/* Pie Chart */}
          <div className="w-full @[600px]:w-1/2">
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="amountCents"
                  nameKey="categoryName"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => {
                    const dataEntry = data.find((d) => d.categoryName === entry.name);
                    return `${dataEntry?.percentOfTotal.toFixed(0) || 0}%`;
                  }}
                  onClick={canHover ? (entry) => handleCategoryClick(entry.categoryId) : undefined}
                  cursor={canHover ? "pointer" : "default"}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend with click handlers */}
          <div className="w-full @[600px]:w-1/2 space-y-2">
            {legendItems.map((category) => (
              <div
                key={category.categoryId ?? category.categoryName}
                className={cn(
                  "flex items-center justify-between p-2 rounded transition-colors",
                  category.categoryId && "cursor-pointer hover:bg-accent"
                )}
                onClick={() => handleCategoryClick(category.categoryId)}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm">{category.categoryName}</span>
                </div>
                <span className="text-sm font-mono">{formatPHP(category.amountCents)}</span>
              </div>
            ))}
            {hiddenCount > 0 && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                +{hiddenCount} more {hiddenCount === 1 ? "category" : "categories"}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
