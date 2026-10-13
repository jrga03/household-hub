import { parsePHPUnbounded } from "@/lib/currency";
import { isLocalDate } from "@/lib/transactions/events";
import { BDO_CREDIT_CARD_PDF } from "./formats";
import { readPdfLines, type PdfLine } from "./pdf-text";
import { StatementParseError, type StatementLine, type StatementParser } from "./statement";

const SHORT_DATE = /^(\d{2})\/(\d{2})\/(\d{2})$/;
const AMOUNT = /^(-?)([\d,]+\.\d{2})$/;
const CARD_PAYMENT = /^PAYMENT RECEIVED\b/;

/** "07/28/26" → "2026-07-28"; null when it isn't a real day. */
function toLocalDate(text: string): string | null {
  const match = SHORT_DATE.exec(text);
  if (!match) return null;
  const [, month, day, year] = match;
  const date = `20${year ?? ""}-${month ?? ""}-${day ?? ""}`;
  return isLocalDate(date) ? date : null;
}

const isTransactionHeader = (line: PdfLine) =>
  line.includes("Sale Date") && line.includes("Post Date") && line.includes("Transaction Details");

/**
 * A transaction row is sale date, post date, details, amount. Balances,
 * subtotals, card numbers and reference rows carry no dates, so they drop out.
 * The statement shows the bank's side: a positive amount is a charge.
 */
function readTransaction(line: PdfLine): StatementLine | null {
  const [saleText = "", postText = "", ...rest] = line;
  const purchaseDate = toLocalDate(saleText);
  const postingDate = toLocalDate(postText);
  const amountMatch = AMOUNT.exec(rest.at(-1) ?? "");
  if (rest.length < 2 || !purchaseDate || !postingDate || !amountMatch) return null;

  const [, minus = "", digits = ""] = amountMatch;
  const amount = parsePHPUnbounded(digits);
  if (!amount) return null;
  const description = rest.slice(0, -1).join(" ");
  return {
    purchaseDate,
    postingDate,
    description,
    amount,
    type: minus ? "income" : "expense",
    isCardPayment: minus !== "" && CARD_PAYMENT.test(description),
  };
}

export const bdoCreditCardPdf: StatementParser = {
  format: BDO_CREDIT_CARD_PDF,
  async parse(data, password) {
    const lines = await readPdfLines(data, password);
    if (!lines.some(isTransactionHeader)) throw new StatementParseError("unrecognised-layout");
    return lines.flatMap((line) => readTransaction(line) ?? []);
  },
};
