import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
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
  const planSearch: MonthSearch = search.month === undefined ? {} : { month: search.month };
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
        {/* On phones the header has no room for it beside the title; it sits in the body */}
        <EditPlanLink search={planSearch} className="hidden medium:inline-flex" />
      </HeaderActions>

      <PageShell variant="list-detail">
        {/* A viewport breakpoint, not a container query: it must flip with the header's copy */}
        <div
          className={cn(
            "col-span-full flex items-center gap-2",
            month === currentMonth && "medium:hidden"
          )}
        >
          <BackToThisMonth month={month} currentMonth={currentMonth} onChange={setMonth} />
          <EditPlanLink search={planSearch} className="ml-auto medium:hidden" />
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
