import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ACCOUNT_NAME_MAX_LENGTH,
  ACCOUNT_TYPES,
  type AccountDetails,
  type AccountType,
} from "@/lib/accounts/events";
import type { AccountDetailsInput } from "@/lib/commands/accounts";
import { formatPHP, parsePHPSafe, PESO_SIGN } from "@/lib/currency";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "Bank account",
  cash: "Cash",
  e_wallet: "E-wallet",
  investment: "Investment",
};

/** Name, type and starting balance, shared by the add and edit forms. */
export function AccountDetailsFields({
  idPrefix,
  defaults,
}: {
  idPrefix: string;
  defaults?: AccountDetails;
}) {
  return (
    <div className="grid gap-4 @[480px]:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Account name</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          required
          maxLength={ACCOUNT_NAME_MAX_LENGTH}
          placeholder="e.g. BDO Savings"
          autoComplete="off"
          defaultValue={defaults?.name}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-type`}>Type</Label>
        <Select name="type" defaultValue={defaults?.type ?? "bank"}>
          <SelectTrigger id={`${idPrefix}-type`} className="w-full">
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
        <Label htmlFor={`${idPrefix}-starting-balance`}>Starting balance ({PESO_SIGN})</Label>
        <Input
          id={`${idPrefix}-starting-balance`}
          name="startingBalance"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          defaultValue={defaults && formatPHP(defaults.startingBalanceCents).replace(PESO_SIGN, "")}
        />
      </div>
    </div>
  );
}

type ReadDetails = { input: AccountDetailsInput; error: null } | { input: null; error: string };

export function readAccountDetails(formData: FormData): ReadDetails {
  const startingBalance = parsePHPSafe(String(formData.get("startingBalance") ?? ""));
  if (!startingBalance.success) return { input: null, error: startingBalance.error.message };
  return {
    input: {
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? ""),
      startingBalanceCents: startingBalance.value,
    },
    error: null,
  };
}
