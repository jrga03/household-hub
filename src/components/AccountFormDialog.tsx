import { useEffect } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { ColorPicker } from "@/components/ui/color-picker";
import { useCreateAccount, useUpdateAccount, useAccounts } from "@/lib/supabaseQueries";
import { useAuthStore } from "@/stores/authStore";
import { AccountType, AccountVisibility } from "@/types/accounts";
import { toast } from "sonner";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["bank", "investment", "credit_card", "cash", "e-wallet"]),
  // Cents, validated numerically; CurrencyInput handles parsing/formatting
  initial_balance_cents: z
    .number()
    .int("Amount must be an integer")
    .min(0, "Amount must be between ₱0.00 and ₱9,999,999.99")
    .max(999999999, "Amount must be between ₱0.00 and ₱9,999,999.99"),
  visibility: z.enum(["household", "personal"]),
  color: z.string().regex(/^#[0-9A-F]{6}$/i, "Invalid color"),
  icon: z.string().min(1),
});

type AccountFormData = z.infer<typeof accountSchema>;

interface Props {
  open: boolean;
  onClose: () => void;
  editingId?: string | null;
}

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "bank", label: "Bank Account" },
  { value: "credit_card", label: "Credit Card" },
  { value: "cash", label: "Cash" },
  { value: "e-wallet", label: "E-Wallet" },
  { value: "investment", label: "Investment" },
];

export function AccountFormDialog({ open, onClose, editingId }: Props) {
  const user = useAuthStore((state) => state.user);
  const { data: accounts } = useAccounts();
  const createAccount = useCreateAccount();
  const updateAccount = useUpdateAccount();

  const form = useForm<AccountFormData>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      type: "bank",
      initial_balance_cents: 0,
      visibility: "household",
      color: "#3B82F6",
      icon: "building-2",
    },
  });

  // Watch form values using useWatch (React Compiler compatible)
  const type = useWatch({ control: form.control, name: "type" });
  const visibility = useWatch({ control: form.control, name: "visibility" });
  const selectedColor = useWatch({ control: form.control, name: "color" });

  // Load existing account data when editing
  useEffect(() => {
    if (editingId && accounts) {
      const account = accounts.find((a) => a.id === editingId);
      if (account) {
        form.reset({
          name: account.name,
          type: account.type as AccountType,
          initial_balance_cents: account.initial_balance_cents ?? 0,
          visibility: account.visibility as AccountVisibility,
          color: account.color ?? "#3B82F6",
          icon: account.icon ?? "building-2",
        });
      }
    }
  }, [editingId, accounts, form]);

  const onSubmit = async (data: AccountFormData) => {
    try {
      const accountData = {
        name: data.name,
        type: data.type,
        initial_balance_cents: data.initial_balance_cents,
        visibility: data.visibility,
        color: data.color,
        icon: data.icon,
        owner_user_id: data.visibility === "personal" ? user?.id : null,
        // Set sort_order to end of list when creating
        ...(editingId ? {} : { sort_order: accounts?.length ?? 0 }),
      };

      if (editingId) {
        await updateAccount.mutateAsync({
          id: editingId,
          updates: accountData,
        });
        toast.success("Account updated");
      } else {
        await createAccount.mutateAsync(accountData);
        toast.success("Account created");
      }

      form.reset();
      onClose();
    } catch (error) {
      console.error("Failed to save account:", error);

      // Extract error message from Supabase error or use generic message
      const message =
        error instanceof Error ? error.message : "Failed to save account. Please try again.";

      toast.error(message);

      // Set form error for inline display
      form.setError("root", {
        message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Account" : "Create Account"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div>
            <Label htmlFor="name">Account Name</Label>
            <Input id="name" {...form.register("name")} placeholder="e.g., BPI Savings" />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>

          {/* Type */}
          <div>
            <Label htmlFor="type">Account Type</Label>
            <Select
              value={type}
              onValueChange={(value) => form.setValue("type", value as AccountType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Initial Balance */}
          <div>
            <Label htmlFor="initial_balance">Initial Balance (PHP)</Label>
            <Controller
              name="initial_balance_cents"
              control={form.control}
              render={({ field, fieldState }) => (
                <CurrencyInput id="initial_balance" {...field} error={fieldState.error?.message} />
              )}
            />
          </div>

          {/* Visibility */}
          <div>
            <Label htmlFor="visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(value) => form.setValue("visibility", value as AccountVisibility)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="household">Household (Visible to all)</SelectItem>
                <SelectItem value="personal">Personal (Only you)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color: shared picker (44px touch targets) instead of inline swatches */}
          <div>
            <Label>Color</Label>
            <div className="mt-2">
              <ColorPicker
                value={selectedColor}
                onChange={(color) => form.setValue("color", color)}
              />
            </div>
          </div>

          {/* Root Error */}
          {form.formState.errors.root && (
            <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
