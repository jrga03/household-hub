import { envelopeLabel } from "@/lib/allocations/envelope";
import { transactionLabel } from "@/lib/transactions/events";
import { isTransfer, transferDirection, type ListRow } from "@/lib/transactions/filter";
import type { AmountDirection } from "./TransactionAmount";
import { transferName } from "./transferName";

/** What a row shows: its name, the muted line beneath it and which way its money went. */
export interface RowDisplay {
  label: string;
  detail: string;
  direction: AmountDirection;
}

export interface RowNames {
  categories: Map<string, string>;
  accounts: Map<string, string>;
}

/** A transfer is signed in or out of `filteredAccount`; without one, it only moved. */
export function rowDisplay(row: ListRow, names: RowNames, filteredAccount?: string): RowDisplay {
  const accountNameOf = (accountId: string) =>
    names.accounts.get(accountId) ?? "Account not on this device yet";
  if (isTransfer(row)) {
    const direction = transferDirection(row, filteredAccount);
    const path = `${accountNameOf(row.fromAccountId)} → ${accountNameOf(row.toAccountId)}`;
    return {
      label: transferName(row, accountNameOf, direction),
      detail: `${envelopeLabel(row.envelope, names.categories, names.accounts)} · ${path}`,
      direction: direction ?? "moved",
    };
  }
  const categoryName =
    row.categoryId === null
      ? "Unassigned"
      : (names.categories.get(row.categoryId) ?? "Category not on this device yet");
  return {
    label: transactionLabel(row),
    detail: `${categoryName} · ${accountNameOf(row.accountId)}`,
    direction: row.type === "income" ? "in" : "out",
  };
}
