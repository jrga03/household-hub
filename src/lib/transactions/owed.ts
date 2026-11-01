import { sumCents, type Cents } from "@/lib/currency";
import type { TransactionRow } from "./projection";

export interface Owed {
  totalCents: Cents;
  count: number;
}

/** Out-of-pocket and not yet paid back (ADR 0012); only an expense can be owed back. */
export const isOpenOutOfPocket = (
  row: TransactionRow
): row is TransactionRow & { paidByUserId: string } =>
  !row.removed && row.paidByUserId !== null && row.status === "pending" && row.type === "expense";

/** What the household owes each payer, by user ID: open out-of-pocket expenses only. */
export function owedByPayer(rows: TransactionRow[]): Map<string, Owed> {
  const amounts = new Map<string, Cents[]>();
  for (const row of rows) {
    if (!isOpenOutOfPocket(row)) continue;
    amounts.set(row.paidByUserId, [...(amounts.get(row.paidByUserId) ?? []), row.amountCents]);
  }
  return new Map(
    [...amounts].map(([payer, cents]) => [
      payer,
      { totalCents: sumCents(cents), count: cents.length },
    ])
  );
}
