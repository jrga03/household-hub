import type { Cents } from "@/lib/currency";
import { CategoryChart } from "./CategoryChart";

interface DashboardRailProps {
  categoryBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    color: string;
    amountCents: Cents;
    percentOfTotal: number;
  }>;
}

export function DashboardRail({ categoryBreakdown }: DashboardRailProps) {
  return (
    <div className="space-y-6">
      <CategoryChart data={categoryBreakdown} />
    </div>
  );
}
