import type { ComponentProps } from "react";
import { Combobox, type ComboboxGroup } from "@/components/app/Combobox";
import { ACCOUNT_TYPES } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { ACCOUNT_TYPE_LABELS } from "./AccountDetailsFields";

export const accountLabel = (account: AccountRow) =>
  `${account.name}${account.visibility === "personal" ? " (Personal)" : ""}${account.retired ? " (retired)" : ""}`;

/** The accounts by type, each with its label; a type with no account is left out. */
export const accountComboboxGroups = (accounts: AccountRow[], label = accountLabel) =>
  ACCOUNT_TYPES.map((type) => ({
    label: ACCOUNT_TYPE_LABELS[type],
    options: accounts
      .filter((account) => account.type === type)
      .map((account) => ({ value: account.id, label: label(account) })),
  })).filter((group) => group.options.length > 0) satisfies ComboboxGroup[];

/** The accounts by type, searchable by name or type. Inside a `Field`, spread its control props onto it. */
export function AccountSelect({
  accounts,
  label,
  ...combobox
}: Omit<ComponentProps<typeof Combobox>, "groups" | "className" | "children" | "empty"> & {
  accounts: AccountRow[];
  /** Replaces `accountLabel`, to add a tag such as "(Paying Account)". */
  label?: (account: AccountRow) => string;
}) {
  return (
    <Combobox {...combobox} className="w-full" groups={accountComboboxGroups(accounts, label)} />
  );
}
