import uFuzzy from "@leeoniya/ufuzzy";
import { diffCents, parsePHPUnbounded, sumCents, type Cents } from "@/lib/currency";
import type { BalanceCorrectionRow } from "@/lib/corrections/projection";
import { isVisibility, type Visibility } from "@/lib/events/ownership";
import type { TransferRow } from "@/lib/transfers/projection";
import { monthOfDate } from "@/lib/utils/dates";
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
  /** An inclusive run of "yyyy-MM" months, set only together and only without `month`. */
  from?: string;
  to?: string;
  /** A row takes its account's visibility (ADR 0002). */
  visibility?: Visibility;
  /** A transfer matches on either side. */
  account?: string;
  /** A category ID, or UNASSIGNED_FILTER; a transfer or correction matches by its envelope. */
  category?: string;
  type?: ListType;
  status?: TransactionStatus;
  needsCategory?: boolean;
  /** Fuzzy-matches every word in the description or notes, or the exact amount when it's a number. */
  query?: string;
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const isMonth = (value: unknown): value is string => typeof value === "string" && MONTH.test(value);

const nonEmpty = (value: unknown) =>
  typeof value === "string" && value !== "" ? value : undefined;

export const isEntryDirection = (value: unknown): value is EntryDirection =>
  value === TRANSFER_TYPE || isTransactionType(value);

export const isListType = (value: unknown): value is ListType =>
  value === CORRECTION_TYPE || isEntryDirection(value);

/** The route's search params as a filter; anything unusable is left out. */
export function readTransactionFilter(search: Record<string, unknown>): TransactionFilter {
  const filter: TransactionFilter = {};
  if (isMonth(search.month)) filter.month = search.month;
  else if (isMonth(search.from) && isMonth(search.to) && search.from <= search.to) {
    filter.from = search.from;
    filter.to = search.to;
  }
  if (typeof search.visibility === "string" && isVisibility(search.visibility)) {
    filter.visibility = search.visibility;
  }
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
  if (filter.from !== undefined && monthOfDate(row.date) < filter.from) return false;
  if (filter.to !== undefined && monthOfDate(row.date) > filter.to) return false;
  if (filter.visibility !== undefined && row.visibility !== filter.visibility) return false;
  if (filter.account !== undefined && !touchesAccount(row, filter.account)) return false;
  if (filter.category !== undefined && categoryKey(row) !== filter.category) return false;
  if (filter.type !== undefined && typeOf(row) !== filter.type) return false;
  if (filter.status !== undefined && statusOf(row) !== filter.status) return false;
  if (filter.needsCategory && !needsCategory(row)) return false;
  return true;
}

const AMOUNT_QUERY = /^₱?\s*(\d{1,3}(,\d{3})*|\d+)(\.\d{0,2})?$/;

const NO_TYPOS = { intraIns: 0, intraSub: 0, intraTrn: 0, intraDel: 0 } as const;
const ONE_TYPO = { intraIns: 1, intraSub: 1, intraTrn: 1, intraDel: 1 } as const;

/** uFuzzy's cap on terms it tries in every order; past it, each term is filtered on its own. */
const MAX_REORDERED_TERMS = 5;

const fuzzy = new uFuzzy({
  intraMode: 1,
  intraRules: (term) => ({
    intraSlice: [1, Infinity],
    ...(term.length > 3 && /\D/.test(term) ? ONE_TYPO : NO_TYPOS),
  }),
});

const normalize = (text: string) => uFuzzy.latinize(text.toLowerCase());

const NOT_LATIN_ALPHANUMERIC = /[^a-z\d]+/g;

/** "Grab Food" and "7-Eleven" also as "grabfood" and "7eleven". */
const compact = (text: string) => text.replace(NOT_LATIN_ALPHANUMERIC, "");

/** Built once per row, so typing a query doesn't rebuild it for every row. */
const searchTexts = new WeakMap<ListRow, string>();

function searchTextOf(row: ListRow): string {
  const cached = searchTexts.get(row);
  if (cached !== undefined) return cached;
  const fields = isCorrection(row) ? [] : [row.description, row.notes].map(normalize);
  const text = [...fields, ...fields.map(compact)].join(" ");
  searchTexts.set(row, text);
  return text;
}

/** The indexes of the rows whose text holds every term of the query. */
function textMatches(rows: ListRow[], query: string): Set<number> {
  const normalized = normalize(query);
  // uFuzzy reads quotes, dashes and apostrophes as exact, excluded and contracted terms.
  const terms = normalized.replace(NOT_LATIN_ALPHANUMERIC, " ").trim();
  const texts = rows.map(searchTextOf);
  if (terms === "") {
    // uFuzzy can't search a non-Latin script, so it matches by substring; symbols alone match nothing.
    if (!/[\p{L}\p{N}]/u.test(normalized)) return new Set();
    return new Set(texts.flatMap((text, index) => (text.includes(normalized) ? [index] : [])));
  }
  const [indexes] = fuzzy.search(texts, terms, MAX_REORDERED_TERMS, 0);
  return new Set(indexes ?? []);
}

function searchRows<Row extends ListRow>(rows: Row[], query: string): Row[] {
  const text = query.trim().toLowerCase();
  if (text === "") return rows;
  const amount: Cents | null = AMOUNT_QUERY.test(text) ? parsePHPUnbounded(text) : null;
  const matched = textMatches(rows, text);
  return rows.filter((row, index) => row.amountCents === amount || matched.has(index));
}

/** Every filter given must hold; order is kept. */
export function filterTransactions<Row extends ListRow>(
  rows: Row[],
  filter: TransactionFilter
): Row[] {
  return searchRows(
    rows.filter((row) => matchesFilter(row, filter)),
    filter.query ?? ""
  );
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
