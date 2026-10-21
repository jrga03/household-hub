import { useState } from "react";
import { format } from "date-fns";
import { Info, Pencil } from "lucide-react";
import { Button } from "@/components/app/Button";
import { Money } from "@/components/app/Money";
import { StatusBadge } from "@/components/app/StatusBadge";
import type { Actor } from "@/lib/commands/accounts";
import { isTransfer, statusOf } from "@/lib/transactions/filter";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { TransferRow } from "@/lib/transfers/projection";
import { cn } from "@/lib/utils";
import { parseLocalDate } from "@/lib/utils/dates";
import { removeRow, useStatusToggle } from "./rowActions";
import type { RowDisplay } from "./rowDisplay";
import { TransactionDialog } from "./TransactionDialog";
import { TransferDialog } from "./TransferDialog";

/**
 * A transaction or transfer as the detail pane shows it: the amount, where
 * it moved and its status, with Edit, the status change and Remove.
 */
export function TransactionDetail({
  actor,
  row,
  display,
}: {
  actor: Actor;
  row: TransactionRow | TransferRow;
  display: RowDisplay;
}) {
  const [editing, setEditing] = useState(false);
  const { toggleTo, changing, toggle } = useStatusToggle(actor, row);
  const pending = statusOf(row) === "pending";
  const facts: [string, string][] = isTransfer(row)
    ? [
        ["From", display.route?.from ?? ""],
        ["To", display.route?.to ?? ""],
        ["Category", display.category],
      ]
    : [
        ["Category", display.category],
        ["Account", display.account],
      ];
  if (row.notes) facts.push(["Notes", row.notes]);

  return (
    <div className="space-y-6">
      <Money
        {...display.amount}
        cents={row.amountCents}
        className={cn("block text-heading", pending && "text-muted-foreground")}
      />
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-body">
        <dt className="text-muted-foreground">Date</dt>
        <dd>{format(parseLocalDate(row.date), "EEEE, MMMM d, yyyy")}</dd>
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          {pending ? (
            <StatusBadge tone="outline" icon={Info}>
              Pending
            </StatusBadge>
          ) : (
            "Cleared"
          )}
        </dd>
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
        <Button variant="outline" disabled={changing} onClick={() => toggle()}>
          Mark {toggleTo}
        </Button>
        <Button
          variant="ghost"
          className="ml-auto text-destructive"
          onClick={() => void removeRow(actor, row, display.label)}
        >
          Remove
        </Button>
      </div>
      {editing &&
        (isTransfer(row) ? (
          <TransferDialog actor={actor} transfer={row} onClose={() => setEditing(false)} />
        ) : (
          <TransactionDialog actor={actor} transaction={row} onClose={() => setEditing(false)} />
        ))}
    </div>
  );
}
