import { diffCents, parsePHPUnbounded, sumCents, type Cents } from "@/lib/currency";
import type { BalanceCorrectionRow } from "@/lib/corrections/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import {
  isTransactionStatus,
  isTransactionType,
  type TransactionStatus,
  type TransactionType,
} from "./events";
import type { TransactionRow } from "./projection";

/** The category filter's value for transactions in no category. */
export const UNASSIGNED_FILTER = "unassigned";

/** The type filter's value for transfers, beside Expense and Income. */
export const TRANSFER_TYPE = "transfer";

/** The type filter's value for balance corrections. */
export const CORRECTION_TYPE = "correction";

/** What a new entry is: Expense, Income or Transfer. */
export type EntryDirection = TransactionType | typeof TRANSFER_TYPE;

export type ListType = EntryDirection | typeof CORRECTION_TYPE;

/**
 * One row of the transaction list: a transaction, a transfer shown once for
 * both legs, or a balance correction.
 */
export type ListRow = TransactionRow | TransferRow | BalanceCorrectionRow;

export const isTransfer = (row: ListRow): row is TransferRow => "fromAccountId" in row;

export const isCorrection = (row: ListRow): row is BalanceCorrectionRow => "direction" in row;

export const isTransaction = (row: ListRow): row is TransactionRow =>
  !isTransfer(row) && !isCorrection(row);

/** A correction counts as cleared (ADR 0009). */
export const statusOf = (row: ListRow): TransactionStatus =>
  isCorrection(row) ? "cleared" : row.status;

export interface TransactionFilter {
  /** "yyyy-MM", matched against the local date. */
  month?: string;
  /** A transfer matches on either side. */
  account?: string;
  /** A category ID, or UNASSIGNED_FILTER; a transfer or correction matches by its envelope. */
  category?: string;
  type?: ListType;
  status?: TransactionStatus;
  needsCategory?: boolean;
  /** Matches the description or notes, or the exact amount when it's a number. */
  query?: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const nonEmpty = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined;

export const isEntryDirection = (value: unknown): value is EntryDirection =>
  value === TRANSFER_TYPE || isTransactionType(value);

export const isListType = (value: unknown): value is ListType =>
  value === CORRECTION_TYPE || isEntryDirection(value);

/** The route's search params as a filter; anything unusable is left out. */
export function readTransactionFilter(search: Record<string, unknown>): TransactionFilter {
  const filter: TransactionFilter = {};
  if (typeof search.month === "string" && MONTH.test(search.month)) filter.month = search.month;
  const account = nonEmpty(search.account);
  if (account) filter.account = account;
  const category = nonEmpty(search.category);
  if (category) filter.category = category;
  if (isListType(search.type)) filter.type = search.type;
  if (isTransactionStatus(search.status)) filter.status = search.status;
  if (search.needsCategory === true) filter.needsCategory = true;
  // The router parses a bare number in the URL as a number.
  const query = typeof search.query === "number" ? String(search.query) : nonEmpty(search.query);
  if (query) filter.query = query;
  return filter;
}

export const needsCategory = (row: ListRow) =>
  isTransaction(row) && row.type === "expense" && row.categoryId === null;

/** The category filter's value a row matches, or null for a Card Payment transfer. */
function categoryKey(row: ListRow): string | null {
  if (isTransaction(row)) return row.categoryId ?? UNASSIGNED_FILTER;
  const { envelope } = row;
  if (envelope.kind === "unassigned") return UNASSIGNED_FILTER;
  return envelope.kind === "category" ? envelope.id : null;
}

const touchesAccount = (row: ListRow, accountId: string) =>
  isTransfer(row)
    ? row.fromAccountId === accountId || row.toAccountId === accountId
    : row.accountId === accountId;

function typeOf(row: ListRow): ListType {
  if (isTransfer(row)) return TRANSFER_TYPE;
  return isCorrection(row) ? CORRECTION_TYPE : row.type;
}

function matchesFilter(row: ListRow, filter: TransactionFilter): boolean {
  if (filter.month !== undefined && !row.date.startsWith(`${filter.month}-`)) return false;
  if (filter.account !== undefined && !touchesAccount(row, filter.account)) return false;
  if (filter.category !== undefined && categoryKey(row) !== filter.category) return false;
  if (filter.type !== undefined && typeOf(row) !== filter.type) return false;
  if (filter.status !== undefined && statusOf(row) !== filter.status) return false;
  if (filter.needsCategory && !needsCategory(row)) return false;
  return true;
}

const AMOUNT_QUERY = /^₱?\s*(\d{1,3}(,\d{3})*|\d+)(\.\d{0,2})?$/;

function matchesQuery(query: string) {
  const text = query.trim().toLowerCase();
  if (text === "") return () => true;
  const amount: Cents | null = AMOUNT_QUERY.test(text) ? parsePHPUnbounded(text) : null;
  return (row: ListRow) =>
    row.amountCents === amount ||
    (!isCorrection(row) &&
      (row.description.toLowerCase().includes(text) || row.notes.toLowerCase().includes(text)));
}

/** Every filter given must hold; order is kept. */
export function filterTransactions<Row extends ListRow>(
  rows: Row[],
  filter: TransactionFilter
): Row[] {
  const matchesSearch = matchesQuery(filter.query ?? "");
  return rows.filter((row) => matchesFilter(row, filter) && matchesSearch(row));
}

/** Which way a transfer moves for the filtered account; null when no account is filtered or it's neither side. */
export function transferDirection(
  transfer: TransferRow,
  accountId: string | undefined
): "in" | "out" | null {
  if (accountId === transfer.fromAccountId) return "out";
  if (accountId === transfer.toAccountId) return "in";
  return null;
}

const newerFirst = (a: ListRow, b: ListRow) =>
  a.date !== b.date
    ? b.date.localeCompare(a.date)
    : a.recordedHlc < b.recordedHlc
      ? 1
      : a.recordedHlc > b.recordedHlc
        ? -1
        : 0;

/** Transactions, transfers and corrections in one list: newest date first, then the most recently recorded. */
export const newestFirst = (...lists: ListRow[][]): ListRow[] => lists.flat().sort(newerFirst);

export interface TransactionTotals {
  incomeCents: Cents;
  expenseCents: Cents;
  /** Income minus expenses; negative when more went out. */
  netCents: Cents;
}

/** Transfers and corrections move money without earning or spending it, so they're left out. */
export function totalTransactions(rows: ListRow[]): TransactionTotals {
  const amountsOf = (type: TransactionType) =>
    rows.filter((row) => isTransaction(row) && row.type === type).map((row) => row.amountCents);
  const incomeCents = sumCents(amountsOf("income"));
  const expenseCents = sumCents(amountsOf("expense"));
  return { incomeCents, expenseCents, netCents: diffCents(incomeCents, expenseCents) };
}
