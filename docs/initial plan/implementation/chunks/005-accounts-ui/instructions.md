# Instructions: Accounts UI

Follow these steps in order. Estimated time: 120 minutes.

---

## Step 1: Create Currency Utilities (15 min)

Create `src/lib/currency.ts`:

```typescript
const MAX_AMOUNT_CENTS = 999999999; // PHP 9,999,999.99

/**
 * Converts integer cents to formatted PHP display string
 * @param cents - Amount in cents (e.g., 150050 for ₱1,500.50)
 * @returns Formatted string (e.g., "₱1,500.50")
 */
export function formatPHP(cents: number): string {
  if (cents === 0) return "₱0.00";

  const isNegative = cents < 0;
  const absoluteCents = Math.abs(cents);
  const pesos = Math.floor(absoluteCents / 100);
  const centavos = absoluteCents % 100;

  const formattedPesos = pesos.toLocaleString("en-PH");
  const formattedCentavos = centavos.toString().padStart(2, "0");

  return `${isNegative ? "-" : ""}₱${formattedPesos}.${formattedCentavos}`;
}

/**
 * Converts user input to integer cents
 * @param input - String like "1,500.50" or "₱1,500.50" or number
 * @returns Amount in cents (150050)
 */
export function parsePHP(input: string | number): number {
  if (typeof input === "number") {
    return Math.round(input * 100);
  }

  if (!input || typeof input !== "string") {
    return 0;
  }

  // Remove currency symbol, commas, and whitespace
  const cleaned = input.replace(/[₱,\s]/g, "");

  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    return 0;
  }

  const cents = Math.round(parsed * 100);

  if (cents < 0 || cents > MAX_AMOUNT_CENTS) {
    throw new Error(`Amount out of range: ${cents} cents`);
  }

  return cents;
}

/**
 * Validates amount is within safe range
 */
export function validateAmount(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0 && cents <= MAX_AMOUNT_CENTS;
}
```

**Verify**: No TypeScript errors

---

## Step 2: Create Supabase Query Hooks (20 min)

Create `src/lib/supabaseQueries.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { Account, AccountInsert, AccountUpdate } from "@/types/accounts";

// Fetch all accounts
export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data as Account[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Create account
export function useCreateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (account: AccountInsert) => {
      const { data, error } = await supabase.from("accounts").insert(account).select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Update account
export function useUpdateAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: AccountUpdate }) => {
      const { data, error } = await supabase
        .from("accounts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}

// Archive account (soft delete)
export function useArchiveAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("accounts").update({ is_active: false }).eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
```

---

## Step 3: Setup TanStack Query Provider (5 min)

Update `src/main.tsx`:

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { AuthProvider } from "@/components/AuthProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Create query client
const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
```

---

## Step 4: Create Accounts Route (15 min)

Create `src/routes/accounts.tsx`:

```typescript
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { useEffect, useState } from "react";
import { useAccounts, useArchiveAccount } from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Archive } from "lucide-react";

export const Route = createFileRoute("/accounts")({
  component: Accounts,
});

function Accounts() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const { data: accounts, isLoading } = useAccounts();
  const archiveAccount = useArchiveAccount();

  useEffect(() => {
    if (!user) {
      navigate({ to: "/login" });
    }
  }, [user, navigate]);

  if (!user) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="mt-4 text-sm text-muted-foreground">Loading accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <h1 className="text-xl font-bold">Accounts</h1>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="container mx-auto px-4 py-8">
        {accounts && accounts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No accounts yet. Create your first account!</p>
            <Button onClick={() => setIsFormOpen(true)} className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Create Account
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts?.map((account) => (
              <div
                key={account.id}
                className="rounded-lg border p-6"
                style={{ borderLeftWidth: "4px", borderLeftColor: account.color }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{account.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">
                      {account.type.replace("_", " ")} •{" "}
                      {account.visibility === "household" ? "Household" : "Personal"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(account.id);
                        setIsFormOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Archive "${account.name}"?`)) {
                          archiveAccount.mutate(account.id);
                        }
                      }}
                    >
                      <Archive className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4">
                  <p className="text-2xl font-bold">
                    {formatPHP(account.initial_balance_cents)}
                  </p>
                  <p className="text-xs text-muted-foreground">Initial Balance</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Account Form Dialog - TODO: Create this component */}
        {/* <AccountFormDialog
          open={isFormOpen}
          onClose={() => { setIsFormOpen(false); setEditingId(null); }}
          editingId={editingId}
        /> */}
      </main>
    </div>
  );
}
```

---

## Step 5: Create Account Form (30 min)

Install form dependencies:

```bash
npx shadcn-ui@latest add dialog
npx shadcn-ui@latest add select
npx shadcn-ui@latest add label
```

Create `src/components/AccountFormDialog.tsx`:

```typescript
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { parsePHP, formatPHP } from "@/lib/currency";
import { useAuthStore } from "@/stores/authStore";
import { AccountType, AccountVisibility } from "@/types/accounts";

const accountSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  type: z.enum(["bank", "investment", "credit_card", "cash", "e-wallet"]),
  initial_balance: z.string(),
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

  // Load existing account data when editing
  useEffect(() => {
    if (editingId && accounts) {
      const account = accounts.find((a) => a.id === editingId);
      if (account) {
        form.reset({
          name: account.name,
          type: account.type as AccountType,
          initial_balance: formatPHP(account.initial_balance_cents).replace("₱", "").replace(",", ""),
          visibility: account.visibility as AccountVisibility,
          color: account.color,
          icon: account.icon,
        });
      }
    }
  }, [editingId, accounts, form]);

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
      };

      if (editingId) {
        await updateAccount.mutateAsync({
          id: editingId,
          updates: accountData,
        });
      } else {
        await createAccount.mutateAsync(accountData);
      }

      form.reset();
      onClose();
    } catch (error) {
      console.error("Failed to save account:", error);
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
            <Input
              id="name"
              {...form.register("name")}
              placeholder="e.g., BPI Savings"
            />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive mt-1">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>

          {/* Type */}
          <div>
            <Label htmlFor="type">Account Type</Label>
            <Select
              value={form.watch("type")}
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
              value={form.watch("visibility")}
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
                    form.watch("color") === color.value
                      ? "border-primary"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: color.value }}
                  title={color.label}
                />
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Saving..."
                : editingId
                ? "Update"
                : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Step 6: Wire Form to Accounts Page (5 min)

Update `src/routes/accounts.tsx` to uncomment and use the form:

```typescript
// Add import
import { AccountFormDialog } from "@/components/AccountFormDialog";

// Then uncomment the form component at the bottom:
<AccountFormDialog
  open={isFormOpen}
  onClose={() => {
    setIsFormOpen(false);
    setEditingId(null);
  }}
  editingId={editingId}
/>
```

---

## Step 7: Add Accounts Link to Dashboard (5 min)

Update `src/routes/dashboard.tsx`:

```typescript
// Update the Accounts card
<div className="rounded-lg border p-6">
  <h3 className="font-semibold">Accounts</h3>
  <p className="mt-2 text-sm text-muted-foreground">
    Manage your bank accounts and balances
  </p>
  <Link
    to="/accounts"
    className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
  >
    View Accounts →
  </Link>
</div>
```

---

## Step 8: Test Full Flow (15 min)

```bash
npm run dev
```

1. **Login** → Should redirect to dashboard
2. **Click "View Accounts →"** → Should navigate to /accounts
3. **See test accounts** → 3 household accounts from seed data
4. **Click "Add Account"** → Form dialog opens
5. **Fill form**:
   - Name: "Test Checking"
   - Type: Bank Account
   - Balance: 5000.50
   - Visibility: Household
   - Pick blue color
6. **Submit** → Account appears in list
7. **Click Edit** → Form opens with existing data
8. **Change name** → "Test Checking Updated"
9. **Submit** → Name updates in list
10. **Click Archive** → Confirm → Account disappears

---

## Step 9: Add Balance Calculations (Optional - 10 min)

For now, accounts show only `initial_balance_cents`. In chunk 007 (transactions), we'll calculate current balance.

Create placeholder in `src/lib/supabaseQueries.ts`:

```typescript
// TODO (Chunk 007): Calculate current balance from transactions
export function useAccountBalance(accountId: string) {
  return useQuery({
    queryKey: ["accountBalance", accountId],
    queryFn: async () => {
      // For now, just return initial balance
      const { data: account } = await supabase
        .from("accounts")
        .select("initial_balance_cents")
        .eq("id", accountId)
        .single();

      return account?.initial_balance_cents || 0;
    },
  });
}
```

---

## Step 10: Add Navigation Header (5 min)

Update dashboard header to show on all authenticated routes.

Create `src/components/Header.tsx`:

```typescript
import { Link } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";

export function Header() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  return (
    <header className="border-b">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="text-xl font-bold hover:text-primary">
            Household Hub
          </Link>
          <nav className="flex gap-4">
            <Link
              to="/accounts"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Accounts
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="outline" size="sm" onClick={signOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
```

Use it in accounts and dashboard routes.

---

## Done!

When you can create, view, edit, and archive accounts with proper PHP formatting, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**TanStack Query Cache**:

- Accounts cached for 5 minutes
- Invalidated after create/update/delete
- Refetches automatically when stale

**Form Validation**:

- Name required (max 100 chars)
- Type must be valid enum
- Balance must be valid number
- Color must be valid hex

**Currency Input**:

- Accepts: "1500", "1,500", "1500.50", "₱1,500.50"
- Stores: 150050 (cents)
- Displays: ₱1,500.50

**Soft Delete**:

- Archive sets `is_active = false`
- Doesn't actually delete row
- Preserves transaction history (chunk 007)
