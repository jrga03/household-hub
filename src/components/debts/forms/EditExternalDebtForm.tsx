import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updateDebtName, archiveDebt } from "@/lib/debts/crud";
import {
  editExternalDebtSchema,
  isDebtNameUnique,
  type EditExternalDebtFormData,
} from "@/lib/debts/validation";
import type { Debt } from "@/types/debt";
import { formatPHP } from "@/lib/currency";
import { toast } from "sonner";
import { reportError } from "@/lib/sentry";
import { useAuthStore } from "@/stores/authStore";

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
  const userId = useAuthStore((state) => state.user?.id);
  const form = useForm<EditExternalDebtFormData>({
    resolver: zodResolver(editExternalDebtSchema),
    defaultValues: {
      name: debt.name,
    },
  });

  const onSubmit = async (data: EditExternalDebtFormData) => {
    if (!userId) {
      toast.error("Sign in to save debts");
      return;
    }

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
      await updateDebtName(debt.id, "external", data.name.trim(), userId);

      toast.success("Debt updated successfully");
      onSuccess?.();
    } catch (error) {
      console.error("Failed to update debt:", error);
      reportError(error, { subsystem: "ui", operation: "update-external-debt" });
      toast.error("Failed to update debt. Please try again.");
    }
  };

  const handleArchive = async () => {
    if (!userId) {
      toast.error("Sign in to save debts");
      return;
    }

    try {
      await archiveDebt(debt.id, "external", userId);
      toast.success("Debt archived successfully");
      onArchive?.();
    } catch (error) {
      console.error("Failed to archive debt:", error);
      reportError(error, { subsystem: "ui", operation: "archive-external-debt" });
      toast.error("Failed to archive debt. Please try again.");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={(event) => void form.handleSubmit(onSubmit)(event)} className="space-y-6">
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
            onClick={() => void handleArchive()}
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
