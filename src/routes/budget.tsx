import { createFileRoute } from "@tanstack/react-router";
import {
  BudgetBodyTopPrototype,
  BudgetHeaderPrototype,
  HEADER_VARIANTS,
  type HeaderVariant,
} from "@/components/budgets/BudgetHeader.prototype";
import { BudgetView } from "@/components/budgets/BudgetView";
import { PageShell } from "@/components/layout/PageShell";
import { PrototypeSwitcher } from "@/components/prototype/PrototypeSwitcher";
import { useHousehold } from "@/hooks/useHousehold";
import { cn } from "@/lib/utils";
import { isLocalMonth, localMonth } from "@/lib/utils/dates";
import { useAuthStore } from "@/stores/authStore";

export interface MonthSearch {
  /** "yyyy-MM"; this month when left out. */
  month?: string;
  /** PROTOTYPE (#177) */
  variant?: HeaderVariant;
}

const isVariant = (value: unknown): value is HeaderVariant =>
  HEADER_VARIANTS.some((variant) => variant.key === value);

export const Route = createFileRoute("/budget")({
  staticData: { title: "Budget" },
  validateSearch: (search: Record<string, unknown>): MonthSearch => ({
    ...(isLocalMonth(search.month) ? { month: search.month } : {}),
    ...(isVariant(search.variant) ? { variant: search.variant } : {}),
  }),
  component: BudgetPage,
});

function BudgetPage() {
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const currentMonth = localMonth(new Date());
  const month = search.month ?? currentMonth;
  const variant = search.variant ?? "A";
  // This month is left out of the URL, so a bookmark keeps following the calendar.
  const setMonth = (next: string) =>
    void navigate({
      search: (prev) => ({ ...prev, month: next === currentMonth ? undefined : next }),
      replace: true,
    });
  const setVariant = (next: HeaderVariant) =>
    void navigate({ search: (prev) => ({ ...prev, variant: next }), replace: true });
  const props = { variant, month, currentMonth, setMonth, search: { month: search.month } };

  return (
    <>
      <BudgetHeaderPrototype {...props} />

      <PageShell variant="rail">
        <div
          className={cn(
            "space-y-4 @[1100px]:col-span-2 empty:hidden",
            variant !== "C" && month === currentMonth && "sm:hidden"
          )}
        >
          <BudgetBodyTopPrototype {...props} />
        </div>
        {household && userId && (
          <BudgetView
            actor={{ householdId: household.id, userId }}
            month={month}
            currentMonth={currentMonth}
          />
        )}
      </PageShell>
      <PrototypeSwitcher variants={HEADER_VARIANTS} current={variant} onChange={setVariant} />
    </>
  );
}
