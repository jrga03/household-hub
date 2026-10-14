const FORMULA_START = /^[=+\-@\t\r]/;
const NEGATIVE_AMOUNT = /^-\d+\.\d{2}$/;
const NEEDS_QUOTES = /[",\r\n]/;

/**
 * A member's text could start like a formula; a spreadsheet would run it. A
 * negative amount as `formatPHPDecimal` writes it stays a number.
 */
function escapeValue(value: string): string {
  const looksLikeFormula = FORMULA_START.test(value) && !NEGATIVE_AMOUNT.test(value);
  const inert = looksLikeFormula ? `'${value}` : value;
  return NEEDS_QUOTES.test(inert) ? `"${inert.replaceAll('"', '""')}"` : inert;
}

/** RFC 4180: comma-separated, CRLF after every row. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeValue).join(",") + "\r\n").join("");
}
