# Chunk D8: Debt Forms

## At a Glance

- **Time**: 1.5 hours
- **Prerequisites**: D4 (CRUD), D7 (UI Components) complete
- **Can Skip**: No - users need forms to create/edit debts
- **Depends On**: React Hook Form, Zod, shadcn/ui form components

## What You're Building

Type-safe, validated forms for debt management:

- **CreateExternalDebtForm**: Create new external debts (banks, creditors)
- **EditExternalDebtForm**: Edit existing external debts (name only)
- **CreateInternalDebtForm**: Create IOUs between users
- **EditInternalDebtForm**: Edit internal debt details
- **Validation**: Client-side validation with Zod schemas
- **Error handling**: User-friendly error messages
- **Accessibility**: WCAG 2.1 AA compliant forms
- **Loading states**: Submit button with loading spinner

## Why This Matters

Forms are the **primary data entry point** for debts:

- **Data quality**: Validation prevents invalid debts from being created
- **User experience**: Clear errors guide users to fix mistakes
- **Type safety**: Zod schemas ensure runtime type validation
- **Accessibility**: Proper labels, ARIA attributes, error announcements
- **Offline support**: Forms work offline, sync when online
- **Error prevention**: Name uniqueness check prevents duplicates

This chunk implements the form patterns from the project architecture.

## Before You Start

Verify these prerequisites:

- [ ] **React Hook Form installed** - `npm install react-hook-form`
- [ ] **Zod installed** - `npm install zod @hookform/resolvers`
- [ ] **shadcn/ui form components** - `npx shadcn@latest add form`
- [ ] **CRUD operations** from D4 available
- [ ] **Currency utilities** from D7 available

**How to verify**:

```bash
# Check installations
npm list react-hook-form zod @hookform/resolvers

# Check shadcn/ui form
ls src/components/ui/form.tsx
ls src/components/ui/input.tsx
ls src/components/ui/label.tsx
```

## What Happens Next

After this chunk:

- Users can create external debts via form
- Users can create internal debts (IOUs)
- Form validation prevents invalid data
- Ready for Chunk D9 (Transaction Form Integration)

## Key Files Created

```
src/
├── components/
│   └── debts/
│       ├── forms/
│       │   ├── CreateExternalDebtForm.tsx
│       │   ├── EditExternalDebtForm.tsx
│       │   ├── CreateInternalDebtForm.tsx
│       │   └── EditInternalDebtForm.tsx
│       └── __tests__/
│           └── CreateExternalDebtForm.test.tsx
└── lib/
    └── debts/
        └── validation.ts               # Zod schemas
```

## Features Included

### CreateExternalDebtForm

**Fields**:

- **Name** (required): Debt name (e.g., "Car Loan", "Credit Card")
- **Original Amount** (required): Initial debt amount in PHP
- **Description** (optional): Additional notes

**Validation**:

- Name: 1-100 characters, unique within active debts
- Amount: ₱1.00 to ₱999,999,999.00 (100 to 99999999900 cents)
- Description: Max 500 characters

**Behavior**:

- Submit calls `createExternalDebt()` from D4
- Success: Close form, refresh debt list, show toast
- Error: Display error message below form

### EditExternalDebtForm

**Fields**:

- **Name** (required): Editable debt name

**Validation**:

- Name: 1-100 characters, unique (excluding current debt)

**Behavior**:

- Submit calls `updateDebtName()` from D4
- Original amount NOT editable (immutable)
- Archive button triggers `archiveDebt()`

### CreateInternalDebtForm

**Fields**:

- **From** (required): User/account who owes money
- **To** (required): User/account owed money
- **Amount** (required): Debt amount in PHP
- **Description** (optional): Notes

**Validation**:

- From/To: Must be different entities
- Amount: ₱1.00 to ₱999,999,999.00

**Behavior**:

- Submit calls `createInternalDebt()` from D4
- Shows from/to type selector (user vs account)

### EditInternalDebtForm

**Fields**:

- **Description** (optional): Editable notes

**Validation**:

- Description: Max 500 characters

**Behavior**:

- From/To/Amount NOT editable (immutable)
- Archive button available

## Related Documentation

- **Form Validation**: DEBT-VALIDATION.md (validation rules)
- **CRUD Operations**: D4 chunk (create/update functions)
- **React Hook Form**: https://react-hook-form.com
- **Zod**: https://zod.dev
- **Decisions**:
  - #13: Name uniqueness (active debts only) - DEBT-DECISIONS.md lines 490-534
  - #15: Amount immutability - DEBT-DECISIONS.md lines 569-609

## Technical Stack

- **React Hook Form**: Form state management
- **Zod**: Schema validation
- **@hookform/resolvers**: React Hook Form + Zod integration
- **shadcn/ui**: Form, Input, Label, Button, Textarea components
- **TypeScript**: Full type safety

## Design Patterns

### Controlled Form Pattern

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(100),
  original_amount_cents: z.number().int().min(100).max(99999999900),
});

type FormData = z.infer<typeof schema>;

function CreateDebtForm() {
  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      original_amount_cents: 0,
    },
  });

  const onSubmit = async (data: FormData) => {
    await createExternalDebt({
      ...data,
      household_id: currentHouseholdId,
    });
  };

  return <Form {...form} onSubmit={form.handleSubmit(onSubmit)} />;
}
```

**Why**: Type-safe, runtime-validated, single source of truth.

### Async Validation Pattern

```tsx
// Check name uniqueness asynchronously
const schema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .refine(
      async (name) => {
        const existing = await db.debts
          .where("name")
          .equals(name)
          .and((d) => d.status !== "archived")
          .first();
        return !existing;
      },
      { message: "A debt with this name already exists" }
    ),
});
```

**Why**: Prevents duplicate names, runs only on blur/submit.

### Currency Input Pattern

```tsx
function CurrencyInput({ value, onChange }) {
  const [displayValue, setDisplayValue] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setDisplayValue(input);

    // Parse to cents and update form
    try {
      const cents = parsePHP(input);
      onChange(cents);
    } catch {
      // Invalid input - don't update form value
    }
  };

  return <Input type="text" value={displayValue} onChange={handleChange} placeholder="₱0.00" />;
}
```

**Why**: User-friendly currency input, stored as cents internally.

### Error Recovery Pattern

```tsx
const onSubmit = async (data: FormData) => {
  try {
    await createExternalDebt(data);
    toast.success("Debt created successfully");
    onClose();
  } catch (error) {
    if (error.message.includes("unique constraint")) {
      form.setError("name", {
        type: "manual",
        message: "A debt with this name already exists",
      });
    } else {
      toast.error("Failed to create debt. Please try again.");
    }
  }
};
```

**Why**: User-friendly error messages, field-specific errors.

## Critical Concepts

**Name Uniqueness Scope**: Name uniqueness applies to **active debts only**. Archived debts don't count, allowing users to reuse names after archiving. This is enforced by:

```sql
CREATE UNIQUE INDEX debts_name_unique ON debts(household_id, name)
WHERE status != 'archived';
```

**Amount Immutability**: The `original_amount_cents` field is **immutable after creation**. Users cannot edit it. Rationale:

- Prevents confusion in payment history
- Balance calculation depends on stable original amount
- If amount was wrong, archive and create new debt

**Currency Storage Format**: Forms display amounts in PHP (₱1,500.50) but store as cents (150050). Use:

- `formatPHP(cents)` to display
- `parsePHP(input)` to store

**Validation Timing**:

- **onBlur**: Async validations (name uniqueness)
- **onChange**: Synchronous validations (length, format)
- **onSubmit**: Final validation before API call

**Error Announcement**: Use ARIA live regions to announce errors to screen readers:

```tsx
<p role="alert" aria-live="polite">
  {errors.name?.message}
</p>
```

## Form Field Specifications

### Name Field

**Type**: Text input
**Requirements**:

- 1-100 characters
- Unique within active debts of household
- Trimmed whitespace
- No special validation (allow all characters)

**Error messages**:

- "Name is required"
- "Name must be 100 characters or less"
- "A debt with this name already exists"

### Amount Field

**Type**: Currency input (text input with formatting)
**Requirements**:

- ₱1.00 to ₱999,999,999.00
- Stored as cents (100 to 99999999900)
- Accepts formats: "1500", "1500.50", "₱1,500.50"

**Error messages**:

- "Amount is required"
- "Amount must be at least ₱1.00"
- "Amount must not exceed ₱999,999,999.00"
- "Invalid amount format"

### Description Field

**Type**: Textarea
**Requirements**:

- Optional
- Max 500 characters
- Multiline allowed

**Error messages**:

- "Description must be 500 characters or less"

### From/To Fields (Internal Debts)

**Type**: Select dropdown
**Requirements**:

- Type: "user" or "account"
- ID: Valid user/account ID
- From ≠ To (different entities)

**Error messages**:

- "From is required"
- "To is required"
- "From and To must be different"

## Accessibility Requirements

**Form Structure**:

- Each field has `<label>` with `htmlFor`
- Error messages have `role="alert"` and `aria-live="polite"`
- Required fields marked with `aria-required="true"`
- Invalid fields marked with `aria-invalid="true"`

**Keyboard Navigation**:

- Tab through fields in logical order
- Enter submits form
- Escape closes dialog (if in modal)

**Screen Reader Announcements**:

- Field labels read on focus
- Errors announced when they appear
- Success toast announced
- Loading state announced ("Saving...")

## Loading States

**Submit Button**:

```tsx
<Button type="submit" disabled={form.formState.isSubmitting}>
  {form.formState.isSubmitting ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Creating...
    </>
  ) : (
    "Create Debt"
  )}
</Button>
```

**Form Disabled During Submit**:

```tsx
<fieldset disabled={form.formState.isSubmitting}>{/* All form fields */}</fieldset>
```

## Success/Error Feedback

**Success Flow**:

1. Form submits successfully
2. Show success toast: "Debt created successfully"
3. Close form/modal
4. Refresh debt list (via query invalidation)
5. Navigate to debt detail page (optional)

**Error Flow**:

1. Form submission fails
2. Parse error type:
   - Validation error → Set field error
   - Network error → Show generic toast
   - Duplicate name → Set name field error
3. Keep form open with errors visible
4. User can fix and retry

---

**Ready?** → Open `IMPLEMENTATION.md` to begin
