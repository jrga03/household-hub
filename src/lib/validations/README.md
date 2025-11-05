# Validation Schemas (`/src/lib/validations/`)

## Purpose

Zod validation schemas for client-side form validation and type inference. These schemas define validation rules for financial data entry, enforcing data integrity before data reaches the database.

## Directory Contents

**1 validation file** (2.1 KB):

- **`transaction.ts`** (85 lines, 2.1K) - Transaction creation and edit validation schema

## Component Overview

### transaction.ts

**Purpose:** Zod schema for validating transaction form data with business rules enforcement.

**Schema structure:**

```typescript
transactionSchema = z.object({
  date: z.date() with future date check
  description: z.string() (3-200 chars)
  amount_cents: z.number() (1-999,999,999)
  type: z.enum(["income", "expense"])
  account_id: z.string().nullable().optional()
  category_id: z.string().nullable().optional()
  status: z.enum(["pending", "cleared"])
  visibility: z.enum(["household", "personal"])
  notes: z.string() (max 500 chars, optional)
})
```

**Key validation rules:**

1. **Date constraint** (src/lib/validations/transaction.ts:12-15):
   - Cannot be in the future
   - Uses `endOfDay(new Date())` for timezone-safe comparison
   - Ensures financial records are historical or current

2. **Description length** (src/lib/validations/transaction.ts:17):
   - Minimum: 3 characters (prevents accidental empty entries)
   - Maximum: 200 characters (database field limit)

3. **Amount constraints** (src/lib/validations/transaction.ts:18):
   - Must be positive integer (cents)
   - Maximum: 999,999,999 cents (₱9,999,999.99)
   - Enforces currency handling pattern (see DATABASE.md lines 1005-1160)

4. **Optional fields:**
   - `account_id`: Nullable for income transactions without account assignment
   - `category_id`: Nullable for uncategorized transactions
   - `notes`: Optional detailed notes (max 500 chars)

**Type inference:**

```typescript
export type TransactionFormData = z.infer<typeof transactionSchema>;
```

**Used by:**

- `src/components/transactions/TransactionForm.tsx` - React Hook Form integration
- `src/components/transactions/TransactionEditDialog.tsx` - Edit form validation

## Validation Patterns

### 1. React Hook Form Integration

**Standard pattern:**

```typescript
const form = useForm<TransactionFormData>({
  resolver: zodResolver(transactionSchema),
  defaultValues: {
    date: new Date(),
    description: "",
    amount_cents: 0,
    type: "expense",
    status: "cleared",
    visibility: "household",
  },
});
```

**Benefits:**

- Type-safe form state
- Automatic error messages
- Client-side validation before submission
- Prevents invalid data from reaching backend

### 2. Future Date Prevention

**Implementation detail:**

```typescript
date: z.date().refine((date) => date <= endOfDay(new Date()), {
  message: "Transaction date cannot be in the future",
});
```

**Why important:**

- Financial transactions are historical records
- Future dates would skew monthly reports
- Budget vs actual calculations would be incorrect
- User likely made input error if date is future

**Edge case:** Uses `endOfDay()` to allow transactions entered on current day up to 11:59:59 PM

### 3. Amount Validation

**Positive integers only:**

- `z.number().int().positive()`
- Enforces cents storage pattern (no decimals)
- Frontend displays as formatted PHP via `formatPHP()`

**Maximum value:**

- 999,999,999 cents = ₱9,999,999.99
- Prevents database overflow
- Reasonable limit for household finances

### 4. Nullable vs Optional Fields

**Pattern distinction:**

```typescript
account_id: z.string().nullable().optional(); // Can be null or undefined
category_id: z.string().nullable().optional(); // Can be null or undefined
notes: z.string().max(500).nullable().optional(); // Can be null, undefined, or string
```

**Why both?**

- `.nullable()`: Allows explicit null value (database NULL)
- `.optional()`: Allows field to be omitted from object
- Together: Maximum flexibility for partial updates

## Integration Points

### Form Components

**TransactionForm** - Main transaction creation form

- Location: `src/components/transactions/TransactionForm.tsx`
- Uses: `zodResolver(transactionSchema)` with React Hook Form
- Displays: Field-level error messages from Zod

**TransactionEditDialog** - Edit existing transaction

- Location: `src/components/transactions/TransactionEditDialog.tsx`
- Uses: Same schema with pre-populated values
- Validates: Before allowing save

### Utilities

**date-fns** - Date manipulation library

- `endOfDay()`: Used for future date check
- Ensures timezone-safe comparisons
- Prevents edge cases at midnight

**CurrencyInput** - Custom input component

- Location: `src/components/ui/currency-input.tsx`
- Accepts: `amount_cents` validation from schema
- Displays: Formatted PHP with ₱ prefix

## Key Features

### 1. Client-Side Validation

**Benefits:**

- Immediate feedback (no server round-trip)
- Reduces invalid API requests
- Improves user experience
- Catches errors before sync queue

**Performance:**

- Validation runs on blur and submit
- Negligible overhead (milliseconds)
- No network latency

### 2. Type Safety

**TypeScript inference:**

```typescript
type TransactionFormData = z.infer<typeof transactionSchema>
// Automatically typed as:
{
  date: Date;
  description: string;
  amount_cents: number;
  type: "income" | "expense";
  account_id?: string | null;
  category_id?: string | null;
  status: "pending" | "cleared";
  visibility: "household" | "personal";
  notes?: string | null;
}
```

**Benefits:**

- Autocomplete in IDE
- Compile-time error checking
- Refactoring safety
- Documentation through types

### 3. Reusable Schema

**Single source of truth:**

- Form validation
- Type inference
- Error messages
- API request validation (future)

**Consistency:**

- Same rules everywhere
- No validation drift
- Easy to update centrally

## Critical Implementation Notes

### 1. Date Handling

**User timezone awareness:**

- Transaction `date` field is DATE type in database
- User's local date is canonical (see DATABASE.md lines 932-1004)
- Schema validates against user's current date, not UTC

**Future consideration:**

- When implementing timezone-aware features
- Date validation may need `profiles.timezone` lookup
- Currently assumes browser timezone is correct

### 2. Amount Precision

**No decimal validation:**

- Schema expects integer cents (already converted)
- `CurrencyInput` component handles conversion
- Schema validates final integer value

**Flow:**

1. User types: "1,500.50"
2. CurrencyInput converts: 150050
3. Schema validates: `z.number().int().positive().max(999999999)`
4. Database stores: 150050

### 3. Optional Fields Philosophy

**Nullable account_id:**

- Allows income transactions without account
- Example: Cash gifts, found money
- Can be assigned to account later

**Nullable category_id:**

- Allows uncategorized transactions initially
- User can categorize later
- Prevents blocking transaction creation

**Optional notes:**

- Most transactions don't need notes
- Available for special cases (tax deductions, reimbursements)
- Empty string vs null vs undefined handled gracefully

## Common Use Cases

### 1. Creating Transaction with Validation

```typescript
const form = useForm<TransactionFormData>({
  resolver: zodResolver(transactionSchema),
});

const onSubmit = async (data: TransactionFormData) => {
  // Data is guaranteed valid at this point
  await createTransaction(data);
};
```

### 2. Handling Validation Errors

```typescript
<FormField
  control={form.control}
  name="date"
  render={({ field, fieldState }) => (
    <FormItem>
      <FormLabel>Date</FormLabel>
      <FormControl>
        <DatePicker {...field} />
      </FormControl>
      {fieldState.error && (
        <FormMessage>{fieldState.error.message}</FormMessage>
      )}
    </FormItem>
  )}
/>
```

### 3. Pre-populating Edit Form

```typescript
const form = useForm<TransactionFormData>({
  resolver: zodResolver(transactionSchema),
  defaultValues: {
    date: new Date(transaction.date),
    description: transaction.description,
    amount_cents: transaction.amount_cents,
    // ... other fields
  },
});
```

## Validation Error Messages

**Date errors:**

- "Transaction date cannot be in the future"

**Description errors:**

- "String must contain at least 3 character(s)"
- "String must contain at most 200 character(s)"

**Amount errors:**

- "Number must be positive"
- "Number must be less than or equal to 999999999"

**Type errors:**

- "Invalid enum value. Expected 'income' | 'expense'"

**Status errors:**

- "Invalid enum value. Expected 'pending' | 'cleared'"

**Visibility errors:**

- "Invalid enum value. Expected 'household' | 'personal'"

## Future Enhancements

### Planned Additions

**Transfer validation schema:**

- Validate from_account_id ≠ to_account_id
- Ensure both accounts exist
- Currently handled in TransferForm component

**Budget validation schema:**

- Validate month key format (YYYY-MM)
- Ensure target amount positive
- Category exists and is not parent-only

**Account validation schema:**

- Unique account names within household
- Valid initial balance
- Account type enum validation

### Multi-Currency Support (Phase 2)

**Schema changes needed:**

- Add `currency_code` field (default "PHP")
- Add `exchange_rate` field for non-PHP
- Validate amount ranges per currency
- See DECISIONS.md for multi-currency strategy

## Related Components

### Form Components

- [src/components/transactions/TransactionForm.tsx](../../components/transactions/README.md) - Uses validation schema
- [src/components/transactions/TransactionEditDialog.tsx](../../components/transactions/README.md) - Edit form validation

### UI Components

- [src/components/ui/currency-input.tsx](../../components/ui/README.md) - Amount input with validation
- [src/components/ui/date-picker.tsx](../../components/ui/README.md) - Date input with calendar

### Utilities

- [src/lib/currency.ts](../README.md) - Currency formatting and parsing
- [src/lib/date.ts](../README.md) - Date utilities (if exists)

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../CLAUDE.md) - Project quick reference
- [/src/README.md](../../README.md) - Source code overview
- [/src/lib/README.md](../README.md) - Library utilities

### Database

- [docs/initial plan/DATABASE.md](../../../docs/initial%20plan/DATABASE.md) - Currency spec (lines 1005-1160), date handling (lines 932-1004)

### Validation Libraries

- [Zod Documentation](https://zod.dev) - Schema validation
- [React Hook Form](https://react-hook-form.com/docs/useform) - Form integration
- [date-fns](https://date-fns.org) - Date manipulation

## Troubleshooting

### Issue: "Transaction date cannot be in the future" for today's date

**Check:**

1. Is browser timezone correct?
2. Is system clock accurate?
3. Try selecting date from calendar instead of typing

**Fix:** Use `endOfDay(new Date())` comparison allows same-day transactions

### Issue: Amount validation failing

**Check:**

1. Is CurrencyInput converting to cents correctly?
2. Is value an integer (not decimal)?
3. Is value positive?

**Debug:** Log `amount_cents` value before form submission

### Issue: Form submits with invalid data

**Check:**

1. Is `zodResolver(transactionSchema)` properly configured?
2. Are you using `form.handleSubmit(onSubmit)`?
3. Check browser console for Zod validation errors

**Fix:** Ensure React Hook Form integration is correct

## Performance Considerations

### Validation Performance

**Fast validation:**

- Zod validation takes <1ms for simple schemas
- No async operations
- No network requests
- Runs on blur and submit only

**Optimization:**

- Schema parsed once at module load
- Reused across all form instances
- No per-field schema creation

### Bundle Size

**Zod dependency:**

- ~15KB minified + gzipped
- Tree-shakeable (only used schemas included)
- Worth the size for type safety + validation

## Security Considerations

### Client-Side Validation Only

**Important:** These schemas provide UX feedback only

**Backend must:**

- Re-validate all data
- Enforce database constraints
- Use RLS policies for access control
- Never trust client data

**Current architecture:**

- Supabase RLS enforces security
- Database constraints provide final validation
- Client validation improves UX, not security

### Input Sanitization

**SQL injection:**

- Not a concern (using Supabase prepared statements)
- All queries parameterized

**XSS prevention:**

- React escapes by default
- No `dangerouslySetInnerHTML` usage
- Description and notes rendered as plain text
