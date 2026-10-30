import { createFileRoute, Link } from "@tanstack/react-router";
import { BudgetView } from "@/components/budgets/BudgetView";
import { BackToThisMonth, MonthPicker } from "@/components/budgets/MonthPicker";
import { readOpenItem, type OpenItemSearch } from "@/components/layout/DetailPane";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/app/Button";
import { useHousehold } from "@/hooks/useHousehold";
import { cn } from "@/lib/utils";
import { daysLeftInMonth, isLocalMonth, localMonth } from "@/lib/utils/dates";
import { useAuthStore } from "@/stores/authStore";

export interface MonthSearch {
  /** "yyyy-MM"; this month when left out. */
  month?: string;
}

export const Route = createFileRoute("/budget")({
  staticData: { title: "Budget" },
  validateSearch: (search: Record<string, unknown>): MonthSearch & OpenItemSearch => ({
    ...(isLocalMonth(search.month) && { month: search.month }),
    ...readOpenItem(search),
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = new Date();
  const currentMonth = localMonth(now);
  const month = search.month ?? currentMonth;
  const monthSearch: MonthSearch = search.month === undefined ? {} : { month: search.month };
  // This month is left out of the URL, so a bookmark keeps following the calendar.
  // The open category stays open on the new month.
  const setMonth = (next: string) =>
    void navigate({
      search: ({ open }) => ({
        ...(next !== currentMonth && { month: next }),
        ...(open !== undefined && { open }),
      }),
      replace: true,
    });

  return (
    <>
      <HeaderActions>
        <MonthPicker month={month} onChange={setMonth} />
        {/* Below expanded the header has no room for them beside the title; they sit in the body */}
        <BudgetLinks search={monthSearch} className="hidden expanded:flex" />
      </HeaderActions>

      <PageShell variant="list-detail">
        {/* A viewport breakpoint, not a container query: it must flip with the header's copy */}
        <div
          className={cn(
            "col-span-full flex flex-wrap items-center gap-2",
            month === currentMonth && "expanded:hidden"
          )}
        >
          <BackToThisMonth month={month} currentMonth={currentMonth} onChange={setMonth} />
          <BudgetLinks search={monthSearch} className="ml-auto flex expanded:hidden" />
        </div>
        {household && userId && (
          <BudgetView
            actor={{ householdId: household.id, userId }}
            month={month}
            currentMonth={currentMonth}
            daysLeft={month === currentMonth ? daysLeftInMonth(now) : undefined}
          />
        )}
      </PageShell>
    </>
  );
}

function BudgetLinks({ search, className }: { search: MonthSearch; className: string }) {
  return (
    <div className={cn("gap-2", className)}>
      <Button asChild variant="outline" size="sm">
        <Link to="/set-budgets" search={search}>
          Set budgets
        </Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/assign-money" search={search}>
          Assign money
        </Link>
      </Button>
    </div>
  );
}
