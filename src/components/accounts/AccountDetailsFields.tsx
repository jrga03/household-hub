import { useState } from "react";
import { CurrencyInput } from "@/components/app/CurrencyInput";
import { Field } from "@/components/app/Field";
import { Input } from "@/components/app/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/app/Select";
import { useAccounts } from "@/hooks/useAccounts";
import {
  ACCOUNT_NAME_MAX_LENGTH,
  CREDIT_CARD,
  isAccountType,
  type AccountDetails,
  type AccountType,
} from "@/lib/accounts/events";
import { payingAccountChoices } from "@/lib/accounts/paying-account";
import type { AccountDetailsInput } from "@/lib/commands/accounts";
import { parsePHPSafe, PESO_SIGN, type Cents } from "@/lib/currency";
import { VISIBILITY_LABELS, type Ownership } from "@/lib/events/ownership";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank account",
  cash: "Cash",
  e_wallet: "E-wallet",
  investment: "Investment",
  credit_card: "Credit card",
};

/**
 * Name, type, starting balance and a card's Paying Account, shared by the add
 * and edit forms. `types` lists the types the account may take; a single type
 * is shown, not chosen.
 */
export function AccountDetailsFields({
  types,
  ownership,
  defaults,
  startingBalanceError,
}: {
  types: readonly AccountType[];
  ownership: Ownership;
  defaults?: AccountDetails;
  startingBalanceError?: string;
}) {
  const [type, setType] = useState(defaults?.type ?? types[0]);
  const [startingBalance, setStartingBalance] = useState<Cents | undefined>(
    defaults?.startingBalanceCents
  );
  const isCard = type === CREDIT_CARD;

  return (
    <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
      <Field label="Account name">
        <Input
          name="name"
          required
          maxLength={ACCOUNT_NAME_MAX_LENGTH}
          placeholder="e.g. BDO Savings"
          autoComplete="off"
          enterKeyHint="next"
          defaultValue={defaults?.name}
        />
      </Field>
      {types.length === 1 ? (
        <Field label="Type">
          <Input readOnly value={types[0] ? ACCOUNT_TYPE_LABELS[types[0]] : ""} />
        </Field>
      ) : (
        <Field label="Type">
          {(control) => (
            <Select
              name="type"
              value={type}
              onValueChange={(value) => isAccountType(value) && setType(value)}
            >
              <SelectTrigger {...control} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ACCOUNT_TYPE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
      {types.length === 1 && <input type="hidden" name="type" value={type ?? ""} />}
      <Field
        label={`${isCard ? "Starting amount owed" : "Starting balance"} (${PESO_SIGN})`}
        error={startingBalanceError}
      >
        <CurrencyInput
          name="startingBalance"
          placeholder="0.00"
          autoComplete="off"
          enterKeyHint="done"
          value={startingBalance}
          onChange={setStartingBalance}
        />
      </Field>
      {isCard && (
        <PayingAccountField
          ownership={ownership}
          defaultValue={defaults?.payingAccountId ?? undefined}
        />
      )}
    </div>
  );
}

function PayingAccountField({
  ownership,
  defaultValue,
}: {
  ownership: Ownership;
  defaultValue?: string;
}) {
  const choices = payingAccountChoices(useAccounts() ?? [], ownership);
  const visibility = VISIBILITY_LABELS[ownership.visibility];
  // A Paying Account retired on another device is no longer a choice; the member picks again.
  const stillChoosable = choices.some((choice) => choice.id === defaultValue);

  if (choices.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-label">Paid from</p>
        <p className="text-body text-muted-foreground">
          Add a {visibility} account other than a credit card first.
        </p>
      </div>
    );
  }
  return (
    <Field label="Paid from">
      {(control) => (
        <Select
          name="payingAccountId"
          required
          defaultValue={stillChoosable ? defaultValue : undefined}
        >
          <SelectTrigger {...control} className="w-full">
            <SelectValue placeholder={`Choose a ${visibility} account`} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((choice) => (
              <SelectItem key={choice.id} value={choice.id}>
                {choice.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}

type ReadDetails =
  | { input: AccountDetailsInput; startingBalanceError: null }
  | { input: null; startingBalanceError: string };

export function readAccountDetails(formData: FormData): ReadDetails {
  const startingBalance = parsePHPSafe(String(formData.get("startingBalance") ?? ""));
  if (!startingBalance.success) {
    return { input: null, startingBalanceError: startingBalance.error.message };
  }
  // The picker is shown only for a card, so any other type submits no Paying Account.
  const payingAccountId = formData.get("payingAccountId");
  return {
    input: {
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? ""),
      startingBalanceCents: startingBalance.value,
      payingAccountId: typeof payingAccountId === "string" ? payingAccountId : null,
    },
    startingBalanceError: null,
  };
}
