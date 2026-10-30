import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/app/Button";
import { monthLabel, parseLocalDate, shiftMonth } from "@/lib/utils/dates";

/** The header's month stepper; `month`, `min` and `max` are "yyyy-MM". */
export function MonthPicker({
  month,
  min,
  max,
  onChange,
}: {
  month: string;
  min?: string;
  max?: string;
  onChange: (month: string) => void;
}) {
  return (
    <div role="group" aria-label="Month" className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Previous month"
        disabled={min !== undefined && month <= min}
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <p className="w-[4.75rem] text-center text-body font-medium" aria-live="polite">
        <span aria-hidden>{format(parseLocalDate(`${month}-01`), "MMM yyyy")}</span>
        <span className="sr-only">{monthLabel(month)}</span>
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Next month"
        disabled={max !== undefined && month >= max}
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

/** Shown under the header while another month is picked. */
export function BackToThisMonth({
  month,
  currentMonth,
  onChange,
}: {
  month: string;
  currentMonth: string;
  onChange: (month: string) => void;
}) {
  if (month === currentMonth) return null;
  return (
    <Button variant="link" className="h-auto p-0" onClick={() => onChange(currentMonth)}>
      Back to this month
    </Button>
  );
}
