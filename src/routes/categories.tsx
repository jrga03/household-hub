import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { CategoriesView } from "@/components/categories/CategoriesView";
import { useHousehold } from "@/hooks/useHousehold";
import { isLocalMonth, localMonth } from "@/lib/utils/dates";
import { useAuthStore } from "@/stores/authStore";

interface CategoriesSearch {
  /** "yyyy-MM"; this month when left out. */
  month?: string;
}

export const Route = createFileRoute("/categories")({
  validateSearch: (search: Record<string, unknown>): CategoriesSearch =>
    isLocalMonth(search.month) ? { month: search.month } : {},
  component: CategoriesPage,
});

function CategoriesPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const currentMonth = localMonth(new Date());
  const month = search.month ?? currentMonth;
  // This month is left out of the URL, so a bookmark keeps following the calendar.
  const setMonth = (next: string) =>
    void navigate({ search: next === currentMonth ? {} : { month: next }, replace: true });

  return (
    <div className="bg-background">
      <div className="border-b">
        {/* Aligned with the rail layout below, which drops its max width from 1100px. */}
        <div className="@container">
          <div className="mx-auto w-full max-w-7xl px-4 py-4 @[1100px]:max-w-none">
            <h1 className="text-xl font-bold">Categories</h1>
            <p className="text-sm text-muted-foreground">
              The money in each envelope, where it sits, and each month&apos;s budgets. Tap a
              category to see its month.
            </p>
          </div>
        </div>
      </div>

      {/* The categories fill the main column and the ledger the detail pane beside it. */}
      <PageShell variant="rail">
        {household && userId && (
          <CategoriesView
            actor={{ householdId: household.id, userId }}
            month={month}
            currentMonth={currentMonth}
            onMonthChange={setMonth}
          />
        )}
      </PageShell>
    </div>
  );
}
