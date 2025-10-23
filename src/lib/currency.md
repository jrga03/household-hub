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
