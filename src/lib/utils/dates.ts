/**
 * Date utilities shared across components.
 */

import { addMonths, format } from "date-fns";

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
  const [year = NaN, month = NaN, day = NaN] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Whether the value names a calendar month, "yyyy-MM". */
export const isLocalMonth = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** The local calendar month of a moment, "yyyy-MM". */
export const localMonth = (date: Date) => format(date, "yyyy-MM");

/** The month `by` months after (or before, when negative) a "yyyy-MM" month. */
export const shiftMonth = (month: string, by: number) =>
  localMonth(addMonths(parseLocalDate(`${month}-01`), by));

/** "October 2026". */
export const monthLabel = (month: string) => format(parseLocalDate(`${month}-01`), "MMMM yyyy");
