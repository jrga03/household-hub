import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPHP, parsePHP, MAX_AMOUNT_CENTS } from "@/lib/currency";

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  value?: number; // Amount in cents
  onChange?: (value: number) => void; // Callback with cents
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  error?: string;
}

/**
 * Currency input component for PHP amounts
 *
 * - Displays formatted PHP amounts with ₱ symbol and thousand separators
 * - Accepts user input in various formats
 * - Validates and converts to cents
 * - Integrates with React Hook Form via Controller
 *
 * @example
 * ```tsx
 * <CurrencyInput
 *   value={150050} // ₱1,500.50 in cents
 *   onChange={(cents) => setValue('amount', cents)}
 *   error={errors.amount?.message}
 * />
 * ```
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, onBlur, error, disabled, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState("");
    const [isFocused, setIsFocused] = React.useState(false);

    // Format value for display when not focused
    React.useEffect(() => {
      if (!isFocused && value !== undefined) {
        setDisplayValue(formatPHP(value).replace("₱", ""));
      }
    }, [value, isFocused]);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      // Show raw number for editing
      if (value !== undefined) {
        const rawValue = (value / 100).toFixed(2);
        setDisplayValue(rawValue);
      }
      e.target.select(); // Select all on focus
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);

      try {
        const cents = parsePHP(displayValue);
        onChange?.(cents);
        // Format for display
        setDisplayValue(formatPHP(cents).replace("₱", ""));
      } catch {
        // Invalid input - reset to current value
        if (value !== undefined) {
          setDisplayValue(formatPHP(value).replace("₱", ""));
        }
      }

      onBlur?.(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;
      setDisplayValue(input);

      // Commit on every keystroke, not just blur, so Enter-submit validates
      // the typed amount instead of a stale value and previews (e.g. debt
      // balance) update live. parsePHP handles partial input like "1." and
      // ""; invalid intermediate states are silently ignored until blur.
      // The format-on-blur effect is gated on !isFocused, so committing here
      // never reformats (clobbers) the text while the user is typing.
      try {
        const cents = parsePHP(input);
        onChange?.(cents);
      } catch {
        // parsePHP also throws when the amount EXCEEDS MAX_AMOUNT_CENTS.
        // Swallowing that case would leave the last parseable prefix
        // committed (typing "99999999" keeps ₱9,999,999 in form state while
        // the input shows ₱99,999,999) and Enter would submit a silently
        // wrong amount. Commit the over-max cents value instead so the
        // schema-level .max() rule rejects submit with its "too large" error.
        const parsed = parseFloat(input.replace(/[₱,\s]/g, ""));
        if (!isNaN(parsed)) {
          const cents = Math.round(parsed * 100);
          if (cents > MAX_AMOUNT_CENTS) {
            onChange?.(cents);
          }
        }
        // Otherwise not parseable yet (e.g. "abc" or "-"); blur resets the display.
      }
    };

    return (
      <div className="relative">
        <span
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        >
          ₱
        </span>
        <Input
          {...props}
          ref={ref}
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          className={cn("pl-7", error && "border-destructive", className)}
          aria-label="Amount in Philippine Pesos"
          // Only override the aria wiring when this component renders its own
          // error paragraph; otherwise pass through whatever the host injected
          // (shadcn FormControl wires aria-invalid/aria-describedby to
          // FormMessage, and clobbering it breaks the screen-reader
          // association in forms like BudgetForm).
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={error ? `${props.id}-error` : props["aria-describedby"]}
        />
        {error && (
          <p id={`${props.id}-error`} className="mt-1.5 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
