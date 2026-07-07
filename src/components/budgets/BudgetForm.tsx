import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { CategorySelector } from "@/components/ui/category-selector";
import type { Budget } from "@/lib/supabaseQueries";

const budgetSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  // Cents, validated numerically; CurrencyInput handles parsing/formatting
  amount_cents: z
    .number()
    .int("Amount must be an integer")
    .min(1, "Amount must be between ₱0.01 and ₱9,999,999.99")
    .max(999999999, "Amount must be between ₱0.01 and ₱9,999,999.99"),
});

type BudgetFormData = z.infer<typeof budgetSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { categoryId: string; amountCents: number }) => void;
  existingBudget?: Budget;
}

export function BudgetForm({ open, onClose, onSubmit, existingBudget }: Props) {
  const form = useForm<BudgetFormData>({
    resolver: zodResolver(budgetSchema),
    defaultValues: {
      categoryId: existingBudget?.categoryId || "",
      amount_cents: existingBudget?.budgetAmountCents ?? 0,
    },
  });

  // Load the edited budget's values when the dialog opens (the component
  // stays mounted between opens, so mount-time defaults are stale) and
  // clear the form when it closes.
  useEffect(() => {
    if (open) {
      form.reset({
        categoryId: existingBudget?.categoryId || "",
        amount_cents: existingBudget?.budgetAmountCents ?? 0,
      });
    } else {
      form.reset({
        categoryId: "",
        amount_cents: 0,
      });
    }
  }, [open, existingBudget, form]);

  const handleSubmit = (data: BudgetFormData) => {
    onSubmit({
      categoryId: data.categoryId,
      amountCents: data.amount_cents,
    });

    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existingBudget ? "Edit Budget" : "Create Budget"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            {/* Category */}
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <FormControl>
                    <CategorySelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!!existingBudget} // Can't change category when editing
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount_cents"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Amount</FormLabel>
                  <FormControl>
                    <CurrencyInput {...field} placeholder="1,500.00" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">{existingBudget ? "Update" : "Create"}</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
