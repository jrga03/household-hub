import { CategoryChart } from "./CategoryChart";

interface DashboardRailProps {
  categoryBreakdown: Array<{
    categoryId: string;
    categoryName: string;
    color: string;
    amountCents: number;
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
