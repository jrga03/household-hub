import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatPHP, parsePHP } from "@/lib/currency";

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
          aria-invalid={!!error}
          aria-describedby={error ? `${props.id}-error` : undefined}
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
