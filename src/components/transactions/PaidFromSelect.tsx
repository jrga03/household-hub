import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import { useAllAccounts } from "@/hooks/useAccounts";
import { payingAccountChoices } from "@/lib/accounts/paying-account";
import type { AccountRow } from "@/lib/accounts/projection";

/** The accounts that can pay a card line (Paid from), its usual Paying Account, and account names. */
export function usePaidFrom(card: AccountRow | undefined) {
  const accounts = useAllAccounts();
  return {
    choices: card && accounts ? payingAccountChoices(accounts.list, card) : [],
    usualId: card?.payingAccountId ?? null,
    // Blank for the frame before the accounts load.
    nameOf: (accountId: string | null) =>
      accounts
        ? ((accountId === null ? undefined : accounts.byId.get(accountId)?.name) ?? "No account")
        : "",
  };
}

/** Labelled by `id`'s `<Label>`, or named "Paid from" when it has none. */
export function PaidFromSelect({
  id,
  card,
  value,
  placeholder,
  onChange,
}: {
  id?: string;
  card: AccountRow | undefined;
  value: string | undefined;
  placeholder?: string;
  onChange: (accountId: string) => void;
}) {
  const { choices, usualId } = usePaidFrom(card);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={id ? undefined : "Paid from"} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {choices.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            {account.name}
            {account.id === usualId && " (usual)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
