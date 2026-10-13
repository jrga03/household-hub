import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { BudgetView } from "@/components/budgets/BudgetView";
import { BackToThisMonth, MonthPicker } from "@/components/budgets/MonthPicker";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/hooks/useHousehold";
import { isLocalMonth, localMonth } from "@/lib/utils/dates";
import { useAuthStore } from "@/stores/authStore";

export interface MonthSearch {
  /** "yyyy-MM"; this month when left out. */
  month?: string;
}

export const Route = createFileRoute("/budget")({
  staticData: { title: "Budget" },
  validateSearch: (search: Record<string, unknown>): MonthSearch =>
    isLocalMonth(search.month) ? { month: search.month } : {},
  component: BudgetPage,
});

function BudgetPage() {
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
        <MonthPicker month={month} onChange={setMonth} />
        <Button asChild variant="outline" size="sm" aria-label="Edit plan">
          <Link to="/plan" search={search}>
            <Pencil />
            <span className="hidden sm:inline">Edit plan</span>
          </Link>
        </Button>
      </HeaderActions>

      <PageShell variant="rail">
        <div className="space-y-4 @[1100px]:col-span-2 empty:hidden">
          <BackToThisMonth month={month} currentMonth={currentMonth} onChange={setMonth} />
        </div>
        {household && userId && (
          <BudgetView
            actor={{ householdId: household.id, userId }}
            month={month}
            currentMonth={currentMonth}
          />
        )}
      </PageShell>
    </>
  );
}
