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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/ui/category-selector";
import { parsePHP, formatPHP } from "@/lib/currency";
import type { Budget } from "@/lib/supabaseQueries";

const MAX_AMOUNT_CENTS = 999999999;

const budgetSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  amount: z.string().min(1, "Amount is required"),
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
      amount: existingBudget ? formatPHP(existingBudget.budgetAmountCents).replace("₱", "") : "",
    },
  });

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset({
        categoryId: "",
        amount: "",
      });
    }
  }, [open, form]);

  const handleSubmit = (data: BudgetFormData) => {
    try {
      const amountCents = parsePHP(data.amount);

      if (amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
        form.setError("amount", {
          message: "Amount must be between ₱0.01 and ₱9,999,999.99",
        });
        return;
      }

      onSubmit({
        categoryId: data.categoryId,
        amountCents,
      });

      form.reset();
      onClose();
    } catch {
      form.setError("amount", {
        message: "Invalid amount format",
      });
    }
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
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Amount</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground">₱</span>
                      <Input {...field} type="text" placeholder="1,500.00" className="pl-7" />
                    </div>
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
