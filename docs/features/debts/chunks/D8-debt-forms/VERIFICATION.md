# D8 Verification: Debt Forms

## Quick Verification (3 minutes)

```bash
npm run dev
# Navigate to forms demo page
# Test each form with valid/invalid data
```

---

## Part 1: Validation Schemas

### createExternalDebtSchema

```typescript
import { createExternalDebtSchema } from "@/lib/debts/validation";

// Valid data
const valid = createExternalDebtSchema.safeParse({
  name: "Car Loan",
  original_amount_cents: 100000,
  household_id: "h1",
});
console.assert(valid.success === true);

// Invalid: missing name
const invalid1 = createExternalDebtSchema.safeParse({
  name: "",
  original_amount_cents: 100000,
  household_id: "h1",
});
console.assert(invalid1.success === false);
console.assert(invalid1.error.issues[0].message === "Name is required");

// Invalid: amount too small
const invalid2 = createExternalDebtSchema.safeParse({
  name: "Test",
  original_amount_cents: 50, // Less than ₱1.00
  household_id: "h1",
});
console.assert(invalid2.success === false);
console.assert(invalid2.error.issues[0].message.includes("at least ₱1.00"));

// Invalid: amount too large
const invalid3 = createExternalDebtSchema.safeParse({
  name: "Test",
  original_amount_cents: 100000000000, // Over max
  household_id: "h1",
});
console.assert(invalid3.success === false);
```

### createInternalDebtSchema

```typescript
import { createInternalDebtSchema } from "@/lib/debts/validation";

// Valid data
const valid = createInternalDebtSchema.safeParse({
  from_type: "user",
  from_id: "user-1",
  to_type: "user",
  to_id: "user-2",
  original_amount_cents: 50000,
  household_id: "h1",
});
console.assert(valid.success === true);

// Invalid: from and to are the same
const invalid = createInternalDebtSchema.safeParse({
  from_type: "user",
  from_id: "user-1",
  to_type: "user",
  to_id: "user-1", // Same as from
  original_amount_cents: 50000,
  household_id: "h1",
});
console.assert(invalid.success === false);
console.assert(invalid.error.issues[0].message === "From and To must be different");
```

### isDebtNameUnique Function

```typescript
import { isDebtNameUnique } from "@/lib/debts/validation";
import { createExternalDebt } from "@/lib/debts";

// Create a debt
await createExternalDebt({
  name: "Existing Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Check uniqueness
const isUnique1 = await isDebtNameUnique("New Debt", "h1");
console.assert(isUnique1 === true, "New name is unique");

const isUnique2 = await isDebtNameUnique("Existing Debt", "h1");
console.assert(isUnique2 === false, "Existing name is not unique");

// Case-insensitive check
const isUnique3 = await isDebtNameUnique("existing debt", "h1");
console.assert(isUnique3 === false, "Case-insensitive match");

// Excluding current debt (for edit)
const debtId = "debt-123";
const isUnique4 = await isDebtNameUnique("Existing Debt", "h1", debtId);
console.assert(isUnique4 === true, "Excluded from check");
```

### parseAmountInput Function

```typescript
import { parseAmountInput } from "@/lib/debts/validation";

// Valid inputs
console.assert(parseAmountInput("1500") === 150000);
console.assert(parseAmountInput("1500.50") === 150050);
console.assert(parseAmountInput("₱1,500.50") === 150050);
console.assert(parseAmountInput("₱ 1,500.50") === 150050);

// Invalid inputs
console.assert(parseAmountInput("invalid") === null);
console.assert(parseAmountInput("") === null);
console.assert(parseAmountInput("-100") === null);

// Out of range
console.assert(parseAmountInput("0.50") === null); // Below min
console.assert(parseAmountInput("1000000000") === null); // Above max
```

---

## Part 2: CurrencyInput Component

### Display Formatting

```tsx
import { CurrencyInput } from "@/components/debts/forms/CurrencyInput";
import { useState } from "react";

function Test() {
  const [amount, setAmount] = useState(0);

  return (
    <div>
      <CurrencyInput value={amount} onChange={setAmount} />
      <p>Stored: {amount} cents</p>
    </div>
  );
}

// Type "1500.50"
// Expected stored: 150050
// Expected display (on blur): "1500.50"

// Type "₱1,500.50"
// Expected stored: 150050
// Expected display (on blur): "1500.50"
```

### Input Parsing

```tsx
// Type various formats
"1500"        → stores 150000 cents
"1500.5"      → stores 150050 cents
"1500.50"     → stores 150050 cents
"₱1,500.50"   → stores 150050 cents
"₱ 1 , 5 0 0" → stores 150000 cents

// Invalid input doesn't update value
"abc"         → no change
"-100"        → no change
""            → resets to 0
```

### Blur Formatting

```tsx
// Initial value: 150050 cents
// Display: "1500.50"

// User changes to "1500"
// On blur, display becomes: "1500.00"

// User changes to "₱1,500.50"
// On blur, display becomes: "1500.50"
```

---

## Part 3: CreateExternalDebtForm

### Valid Submission

```tsx
import { CreateExternalDebtForm } from "@/components/debts/forms/CreateExternalDebtForm";

<CreateExternalDebtForm householdId="h1" onSuccess={(id) => console.log("Created:", id)} />;

// Fill form:
// - Name: "Test Debt"
// - Amount: "1000.00"
// - Description: "Test description"

// Click "Create Debt"

// Expected:
// - Success toast: "Debt created successfully"
// - onSuccess called with debt ID
// - Form resets to empty
```

### Validation Errors

```tsx
// Leave name empty, click submit
// Expected: "Name is required" error below name field

// Enter name longer than 100 chars
// Expected: "Name must be 100 characters or less"

// Enter amount "0.50" (below minimum)
// Expected: "Amount must be at least ₱1.00"

// Enter amount "1000000000" (above maximum)
// Expected: "Amount must not exceed ₱999,999,999.00"
```

### Name Uniqueness Error

```tsx
// Create first debt: "Car Loan"
await createExternalDebt({
  name: "Car Loan",
  original_amount_cents: 100000,
  household_id: "h1",
});

// Try to create second debt: "Car Loan"
<CreateExternalDebtForm householdId="h1" />;

// Fill form with name "Car Loan", submit
// Expected: "A debt with this name already exists" error

// Change name to "car loan" (lowercase), submit
// Expected: Same error (case-insensitive)

// Change name to "New Debt", submit
// Expected: Success
```

### Loading State

```tsx
// Click "Create Debt" button
// Expected:
// - Button text: "Creating..." with spinner
// - Button disabled
// - All form fields disabled
// - Cannot type or click during submission
```

### Cancel Button

```tsx
<CreateExternalDebtForm householdId="h1" onCancel={() => console.log("Cancelled")} />

// Fill form partially
// Click "Cancel"
// Expected: onCancel called, form can be closed
```

---

## Part 4: EditExternalDebtForm

### Name Edit

```tsx
import { EditExternalDebtForm } from "@/components/debts/forms/EditExternalDebtForm";

const debt = {
  id: "debt-1",
  name: "Original Name",
  original_amount_cents: 100000,
  status: "active" as const,
  household_id: "h1",
  created_at: "2025-11-01",
  updated_at: "2025-11-01",
};

<EditExternalDebtForm debt={debt} onSuccess={() => console.log("Updated")} />;

// Change name to "New Name"
// Click "Save Changes"
// Expected:
// - Success toast
// - onSuccess called
// - Debt name updated in database
```

### No Changes

```tsx
// Don't change anything
// Click "Save Changes"
// Expected: Info toast "No changes to save"
```

### Amount Read-Only

```tsx
// Expected:
// - Original amount displayed as large text (₱1,000.00)
// - No input field for amount
// - Text: "Original amount cannot be changed"
```

### Archive Button

```tsx
// Click "Archive Debt" button
// Expected:
// - Confirmation dialog (if implemented)
// - Debt status changes to 'archived'
// - Success toast: "Debt archived successfully"
// - onArchive callback called
```

### Archive Button Disabled

```tsx
const archivedDebt = { ...debt, status: "archived" as const };

<EditExternalDebtForm debt={archivedDebt} />;

// Expected:
// - "Archive Debt" button disabled
// - Cannot archive already-archived debt
```

---

## Part 5: CreateInternalDebtForm

### Valid Submission

```tsx
import { CreateInternalDebtForm } from "@/components/debts/forms/CreateInternalDebtForm";

const users = [
  { id: "user-1", name: "Alice" },
  { id: "user-2", name: "Bob" },
];

const accounts = [
  { id: "acc-1", name: "Cash" },
  { id: "acc-2", name: "Bank" },
];

<CreateInternalDebtForm
  householdId="h1"
  users={users}
  accounts={accounts}
  onSuccess={(id) => console.log("Created:", id)}
/>;

// Fill form:
// - Who Owes: User → Alice
// - Who Is Owed: User → Bob
// - Amount: ₱500.00
// - Description: "Dinner split"

// Click "Create Internal Debt"
// Expected: Success toast, internal debt created
```

### From/To Validation

```tsx
// Select:
// - Who Owes: User → Alice
// - Who Is Owed: User → Alice (same as from)

// Click submit
// Expected: "From and To must be different" error
```

### Type Switching

```tsx
// Select "Who Owes: User"
// Expected: Dropdown shows users (Alice, Bob)

// Change to "Who Owes: Account"
// Expected: Dropdown shows accounts (Cash, Bank)

// Selection resets when type changes
```

### Mixed Types

```tsx
// Select:
// - Who Owes: User → Alice
// - Who Is Owed: Account → Bank

// Click submit
// Expected: Success (different types allowed)
```

---

## Part 6: Accessibility Testing

### Keyboard Navigation

```tsx
// Tab through CreateExternalDebtForm
// Expected tab order:
// 1. Name input
// 2. Amount input
// 3. Description textarea
// 4. Cancel button (if present)
// 5. Create Debt button

// Press Enter on Name field
// Expected: Form submits (if valid)

// Press Escape (in dialog)
// Expected: Dialog closes
```

### Screen Reader Announcements

```bash
# Use VoiceOver (Mac) or NVDA (Windows)
```

**Name field**:

- Focus: "Debt Name, edit text, A unique name to identify this debt"
- After error: "Debt Name, invalid data, Name is required"

**Amount field**:

- Focus: "Original Amount, edit text, The initial debt amount"
- After error: "Original Amount, invalid data, Amount must be at least ₱1.00"

**Submit button**:

- Focus: "Create Debt, button"
- During submit: "Creating..., button, disabled"

**Error messages**:

- When error appears: Announced immediately via aria-live="polite"

### ARIA Attributes

```tsx
// Inspect Name field
<Input
  aria-invalid="true"          // When error
  aria-describedby="name-error" // Links to error message
/>

<FormMessage
  id="name-error"
  role="alert"
  aria-live="polite"
>
  Name is required
</FormMessage>
```

---

## Part 7: Error Handling

### Network Error

```tsx
// Mock network failure
vi.mock("@/lib/debts", () => ({
  createExternalDebt: vi.fn().mockRejectedValue(new Error("Network error")),
}));

// Fill and submit form
// Expected:
// - Error toast: "Failed to create debt. Please try again."
// - Form stays open
// - Can retry submission
```

### Unique Constraint Error

```tsx
// Mock database constraint error
vi.mock("@/lib/debts", () => ({
  createExternalDebt: vi.fn().mockRejectedValue(new Error("unique constraint violation")),
}));

// Fill and submit form
// Expected:
// - Field error on name: "A debt with this name already exists"
// - No toast (field error shown instead)
```

### Validation Error Recovery

```tsx
// Submit form with empty name
// Expected: "Name is required" error

// Fill name with valid value
// Expected: Error clears immediately (onChange validation)

// Submit again
// Expected: Success (no error)
```

---

## Part 8: Integration Testing

### Create → View Flow

```tsx
import { useState } from "react";
import { CreateExternalDebtForm } from "@/components/debts/forms/CreateExternalDebtForm";
import { DebtCard } from "@/components/debts/DebtCard";

function IntegrationTest() {
  const [createdDebtId, setCreatedDebtId] = useState<string | null>(null);

  return (
    <div>
      <CreateExternalDebtForm householdId="h1" onSuccess={(id) => setCreatedDebtId(id)} />

      {createdDebtId && <DebtCard debt={debt} balance={debt.original_amount_cents} />}
    </div>
  );
}

// Create debt via form
// Expected: DebtCard appears below with correct data
```

### Edit → Refresh Flow

```tsx
// Load debt in edit form
<EditExternalDebtForm debt={debt} onSuccess={refetchDebt} />

// Change name, save
// Expected:
// - Name updates in database
// - UI refreshes with new name
// - Balance unchanged
```

---

## Edge Cases

### Edge Case 1: Very Long Name

```tsx
// Enter name with 100 characters
const longName = "A".repeat(100);

// Submit
// Expected: Success (exactly at limit)

// Enter name with 101 characters
const tooLong = "A".repeat(101);

// Submit
// Expected: "Name must be 100 characters or less" error
```

### Edge Case 2: Exact Amount Limits

```tsx
// Enter amount "1.00" (minimum)
// Expected: Success

// Enter amount "999999999.00" (maximum)
// Expected: Success

// Enter amount "0.99" (below minimum)
// Expected: Error

// Enter amount "1000000000.00" (above maximum)
// Expected: Error
```

### Edge Case 3: Special Characters in Name

```tsx
// Enter name: "Car Loan (2024) - 5.5% APR"
// Expected: Success (all special chars allowed)

// Enter name: "車のローン" (Japanese)
// Expected: Success (Unicode allowed)

// Enter name: "Empréstimo" (Portuguese)
// Expected: Success (Accented chars allowed)
```

### Edge Case 4: Whitespace Handling

```tsx
// Enter name: "  Car Loan  " (leading/trailing spaces)
// Expected: Trimmed to "Car Loan" on submit

// Enter name: "Car    Loan" (multiple spaces)
// Expected: Kept as-is (internal spaces preserved)

// Enter name: "   " (only spaces)
// Expected: "Name is required" error (trimmed to empty)
```

### Edge Case 5: Currency Input Edge Cases

```tsx
// Enter "1500.999" (more than 2 decimals)
// Expected: Rounds to 150100 cents (₱1,501.00)

// Enter "1500.001"
// Expected: Rounds to 150000 cents (₱1,500.00)

// Paste "₱1,500.50" from clipboard
// Expected: Parses correctly to 150050 cents
```

---

## Final Checklist

- [ ] Dependencies installed (react-hook-form, zod, @hookform/resolvers)
- [ ] shadcn/ui form components installed
- [ ] Validation schemas work correctly
- [ ] isDebtNameUnique checks uniqueness
- [ ] parseAmountInput handles all formats
- [ ] CurrencyInput displays and parses correctly
- [ ] CreateExternalDebtForm submits successfully
- [ ] EditExternalDebtForm updates name
- [ ] CreateInternalDebtForm creates internal debts
- [ ] Form validation errors clear on fix
- [ ] Loading states work (disabled fields, spinner)
- [ ] Success/error toasts appear
- [ ] Keyboard navigation works
- [ ] Screen reader announcements work
- [ ] ARIA attributes correct
- [ ] Component tests pass (if created)

**Status**: ✅ Chunk D8 Complete

**Next Chunk**: D9 - Transaction Form Integration

---

## Visual Verification Checklist

Open each form in the browser and verify:

### CreateExternalDebtForm

- [ ] Name input visible with placeholder
- [ ] Amount input shows "₱0.00" placeholder
- [ ] Description textarea has 3 rows
- [ ] "Create Debt" button prominent (primary variant)
- [ ] Cancel button outline variant (if present)
- [ ] Form descriptions show below each field
- [ ] Error messages appear in red below fields
- [ ] Submit button shows spinner when loading

### EditExternalDebtForm

- [ ] Name input pre-filled with current name
- [ ] Amount shown as large read-only text
- [ ] "Original amount cannot be changed" text visible
- [ ] "Archive Debt" button red/destructive variant
- [ ] "Save Changes" button primary variant
- [ ] Archive button disabled if already archived

### CreateInternalDebtForm

- [ ] Two type selectors (User/Account) for From and To
- [ ] Entity dropdowns update when type changes
- [ ] Amount input with currency formatting
- [ ] Description textarea optional
- [ ] "Create Internal Debt" button clear
- [ ] Form layout logical and easy to follow
