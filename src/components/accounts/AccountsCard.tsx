import { useActionState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SubmitButton } from "@/components/ui/submit-button";
import { useAccounts } from "@/hooks/useAccounts";
import { ACCOUNT_NAME_MAX_LENGTH, ACCOUNT_TYPES, type AccountType } from "@/lib/accounts/events";
import { createAccount, type Actor } from "@/lib/commands/accounts";
import { formatPHP, parsePHPSafe } from "@/lib/currency";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank account",
  cash: "Cash",
  e_wallet: "E-wallet",
  investment: "Investment",
};

export function AccountsCard({ actor }: { actor: Actor }) {
  const accounts = useAccounts();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounts</CardTitle>
        <CardDescription>Household accounts every member sees.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {accounts?.length === 0 && (
          <p className="text-sm text-muted-foreground">No accounts yet. Add the first one below.</p>
        )}
        {accounts && accounts.length > 0 && (
          <ul aria-label="Accounts" className="divide-y rounded-md border">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{account.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {ACCOUNT_TYPE_LABELS[account.type]}
                  </p>
                </div>
                <span className="shrink-0 tabular-nums">
                  {formatPHP(account.startingBalanceCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <AddAccountForm actor={actor} />
      </CardContent>
    </Card>
  );
}

function AddAccountForm({ actor }: { actor: Actor }) {
  const [state, addAction] = useActionState(
    async (_previous: { error: string | null }, formData: FormData) => {
      const startingBalance = parsePHPSafe(String(formData.get("startingBalance") ?? ""));
      if (!startingBalance.success) return { error: startingBalance.error.message };
      try {
        await createAccount(actor, {
          name: String(formData.get("name") ?? ""),
          type: String(formData.get("type") ?? ""),
          startingBalanceCents: startingBalance.value,
        });
        toast.success("Account added");
        return { error: null };
      } catch (error) {
        return { error: error instanceof Error ? error.message : "Couldn't add the account." };
      }
    },
    { error: null }
  );

  return (
    <form action={addAction} className="space-y-4" aria-label="Add an account">
      <div className="grid gap-4 @[480px]:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="account-name">Account name</Label>
          <Input
            id="account-name"
            name="name"
            required
            maxLength={ACCOUNT_NAME_MAX_LENGTH}
            placeholder="e.g. BDO Savings"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-type">Type</Label>
          <Select name="type" defaultValue="bank">
            <SelectTrigger id="account-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {ACCOUNT_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="account-starting-balance">Starting balance (₱)</Label>
          <Input
            id="account-starting-balance"
            name="startingBalance"
            inputMode="decimal"
            placeholder="0.00"
            autoComplete="off"
          />
        </div>
      </div>

      {state.error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <SubmitButton pendingText="Adding...">Add account</SubmitButton>
    </form>
  );
}
