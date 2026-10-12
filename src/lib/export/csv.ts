const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

/** A member's text could start like a formula; a spreadsheet would run it. */
function escapeValue(value: string): string {
  const inert = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(inert) ? `"${inert.replaceAll('"', '""')}"` : inert;
}

/** RFC 4180: comma-separated, CRLF after every row. */
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeValue).join(",") + "\r\n").join("");
}
