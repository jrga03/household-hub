import { useState } from "react";
import { Button } from "@/components/app/Button";
import { Label } from "@/components/app/Label";
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

/** The edit form's line under Account for a card transaction: "Paid from <account> (usual) · Change". */
export function PaidFromLine({
  card,
  value,
  onChange,
  className,
}: {
  card: AccountRow;
  value: string | null;
  onChange: (accountId: string) => void;
  className?: string;
}) {
  const { usualId, nameOf } = usePaidFrom(card);
  const [changing, setChanging] = useState(false);
  return (
    <div className={className}>
      {value !== null && <input type="hidden" name="payingAccountId" value={value} />}
      {changing ? (
        <div className="space-y-2">
          <Label htmlFor="transaction-paid-from">Paid from</Label>
          <PaidFromSelect
            id="transaction-paid-from"
            card={card}
            value={value ?? undefined}
            onChange={(accountId) => {
              onChange(accountId);
              setChanging(false);
            }}
          />
        </div>
      ) : (
        <p className="flex items-center gap-1 text-body text-muted-foreground">
          Paid from {nameOf(value)}
          {value === usualId && " (usual)"}
          <span aria-hidden>·</span>
          <Button
            type="button"
            size="sm"
            variant="link"
            className="h-auto p-0"
            onClick={() => setChanging(true)}
          >
            Change
          </Button>
        </p>
      )}
    </div>
  );
}
