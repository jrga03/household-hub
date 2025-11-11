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
import { createExternalDebt } from "@/lib/debts/crud";
import {
  createExternalDebtSchema,
  isDebtNameUnique,
  type CreateExternalDebtFormData,
} from "@/lib/debts/validation";
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
