import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useCreateTransfer } from "@/hooks/useTransfers";
import { toast } from "sonner";

const schema = z
  .object({
    from_account_id: z.string().min(1, "From account required"),
    to_account_id: z.string().min(1, "To account required"),
    amount_cents: z.number().min(1, "Amount must be positive"),
    date: z.string(),
    description: z.string().optional(),
  })
  .refine((data) => data.from_account_id !== data.to_account_id, {
    message: "Cannot transfer to same account",
    path: ["to_account_id"],
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
      date: new Date().toISOString().split("T")[0],
      amount_cents: 0,
    },
  });

  const onSubmit = async (data: FormData) => {
    try {
      // Find account names from accounts array
      const fromAccount = accounts.find((a) => a.id === data.from_account_id);
      const toAccount = accounts.find((a) => a.id === data.to_account_id);

      if (!fromAccount || !toAccount) {
        toast.error("Invalid account selection");
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
      toast.success("Transfer created successfully");
      form.reset({
        date: new Date().toISOString().split("T")[0],
        amount_cents: 0,
      });
      onSuccess?.();
    } catch (error) {
      toast.error("Failed to create transfer");
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
                {accounts.map((account) => (
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
                {accounts.map((account) => (
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

      <div>
        <label htmlFor="date" className="text-sm font-medium">
          Date
        </label>
        <Input id="date" type="date" {...form.register("date")} />
        {form.formState.errors.date && (
          <p className="text-sm text-destructive">{form.formState.errors.date.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="text-sm font-medium">
          Description (Optional)
        </label>
        <Input
          id="description"
          type="text"
          placeholder="e.g., Monthly savings"
          {...form.register("description")}
        />
      </div>

      <Button type="submit" disabled={createTransfer.isPending}>
        {createTransfer.isPending ? "Creating..." : "Create Transfer"}
      </Button>
    </form>
  );
}
