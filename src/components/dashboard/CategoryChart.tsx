import { formatPHP } from "@/lib/currency";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/card";
import { useNavigate } from "@tanstack/react-router";

interface Props {
  data: Array<{
    categoryId: string;
    categoryName: string;
    color: string;
    amountCents: number;
    percentOfTotal: number;
  }>;
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

  const handleCategoryClick = (categoryId: string) => {
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

  return (
    <Card className="p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-4">Spending by Category</h3>
      <div className="flex flex-col md:flex-row items-center gap-4">
        {/* Pie Chart */}
        <div className="w-full md:w-1/2">
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
                onClick={(entry) => handleCategoryClick(entry.categoryId)}
                cursor="pointer"
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
        <div className="w-full md:w-1/2 space-y-2">
          {data.slice(0, 5).map((category) => (
            <div
              key={category.categoryName}
              className="flex items-center justify-between cursor-pointer hover:bg-accent p-2 rounded transition-colors"
              onClick={() => handleCategoryClick(category.categoryId)}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color }} />
                <span className="text-sm">{category.categoryName}</span>
              </div>
              <span className="text-sm font-mono">{formatPHP(category.amountCents)}</span>
            </div>
          ))}
          {data.length > 5 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              +{data.length - 5} more {data.length - 5 === 1 ? "category" : "categories"}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
