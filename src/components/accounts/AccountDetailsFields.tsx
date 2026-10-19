import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatPHPInput, parsePHPSafe, PESO_SIGN } from "@/lib/currency";
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
  idPrefix,
  types,
  ownership,
  defaults,
}: {
  idPrefix: string;
  types: readonly AccountType[];
  ownership: Ownership;
  defaults?: AccountDetails;
}) {
  const [type, setType] = useState(defaults?.type ?? types[0]);
  const isCard = type === CREDIT_CARD;

  return (
    <div className="grid grid-cols-1 gap-4 @[480px]:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Account name</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={ACCOUNT_NAME_MAX_LENGTH}
          placeholder="e.g. BDO Savings"
          autoComplete="off"
          enterKeyHint="next"
          defaultValue={defaults?.name}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-type`}>Type</Label>
        {types.length === 1 ? (
          <>
            <input type="hidden" name="type" value={type ?? ""} />
            <p id={`${idPrefix}-type`} className="py-2 text-body">
              {types[0] && ACCOUNT_TYPE_LABELS[types[0]]}
            </p>
          </>
        ) : (
          <Select
            name="type"
            value={type}
            onValueChange={(value) => isAccountType(value) && setType(value)}
          >
            <SelectTrigger id={`${idPrefix}-type`} className="w-full">
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
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-starting-balance`}>
          {isCard ? "Starting amount owed" : "Starting balance"} ({PESO_SIGN})
        </Label>
        <Input
          id={`${idPrefix}-starting-balance`}
          name="startingBalance"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          enterKeyHint="done"
          defaultValue={defaults && formatPHPInput(defaults.startingBalanceCents)}
        />
      </div>
      {isCard && (
        <PayingAccountField
          id={`${idPrefix}-paying-account`}
          ownership={ownership}
          defaultValue={defaults?.payingAccountId ?? undefined}
        />
      )}
    </div>
  );
}

function PayingAccountField({
  id,
  ownership,
  defaultValue,
}: {
  id: string;
  ownership: Ownership;
  defaultValue?: string;
}) {
  const choices = payingAccountChoices(useAccounts() ?? [], ownership);
  const visibility = VISIBILITY_LABELS[ownership.visibility];
  // A Paying Account retired on another device is no longer a choice; the member picks again.
  const stillChoosable = choices.some((choice) => choice.id === defaultValue);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Paid from</Label>
      {choices.length === 0 ? (
        <p id={id} className="text-body text-muted-foreground">
          Add a {visibility} account other than a credit card first.
        </p>
      ) : (
        <Select
          name="payingAccountId"
          required
          defaultValue={stillChoosable ? defaultValue : undefined}
        >
          <SelectTrigger id={id} className="w-full">
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
    </div>
  );
}

type ReadDetails = { input: AccountDetailsInput; error: null } | { input: null; error: string };

export function readAccountDetails(formData: FormData): ReadDetails {
  const startingBalance = parsePHPSafe(String(formData.get("startingBalance") ?? ""));
  if (!startingBalance.success) return { input: null, error: startingBalance.error.message };
  // The picker is shown only for a card, so any other type submits no Paying Account.
  const payingAccountId = formData.get("payingAccountId");
  return {
    input: {
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? ""),
      startingBalanceCents: startingBalance.value,
      payingAccountId: typeof payingAccountId === "string" ? payingAccountId : null,
    },
    error: null,
  };
}
