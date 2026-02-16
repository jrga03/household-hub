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
import { createInternalDebt } from "@/lib/debts/crud";
import { createInternalDebtSchema, type CreateInternalDebtFormData } from "@/lib/debts/validation";
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
      // Generate name for internal debt
      const fromEntity =
        fromType === "user"
          ? users.find((u) => u.id === data.from_id)
          : accounts.find((a) => a.id === data.from_id);
      const toEntity =
        toType === "user"
          ? users.find((u) => u.id === data.to_id)
          : accounts.find((a) => a.id === data.to_id);

      const debtName = `IOU: ${fromEntity?.name || "Unknown"} → ${toEntity?.name || "Unknown"}`;

      // Create internal debt with generated name
      const debtData = {
        ...data,
        name: debtName,
        from_type: (data.from_type === "user" ? "member" : "account") as "member" | "account",
        to_type: (data.to_type === "user" ? "member" : "account") as "member" | "account",
        from_display_name: fromEntity?.name,
        to_display_name: toEntity?.name,
      };

      const debt = await createInternalDebt(debtData);

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
