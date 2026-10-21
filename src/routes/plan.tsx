import { createFileRoute } from "@tanstack/react-router";
import { BackToThisMonth, MonthPicker } from "@/components/budgets/MonthPicker";
import { PlanView } from "@/components/budgets/PlanView";
import { HeaderActions } from "@/components/layout/HeaderActions";
import { PageShell } from "@/components/layout/PageShell";
import { useHousehold } from "@/hooks/useHousehold";
import type { DistributeMode } from "@/lib/budgets/distribute";
import { isLocalDate } from "@/lib/transactions/events";
import { isLocalMonth, localMonth } from "@/lib/utils/dates";
import { useAuthStore } from "@/stores/authStore";

interface PlanSearch {
  /** "yyyy-MM"; this month when left out. */
  month?: string;
  /** Opens Distribute money: after recording income, or for the opening balances. */
  distribute?: DistributeMode;
  /** Distribute's source account; the first one that holds envelopes when left out. */
  account?: string;
  /** The income to split, as typed ("40000.00"); the source's Unassigned when left out. */
  amount?: string;
  /** Distribute's date, "yyyy-MM-dd"; today when left out. */
  date?: string;
}

const isDistributeMode = (value: unknown): value is DistributeMode =>
  value === "income" || value === "opening";

export const Route = createFileRoute("/plan")({
  staticData: { title: "Plan", parent: "/budget" },
  validateSearch: (search: Record<string, unknown>): PlanSearch => ({
    ...(isLocalMonth(search.month) && { month: search.month }),
    ...(isDistributeMode(search.distribute) && { distribute: search.distribute }),
    ...(typeof search.account === "string" && { account: search.account }),
    ...(typeof search.amount === "string" && { amount: search.amount }),
    ...(isLocalDate(search.date) && { date: search.date }),
  }),
  component: PlanPage,
});

function PlanPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const currentMonth = localMonth(new Date());
  const month = search.month ?? currentMonth;
  const monthOnly = (next: string) => (next === currentMonth ? {} : { month: next });
  const setMonth = (next: string) =>
    void navigate({ search: { ...search, ...monthOnly(next) }, replace: true });
  const setDistribute = (mode: DistributeMode | null) =>
    void navigate({
      search: mode ? { ...monthOnly(month), distribute: mode } : monthOnly(month),
      replace: true,
    });

  return (
    <>
      <HeaderActions>
        <MonthPicker month={month} onChange={setMonth} />
      </HeaderActions>

      <PageShell>
        <div className="space-y-4">
          <BackToThisMonth month={month} currentMonth={currentMonth} onChange={setMonth} />
          {household && userId && (
            <PlanView
              actor={{ householdId: household.id, userId }}
              month={month}
              currentMonth={currentMonth}
              distribute={
                search.distribute
                  ? {
                      mode: search.distribute,
                      accountId: search.account,
                      amount: search.amount,
                      date: search.date,
                    }
                  : null
              }
              onDistribute={setDistribute}
            />
          )}
        </div>
      </PageShell>
    </>
  );
}
