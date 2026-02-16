import React, { useState, useMemo } from "react";
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
  // Track whether the user is actively editing
  const [isEditing, setIsEditing] = useState(false);
  const [rawInput, setRawInput] = useState("");

  // Derive display value: use raw input when editing, formatted value otherwise
  const displayValue = useMemo(() => {
    if (isEditing) {
      return rawInput;
    }
    return value > 0 ? formatAmountInput(value) : "";
  }, [isEditing, rawInput, value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setIsEditing(true);
    setRawInput(input);

    // Parse to cents
    const cents = parseAmountInput(input);

    if (cents !== null) {
      onChange(cents);
    }
  };

  const handleBlur = () => {
    // Stop editing mode so display value is derived from prop
    setIsEditing(false);
    setRawInput("");

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
