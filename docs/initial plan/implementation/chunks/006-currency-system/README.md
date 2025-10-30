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

Verify these prerequisites from Chunk 005:

- [ ] **Chunk 005 checkpoint passed** - All accounts UI tests passing
- [ ] **Currency utilities exist** in `src/lib/currency.ts`:
  - `formatPHP(cents: number): string` function implemented
  - `parsePHP(input: string | number): number` function implemented
  - `validateAmount(cents: number): boolean` function implemented
- [ ] **Vitest configured** - Can run `npm test` successfully
- [ ] **React Hook Form and Zod installed** - Dependencies available

**How to verify**: Run `npm test src/lib/currency.test.ts` from chunk 005. If tests don't exist, complete chunk 005 first.

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
- **Original**: `/CLAUDE.md` - Project instructions (currency handling section)
- **Decisions**:
  - #51: PHP currency only for MVP (DECISIONS.md lines 556-564)
  - #9: Positive amounts with type field (DECISIONS.md lines 123-129)
- **Architecture**: Three-layer state with currency precision

**Note**: This chunk focuses on **testing existing utilities** and **creating reusable components**. The core currency utilities (`formatPHP`, `parsePHP`, `validateAmount`) are implemented in Chunk 005.

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
