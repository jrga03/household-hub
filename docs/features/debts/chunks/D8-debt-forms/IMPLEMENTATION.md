# D8 Implementation: Debt Forms

**Time estimate**: 1.5 hours
**Prerequisites**: D4 (CRUD), D7 (UI Components) complete

---

## Step 0: Install Dependencies (5 min)

Install React Hook Form, Zod, and shadcn/ui form components.

```bash
# Install form libraries
npm install react-hook-form zod @hookform/resolvers

# Install shadcn/ui form components
npx shadcn@latest add form
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add textarea
npx shadcn@latest add select

# Verify installation
npm list react-hook-form zod @hookform/resolvers
```

**Verification**:

```bash
ls src/components/ui/form.tsx
ls src/components/ui/input.tsx
ls src/components/ui/textarea.tsx
```

---

## Step 1: Create Validation Schemas (15 min)

Zod schemas for debt form validation.

**File**: `src/lib/debts/validation.ts` (NEW)

```typescript
import { z } from "zod";
import { db } from "@/lib/dexie";

/**
 * Validation schemas for debt forms
 */

/**
 * External debt creation schema
 */
export const createExternalDebtSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less")
    .trim(),

  original_amount_cents: z
    .number()
    .int("Amount must be a whole number")
    .min(100, "Amount must be at least ₱1.00")
    .max(99999999900, "Amount must not exceed ₱999,999,999.00"),

  description: z.string().max(500, "Description must be 500 characters or less").optional(),

  household_id: z.string().min(1, "Household ID is required"),
});

export type CreateExternalDebtFormData = z.infer<typeof createExternalDebtSchema>;

/**
 * External debt edit schema (name only)
 */
export const editExternalDebtSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or less")
    .trim(),
});

export type EditExternalDebtFormData = z.infer<typeof editExternalDebtSchema>;

/**
 * Internal debt creation schema
 */
export const createInternalDebtSchema = z
  .object({
    from_type: z.enum(["user", "account"], {
      errorMap: () => ({ message: "From type must be user or account" }),
    }),

    from_id: z.string().min(1, "From is required"),

    to_type: z.enum(["user", "account"], {
      errorMap: () => ({ message: "To type must be user or account" }),
    }),

    to_id: z.string().min(1, "To is required"),

    original_amount_cents: z
      .number()
      .int("Amount must be a whole number")
      .min(100, "Amount must be at least ₱1.00")
      .max(99999999900, "Amount must not exceed ₱999,999,999.00"),

    description: z.string().max(500, "Description must be 500 characters or less").optional(),

    household_id: z.string().min(1, "Household ID is required"),
  })
  .refine(
    (data) => {
      // Ensure from and to are different
      if (data.from_type === data.to_type && data.from_id === data.to_id) {
        return false;
      }
      return true;
    },
    {
      message: "From and To must be different",
      path: ["to_id"], // Show error on "to" field
    }
  );

export type CreateInternalDebtFormData = z.infer<typeof createInternalDebtSchema>;

/**
 * Check if debt name is unique within active debts
 *
 * @param name - Debt name to check
 * @param householdId - Household ID
 * @param excludeDebtId - Optional debt ID to exclude (for edit forms)
 * @returns True if name is unique
 */
export async function isDebtNameUnique(
  name: string,
  householdId: string,
  excludeDebtId?: string
): Promise<boolean> {
  const trimmedName = name.trim();

  const existing = await db.debts
    .where("household_id")
    .equals(householdId)
    .and((debt) => {
      // Exclude archived debts
      if (debt.status === "archived") return false;

      // Exclude current debt (for edit)
      if (excludeDebtId && debt.id === excludeDebtId) return false;

      // Case-insensitive name match
      return debt.name.toLowerCase() === trimmedName.toLowerCase();
    })
    .first();

  return !existing;
}

/**
 * Validate amount string and convert to cents
 *
 * @param input - Amount string (e.g., "1500", "₱1,500.50")
 * @returns Amount in cents or null if invalid
 */
export function parseAmountInput(input: string): number | null {
  try {
    // Remove currency symbol, commas, spaces
    const cleaned = input.replace(/[₱,\s]/g, "");

    // Parse as float
    const pesos = parseFloat(cleaned);

    if (isNaN(pesos) || pesos < 0) {
      return null;
    }

    // Convert to cents
    const cents = Math.round(pesos * 100);

    // Validate range
    if (cents < 100 || cents > 99999999900) {
      return null;
    }

    return cents;
  } catch {
    return null;
  }
}

/**
 * Format cents to display value for input
 *
 * @param cents - Amount in cents
 * @returns Formatted string (e.g., "1500.50")
 */
export function formatAmountInput(cents: number): string {
  const pesos = cents / 100;
  return pesos.toFixed(2);
}
```

**Verification**:

```typescript
import {
  createExternalDebtSchema,
  isDebtNameUnique,
  parseAmountInput,
} from "@/lib/debts/validation";

// Test schema
const result = createExternalDebtSchema.safeParse({
  name: "Test Debt",
  original_amount_cents: 100000,
  household_id: "h1",
});
console.assert(result.success === true);

// Test name uniqueness
const isUnique = await isDebtNameUnique("New Debt", "h1");
console.log("Is unique:", isUnique);

// Test amount parsing
console.assert(parseAmountInput("1500.50") === 150050);
console.assert(parseAmountInput("₱1,500.50") === 150050);
```

---

## Step 2: Create Currency Input Component (15 min)

Reusable currency input with formatting.

**File**: `src/components/debts/forms/CurrencyInput.tsx` (NEW)

```tsx
import React, { useState, useEffect } from "react";
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
  // Display value (formatted string)
  const [displayValue, setDisplayValue] = useState("");

  // Initialize display value from cents value
  useEffect(() => {
    if (value > 0) {
      setDisplayValue(formatAmountInput(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setDisplayValue(input);

    // Parse to cents
    const cents = parseAmountInput(input);

    if (cents !== null) {
      onChange(cents);
    }
  };

  const handleBlur = () => {
    // Format display value on blur
    if (value > 0) {
      setDisplayValue(formatAmountInput(value));
    } else {
      setDisplayValue("");
    }

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
```

**Verification**:

```tsx
import { CurrencyInput } from "@/components/debts/forms/CurrencyInput";

function Test() {
  const [amount, setAmount] = useState(0);

  return (
    <div>
      <CurrencyInput value={amount} onChange={setAmount} />
      <p>Amount in cents: {amount}</p>
      <p>Amount in PHP: {formatPHP(amount)}</p>
    </div>
  );
}
```

---

## Step 3: Create External Debt Form (25 min)

Form for creating external debts.

**File**: `src/components/debts/forms/CreateExternalDebtForm.tsx` (NEW)

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "./CurrencyInput";
import { createExternalDebt } from "@/lib/debts";
import { createExternalDebtSchema, isDebtNameUnique } from "@/lib/debts/validation";
import type { CreateExternalDebtFormData } from "@/lib/debts/validation";
import { toast } from "sonner";

interface CreateExternalDebtFormProps {
  householdId: string;
  onSuccess?: (debtId: string) => void;
  onCancel?: () => void;
}

/**
 * Form for creating external debts (banks, creditors, etc.)
 *
 * Features:
 * - Name uniqueness validation
 * - Currency input with formatting
 * - Client-side validation with Zod
 * - Accessible error messages
 *
 * @example
 * <CreateExternalDebtForm
 *   householdId="h1"
 *   onSuccess={(id) => navigate(`/debts/${id}`)}
 *   onCancel={() => closeDialog()}
 * />
 */
export function CreateExternalDebtForm({
  householdId,
  onSuccess,
  onCancel,
}: CreateExternalDebtFormProps) {
  const form = useForm<CreateExternalDebtFormData>({
    resolver: zodResolver(createExternalDebtSchema),
    defaultValues: {
      name: "",
      original_amount_cents: 0,
      description: "",
      household_id: householdId,
    },
  });

  const onSubmit = async (data: CreateExternalDebtFormData) => {
    try {
      // Check name uniqueness
      const isUnique = await isDebtNameUnique(data.name, householdId);

      if (!isUnique) {
        form.setError("name", {
          type: "manual",
          message: "A debt with this name already exists",
        });
        return;
      }

      // Create debt
      const debt = await createExternalDebt(data);

      // Success
      toast.success("Debt created successfully");
      onSuccess?.(debt.id);

      // Reset form
      form.reset();
    } catch (error) {
      console.error("Failed to create debt:", error);

      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes("unique constraint")) {
          form.setError("name", {
            type: "manual",
            message: "A debt with this name already exists",
          });
        } else {
          toast.error(error.message || "Failed to create debt. Please try again.");
        }
      } else {
        toast.error("Failed to create debt. Please try again.");
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={form.formState.isSubmitting} className="space-y-4">
          {/* Name field */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Debt Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Car Loan, Credit Card"
                    {...field}
                    aria-invalid={!!form.formState.errors.name}
                    aria-describedby={form.formState.errors.name ? "name-error" : undefined}
                  />
                </FormControl>
                <FormDescription>A unique name to identify this debt</FormDescription>
                <FormMessage id="name-error" role="alert" aria-live="polite" />
              </FormItem>
            )}
          />

          {/* Amount field */}
          <FormField
            control={form.control}
            name="original_amount_cents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Original Amount</FormLabel>
                <FormControl>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="₱0.00"
                    aria-invalid={!!form.formState.errors.original_amount_cents}
                    aria-describedby={
                      form.formState.errors.original_amount_cents ? "amount-error" : undefined
                    }
                  />
                </FormControl>
                <FormDescription>The initial debt amount (cannot be changed later)</FormDescription>
                <FormMessage id="amount-error" role="alert" aria-live="polite" />
              </FormItem>
            )}
          />

          {/* Description field */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Additional notes about this debt..."
                    className="resize-none"
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormDescription>Any additional details or notes</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Form actions */}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </Button>
          )}

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
        </div>
      </form>
    </Form>
  );
}
```

**Verification**:

```tsx
import { CreateExternalDebtForm } from "@/components/debts/forms/CreateExternalDebtForm";

function DebtCreationPage() {
  return (
    <div className="container max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-6">Create External Debt</h1>

      <CreateExternalDebtForm
        householdId="h1"
        onSuccess={(id) => console.log("Created:", id)}
        onCancel={() => console.log("Cancelled")}
      />
    </div>
  );
}
```

---

## Step 4: Create Edit External Debt Form (15 min)

Form for editing external debt names.

**File**: `src/components/debts/forms/EditExternalDebtForm.tsx` (NEW)

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updateDebtName, archiveDebt } from "@/lib/debts";
import { editExternalDebtSchema, isDebtNameUnique } from "@/lib/debts/validation";
import type { EditExternalDebtFormData } from "@/lib/debts/validation";
import type { Debt } from "@/types/debt";
import { toast } from "sonner";

interface EditExternalDebtFormProps {
  debt: Debt;
  onSuccess?: () => void;
  onCancel?: () => void;
  onArchive?: () => void;
}

/**
 * Form for editing external debt details
 *
 * Only allows editing the name (amount is immutable).
 * Includes archive button.
 */
export function EditExternalDebtForm({
  debt,
  onSuccess,
  onCancel,
  onArchive,
}: EditExternalDebtFormProps) {
  const form = useForm<EditExternalDebtFormData>({
    resolver: zodResolver(editExternalDebtSchema),
    defaultValues: {
      name: debt.name,
    },
  });

  const onSubmit = async (data: EditExternalDebtFormData) => {
    try {
      // Check if name changed
      if (data.name.trim() === debt.name) {
        toast.info("No changes to save");
        return;
      }

      // Check name uniqueness (exclude current debt)
      const isUnique = await isDebtNameUnique(data.name, debt.household_id, debt.id);

      if (!isUnique) {
        form.setError("name", {
          type: "manual",
          message: "A debt with this name already exists",
        });
        return;
      }

      // Update debt name
      await updateDebtName(debt.id, "external", data.name.trim());

      toast.success("Debt updated successfully");
      onSuccess?.();
    } catch (error) {
      console.error("Failed to update debt:", error);
      toast.error("Failed to update debt. Please try again.");
    }
  };

  const handleArchive = async () => {
    try {
      await archiveDebt(debt.id, "external");
      toast.success("Debt archived successfully");
      onArchive?.();
    } catch (error) {
      console.error("Failed to archive debt:", error);
      toast.error("Failed to archive debt. Please try again.");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={form.formState.isSubmitting} className="space-y-4">
          {/* Name field */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Debt Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Car Loan" {...field} />
                </FormControl>
                <FormMessage role="alert" aria-live="polite" />
              </FormItem>
            )}
          />

          {/* Original amount (read-only) */}
          <div>
            <FormLabel>Original Amount</FormLabel>
            <div className="mt-2 text-2xl font-bold">{formatPHP(debt.original_amount_cents)}</div>
            <p className="text-sm text-muted-foreground mt-1">Original amount cannot be changed</p>
          </div>
        </fieldset>

        {/* Form actions */}
        <div className="flex justify-between">
          <Button
            type="button"
            variant="destructive"
            onClick={handleArchive}
            disabled={form.formState.isSubmitting || debt.status === "archived"}
          >
            <Archive className="mr-2 h-4 w-4" />
            Archive Debt
          </Button>

          <div className="flex gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={form.formState.isSubmitting}
              >
                Cancel
              </Button>
            )}

            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
```

**Verification**:

```tsx
import { EditExternalDebtForm } from "@/components/debts/forms/EditExternalDebtForm";

const mockDebt = {
  id: "1",
  name: "Car Loan",
  original_amount_cents: 100000,
  status: "active" as const,
  household_id: "h1",
  created_at: "2025-11-01",
  updated_at: "2025-11-01",
};

<EditExternalDebtForm
  debt={mockDebt}
  onSuccess={() => console.log("Updated")}
  onArchive={() => console.log("Archived")}
/>;
```

---

## Step 5: Create Internal Debt Form (25 min)

Form for creating internal debts (IOUs between users/accounts).

**File**: `src/components/debts/forms/CreateInternalDebtForm.tsx` (NEW)

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "./CurrencyInput";
import { createInternalDebt } from "@/lib/debts";
import { createInternalDebtSchema } from "@/lib/debts/validation";
import type { CreateInternalDebtFormData } from "@/lib/debts/validation";
import { toast } from "sonner";

interface CreateInternalDebtFormProps {
  householdId: string;
  /** Available users for selection */
  users: Array<{ id: string; name: string }>;
  /** Available accounts for selection */
  accounts: Array<{ id: string; name: string }>;
  onSuccess?: (debtId: string) => void;
  onCancel?: () => void;
}

/**
 * Form for creating internal debts (IOUs between users or accounts)
 *
 * Features:
 * - From/To entity selection (user or account)
 * - Validation: From ≠ To
 * - Currency input
 * - Optional description
 */
export function CreateInternalDebtForm({
  householdId,
  users,
  accounts,
  onSuccess,
  onCancel,
}: CreateInternalDebtFormProps) {
  const form = useForm<CreateInternalDebtFormData>({
    resolver: zodResolver(createInternalDebtSchema),
    defaultValues: {
      from_type: "user",
      from_id: "",
      to_type: "user",
      to_id: "",
      original_amount_cents: 0,
      description: "",
      household_id: householdId,
    },
  });

  const fromType = form.watch("from_type");
  const toType = form.watch("to_type");

  const onSubmit = async (data: CreateInternalDebtFormData) => {
    try {
      // Create internal debt
      const debt = await createInternalDebt(data);

      toast.success("Internal debt created successfully");
      onSuccess?.(debt.id);

      form.reset();
    } catch (error) {
      console.error("Failed to create internal debt:", error);
      toast.error("Failed to create internal debt. Please try again.");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <fieldset disabled={form.formState.isSubmitting} className="space-y-4">
          {/* From Type */}
          <FormField
            control={form.control}
            name="from_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Who Owes Money</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* From ID */}
          <FormField
            control={form.control}
            name="from_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{fromType === "user" ? "Select User" : "Select Account"}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${fromType}`} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(fromType === "user" ? users : accounts).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* To Type */}
          <FormField
            control={form.control}
            name="to_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Who Is Owed Money</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="account">Account</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* To ID */}
          <FormField
            control={form.control}
            name="to_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{toType === "user" ? "Select User" : "Select Account"}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${toType}`} />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {(toType === "user" ? users : accounts).map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Amount */}
          <FormField
            control={form.control}
            name="original_amount_cents"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <CurrencyInput
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    placeholder="₱0.00"
                  />
                </FormControl>
                <FormDescription>The amount owed</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="e.g., Dinner split, Borrowed money, etc."
                    rows={3}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={form.formState.isSubmitting}
            >
              Cancel
            </Button>
          )}

          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Internal Debt"
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

**Note**: You'll need to add lucide-react if not installed:

```bash
npm install lucide-react
```

**Verification**: See VERIFICATION.md for testing instructions.

---

## Step 6: Export Forms from Index (5 min)

**File**: `src/components/debts/forms/index.ts` (NEW)

```typescript
export { CreateExternalDebtForm } from "./CreateExternalDebtForm";
export { EditExternalDebtForm } from "./EditExternalDebtForm";
export { CreateInternalDebtForm } from "./CreateInternalDebtForm";
export { CurrencyInput } from "./CurrencyInput";
```

---

## Step 7: Create Form Tests (Optional - 15 min)

**File**: `src/components/debts/__tests__/CreateExternalDebtForm.test.tsx` (NEW)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateExternalDebtForm } from "../forms/CreateExternalDebtForm";

// Mock dependencies
vi.mock("@/lib/debts", () => ({
  createExternalDebt: vi.fn(),
}));

describe("CreateExternalDebtForm", () => {
  it("should render all form fields", () => {
    render(<CreateExternalDebtForm householdId="h1" />);

    expect(screen.getByLabelText(/debt name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/original amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create debt/i })).toBeInTheDocument();
  });

  it("should show validation errors for empty fields", async () => {
    render(<CreateExternalDebtForm householdId="h1" />);

    const submitButton = screen.getByRole("button", { name: /create debt/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/name is required/i)).toBeInTheDocument();
    });
  });

  it("should call onSuccess after successful submission", async () => {
    const handleSuccess = vi.fn();

    render(<CreateExternalDebtForm householdId="h1" onSuccess={handleSuccess} />);

    // Fill form
    fireEvent.change(screen.getByLabelText(/debt name/i), {
      target: { value: "Test Debt" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /create debt/i }));

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalled();
    });
  });
});
```

---

## Final Verification

Test all forms in a demo page:

```tsx
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CreateExternalDebtForm,
  EditExternalDebtForm,
  CreateInternalDebtForm,
} from "@/components/debts/forms";

export function FormsDemo() {
  return (
    <div className="container max-w-2xl py-8">
      <h1 className="text-3xl font-bold mb-6">Debt Forms Demo</h1>

      <Tabs defaultValue="create-external">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="create-external">Create External</TabsTrigger>
          <TabsTrigger value="edit-external">Edit External</TabsTrigger>
          <TabsTrigger value="create-internal">Create Internal</TabsTrigger>
        </TabsList>

        <TabsContent value="create-external" className="mt-6">
          <CreateExternalDebtForm
            householdId="h1"
            onSuccess={(id) => console.log("Created:", id)}
          />
        </TabsContent>

        <TabsContent value="edit-external" className="mt-6">
          <EditExternalDebtForm debt={mockDebt} onSuccess={() => console.log("Updated")} />
        </TabsContent>

        <TabsContent value="create-internal" className="mt-6">
          <CreateInternalDebtForm
            householdId="h1"
            users={mockUsers}
            accounts={mockAccounts}
            onSuccess={(id) => console.log("Created:", id)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

**Run verification**:

```bash
npm run dev
# Navigate to /debts/forms-demo
# Test each form:
# - Fill valid data → Should submit successfully
# - Leave fields empty → Should show validation errors
# - Enter invalid amounts → Should show range errors
# - Enter duplicate name → Should show uniqueness error
```

---

## ★ Insight ─────────────────────────────────────

**Type Safety Across Layers**: This implementation demonstrates **end-to-end type safety**:

1. **Zod Schema** defines runtime validation
2. **TypeScript Inference** (`z.infer<>`) creates TypeScript types from schema
3. **React Hook Form** uses inferred types for form data
4. **CRUD Functions** accept typed data

This means a single schema definition provides both runtime validation AND compile-time type checking.

**Async Validation Pattern**: Name uniqueness is checked **asynchronously** using a custom validation function, not in the Zod schema. This is intentional:

- Zod async validation blocks the entire form
- Custom validation runs only on blur/submit
- Better UX (doesn't check on every keystroke)

**Currency Input Abstraction**: The CurrencyInput component provides a **user-friendly abstraction** over cent storage:

- Users type "1500.50" (familiar format)
- Component stores 150050 (database format)
- Component displays "1500.50" (familiar format)

This separation of concerns ensures data integrity while maintaining good UX.

─────────────────────────────────────────────────

---

**Time check**: You should have completed D8 in ~1.5 hours.

**Next**: Chunk D9 - Transaction Form Integration
