/* eslint-disable arch/no-direct-primitive-import -- prototype (#194), throwaway branch */
// PROTOTYPE (#194): Transactions B, a table on the laptop.
import { useEffect, useState, type ReactNode } from "react";
import { CircleCheck, Info, SlidersHorizontal, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { ACCOUNTS, BUDGET_GROUPS, MONTH_LABEL, ROWS } from "../fixtures";
import { Amount, dayHeading, groupByDate, labelOf, RowIcons, shortDate, totalOf } from "./shared";
import { Detail } from "./Detail";

const CATEGORY_NAMES = BUDGET_GROUPS.flatMap((group) => group.categories.map((c) => c.name));

/**
 * Laptop: a row opens its detail in a pane on the right, and the filter rail
 * folds into a Filters button while the pane is open (two panes at 1040px).
 * Each row also carries quick actions on hover or focus.
 */
export function TransactionsB() {
  const [openId, setOpenId] = useState<string | undefined>(ROWS[4]?.id);
  const open = ROWS.find((row) => row.id === openId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpenId(undefined);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      className={cn(
        "grid gap-6 p-4 @[840px]:p-6",
        open ? "@[840px]:grid-cols-[1fr_360px]" : "@[840px]:grid-cols-[200px_1fr]"
      )}
    >
      {!open && <FilterRail />}
      <div className="min-w-0 space-y-4">
        <div className="flex items-center gap-3">
          <Summary />
          {open && (
            <Button variant="outline" size="sm" className="ml-auto hidden @[840px]:inline-flex">
              <SlidersHorizontal />
              Filters
            </Button>
          )}
        </div>
        <CompactList />
        <Table openId={openId} onOpen={setOpenId} compact={Boolean(open)} />
      </div>
      {open && (
        <Detail
          row={open}
          figure={false}
          onClose={() => setOpenId(undefined)}
          className="sticky top-[calc(3.5rem+1.5rem)] hidden self-start @[840px]:block"
        />
      )}
    </div>
  );
}

function Summary() {
  return (
    <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-body text-muted-foreground">
      <span className="font-medium text-foreground">{MONTH_LABEL}</span>
      <span>{ROWS.length} transactions</span>
      <span>
        In <span className="text-income tabular-nums">+{formatPHP(totalOf(ROWS, "income"))}</span>
      </span>
      <span>
        Out{" "}
        <span className="text-foreground tabular-nums">{formatPHP(totalOf(ROWS, "expense"))}</span>
      </span>
    </p>
  );
}

function FilterRail() {
  const [account, setAccount] = useState<string | null>(null);
  return (
    <aside aria-label="Filters" className="hidden space-y-6 @[840px]:block">
      <RailGroup title="Accounts">
        <RailItem label="All accounts" active={account === null} onClick={() => setAccount(null)} />
        {ACCOUNTS.map((item) => (
          <RailItem
            key={item.id}
            label={item.name}
            active={account === item.id}
            onClick={() => setAccount(item.id)}
          />
        ))}
      </RailGroup>
      <RailGroup title="Status">
        <RailItem label="Any status" active />
        <RailItem label="Pending" />
        <RailItem label="Cleared" />
      </RailGroup>
      <RailGroup title="Categories">
        <RailItem label="All categories" active />
        {CATEGORY_NAMES.slice(0, 7).map((name) => (
          <RailItem key={name} label={name} />
        ))}
        <RailItem label="Show all 12…" muted />
      </RailGroup>
    </aside>
  );
}

function RailGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h2 className="px-2 text-label text-muted-foreground">{title}</h2>
      <ul>{children}</ul>
    </section>
  );
}

function RailItem({
  label,
  active = false,
  muted = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  muted?: boolean;
  onClick?: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "w-full truncate rounded-md px-2 py-1 text-left text-body transition-colors hover:bg-accent",
          active && "bg-accent font-medium",
          muted && "text-muted-foreground"
        )}
      >
        {label}
      </button>
    </li>
  );
}

function CompactList() {
  return (
    <div className="-mx-4 @[840px]:hidden">
      {groupByDate(ROWS).map(({ date, rows }) => (
        <section key={date} aria-label={dayHeading(date)}>
          <h2 className="px-4 pt-3 pb-1 text-label text-muted-foreground">{dayHeading(date)}</h2>
          <ul className="divide-y border-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 px-4 py-2">
                <RowIcons row={row} />
                <span
                  className={cn("min-w-0 flex-1 truncate", row.pending && "text-muted-foreground")}
                >
                  {labelOf(row)}
                  {row.category && (
                    <span className="text-caption text-muted-foreground"> · {row.category}</span>
                  )}
                </span>
                <Amount row={row} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Table({
  openId,
  onOpen,
  compact,
}: {
  openId: string | undefined;
  onOpen: (id: string) => void;
  /** The detail pane is open: drop the columns it repeats. */
  compact: boolean;
}) {
  const selected = openId;
  const setSelected = onOpen;
  return (
    <div className="hidden overflow-hidden rounded-lg border @[840px]:block">
      <table className="w-full text-body">
        <thead className="bg-muted text-label text-muted-foreground">
          <tr className="text-left">
            <th className="w-20 px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Category</th>
            {!compact && <th className="px-3 py-2 font-medium">Account</th>}
            {!compact && <th className="w-24 px-3 py-2 font-medium">Status</th>}
            <th className="w-32 px-3 py-2 text-right font-medium">Amount</th>
            <th className="w-20 px-3 py-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {ROWS.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "group relative cursor-pointer transition-colors hover:bg-accent",
                row.id === selected && "bg-accent"
              )}
            >
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                {shortDate(row.date)}
              </td>
              <td className="max-w-0 px-3 py-2">
                <button
                  type="button"
                  aria-current={row.id === selected || undefined}
                  onClick={() => setSelected(row.id)}
                  className="flex w-full items-center gap-2 text-left after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                >
                  <RowIcons row={row} />
                  <span
                    className={cn("truncate font-medium", row.pending && "text-muted-foreground")}
                  >
                    {row.label}
                  </span>
                </button>
              </td>
              <td className="max-w-0 truncate px-3 py-2 text-muted-foreground">
                {row.kind === "transfer"
                  ? "—"
                  : (row.category ?? (row.kind === "income" ? "Income" : "Unassigned"))}
              </td>
              {!compact && (
                <td className="max-w-0 truncate px-3 py-2 text-muted-foreground">
                  {labelOf(row) === row.label ? row.account : labelOf(row)}
                </td>
              )}
              {!compact && (
                <td className="px-3 py-2">
                  {row.pending ? (
                    <Badge variant="outline">
                      <Info aria-hidden />
                      Pending
                    </Badge>
                  ) : (
                    <span className="text-caption text-muted-foreground">Cleared</span>
                  )}
                </td>
              )}
              <td className="px-3 py-2 text-right">
                <Amount row={row} />
              </td>
              <td className="px-2 py-0">
                <div className="relative z-10 flex justify-end opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Mark ${row.label} ${row.pending ? "cleared" : "pending"}`}
                  >
                    <CircleCheck />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove ${row.label}`}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
