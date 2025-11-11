import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { parseAmountInput, formatAmountInput } from "@/lib/debts/validation";

interface CurrencyInputProps {
  value: number; // Value in cents
  onChange: (cents: number) => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

/**
 * Currency input component that displays PHP amounts
 *
 * Accepts input as formatted PHP (₱1,500.50) and stores as cents (150050)
 */
export function CurrencyInput({
  value,
  onChange,
  onBlur,
  placeholder = "₱0.00",
  disabled,
  ...ariaProps
}: CurrencyInputProps) {
  // Display value (formatted string)
  const [displayValue, setDisplayValue] = useState("");

  // Initialize display value from cents value
  useEffect(() => {
    if (value > 0) {
      setDisplayValue(formatAmountInput(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setDisplayValue(input);

    // Parse to cents
    const cents = parseAmountInput(input);

    if (cents !== null) {
      onChange(cents);
    }
  };

  const handleBlur = () => {
    // Format display value on blur
    if (value > 0) {
      setDisplayValue(formatAmountInput(value));
    } else {
      setDisplayValue("");
    }

    onBlur?.();
  };

  return (
    <Input
      type="text"
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      {...ariaProps}
    />
  );
}
