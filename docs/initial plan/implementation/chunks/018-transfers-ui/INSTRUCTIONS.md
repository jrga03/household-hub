# Instructions: Transfers UI

Follow these steps in order. Estimated time: 1 hour.

---

## Step 1: Create Transfer Hook (15 min)

Create `src/hooks/useTransfers.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { v4 as uuid } from "uuid";
import { getDeviceId } from "@/lib/device";

export function useCreateTransfer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      from_account_id,
      to_account_id,
      from_account_name,
      to_account_name,
      amount_cents,
      date,
      description,
      household_id,
      user_id,
    }: {
      from_account_id: string;
      to_account_id: string;
      from_account_name: string;
      to_account_name: string;
      amount_cents: number;
      date: string;
      description: string;
      household_id: string;
      user_id: string;
    }) => {
      const transfer_group_id = uuid();
      const device_id = await getDeviceId(); // Use hybrid device ID strategy

      // Create expense (from account)
      const { error: expenseError } = await supabase.from("transactions").insert({
        household_id,
        account_id: from_account_id,
        date,
        description: `Transfer to ${to_account_name}`,
        amount_cents,
        type: "expense",
        transfer_group_id,
        created_by_user_id: user_id,
        device_id,
      });

      if (expenseError) throw expenseError;

      // Create income (to account)
      const { error: incomeError } = await supabase.from("transactions").insert({
        household_id,
        account_id: to_account_id,
        date,
        description: `Transfer from ${from_account_name}`,
        amount_cents,
        type: "income",
        transfer_group_id,
        created_by_user_id: user_id,
        device_id,
      });

      if (incomeError) throw incomeError;

      return { transfer_group_id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transfers"] });
    },
  });
}

// NOTE: Transaction Atomicity
// This implementation uses sequential inserts without explicit transaction wrapping.
// The database triggers from chunk 017 (handle_transfer_deletion) will clean up
// orphaned transactions if the second insert fails by setting transfer_group_id to NULL.
//
// For production enhancement, consider:
// - Option A: PostgreSQL function with BEGIN/COMMIT transaction wrapper
// - Option B: Supabase RPC function that atomically creates both transactions
//
// Current approach is acceptable for MVP as database triggers provide eventual consistency.

export function useTransfers(householdId: string) {
  return useQuery({
    queryKey: ["transfers", householdId],
    queryFn: async () => {
      // Query pattern matches DATABASE.md lines 522-535
      // Fetch expense side with "from" account details
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `
          *,
          from_account:accounts!transactions_account_id_fkey(id, name)
        `
        )
        .eq("household_id", householdId)
        .not("transfer_group_id", "is", null)
        .eq("type", "expense") // Only show expense side
        .order("date", { ascending: false });

      if (error) throw error;

      // For each transfer, fetch the paired transaction to get destination account
      const transfersWithPairs = await Promise.all(
        (data || []).map(async (transfer) => {
          const { data: paired } = await supabase
            .from("transactions")
            .select(
              `
              id,
              account_id,
              to_account:accounts!transactions_account_id_fkey(id, name)
            `
            )
            .eq("transfer_group_id", transfer.transfer_group_id)
            .eq("type", "income")
            .single();

          return {
            ...transfer,
            from_account_name: transfer.from_account?.name || "Unknown",
            to_account_name: paired?.to_account?.name || "Unknown",
          };
        })
      );

      return transfersWithPairs;
    },
  });
}
```

---

## Step 2: Create Transfer Form (20 min)

Create `src/components/transfers/TransferForm.tsx`:

```typescript
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateTransfer } from '@/hooks/useTransfers';
import { toast } from 'sonner';

const schema = z.object({
  from_account_id: z.string().min(1, 'From account required'),
  to_account_id: z.string().min(1, 'To account required'),
  amount_cents: z.number().min(1, 'Amount must be positive'),
  date: z.string(),
  description: z.string().optional(),
}).refine(data => data.from_account_id !== data.to_account_id, {
  message: 'Cannot transfer to same account',
  path: ['to_account_id'],
});

type FormData = z.infer<typeof schema>;

export function TransferForm({
  accounts,
  householdId,
  userId,
  onSuccess,
}: {
  accounts: Array<{ id: string; name: string }>;
  householdId: string;
  userId: string;
  onSuccess?: () => void;
}) {
  const createTransfer = useCreateTransfer();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: new Date().toISOString().split('T')[0],
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      // Find account names from accounts array
      const fromAccount = accounts.find(a => a.id === data.from_account_id);
      const toAccount = accounts.find(a => a.id === data.to_account_id);

      if (!fromAccount || !toAccount) {
        toast.error('Invalid account selection');
        return;
      }

      await createTransfer.mutateAsync({
        ...data,
        from_account_name: fromAccount.name,
        to_account_name: toAccount.name,
        description: data.description || `Transfer between accounts`,
        household_id: householdId,
        user_id: userId,
      });
      toast.success('Transfer created successfully');
      form.reset();
      onSuccess?.();
    } catch (error) {
      toast.error('Failed to create transfer');
      console.error(error);
    }
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <Controller
        name="from_account_id"
        control={form.control}
        render={({ field, fieldState }) => (
          <div>
            <label className="text-sm font-medium">From Account</label>
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.error && (
              <p className="text-sm text-destructive">{fieldState.error.message}</p>
            )}
          </div>
        )}
      />

      <Controller
        name="to_account_id"
        control={form.control}
        render={({ field, fieldState }) => (
          <div>
            <label className="text-sm font-medium">To Account</label>
            <Select onValueChange={field.onChange} value={field.value}>
              <SelectTrigger>
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.error && (
              <p className="text-sm text-destructive">{fieldState.error.message}</p>
            )}
          </div>
        )}
      />

      <Controller
        name="amount_cents"
        control={form.control}
        render={({ field, fieldState }) => (
          <div>
            <label className="text-sm font-medium">Amount</label>
            <CurrencyInput {...field} error={fieldState.error?.message} />
          </div>
        )}
      />

      <Button type="submit" disabled={createTransfer.isPending}>
        Create Transfer
      </Button>
    </form>
  );
}
```

---

## Step 3: Create Transfer List (15 min)

Create `src/components/transfers/TransferList.tsx`:

```typescript
import { Card, CardContent } from '@/components/ui/card';
import { formatPHP } from '@/lib/currency';
import { ArrowRight } from 'lucide-react';
import { useTransfers } from '@/hooks/useTransfers';

export function TransferList({ householdId }: { householdId: string }) {
  const { data: transfers, isLoading } = useTransfers(householdId);

  if (isLoading) return <div>Loading transfers...</div>;

  if (!transfers || transfers.length === 0) {
    return <div>No transfers found</div>;
  }

  return (
    <div className="space-y-2">
      {transfers.map(transfer => (
        <Card key={transfer.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <span className="font-medium">{transfer.from_account_name}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{transfer.to_account_name}</span>
            </div>
            <div className="text-right">
              <div className="font-bold">{formatPHP(transfer.amount_cents)}</div>
              <div className="text-sm text-muted-foreground">
                {new Date(transfer.date).toLocaleDateString()}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

---

## Step 4: Create Transfers Route (10 min)

Create `src/routes/transfers.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router';
import { TransferForm } from '@/components/transfers/TransferForm';
import { TransferList } from '@/components/transfers/TransferList';

export const Route = createFileRoute('/transfers')({
  component: TransfersPage,
});

function TransfersPage() {
  const householdId = '00000000-0000-0000-0000-000000000001';

  return (
    <div className="container mx-auto max-w-2xl py-8 space-y-8">
      <h1 className="text-3xl font-bold">Transfers</h1>

      <div>
        <h2 className="text-xl font-semibold mb-4">Create Transfer</h2>
        <TransferForm
          accounts={[]} // TODO: Fetch from accounts hook
          householdId={householdId}
          userId="user-id" // TODO: Get from auth
        />
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Transfers</h2>
        <TransferList householdId={householdId} />
      </div>
    </div>
  );
}
```

---

## Done!

**Next**: Run through `CHECKPOINT.md` to verify transfers work correctly.
