import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { BudgetView } from "@/components/budgets/BudgetView";
import { BackToThisMonth, MonthPicker } from "@/components/budgets/MonthPicker";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/hooks/useHousehold";
import { cn } from "@/lib/utils";
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
        {/* On phones the header has no room for it beside the title; it sits in the body */}
        <EditPlanLink search={search} className="hidden sm:inline-flex" />
      </HeaderActions>

      <PageShell variant="rail">
        {/* A viewport breakpoint, not a container query: it must flip with the header's copy */}
        <div
          className={cn(
            "flex items-center gap-2 @[1100px]:col-span-2",
            month === currentMonth && "sm:hidden"
          )}
        >
          <BackToThisMonth month={month} currentMonth={currentMonth} onChange={setMonth} />
          <EditPlanLink search={search} className="ml-auto sm:hidden" />
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

function EditPlanLink({ search, className }: { search: MonthSearch; className: string }) {
  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <Link to="/plan" search={search}>
        <Pencil />
        Edit plan
      </Link>
    </Button>
  );
}
