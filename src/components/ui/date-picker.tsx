import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { parseLocalDate } from "@/lib/utils/dates";

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date | undefined) => void;
  disabled?: boolean;
  /** Kept for API compatibility; native date inputs do not render placeholders. */
  placeholder?: string;
}

/**
 * Date picker built directly on the native `<input type="date">`.
 *
 * Previously this was a Button → Popover → unstyled native input stack that
 * needed three taps on touch and never auto-closed (mobile UX review R20).
 * The native control opens the platform date UI in one tap and needs no
 * dismissal handling.
 *
 * Contract: consumers pass `Date | undefined` via RHF Controller; the input
 * emits local-midnight Dates (never UTC-midnight — `new Date("yyyy-MM-dd")`
 * parses as UTC and shifts the calendar day for UTC+ users).
 */
export function DatePicker({ value, onChange, disabled, placeholder }: DatePickerProps) {
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) {
      onChange(undefined);
      return;
    }

    // Parse "yyyy-MM-dd" as a LOCAL date. new Date("yyyy-MM-dd") would parse
    // as UTC midnight, which is the previous calendar day for UTC+ timezones.
    const date = parseLocalDate(e.target.value);

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
    <Input
      type="date"
      value={value ? format(value, "yyyy-MM-dd") : ""}
      onChange={handleDateChange}
      max={format(new Date(), "yyyy-MM-dd")}
      disabled={disabled}
      placeholder={placeholder}
      aria-label="Select transaction date"
    />
  );
}
