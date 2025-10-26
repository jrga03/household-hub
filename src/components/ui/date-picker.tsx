import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DatePicker({
  value,
  onChange,
  disabled,
  placeholder = "Pick a date",
}: DatePickerProps) {
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) {
      onChange(undefined);
      return;
    }

    const date = new Date(e.target.value);

    // Validate that date is valid
    if (isNaN(date.getTime())) {
      console.error("Invalid date input:", e.target.value);
      onChange(undefined);
      return;
    }

    // Prevent future dates (defense in depth)
    if (date > new Date()) {
      console.warn("Future date rejected:", e.target.value);
      onChange(new Date()); // Default to today
      return;
    }

    onChange(date);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground"
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <input
            type="date"
            value={value ? format(value, "yyyy-MM-dd") : ""}
            onChange={handleDateChange}
            max={format(new Date(), "yyyy-MM-dd")}
            className="w-full"
            aria-label="Select transaction date"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
