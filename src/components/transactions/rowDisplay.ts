import type { MoneyKind } from "@/components/app/Money";
import { envelopeLabel } from "@/lib/allocations/envelope";
import { CORRECTION_LABEL, isMoneyIn } from "@/lib/corrections/events";
import { transactionLabel } from "@/lib/transactions/events";
import {
  isCorrection,
  isTransfer,
  transferDirection,
  type ListRow,
} from "@/lib/transactions/filter";
import { transferName } from "./transferName";

/** What a row shows: its name, the muted line beneath it and what kind of amount it is. */
export interface RowDisplay {
  label: string;
  detail: string;
  amount: MoneyKind;
}

export interface RowNames {
  categories: Map<string, string>;
  accounts: Map<string, string>;
}

/** A transfer is a leg in or out of `filteredAccount`; without one, it only moved. */
export function rowDisplay(row: ListRow, names: RowNames, filteredAccount?: string): RowDisplay {
  const accountNameOf = (accountId: string) =>
    names.accounts.get(accountId) ?? "Account not on this device yet";
  if (isTransfer(row)) {
    const direction = transferDirection(row, filteredAccount);
    const path = `${accountNameOf(row.fromAccountId)} → ${accountNameOf(row.toAccountId)}`;
    return {
      label: transferName(row, accountNameOf, direction),
      detail: `${envelopeLabel(row.envelope, names.categories, names.accounts)} · ${path}`,
      amount: direction ? { kind: "transfer", leg: direction } : { kind: "transfer" },
    };
  }
  if (isCorrection(row)) {
    return {
      label: CORRECTION_LABEL,
      detail: `${envelopeLabel(row.envelope, names.categories, names.accounts)} · ${accountNameOf(row.accountId)}`,
      amount: { kind: isMoneyIn(row) ? "income" : "expense" },
    };
  }
  const categoryName =
    row.categoryId === null
      ? "Unassigned"
      : (names.categories.get(row.categoryId) ?? "Category not on this device yet");
  return {
    label: transactionLabel(row),
    detail: `${categoryName} · ${accountNameOf(row.accountId)}`,
    amount: { kind: row.type === "income" ? "income" : "expense" },
  };
}
