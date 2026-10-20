// PROTOTYPE (#194): Transactions A, list and detail.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MONTH_LABEL, ROWS } from "../fixtures";
import { Detail } from "./Detail";
import {
  Amount,
  dayHeading,
  detailOf,
  groupByDate,
  labelOf,
  netOf,
  RowIcons,
  SignedTotal,
} from "./shared";

const BELOW_HEADER = "top-[calc(3.5rem)]";

const CHIPS = [
  { label: MONTH_LABEL, active: true },
  { label: "Account", active: false },
  { label: "Category", active: false },
  { label: "Status", active: false },
];

export function TransactionsA() {
  const [openId, setOpenId] = useState<string | undefined>(ROWS[2]?.id);
  const open = ROWS.find((row) => row.id === openId);

  return (
    <div className="grid gap-6 p-4 @[840px]:grid-cols-[460px_1fr] @[840px]:p-6">
      <div className="min-w-0 space-y-4">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 @[840px]:mx-0 @[840px]:flex-wrap @[840px]:px-0">
          {CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={cn(
                "flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-label font-medium",
                chip.active
                  ? "border-transparent bg-secondary text-secondary-foreground"
                  : "text-muted-foreground"
              )}
            >
              {chip.label}
              <ChevronDown className="size-4" aria-hidden />
            </button>
          ))}
        </div>

        <div className="-mx-4 @[840px]:mx-0 @[840px]:rounded-lg @[840px]:border">
          {groupByDate(ROWS).map(({ date, rows }) => (
            <section key={date} aria-label={dayHeading(date)}>
              <h2
                className={cn(
                  "sticky z-10 flex items-center justify-between gap-3 border-b bg-muted px-4 py-1 text-label text-muted-foreground",
                  BELOW_HEADER
                )}
              >
                <span>{dayHeading(date)}</span>
                <SignedTotal cents={netOf(rows)} />
              </h2>
              <ul>
                {rows.map((row) => (
                  <li key={row.id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      aria-current={row.id === openId || undefined}
                      onClick={() => setOpenId(row.id)}
                      className={cn(
                        "block w-full px-4 py-2 text-left transition-colors hover:bg-accent",
                        row.id === openId && "@[840px]:bg-accent"
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
                      <span className="block truncate text-body text-muted-foreground">
                        {detailOf(row)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <div className="hidden @[840px]:block">
        <Detail
          row={open}
          onClose={() => setOpenId(undefined)}
          className={cn("sticky", "top-[calc(3.5rem+1.5rem)]")}
        />
      </div>
    </div>
  );
}
