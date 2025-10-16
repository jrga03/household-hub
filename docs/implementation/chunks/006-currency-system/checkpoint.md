# Checkpoint: Currency System

Run these verifications to ensure everything works correctly.

---

## Prerequisites Check ✓

Before running checkpoint, verify chunk 005 is complete:

```bash
# 1. Check currency utilities exist from chunk 005
test -f src/lib/currency.ts && echo "✓ currency.ts exists" || echo "✗ currency.ts missing - complete chunk 005 first"

# 2. Verify required functions are exported
grep -q "formatPHP" src/lib/currency.ts && echo "✓ formatPHP found" || echo "✗ formatPHP missing"
grep -q "parsePHP" src/lib/currency.ts && echo "✓ parsePHP found" || echo "✗ parsePHP missing"
grep -q "validateAmount" src/lib/currency.ts && echo "✓ validateAmount found" || echo "✗ validateAmount missing"

# 3. Verify Vitest is configured
npm test --version 2>/dev/null && echo "✓ Vitest configured" || echo "✗ Vitest not configured"
```

**All checks must pass** before proceeding with the checkpoint verifications below.

---

## 1. Unit Tests Pass ✓

```bash
npm test src/lib/currency.test.ts
```

**Expected**:

```
✓ formatPHP (6 tests)
✓ parsePHP (8 tests)
✓ validateAmount (5 tests)
✓ Currency edge cases (3 tests)

Test Files  1 passed (1)
     Tests  22 passed (22)
```

All tests should pass with no failures or warnings.

---

## 2. Type Checking Passes ✓

```bash
npm run type-check
```

**Expected**: No TypeScript errors in:

- `src/lib/currency.ts`
- `src/lib/currency.test.ts`
- `src/types/currency.ts`
- `src/components/ui/currency-input.tsx`

---

## 3. Currency Utilities Work ✓

Open browser console and test:

```javascript
import { formatPHP, parsePHP, validateAmount } from "@/lib/currency";

// Test 1: Format zero
console.log(formatPHP(0)); // "₱0.00"

// Test 2: Format with thousand separators
console.log(formatPHP(150050)); // "₱1,500.50"

// Test 3: Parse various formats
console.log(parsePHP("1,500.50")); // 150050
console.log(parsePHP("₱1,500.50")); // 150050
console.log(parsePHP(1500.5)); // 150050

// Test 4: Validate amounts
console.log(validateAmount(150050)); // true
console.log(validateAmount(-100)); // false
console.log(validateAmount(1000000000)); // false

// Test 5: Round-trip conversion
const original = 150050;
const formatted = formatPHP(original);
const parsed = parsePHP(formatted);
console.log(parsed === original); // true
```

All outputs should match expected values.

---

## 4. CurrencyInput Component Renders ✓

Create test route (or use existing test page):

```typescript
// src/routes/test-currency.tsx
import { CurrencyInput } from "@/components/ui/currency-input";

function TestPage() {
  const [amount, setAmount] = useState(0);

  return (
    <div className="p-8">
      <CurrencyInput
        value={amount}
        onChange={setAmount}
      />
      <p>Value in cents: {amount}</p>
    </div>
  );
}
```

**Visual checks**:

- [ ] ₱ symbol appears on left side
- [ ] Input accepts keyboard input
- [ ] Input shows formatted value on blur
- [ ] Input shows raw value on focus
- [ ] Text aligns properly
- [ ] Component uses correct font/spacing

---

## 5. Input Formatting Works ✓

**Test Case 1: Clean decimal**

1. Click input field
2. Type "1500.50"
3. Tab out (blur)
4. **Expected**: Displays "₱1,500.50"
5. Console shows: `Value in cents: 150050`

**Test Case 2: With currency symbol**

1. Click input field
2. Type "₱1,000.00"
3. Tab out
4. **Expected**: Displays "₱1,000.00"
5. Console shows: `Value in cents: 100000`

**Test Case 3: Without decimals**

1. Type "5000"
2. Tab out
3. **Expected**: Displays "₱5,000.00"
4. Console shows: `Value in cents: 500000`

**Test Case 4: With commas**

1. Type "2,500.75"
2. Tab out
3. **Expected**: Displays "₱2,500.75"
4. Console shows: `Value in cents: 250075`

---

## 6. Validation Works ✓

**Test Case 1: Negative amount**

1. Type "-100"
2. Tab out
3. **Expected**: Error thrown or input resets
4. No negative value stored

**Test Case 2: Overflow**

1. Type "100000000" (100 million pesos)
2. Tab out
3. **Expected**: Error thrown or input resets
4. Value doesn't exceed max

**Test Case 3: Invalid characters**

1. Type "abc123"
2. Tab out
3. **Expected**: Parses as 0 or resets to previous value
4. No crash or undefined behavior

**Test Case 4: Empty input**

1. Clear input
2. Tab out
3. **Expected**: Defaults to 0 or shows validation error
4. Graceful handling

---

## 7. React Hook Form Integration ✓

Create form test:

```typescript
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { CurrencyInput } from "@/components/ui/currency-input";

const schema = z.object({
  amount: z.number().min(1, "Required").max(999999999, "Too large"),
});

function TestForm() {
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { amount: 0 },
  });

  return (
    <form onSubmit={form.handleSubmit(console.log)}>
      <Controller
        name="amount"
        control={form.control}
        render={({ field, fieldState }) => (
          <CurrencyInput {...field} error={fieldState.error?.message} />
        )}
      />
      <button type="submit">Submit</button>
    </form>
  );
}
```

**Test**:

1. Leave input at 0
2. Click Submit
3. **Expected**: "Required" error shows
4. Type "1500.50"
5. Click Submit
6. **Expected**: No error, form submits
7. Console logs: `{ amount: 150050 }`

---

## 8. Accessibility Check ✓

**Keyboard Navigation**:

- [ ] Can tab to input field
- [ ] Can type without mouse
- [ ] Can tab out to trigger blur
- [ ] Focus visible ring appears

**Screen Reader** (optional):

- [ ] Input announces as "Amount in Philippine Pesos"
- [ ] Error messages linked and announced
- [ ] Currency symbol not read twice

**ARIA Attributes**:

```html
<input
  aria-label="Amount in Philippine Pesos"
  aria-invalid="false"
  aria-describedby="amount-error"
/>
```

---

## 9. Edge Case Handling ✓

**Test Case 1: Round-trip conversion**

```typescript
const original = 123456;
const formatted = formatPHP(original);
const parsed = parsePHP(formatted);

console.log(parsed === original); // true
```

**Test Case 2: Whitespace handling**

```typescript
parsePHP("  1500.50  "); // 150050
parsePHP("₱ 1,500.50"); // 150050
```

**Test Case 3: Missing decimals**

```typescript
parsePHP("1500"); // 150000
parsePHP("1500.5"); // 150050
```

**Test Case 4: Rounding**

```typescript
parsePHP("1500.555"); // 150056 (rounds up)
parsePHP("1500.554"); // 150055 (rounds down)
```

All edge cases should handle correctly.

---

## 10. Documentation Exists ✓

Verify these files exist and are complete:

- [ ] `src/lib/currency.ts` - Utility functions
- [ ] `src/lib/currency.test.ts` - Unit tests (22+ tests)
- [ ] `src/lib/currency.md` - Pattern documentation
- [ ] `src/types/currency.ts` - Type definitions
- [ ] `src/components/ui/currency-input.tsx` - Component
- [ ] All files have proper TypeScript types
- [ ] All functions have JSDoc comments

---

## 11. Integration Points Ready ✓

Verify you can:

**Import currency utilities**:

```typescript
import { formatPHP, parsePHP, validateAmount } from "@/lib/currency";
```

**Import currency types**:

```typescript
import type { AmountCents, CurrencyCode } from "@/types/currency";
import { amountCents, MAX_AMOUNT_CENTS } from "@/types/currency";
```

**Import CurrencyInput component**:

```typescript
import { CurrencyInput } from "@/components/ui/currency-input";
```

**Use in forms**:

```typescript
<Controller
  name="amount"
  control={control}
  render={({ field }) => <CurrencyInput {...field} />}
/>
```

---

## Success Criteria

- [ ] All 22+ unit tests pass
- [ ] Type checking passes with no errors
- [ ] CurrencyInput component renders correctly
- [ ] Formatting works as expected (₱1,500.50)
- [ ] Parsing handles all input formats
- [ ] Validation rejects invalid amounts
- [ ] React Hook Form integration works
- [ ] Keyboard navigation functional
- [ ] Error states display properly
- [ ] Edge cases handled gracefully
- [ ] Documentation complete

---

## Common Issues

### Issue: Tests fail with "Cannot find module"

**Solution**: Run `npm install` to ensure Vitest is installed

### Issue: TypeScript errors in branded type

**Solution**: Ensure `currency.ts` types match `currency.test.ts` imports

### Issue: Input doesn't format on blur

**Solution**: Check that `handleBlur` calls `formatPHP` and `setDisplayValue`

### Issue: Form doesn't submit cents value

**Solution**: Verify Controller field.onChange receives cents, not formatted string

---

## Next Steps

Once all checkpoints pass:

1. Delete test route (`src/routes/test-currency.tsx`)
2. Commit currency system code
3. Move to **Chunk 007: Categories Setup**

---

**Estimated Time**: 15-20 minutes to verify all checkpoints
