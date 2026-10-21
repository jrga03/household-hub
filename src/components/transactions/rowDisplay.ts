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
  /** The category, or the envelope a transfer or correction moves. */
  category: string;
  /** The account, or a transfer's "From → To". */
  account: string;
  /** A transfer's accounts, so a table can break the route only at the arrow. */
  route?: { from: string; to: string };
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
    const route = { from: accountNameOf(row.fromAccountId), to: accountNameOf(row.toAccountId) };
    const path = `${route.from} → ${route.to}`;
    const envelope = envelopeLabel(row.envelope, names.categories, names.accounts);
    return {
      label: transferName(row, accountNameOf, direction),
      detail: `${envelope} · ${path}`,
      amount: direction ? { kind: "transfer", leg: direction } : { kind: "transfer" },
      category: envelope,
      account: path,
      route,
    };
  }
  if (isCorrection(row)) {
    const envelope = envelopeLabel(row.envelope, names.categories, names.accounts);
    const account = accountNameOf(row.accountId);
    return {
      label: CORRECTION_LABEL,
      detail: `${envelope} · ${account}`,
      amount: { kind: isMoneyIn(row) ? "income" : "expense" },
      category: envelope,
      account,
    };
  }
  const categoryName =
    row.categoryId === null
      ? "Unassigned"
      : (names.categories.get(row.categoryId) ?? "Category not on this device yet");
  const account = accountNameOf(row.accountId);
  return {
    label: transactionLabel(row),
    detail: `${categoryName} · ${account}`,
    amount: { kind: row.type === "income" ? "income" : "expense" },
    category: categoryName,
    account,
  };
}
