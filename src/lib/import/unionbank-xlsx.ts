import { parsePHPUnbounded } from "@/lib/currency";
import { isLocalDate } from "@/lib/transactions/events";
import { UNIONBANK_CREDIT_CARD_XLSX } from "./formats";
import { decryptOfficeFile } from "./office-encryption";
import { StatementParseError, type StatementLine, type StatementParser } from "./statement";
import { readFirstSheet, type Cell } from "./xlsx";

const LONG_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const CARD_PAYMENT = /\bPAYMENT\b/;
// A credit that undoes a fee or charge ("LATE PAYMENT FEE REVERSAL") is a refund, not a payment.
const FEE_OR_CHARGE = /\b(FEE|CHARGE|REVERSAL)\b/;

/** "07/28/2026" → "2026-07-28"; null when it isn't a real day. */
function toLocalDate(cell: Cell | undefined): string | null {
  const match = typeof cell === "string" ? LONG_DATE.exec(cell.trim()) : null;
  if (!match) return null;
  const [, month, day, year] = match;
  const date = `${year ?? ""}-${month ?? ""}-${day ?? ""}`;
  return isLocalDate(date) ? date : null;
}

const text = (cell: Cell | undefined) => String(cell ?? "").trim();

const isTransactionHeader = (row: Cell[]) =>
  text(row[0]).toUpperCase() === "DATE" && text(row[1]).toUpperCase() === "DESCRIPTION";

/**
 * A transaction row is date, description, currency, amount, under the table's
 * header. The statement shows the bank's side: a positive amount is a charge.
 * UnionBank prints one date per line, so it is both purchase and posting date.
 */
function readTransaction([dateCell, descriptionCell, , amountCell]: Cell[]): StatementLine | null {
  const date = toLocalDate(dateCell);
  const signed = text(amountCell).replace(/,/g, "");
  if (!date || signed === "") return null;

  const isCredit = signed.startsWith("-");
  const amount = parsePHPUnbounded(isCredit ? signed.slice(1) : signed);
  if (!amount) return null;
  const description = text(descriptionCell);
  return {
    purchaseDate: date,
    postingDate: date,
    description,
    amount,
    type: isCredit ? "income" : "expense",
    isCardPayment: isCredit && CARD_PAYMENT.test(description) && !FEE_OR_CHARGE.test(description),
  };
}

export const unionBankCreditCardXlsx: StatementParser = {
  format: UNIONBANK_CREDIT_CARD_XLSX,
  async parse(data, password) {
    const rows = await readFirstSheet(await decryptOfficeFile(data, password));
    const header = rows?.findIndex(isTransactionHeader) ?? -1;
    if (!rows || header === -1) throw new StatementParseError("unrecognised-layout");
    return rows.slice(header + 1).flatMap((row) => readTransaction(row) ?? []);
  },
};
