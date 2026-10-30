import { createFileRoute } from "@tanstack/react-router";
import { BackToThisMonth, MonthPicker } from "@/components/budgets/MonthPicker";
import { SetBudgetsView } from "@/components/budgets/SetBudgetsView";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { PageShell } from "@/components/layout/PageShell";
import { useHousehold } from "@/hooks/useHousehold";
import { isLocalMonth, localMonth } from "@/lib/utils/dates";
import { useAuthStore } from "@/stores/authStore";
import type { MonthSearch } from "./budget";

export const Route = createFileRoute("/set-budgets")({
  staticData: { title: "Set budgets", parent: "/budget" },
  validateSearch: (search: Record<string, unknown>): MonthSearch => ({
    ...(isLocalMonth(search.month) && { month: search.month }),
  }),
  component: SetBudgetsPage,
});

function SetBudgetsPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const currentMonth = localMonth(new Date());
  const month = search.month ?? currentMonth;
  const setMonth = (next: string) =>
    void navigate({ search: next === currentMonth ? {} : { month: next }, replace: true });

  return (
    <>
      <HeaderActions>
        {/* On phones the header has no room for it beside the title; it sits in the body */}
        <div className="hidden medium:block">
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </HeaderActions>

      <PageShell>
        <div className="space-y-4">
          {/* A viewport breakpoint, not a container query: it must flip with the header's copy */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="medium:hidden">
              <MonthPicker month={month} onChange={setMonth} />
            </div>
            <BackToThisMonth month={month} currentMonth={currentMonth} onChange={setMonth} />
          </div>
          {household && userId && (
            <SetBudgetsView
              actor={{ householdId: household.id, userId }}
              month={month}
              currentMonth={currentMonth}
            />
          )}
        </div>
      </PageShell>
    </>
  );
}
