# Chunk 006: Currency System

## At a Glance

- **Time**: 60 minutes
- **Milestone**: MVP (3 of 10)
- **Prerequisites**: Chunk 005 (accounts UI with currency utilities)
- **Can Skip**: No - critical for data integrity

## What You're Building

Comprehensive currency system infrastructure:

- Unit tests for currency utilities (formatPHP, parsePHP, validateAmount)
- Reusable CurrencyInput component for forms
- Edge case handling (negatives, overflow, invalid input)
- Integration with React Hook Form
- Documentation of PHP currency patterns

## Why This Matters

Currency handling is **critical for financial data integrity**. Even small bugs (rounding errors, overflow issues, invalid parsing) can corrupt your financial data. This chunk ensures bulletproof currency handling throughout the app.

## Before You Start

Make sure you have:

- Chunk 005 completed
- Currency utilities exist in `src/lib/currency.ts`
- Vitest configured for testing
- React Hook Form and Zod installed

## What Happens Next

After this chunk:

- All currency operations tested and verified
- Reusable CurrencyInput component ready for transaction forms
- Edge cases handled gracefully
- Type-safe currency handling throughout app
- Ready to build transaction form (chunk 009)

## Key Files Created

```
src/
├── lib/
│   ├── currency.ts                 # Utilities (from chunk 005)
│   └── currency.test.ts            # Comprehensive unit tests
├── components/
│   └── ui/
│       └── currency-input.tsx      # Reusable currency input component
└── types/
    └── currency.ts                 # Currency type definitions
```

## Features Included

### Unit Tests

- formatPHP with various amounts (0, positive, negative, large numbers)
- parsePHP with various formats (with/without symbols, commas, decimals)
- validateAmount boundary testing (min, max, non-integer, invalid)
- Edge cases (null, undefined, empty string, overflow)

### CurrencyInput Component

- Controlled input with React Hook Form integration
- Real-time formatting as user types
- PHP symbol prefix (₱)
- Validation feedback
- Error states
- Disabled state
- Accessible (ARIA labels)

### Integration Patterns

- React Hook Form controller
- Zod schema integration
- Error message handling
- Touch/blur validation

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 1005-1160 (currency spec)
- **Original**: `docs/initial plan/CLAUDE.md` lines 26-35 (currency handling)
- **Decisions**:
  - #51: PHP currency only for MVP
  - #9: Positive amounts with type field
- **Architecture**: Three-layer state with currency precision

## Technical Stack

- **Vitest**: Unit testing framework
- **React Hook Form**: Form state management
- **Zod**: Schema validation
- **TypeScript**: Type safety for currency operations

## Design Patterns

### Currency Value Object Pattern

```typescript
// Always work with cents internally
type AmountCents = number; // Brand type for type safety

// Convert at boundaries only
const display = formatPHP(amountCents); // → "₱1,500.50"
const stored = parsePHP(userInput); // → 150050
```

### Form Integration Pattern

```typescript
// CurrencyInput with React Hook Form
<Controller
  name="amount"
  control={control}
  render={({ field }) => (
    <CurrencyInput {...field} />
  )}
/>
```

---

**Ready?** → Open `instructions.md` to begin
