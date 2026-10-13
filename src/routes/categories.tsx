import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { HeaderActions } from "@/components/layout/HeaderActions";
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
  staticData: { title: "Categories" },
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
    <>
      <HeaderActions>
        <Button asChild variant="outline" size="sm">
          <Link to="/distribute">Distribute</Link>
        </Button>
      </HeaderActions>

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
    </>
  );
}
