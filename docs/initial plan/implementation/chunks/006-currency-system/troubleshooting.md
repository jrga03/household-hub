# Troubleshooting: Currency System

Common issues and solutions when working with currency utilities and components.

---

## Unit Testing Issues

### Problem: Tests fail with "Cannot find module '@/lib/currency'"

**Symptoms**:

```
Error: Cannot find module '@/lib/currency'
```

**Cause**: Path alias not configured in Vitest

**Solution**:
Update `vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

---

### Problem: Tests pass locally but fail in CI

**Symptoms**:

- Local: All tests pass
- CI: Random test failures

**Cause**: Timezone differences between local and CI environment

**Solution**:
Currency tests shouldn't depend on timezone, but verify:

```typescript
// In currency.test.ts
describe("formatPHP", () => {
  // Use deterministic test cases
  it("should format zero", () => {
    expect(formatPHP(0)).toBe("₱0.00");
  });
  // Don't use Date.now() or timezone-dependent logic
});
```

---

## TypeScript Errors

### Problem: "Type 'number' is not assignable to type 'AmountCents'"

**Symptoms**:

```typescript
const amount: AmountCents = 150050; // Error
```

**Cause**: Branded type requires explicit conversion

**Solution**:
Use the `amountCents()` helper:

```typescript
import { amountCents } from "@/types/currency";

const amount = amountCents(150050); // ✓ Correct
```

---

### Problem: "Cannot find name 'AmountCents'"

**Symptoms**:

```
Cannot find name 'AmountCents'
```

**Cause**: Missing type import

**Solution**:

```typescript
import type { AmountCents } from "@/types/currency";
// or
import { type AmountCents } from "@/types/currency";
```

---

## CurrencyInput Component Issues

### Problem: Input doesn't show formatted value

**Symptoms**:

- Type "1500.50"
- Tab out
- Still shows "1500.50" instead of "₱1,500.50"

**Cause**: Missing blur handler or formatting logic

**Solution**:
Verify `handleBlur` in `currency-input.tsx`:

```typescript
const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  setIsFocused(false);

  try {
    const cents = parsePHP(displayValue);
    onChange?.(cents);
    // This line formats the display
    setDisplayValue(formatPHP(cents).replace("₱", ""));
  } catch (err) {
    // Reset on error
    if (value !== undefined) {
      setDisplayValue(formatPHP(value).replace("₱", ""));
    }
  }

  onBlur?.(e);
};
```

---

### Problem: ₱ symbol appears twice

**Symptoms**:
Display shows "₱₱1,500.50"

**Cause**: Symbol included in both prefix span and formatted value

**Solution**:
Remove symbol from formatted value:

```typescript
// Incorrect:
setDisplayValue(formatPHP(cents)); // Includes ₱

// Correct:
setDisplayValue(formatPHP(cents).replace("₱", "")); // Remove ₱
```

---

### Problem: Cursor jumps to end while typing

**Symptoms**:

- Start typing in middle of number
- Cursor jumps to end after each keystroke

**Cause**: Re-rendering resets cursor position

**Solution**:
Only format on blur, not on every keystroke:

```typescript
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const input = e.target.value;
  // Don't format here - just update the raw value
  setDisplayValue(input);
};

// Only format on blur
const handleBlur = (e) => {
  // ... format here
};
```

---

### Problem: Input clears on focus

**Symptoms**:

- Click input showing "₱1,500.50"
- Input suddenly becomes empty

**Cause**: Focus handler sets empty string

**Solution**:
Show raw numeric value on focus:

```typescript
const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  setIsFocused(true);
  // Show raw number for editing
  if (value !== undefined) {
    const rawValue = (value / 100).toFixed(2);
    setDisplayValue(rawValue);
  }
  e.target.select(); // Optional: select all text
};
```

---

## React Hook Form Integration Issues

### Problem: Form submits formatted string instead of cents

**Symptoms**:

```javascript
// Expected: { amount: 150050 }
// Got: { amount: "₱1,500.50" }
```

**Cause**: Not calling `onChange` with parsed cents

**Solution**:
Ensure CurrencyInput calls `onChange(cents)`:

```typescript
const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  try {
    const cents = parsePHP(displayValue);
    onChange?.(cents); // ← Must pass number, not string
    setDisplayValue(formatPHP(cents).replace("₱", ""));
  } catch (err) {
    // ...
  }
};
```

---

### Problem: Validation error doesn't display

**Symptoms**:

- Form validation fails
- No error message shown under input

**Cause**: Error prop not passed or not displayed

**Solution**:
Ensure error handling in CurrencyInput:

```typescript
export const CurrencyInput = ({ error, ...props }) => {
  return (
    <div className="relative">
      <Input
        {...props}
        aria-invalid={!!error}
        aria-describedby={error ? `${props.id}-error` : undefined}
        className={cn("pl-7", error && "border-destructive")}
      />
      {error && (
        <p id={`${props.id}-error`} className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
};
```

And pass error from Controller:

```typescript
<Controller
  name="amount"
  control={control}
  render={({ field, fieldState }) => (
    <CurrencyInput
      {...field}
      error={fieldState.error?.message} // ← Pass error
    />
  )}
/>
```

---

## Formatting Issues

### Problem: Negative amounts not rejected

**Symptoms**:

- Type "-100"
- Value stores as negative

**Cause**: Missing validation in parsePHP

**Solution**:
Ensure parsePHP throws on negative:

```typescript
export function parsePHP(input: string | number): number {
  // ... parsing logic

  const cents = Math.round(parsed * 100);

  // Add this check:
  if (cents < 0 || cents > MAX_AMOUNT_CENTS) {
    throw new Error(`Amount out of range: ${cents} cents`);
  }

  return cents;
}
```

---

### Problem: Large numbers show as "NaN" or "Infinity"

**Symptoms**:

- Type "999999999999"
- Shows as "NaN" or "Infinity"

**Cause**: Number exceeds MAX_AMOUNT_CENTS

**Solution**:
Catch overflow in CurrencyInput:

```typescript
const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  setIsFocused(false);

  try {
    const cents = parsePHP(displayValue);
    onChange?.(cents);
    setDisplayValue(formatPHP(cents).replace("₱", ""));
  } catch (err) {
    // Show error or reset to previous value
    console.error("Invalid amount:", err);
    if (value !== undefined) {
      setDisplayValue(formatPHP(value).replace("₱", ""));
    } else {
      setDisplayValue("");
    }
  }

  onBlur?.(e);
};
```

---

### Problem: Decimal places lost when editing

**Symptoms**:

- Input shows "1500.50"
- Edit to "1500.55"
- On blur, becomes "1500.50" again

**Cause**: Value not updating on blur

**Solution**:
Ensure `onChange` is called before formatting:

```typescript
const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  setIsFocused(false);

  try {
    const cents = parsePHP(displayValue);
    onChange?.(cents); // ← Call this FIRST
    setDisplayValue(formatPHP(cents).replace("₱", "")); // Then format
  } catch (err) {
    // ...
  }
};
```

---

## Performance Issues

### Problem: Input feels sluggish or laggy

**Symptoms**:

- Typing has noticeable delay
- Input freezes briefly

**Cause**: Too many re-renders or expensive operations

**Solution**:
Optimize with React.memo and useCallback:

```typescript
export const CurrencyInput = React.memo(
  React.forwardRef<HTMLInputElement, CurrencyInputProps>(({ value, onChange, ...props }, ref) => {
    const handleChange = React.useCallback((e) => {
      setDisplayValue(e.target.value);
    }, []);

    const handleBlur = React.useCallback(
      (e) => {
        // ... blur logic
      },
      [value, onChange]
    );

    // ... rest of component
  })
);
```

---

### Problem: Form re-renders too often

**Symptoms**:

- Console logs show excessive renders
- App feels slow when typing

**Cause**: Parent component re-rendering frequently

**Solution**:
Use Controller's render optimization:

```typescript
<Controller
  name="amount"
  control={control}
  render={({ field, fieldState }) => {
    // This will only re-render when field or fieldState changes
    return (
      <CurrencyInput
        {...field}
        error={fieldState.error?.message}
      />
    );
  }}
/>
```

---

## Accessibility Issues

### Problem: Screen reader reads "Peso symbol 1,500.50"

**Symptoms**:
Screen reader announces symbol twice

**Cause**: Symbol in both visual prefix and formatted value

**Solution**:
Use `aria-label` and hide visual symbol from screen readers:

```typescript
<span
  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
  aria-hidden="true" // ← Hide from screen readers
>
  ₱
</span>
<Input
  {...props}
  aria-label="Amount in Philippine Pesos" // ← Describe in label
  // ...
/>
```

---

### Problem: Error message not announced

**Symptoms**:

- Validation error appears
- Screen reader doesn't announce it

**Cause**: Error not linked with `aria-describedby`

**Solution**:
Link error to input:

```typescript
<Input
  aria-invalid={!!error}
  aria-describedby={error ? `${props.id}-error` : undefined}
  // ...
/>
{error && (
  <p id={`${props.id}-error`} className="mt-1.5 text-sm text-destructive">
    {error}
  </p>
)}
```

---

## Testing Issues

### Problem: Can't test CurrencyInput in isolation

**Symptoms**:

- Component renders
- Can't trigger events
- State doesn't update

**Cause**: Missing React Testing Library setup

**Solution**:
Use proper testing utilities:

```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CurrencyInput } from "./currency-input";

it("should format on blur", async () => {
  const onChange = vi.fn();
  render(<CurrencyInput value={0} onChange={onChange} />);

  const input = screen.getByRole("textbox");
  await userEvent.type(input, "1500.50");
  await userEvent.tab(); // Trigger blur

  expect(onChange).toHaveBeenCalledWith(150050);
});
```

---

## Prevention Tips

1. **Always validate input**: Use parsePHP and validateAmount before storage
2. **Test edge cases**: Zero, negative, overflow, invalid characters
3. **Handle errors gracefully**: Don't crash on invalid input
4. **Format consistently**: Always use formatPHP for display
5. **Type safety**: Use AmountCents branded type to prevent mistakes
6. **Document patterns**: Keep currency.md updated with examples

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide first
2. Review `src/lib/currency.md` for patterns
3. Run tests: `npm test src/lib/currency.test.ts`
4. Check TypeScript: `npm run type-check`
5. Inspect component in React DevTools
6. Add console.log to trace values through the flow

---

## Quick Fixes

```bash
# Reset and reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Clear TypeScript cache
rm -rf .tsbuildinfo

# Run tests in watch mode
npm test -- --watch

# Check specific file types
npx tsc --noEmit src/lib/currency.ts
```

---

**Remember**: Currency handling is critical. When in doubt, add more validation and tests rather than less.
