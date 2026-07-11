/**
 * Date utilities shared across components.
 */

/**
 * Parses a "yyyy-MM-dd" string as a LOCAL date (local midnight).
 *
 * `new Date("yyyy-MM-dd")` parses as UTC midnight, which displays as the
 * PREVIOUS calendar day in UTC-negative timezones and shifts day math for
 * UTC+ users. Splitting the string and constructing the Date from its parts
 * keeps the user's calendar day intact — transaction dates are canonical in
 * the user's local timezone (see CLAUDE.md, Transaction Date Strategy).
 *
 * Malformed input yields an Invalid Date (`getTime()` is `NaN`); callers
 * accepting free-form input should check `isNaN(date.getTime())`.
 *
 * @param dateString - Date in "yyyy-MM-dd" format (e.g. "2026-07-05")
 * @returns Date at local midnight of that calendar day
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}
