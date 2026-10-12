import { diffCents, parsePHPUnbounded, sumCents, type Cents } from "@/lib/currency";
import {
  isTransactionStatus,
  isTransactionType,
  type TransactionStatus,
  type TransactionType,
} from "./events";
import type { TransactionRow } from "./projection";

/** The category filter's value for transactions in no category. */
export const UNASSIGNED_FILTER = "unassigned";

export interface TransactionFilter {
  /** "yyyy-MM", matched against the transaction's local date. */
  month?: string;
  account?: string;
  /** A category ID, or UNASSIGNED_FILTER. */
  category?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  needsCategory?: boolean;
  /** Matches the description or notes, or the exact amount when it's a number. */
  query?: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const nonEmpty = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined;

/** The route's search params as a filter; anything unusable is left out. */
export function readTransactionFilter(search: Record<string, unknown>): TransactionFilter {
  const filter: TransactionFilter = {};
  if (typeof search.month === "string" && MONTH.test(search.month)) filter.month = search.month;
  const account = nonEmpty(search.account);
  if (account) filter.account = account;
  const category = nonEmpty(search.category);
  if (category) filter.category = category;
  if (isTransactionType(search.type)) filter.type = search.type;
  if (isTransactionStatus(search.status)) filter.status = search.status;
  if (search.needsCategory === true) filter.needsCategory = true;
  // The router parses a bare number in the URL as a number.
  const query = typeof search.query === "number" ? String(search.query) : nonEmpty(search.query);
  if (query) filter.query = query;
  return filter;
}

export const needsCategory = (transaction: TransactionRow) =>
  transaction.type === "expense" && transaction.categoryId === null;

function matchesFilter(transaction: TransactionRow, filter: TransactionFilter): boolean {
  if (filter.month !== undefined && !transaction.date.startsWith(`${filter.month}-`)) return false;
  if (filter.account !== undefined && transaction.accountId !== filter.account) return false;
  if (
    filter.category !== undefined &&
    (transaction.categoryId ?? UNASSIGNED_FILTER) !== filter.category
  ) {
    return false;
  }
  if (filter.type !== undefined && transaction.type !== filter.type) return false;
  if (filter.status !== undefined && transaction.status !== filter.status) return false;
  if (filter.needsCategory && !needsCategory(transaction)) return false;
  return true;
}

const AMOUNT_QUERY = /^₱?\s*(\d{1,3}(,\d{3})*|\d+)(\.\d{0,2})?$/;

function matchesQuery(query: string) {
  const text = query.trim().toLowerCase();
  if (text === "") return () => true;
  const amount: Cents | null = AMOUNT_QUERY.test(text) ? parsePHPUnbounded(text) : null;
  return (transaction: TransactionRow) =>
    transaction.amountCents === amount ||
    transaction.description.toLowerCase().includes(text) ||
    transaction.notes.toLowerCase().includes(text);
}

/** Every filter given must hold; order is kept. */
export function filterTransactions(
  transactions: TransactionRow[],
  filter: TransactionFilter
): TransactionRow[] {
  const matchesSearch = matchesQuery(filter.query ?? "");
  return transactions.filter(
    (transaction) => matchesFilter(transaction, filter) && matchesSearch(transaction)
  );
}

export interface TransactionTotals {
  incomeCents: Cents;
  expenseCents: Cents;
  /** Income minus expenses; negative when more went out. */
  netCents: Cents;
}

export function totalTransactions(transactions: TransactionRow[]): TransactionTotals {
  const amountsOf = (type: TransactionType) =>
    transactions
      .filter((transaction) => transaction.type === type)
      .map((transaction) => transaction.amountCents);
  const incomeCents = sumCents(amountsOf("income"));
  const expenseCents = sumCents(amountsOf("expense"));
  return { incomeCents, expenseCents, netCents: diffCents(incomeCents, expenseCents) };
}
