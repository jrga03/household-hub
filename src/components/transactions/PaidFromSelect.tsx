import { useState } from "react";
import { Button } from "@/components/app/Button";
import { Field } from "@/components/app/Field";
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
import { cn } from "@/lib/utils";

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

/** Labelled by `id`'s label, or named "Paid from" when it has none. */
export function PaidFromSelect({
  card,
  value,
  name,
  placeholder,
  onChange,
  ...control
}: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  card: AccountRow | undefined;
  value: string | undefined;
  name?: string;
  placeholder?: string;
  onChange: (accountId: string) => void;
}) {
  const { choices, usualId } = usePaidFrom(card);
  return (
    <Select name={name} value={value} onValueChange={onChange}>
      <SelectTrigger
        {...control}
        aria-label={control.id ? undefined : "Paid from"}
        className="w-full"
      >
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

/**
 * "<account> (usual) · Change"; Change swaps in the select, and a choice swaps back.
 * `labelled` reads "Paid from <account>" and labels the select; otherwise a term beside it names it.
 */
export function PaidFromToggle({
  card,
  value,
  labelled,
  onChange,
}: {
  card: AccountRow | undefined;
  value: string | null;
  labelled: boolean;
  onChange: (accountId: string) => void;
}) {
  const { usualId, nameOf } = usePaidFrom(card);
  const [changing, setChanging] = useState(false);
  const choose = (accountId: string) => {
    onChange(accountId);
    setChanging(false);
  };
  if (changing) {
    return labelled ? (
      <Field label="Paid from">
        {(control) => (
          <PaidFromSelect {...control} card={card} value={value ?? undefined} onChange={choose} />
        )}
      </Field>
    ) : (
      <PaidFromSelect card={card} value={value ?? undefined} onChange={choose} />
    );
  }
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span>
        {labelled && "Paid from "}
        {nameOf(value)}
        {value === usualId && <span className="text-muted-foreground"> (usual)</span>}
      </span>
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
    </span>
  );
}

/** The edit form's line under Account for a card transaction. */
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
  return (
    <div className={cn("text-body text-muted-foreground", className)}>
      {value !== null && <input type="hidden" name="payingAccountId" value={value} />}
      <PaidFromToggle card={card} value={value} labelled onChange={onChange} />
    </div>
  );
}
