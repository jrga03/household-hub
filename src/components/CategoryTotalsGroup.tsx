import { formatPHP } from "@/lib/currency";
import { CategoryTotalCard } from "@/components/CategoryTotalCard";
import type { CategoryTotalGroup } from "@/lib/supabaseQueries";

interface Props {
  group: CategoryTotalGroup;
  previousMonthData?: CategoryTotalGroup;
}

export function CategoryTotalsGroup({ group, previousMonthData }: Props) {
  return (
    <div className="space-y-3">
      {/* Parent Category Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted rounded-lg">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: group.parentColor }} />
          <h3 className="font-semibold text-lg">{group.parentName}</h3>
        </div>
        <div className="font-mono font-bold text-lg">{formatPHP(group.totalExpenseCents)}</div>
      </div>

      {/* Child Categories */}
      <div className="grid gap-3 md:grid-cols-2">
        {group.children.map((child) => {
          const previousChild = previousMonthData?.children.find(
            (c) => c.categoryId === child.categoryId
          );

          return (
            <CategoryTotalCard
              key={child.categoryId}
              category={child}
              previousExpenseCents={previousChild?.expenseCents}
            />
          );
        })}
      </div>
    </div>
  );
}
