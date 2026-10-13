import { differenceInCalendarDays, format } from "date-fns";
import { parseLocalDate } from "@/lib/utils/dates";

export type DateGroupItem<Row> = { kind: "date"; date: string } | { kind: "row"; row: Row };

/** "Today", "Yesterday", "Mon Oct 12", or "Wed Dec 31, 2025" for another year. */
export function dateHeading(date: string, today: Date): string {
  const day = parseLocalDate(date);
  const daysAgo = differenceInCalendarDays(today, day);
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return format(day, day.getFullYear() === today.getFullYear() ? "EEE MMM d" : "EEE MMM d, yyyy");
}

/** The rows in their order, with a date heading before the first row of each date. */
export function groupByDate<Row extends { date: string }>(rows: Row[]): DateGroupItem<Row>[] {
  const items: DateGroupItem<Row>[] = [];
  let lastDate: string | null = null;
  for (const row of rows) {
    if (row.date !== lastDate) {
      items.push({ kind: "date", date: row.date });
      lastDate = row.date;
    }
    items.push({ kind: "row", row });
  }
  return items;
}
