import { format, addMonths, subMonths, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  selectedMonth: Date;
  onChange: (month: Date) => void;
}

export function MonthSelector({ selectedMonth, onChange }: Props) {
  const currentMonth = startOfMonth(new Date());
  const isCurrentMonth = format(selectedMonth, "yyyy-MM") === format(currentMonth, "yyyy-MM");

  const handlePrevious = () => {
    onChange(subMonths(selectedMonth, 1));
  };

  const handleNext = () => {
    onChange(addMonths(selectedMonth, 1));
  };

  const handleCurrent = () => {
    onChange(currentMonth);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={handlePrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold min-w-[120px] text-center">
          {format(selectedMonth, "MMMM yyyy")}
        </span>
        {!isCurrentMonth && (
          <Button variant="ghost" size="sm" onClick={handleCurrent}>
            Current
          </Button>
        )}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={handleNext}
        disabled={format(addMonths(selectedMonth, 1), "yyyy-MM") > format(currentMonth, "yyyy-MM")}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
