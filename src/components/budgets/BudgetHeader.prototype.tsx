// PROTOTYPE (#177): four phone layouts for the Budget header. Never merge to main.
import { format } from "date-fns";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { HeaderActions } from "@/components/layout/HeaderActions";
// eslint-disable-next-line arch/no-direct-primitive-import -- throwaway prototype, never merged
import { Button } from "@/components/ui/button";
import { monthLabel, parseLocalDate, shiftMonth } from "@/lib/utils/dates";
import { BackToThisMonth, MonthPicker } from "./MonthPicker";
import type { MonthSearch } from "@/routes/budget";

export const HEADER_VARIANTS = [
  { key: "A", name: "Edit plan in body" },
  { key: "B", name: "Month in body" },
  { key: "C", name: "Compact month" },
  { key: "D", name: "Two-row header" },
] as const;
export type HeaderVariant = (typeof HEADER_VARIANTS)[number]["key"];

interface Props {
  variant: HeaderVariant;
  month: string;
  currentMonth: string;
  setMonth: (month: string) => void;
  search: MonthSearch;
}

function EditPlanIcon({ search, className }: { search: MonthSearch; className?: string }) {
  return (
    <Button asChild variant="outline" size="sm" aria-label="Edit plan" className={className}>
      <Link to="/plan" search={search}>
        <Pencil />
        <span className="hidden sm:inline">Edit plan</span>
      </Link>
    </Button>
  );
}

function EditPlanLabelled({ search }: { search: MonthSearch }) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link to="/plan" search={search}>
        <Pencil />
        Edit plan
      </Link>
    </Button>
  );
}

/** Header content; wide screens keep today's header in every variant. */
export function BudgetHeaderPrototype({ variant, month, setMonth, search }: Props) {
  return (
    <HeaderActions>
      {variant === "A" && (
        <>
          <MonthPicker month={month} onChange={setMonth} />
          <EditPlanIcon search={search} className="hidden sm:inline-flex" />
        </>
      )}
      {variant === "B" && (
        <>
          <div className="hidden sm:block">
            <MonthPicker month={month} onChange={setMonth} />
          </div>
          <EditPlanIcon search={search} />
        </>
      )}
      {variant === "C" && (
        <>
          <div className="sm:hidden">
            <CompactMonthPicker month={month} onChange={setMonth} />
          </div>
          <div className="hidden sm:block">
            <MonthPicker month={month} onChange={setMonth} />
          </div>
          <EditPlanIcon search={search} />
        </>
      )}
      {variant === "D" && (
        <div className="hidden items-center gap-2 sm:flex">
          <MonthPicker month={month} onChange={setMonth} />
          <EditPlanIcon search={search} />
        </div>
      )}
    </HeaderActions>
  );
}

/** What sits at the top of the page body, phone only except "Back to this month". */
export function BudgetBodyTopPrototype({ variant, month, currentMonth, setMonth, search }: Props) {
  const back = <BackToThisMonth month={month} currentMonth={currentMonth} onChange={setMonth} />;

  if (variant === "A") {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2">
        <div>{back}</div>
        <div className="sm:hidden">
          <EditPlanLabelled search={search} />
        </div>
      </div>
    );
  }
  if (variant === "B") {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="sm:hidden">
          <MonthPicker month={month} onChange={setMonth} />
        </div>
        {back}
      </div>
    );
  }
  if (variant === "D") {
    return (
      <>
        <div
          className="sticky z-10 -mx-4 -mt-8 flex items-center justify-between gap-2 border-b bg-background px-4 py-1 sm:hidden"
          style={{ top: "calc(3.5rem + var(--safe-area-top))" }}
        >
          <MonthPicker month={month} onChange={setMonth} />
          <EditPlanLabelled search={search} />
        </div>
        {back}
      </>
    );
  }
  return back;
}

/** "Oct", with the year only when it is not this year ("Oct ’25"). */
function CompactMonthPicker({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const date = parseLocalDate(`${month}-01`);
  const isThisYear = date.getFullYear() === new Date().getFullYear();
  return (
    <div role="group" aria-label="Month" className="flex items-center">
      <Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeft />
      </Button>
      <p className="text-center text-body font-medium whitespace-nowrap" aria-live="polite">
        <span aria-hidden>{format(date, isThisYear ? "MMM" : "MMM ’yy")}</span>
        <span className="sr-only">{monthLabel(month)}</span>
      </p>
      <Button variant="ghost" size="icon" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))}>
        <ChevronRight />
      </Button>
    </div>
  );
}
