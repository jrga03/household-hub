# Instructions: Currency System

Follow these steps in order. Estimated time: 60 minutes.

---

## Step 1: Create Currency Type Definitions (5 min)

Create `src/types/currency.ts`:

```typescript
/**
 * Brand type for amount in cents
 * Prevents accidental mixing of cents and peso amounts
 */
export type AmountCents = number & { readonly __brand: "AmountCents" };

/**
 * Maximum supported amount in cents (PHP 9,999,999.99)
 */
export const MAX_AMOUNT_CENTS = 999999999;

/**
 * Currency code (PHP only for MVP)
 */
export type CurrencyCode = "PHP";

/**
 * Transaction type for amount interpretation
 */
export type TransactionType = "income" | "expense";

/**
 * Create branded AmountCents from regular number
 */
export function amountCents(value: number): AmountCents {
  if (!Number.isInteger(value)) {
    throw new Error(`Amount must be integer cents, got: ${value}`);
  }
  if (value < 0 || value > MAX_AMOUNT_CENTS) {
    throw new Error(`Amount out of range: ${value}`);
  }
  return value as AmountCents;
}
```

**Verify**: No TypeScript errors

---

## Step 2: Create Comprehensive Unit Tests (20 min)

Create `src/lib/currency.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { formatPHP, parsePHP, validateAmount } from "./currency";

describe("formatPHP", () => {
  it("should format zero correctly", () => {
    expect(formatPHP(0)).toBe("₱0.00");
  });

  it("should format positive amounts with thousand separators", () => {
    expect(formatPHP(150050)).toBe("₱1,500.50");
    expect(formatPHP(100000000)).toBe("₱1,000,000.00");
  });

  it("should format cents correctly", () => {
    expect(formatPHP(1)).toBe("₱0.01");
    expect(formatPHP(50)).toBe("₱0.50");
    expect(formatPHP(100)).toBe("₱1.00");
  });

  it("should handle negative amounts", () => {
    expect(formatPHP(-150050)).toBe("-₱1,500.50");
    expect(formatPHP(-100)).toBe("-₱1.00");
  });

  it("should handle maximum amount", () => {
    expect(formatPHP(999999999)).toBe("₱9,999,999.99");
  });

  it("should handle amounts without centavos", () => {
    expect(formatPHP(500000)).toBe("₱5,000.00");
  });
});

describe("parsePHP", () => {
  it("should parse clean decimal strings", () => {
    expect(parsePHP("1500.50")).toBe(150050);
    expect(parsePHP("0.50")).toBe(50);
    expect(parsePHP("100")).toBe(10000);
  });

  it("should parse strings with currency symbol", () => {
    expect(parsePHP("₱1,500.50")).toBe(150050);
    expect(parsePHP("₱ 1500.50")).toBe(150050);
  });

  it("should parse strings with thousand separators", () => {
    expect(parsePHP("1,500.50")).toBe(150050);
    expect(parsePHP("10,000,000.00")).toBe(1000000000);
  });

  it("should parse numeric inputs", () => {
    expect(parsePHP(1500.5)).toBe(150050);
    expect(parsePHP(0)).toBe(0);
    expect(parsePHP(100)).toBe(10000);
  });

  it("should handle empty/invalid inputs", () => {
    expect(parsePHP("")).toBe(0);
    expect(parsePHP("invalid")).toBe(0);
    expect(parsePHP("abc123")).toBe(0);
  });

  it("should round to nearest cent", () => {
    expect(parsePHP("1500.555")).toBe(150056); // Rounds up
    expect(parsePHP("1500.554")).toBe(150055); // Rounds down
  });

  it("should throw on overflow", () => {
    expect(() => parsePHP("100000000")).toThrow(/out of range/);
  });

  it("should throw on negative amounts", () => {
    expect(() => parsePHP("-1500")).toThrow(/out of range/);
  });
});

describe("validateAmount", () => {
  it("should accept valid amounts", () => {
    expect(validateAmount(0)).toBe(true);
    expect(validateAmount(150050)).toBe(true);
    expect(validateAmount(999999999)).toBe(true);
  });

  it("should reject negative amounts", () => {
    expect(validateAmount(-1)).toBe(false);
    expect(validateAmount(-100)).toBe(false);
  });

  it("should reject amounts exceeding maximum", () => {
    expect(validateAmount(1000000000)).toBe(false);
    expect(validateAmount(9999999999)).toBe(false);
  });

  it("should reject non-integer amounts", () => {
    expect(validateAmount(1500.5)).toBe(false);
    expect(validateAmount(100.01)).toBe(false);
  });

  it("should handle edge values", () => {
    expect(validateAmount(1)).toBe(true);
    expect(validateAmount(999999999)).toBe(true);
    expect(validateAmount(1000000000)).toBe(false); // Just over max
  });
});

describe("Currency edge cases", () => {
  it("should handle round-trip conversion", () => {
    const original = 150050;
    const formatted = formatPHP(original);
    const parsed = parsePHP(formatted);
    expect(parsed).toBe(original);
  });

  it("should handle whitespace variations", () => {
    expect(parsePHP("  1500.50  ")).toBe(150050);
    expect(parsePHP("₱ 1,500.50")).toBe(150050);
  });

  it("should handle missing decimal places", () => {
    expect(parsePHP("1500")).toBe(150000);
    expect(parsePHP("1500.5")).toBe(150050);
  });
});
```

**Run tests**:

```bash
npm test src/lib/currency.test.ts
```

All tests should pass.

---

## Step 3: Create CurrencyInput Component (20 min)

Install required shadcn/ui components:

```bash
npx shadcn-ui@latest add input
```

Create `src/components/ui/currency-input.tsx`:

````typescript
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
      } catch (err) {
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
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
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
          <p
            id={`${props.id}-error`}
            className="mt-1.5 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
````

**Verify**: No TypeScript errors

---

## Step 4: Create React Hook Form Integration Example (10 min)

Create `src/components/ui/currency-input.test.tsx` (manual testing helper):

```typescript
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CurrencyInput } from "./currency-input";
import { Button } from "./button";

const schema = z.object({
  amount: z.number().min(1, "Amount must be greater than 0").max(999999999, "Amount too large"),
});

type FormData = z.infer<typeof schema>;

export function CurrencyInputExample() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: 0,
    },
  });

  const onSubmit = (data: FormData) => {
    console.log("Amount in cents:", data.amount);
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="amount" className="text-sm font-medium">
          Amount
        </label>
        <Controller
          name="amount"
          control={form.control}
          render={({ field, fieldState }) => (
            <CurrencyInput
              id="amount"
              {...field}
              error={fieldState.error?.message}
            />
          )}
        />
      </div>

      <Button type="submit">Submit</Button>

      <div className="text-sm text-muted-foreground">
        Current value: {form.watch("amount")} cents
      </div>
    </form>
  );
}
```

---

## Step 5: Add Currency Utilities to Common Exports (5 min)

Update `src/lib/index.ts` (create if doesn't exist):

```typescript
// Currency utilities
export { formatPHP, parsePHP, validateAmount } from "./currency";

// Currency types
export type { AmountCents, CurrencyCode, TransactionType } from "@/types/currency";
export { amountCents, MAX_AMOUNT_CENTS } from "@/types/currency";
```

---

## Step 6: Document Currency Patterns (5 min)

Create `src/lib/currency.md`:

````markdown
# Currency Patterns

## Storage

All amounts stored as **integer cents** (BIGINT in database):

- 1 PHP = 100 cents
- Maximum: 999,999,999 cents (₱9,999,999.99)
- Always positive with explicit `type` field ('income' | 'expense')

## Display

Use `formatPHP(cents)` for all user-facing amounts:

```typescript
formatPHP(150050) → "₱1,500.50"
formatPHP(0)      → "₱0.00"
formatPHP(100)    → "₱1.00"
```
````

## Input

Use `parsePHP(input)` to convert user input to cents:

```typescript
parsePHP("1,500.50")  → 150050
parsePHP("₱1,500.50") → 150050
parsePHP("1500.50")   → 150050
parsePHP(1500.50)     → 150050
```

## Validation

Use `validateAmount(cents)` before storage:

```typescript
validateAmount(150050)      → true
validateAmount(-100)        → false
validateAmount(1000000000)  → false
validateAmount(150.5)       → false (must be integer)
```

## React Hook Form Integration

```typescript
import { Controller } from "react-hook-form";
import { CurrencyInput } from "@/components/ui/currency-input";

// In your form component:
<Controller
  name="amount_cents"
  control={control}
  render={({ field, fieldState }) => (
    <CurrencyInput
      {...field}
      error={fieldState.error?.message}
    />
  )}
/>
```

## Database Queries

```sql
-- Always store as cents
INSERT INTO transactions (amount_cents, type)
VALUES (150050, 'expense');

-- Format in SQL if needed
SELECT
  description,
  CONCAT('₱', TO_CHAR(amount_cents / 100.0, 'FM999,999,999.00')) as formatted
FROM transactions;
```

## Common Mistakes to Avoid

❌ Don't mix pesos and cents:

```typescript
const wrong = transaction.amount_cents * 100; // Already in cents!
```

✅ Always clarify units:

```typescript
const cents = parsePHP(userInput);
const display = formatPHP(cents);
```

❌ Don't use floating point for storage:

```typescript
const wrong = 1500.5; // Precision errors!
```

✅ Always use integers:

```typescript
const correct = 150050; // Exact precision
```

❌ Don't allow negative amounts:

```typescript
const wrong = -150050; // Use type field instead!
```

✅ Use positive amounts with type:

```typescript
{
  amount_cents: 150050,
  type: 'expense' // or 'income'
}
```

````

---

## Step 7: Run All Tests (5 min)

```bash
# Run currency tests
npm test src/lib/currency.test.ts

# Run full test suite
npm test

# Check TypeScript
npm run type-check
````

All tests should pass with no errors.

---

## Step 8: Manual Testing (5 min)

Create a temporary test page `src/routes/test-currency.tsx`:

```typescript
import { createFileRoute } from "@tanstack/react-router";
import { CurrencyInputExample } from "@/components/ui/currency-input.test";

export const Route = createFileRoute("/test-currency")({
  component: TestCurrency,
});

function TestCurrency() {
  return (
    <div className="container mx-auto max-w-md py-12">
      <h1 className="text-2xl font-bold mb-8">Currency Input Test</h1>
      <CurrencyInputExample />
    </div>
  );
}
```

**Visit**: http://localhost:3000/test-currency

**Test Cases**:

1. Type "1500.50" → Should format as "₱1,500.50" on blur
2. Type "₱1,000" → Should parse correctly
3. Type "invalid" → Should reset to previous value
4. Try negative "-100" → Should show error
5. Try overflow "100000000" → Should show error
6. Tab through input → Should format properly

**Delete test route** after verification.

---

## Done!

When all tests pass and the CurrencyInput component works properly, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Type Safety**:

- AmountCents branded type prevents mixing cents and pesos
- Use `amountCents()` helper to create branded values

**Performance**:

- Currency operations are pure functions (easy to memoize)
- No dependencies on external state
- Fast integer arithmetic

**Accessibility**:

- ARIA labels for screen readers
- Error descriptions linked properly
- Keyboard navigation supported

**Edge Cases Handled**:

- Overflow protection (max ₱9,999,999.99)
- Negative amounts rejected
- Invalid input gracefully handled
- Whitespace trimmed
- Round-trip conversion guaranteed
