import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { useCreateAccount, useUpdateAccount, useAccounts } from "@/lib/supabaseQueries";
import { parsePHP, formatPHP, validateAmount } from "@/lib/currency";
import { useAuthStore } from "@/stores/authStore";
import { AccountType, AccountVisibility } from "@/types/accounts";
import { toast } from "sonner";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["bank", "investment", "credit_card", "cash", "e-wallet"]),
  initial_balance: z.string().refine(
    (val) => {
      try {
        const cents = parsePHP(val);
        return validateAmount(cents);
      } catch {
        return false;
      }
    },
    {
      message: "Amount must be between ₱0.00 and ₱9,999,999.99",
    }
  ),
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

const COLORS = [
  { value: "#3B82F6", label: "Blue" },
  { value: "#10B981", label: "Green" },
  { value: "#EF4444", label: "Red" },
  { value: "#F59E0B", label: "Amber" },
  { value: "#8B5CF6", label: "Purple" },
  { value: "#EC4899", label: "Pink" },
  { value: "#6B7280", label: "Gray" },
  { value: "#14B8A6", label: "Teal" },
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
      initial_balance: "0.00",
      visibility: "household",
      color: "#3B82F6",
      icon: "building-2",
    },
  });

  // Watch form values once for efficiency
  const { type, visibility, color: selectedColor } = form.watch();

  // Load existing account data when editing
  useEffect(() => {
    if (editingId && accounts) {
      const account = accounts.find((a) => a.id === editingId);
      if (account) {
        form.reset({
          name: account.name,
          type: account.type as AccountType,
          initial_balance: formatPHP(account.initial_balance_cents ?? 0)
            .replace("₱", "")
            .replace(/,/g, ""),
          visibility: account.visibility as AccountVisibility,
          color: account.color ?? "#3B82F6",
          icon: account.icon ?? "building-2",
        });
      }
    }
  }, [editingId, accounts]);

  const onSubmit = async (data: AccountFormData) => {
    try {
      const accountData = {
        name: data.name,
        type: data.type,
        initial_balance_cents: parsePHP(data.initial_balance),
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
              <SelectTrigger>
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
            <Input
              id="initial_balance"
              {...form.register("initial_balance")}
              placeholder="0.00"
              type="text"
            />
            {form.formState.errors.initial_balance && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.initial_balance.message}
              </p>
            )}
          </div>

          {/* Visibility */}
          <div>
            <Label htmlFor="visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(value) => form.setValue("visibility", value as AccountVisibility)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="household">Household (Visible to all)</SelectItem>
                <SelectItem value="personal">Personal (Only you)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Color */}
          <div>
            <Label>Color</Label>
            <div className="flex gap-2 mt-2">
              {COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => form.setValue("color", color.value)}
                  className={`w-8 h-8 rounded-full border-2 ${
                    selectedColor === color.value ? "border-primary" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                  aria-label={`Select ${color.label} color`}
                />
              ))}
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
