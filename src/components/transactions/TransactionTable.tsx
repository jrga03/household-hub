import { useState } from "react";
import { format } from "date-fns";
import { Info } from "lucide-react";
import { Button } from "@/components/app/Button";
import { DataTable, type DataTableColumn } from "@/components/app/DataTable";
import { Money } from "@/components/app/Money";
import { StatusBadge } from "@/components/app/StatusBadge";
import type { Actor } from "@/lib/commands/accounts";
import { statusOf, type ListRow } from "@/lib/transactions/filter";
import { cn, countOf } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { RowQuickActions } from "./rowActions";
import type { RowDisplay } from "./rowDisplay";
import { RowIcons } from "./TransactionItem";

/** Rows rendered at first and added per "Show more": a table isn't virtualized. */
export const TABLE_PAGE = 100;

interface DisplayedRow {
  row: ListRow;
  display: RowDisplay;
}

const pendingOf = (row: ListRow) => statusOf(row) === "pending";

function columnsFor(actor: Actor): DataTableColumn<DisplayedRow>[] {
  return [
    {
      id: "date",
      header: "Date",
      className: "w-20 text-muted-foreground",
      cell: ({ row }) => format(parseLocalDate(row.date), "MMM d"),
    },
    {
      id: "description",
      header: "Description",
      target: true,
      // Takes the room left over and truncates, so the other columns never do.
      className: "w-full max-w-0",
      cell: ({ row, display }) => (
        <span className="flex items-center gap-2">
          <RowIcons row={row} />
          <span className={cn("truncate font-medium", pendingOf(row) && "text-muted-foreground")}>
            {display.label}
          </span>
        </span>
      ),
    },
    {
      id: "category",
      header: "Category",
      className: "text-muted-foreground",
      cell: ({ display }) => display.category,
    },
    {
      id: "account",
      header: "Account",
      hideBelow: 600,
      className: "text-muted-foreground",
      cell: ({ display }) =>
        display.route ? (
          // Breaks only at the arrow, never mid-name, and never truncates.
          <span className="whitespace-normal">
            <span className="whitespace-nowrap">{display.route.from} →</span>{" "}
            <span className="whitespace-nowrap">{display.route.to}</span>
          </span>
        ) : (
          display.account
        ),
    },
    {
      id: "status",
      header: "Status",
      hideBelow: 600,
      cell: ({ row }) =>
        pendingOf(row) ? (
          <StatusBadge tone="outline" icon={Info}>
            Pending
          </StatusBadge>
        ) : (
          <span className="text-caption text-muted-foreground">Cleared</span>
        ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "end",
      cell: ({ row, display }) => (
        <Money
          {...display.amount}
          cents={row.amountCents}
          className={cn(pendingOf(row) && "text-muted-foreground")}
        />
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      actions: true,
      cell: ({ row, display }) => <RowQuickActions actor={actor} row={row} label={display.label} />,
    },
  ];
}

/** The laptop's transactions: one table row each, opening in the detail pane. */
export function TransactionTable({
  actor,
  rows,
  openId,
  onOpen,
}: {
  actor: Actor;
  rows: DisplayedRow[];
  openId: string | null;
  onOpen: (id: string) => void;
}) {
  const [shownCount, setShownCount] = useState(TABLE_PAGE);
  const hidden = rows.length - shownCount;
  return (
    <div className="space-y-4">
      <DataTable
        label="Transactions"
        columns={columnsFor(actor)}
        rows={rows.slice(0, shownCount)}
        getRowKey={({ row }) => row.id}
        rowTarget={({ row }) => ({ onClick: () => onOpen(row.id) })}
        isRowOpen={({ row }) => row.id === openId}
      />
      {hidden > 0 && (
        <Button variant="outline" onClick={() => setShownCount((count) => count + TABLE_PAGE)}>
          Show {Math.min(hidden, TABLE_PAGE).toLocaleString("en-PH")} more of{" "}
          {countOf(hidden, "transaction", "transactions")}
        </Button>
      )}
    </div>
  );
}
