// PROTOTYPE (#194): Transactions C, the month's figure first, days in a calendar gutter.
import { useState } from "react";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { ROWS, type Row } from "../fixtures";
import { Detail } from "./Detail";
import {
  Amount,
  dayNumber,
  detailOf,
  groupByDate,
  labelOf,
  netOf,
  RowIcons,
  SignedTotal,
  totalOf,
  weekday,
} from "./shared";

type Show = "expense" | "income" | "all";

const SHOW_OPTIONS: { key: Show; label: string }[] = [
  { key: "expense", label: "Out" },
  { key: "income", label: "In" },
  { key: "all", label: "All" },
];

const FIGURE_LABEL: Record<Show, string> = {
  expense: "Spent in October",
  income: "Came in this October",
  all: "In less out, October",
};

const MONTHS = ["May", "Jun", "Jul", "Aug", "Sep", "Oct 2026"];

export function TransactionsC() {
  const [show, setShow] = useState<Show>("expense");
  const [openId, setOpenId] = useState<string | undefined>(ROWS[0]?.id);
  const rows = show === "all" ? ROWS : ROWS.filter((row) => row.kind === show);
  const open = ROWS.find((row) => row.id === openId);

  return (
    <div className="grid gap-6 p-4 @[840px]:grid-cols-[1fr_360px] @[840px]:p-6 @[1200px]:grid-cols-[1fr_420px]">
      <div className="min-w-0 space-y-6">
        <nav
          aria-label="Month"
          className="-mx-4 flex gap-1 overflow-x-auto px-4 @[840px]:mx-0 @[840px]:px-0"
        >
          {MONTHS.map((month, index) => {
            const current = index === MONTHS.length - 1;
            return (
              <button
                key={month}
                type="button"
                aria-current={current || undefined}
                className={cn(
                  "shrink-0 rounded-md px-3 py-1 text-body font-medium text-muted-foreground transition-colors hover:bg-accent",
                  current && "bg-primary text-primary-foreground hover:bg-primary"
                )}
              >
                {month}
              </button>
            );
          })}
        </nav>

        <section aria-label="Month total" className="space-y-3">
          <div className="space-y-1">
            <p className="text-label text-muted-foreground">{FIGURE_LABEL[show]}</p>
            <Figure show={show} />
            <p className="text-caption text-muted-foreground">
              {rows.length} {show === "all" ? "records" : "transactions"} · 20 of 31 days
            </p>
          </div>
          <div role="group" aria-label="Show" className="inline-flex rounded-md border p-0.5">
            {SHOW_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={show === option.key}
                onClick={() => setShow(option.key)}
                className={cn(
                  "rounded-sm px-4 py-1 text-body font-medium text-muted-foreground",
                  show === option.key && "bg-secondary text-secondary-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <ol className="divide-y border-y">
          {groupByDate(rows).map(({ date, rows: dayRows }) => (
            <li key={date} className="grid grid-cols-[3rem_1fr] gap-3 py-3">
              <div className="text-center">
                <p className="text-heading tabular-nums">{dayNumber(date)}</p>
                <p className="text-caption text-muted-foreground">{weekday(date)}</p>
              </div>
              <ul className="min-w-0 space-y-1">
                {dayRows.map((row) => (
                  <li key={row.id}>
                    <DayRow row={row} open={row.id === openId} onOpen={() => setOpenId(row.id)} />
                  </li>
                ))}
                {dayRows.length > 1 && show === "all" && (
                  <li className="flex justify-end px-2 text-caption text-muted-foreground">
                    <span>
                      Day <SignedTotal cents={netOf(dayRows)} />
                    </span>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ol>
      </div>

      <div className="hidden @[840px]:block">
        <Detail
          row={open}
          figure={false}
          onClose={() => setOpenId(undefined)}
          className="sticky top-[calc(3.5rem+1.5rem)]"
        />
      </div>
    </div>
  );
}

function Figure({ show }: { show: Show }) {
  if (show === "all") return <SignedTotal cents={netOf(ROWS)} className="block text-figure" />;
  return (
    <p className={cn("text-figure tabular-nums", show === "income" && "text-income")}>
      {show === "income" ? "+" : ""}
      {formatPHP(totalOf(ROWS, show))}
    </p>
  );
}

function DayRow({ row, open, onOpen }: { row: Row; open: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      aria-current={open || undefined}
      onClick={onOpen}
      className={cn(
        "block w-full rounded-md px-2 py-1 text-left transition-colors hover:bg-accent",
        open && "@[840px]:bg-accent"
      )}
    >
      <span className="flex items-center gap-2">
        <RowIcons row={row} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            row.pending && "text-muted-foreground"
          )}
        >
          {labelOf(row)}
        </span>
        <Amount row={row} />
      </span>
      <span className="block truncate text-caption text-muted-foreground">{detailOf(row)}</span>
    </button>
  );
}
