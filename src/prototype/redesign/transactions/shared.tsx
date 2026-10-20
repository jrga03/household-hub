// PROTOTYPE (#194): money and grouping bits shared by the Transactions variants.
import { ArrowLeftRight, Info } from "lucide-react";
import { formatPHP, sumCents, diffCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { format } from "date-fns";
import type { Row } from "../fixtures";

export const labelOf = (row: Row) =>
  row.kind === "transfer" ? `${row.account} → ${row.toAccount ?? ""}` : row.label;

export const detailOf = (row: Row) =>
  row.kind === "transfer"
    ? row.label
    : `${row.category ?? (row.kind === "income" ? "Income" : "Unassigned")} · ${row.account}`;

export function Amount({ row, className }: { row: Row; className?: string }) {
  const tone =
    row.pending || row.kind === "transfer"
      ? "text-muted-foreground"
      : row.kind === "income"
        ? "text-income"
        : undefined;
  const sign = row.kind === "income" ? "+" : row.kind === "expense" ? "−" : "";
  return (
    <span className={cn("whitespace-nowrap tabular-nums", tone, className)}>
      {sign}
      {formatPHP(row.amount)}
    </span>
  );
}

/** Leading icons a row carries: transfer and pending. */
export function RowIcons({ row }: { row: Row }) {
  return (
    <>
      {row.kind === "transfer" && (
        <ArrowLeftRight
          className="size-4 shrink-0 text-muted-foreground"
          role="img"
          aria-label="Transfer"
        />
      )}
      {row.pending && (
        <Info className="size-4 shrink-0 text-muted-foreground" role="img" aria-label="Pending" />
      )}
    </>
  );
}

/** Income less expenses; transfers move money between accounts and count for neither. */
export function netOf(rows: Row[]): Cents {
  const income = sumCents(rows.filter((row) => row.kind === "income").map((row) => row.amount));
  const out = sumCents(rows.filter((row) => row.kind === "expense").map((row) => row.amount));
  return diffCents(income, out);
}

export const totalOf = (rows: Row[], kind: Row["kind"]): Cents =>
  rows.length === 0
    ? ZERO_CENTS
    : sumCents(rows.filter((row) => row.kind === kind).map((row) => row.amount));

export function SignedTotal({ cents, className }: { cents: Cents; className?: string }) {
  if (cents === 0) {
    return <span className={cn("tabular-nums", className)}>{formatPHP(cents)}</span>;
  }
  const positive = cents > 0;
  return (
    <span className={cn("whitespace-nowrap tabular-nums", positive && "text-income", className)}>
      {positive ? "+" : "−"}
      {formatPHP(positive ? cents : diffCents(ZERO_CENTS, cents))}
    </span>
  );
}

export function groupByDate(rows: Row[]): { date: string; rows: Row[] }[] {
  const groups: { date: string; rows: Row[] }[] = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last?.date === row.date) last.rows.push(row);
    else groups.push({ date: row.date, rows: [row] });
  }
  return groups;
}

export const dayHeading = (date: string) => format(parseLocalDate(date), "EEE, MMM d");
export const longDate = (date: string) => format(parseLocalDate(date), "EEEE, MMMM d, yyyy");
export const shortDate = (date: string) => format(parseLocalDate(date), "MMM d");
export const dayNumber = (date: string) => format(parseLocalDate(date), "d");
export const weekday = (date: string) => format(parseLocalDate(date), "EEE");

export const statusOf = (row: Row) => (row.pending ? "Pending" : "Cleared");
