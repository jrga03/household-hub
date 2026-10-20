/* eslint-disable arch/no-direct-primitive-import -- prototype (#194), throwaway branch */
// PROTOTYPE (#194): the read-only detail of one row, for the list-detail panes.
import { Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Row } from "../fixtures";
import { Amount, labelOf, longDate, RowIcons, statusOf } from "./shared";

export function Detail({
  row,
  onClose,
  className,
  figure = true,
}: {
  row: Row | undefined;
  onClose?: () => void;
  className?: string;
  /** False when the screen already shows its one hero number. */
  figure?: boolean;
}) {
  if (!row) {
    return (
      <div
        className={cn(
          "flex min-h-64 items-center justify-center rounded-lg border border-dashed p-6",
          className
        )}
      >
        <p className="text-body text-muted-foreground">Choose a transaction to see it here.</p>
      </div>
    );
  }

  const facts: [string, string][] =
    row.kind === "transfer"
      ? [
          ["From", row.account],
          ["To", row.toAccount ?? ""],
          ["Note", row.label],
        ]
      : [
          ["Category", row.category ?? (row.kind === "income" ? "Income" : "Unassigned")],
          ["Account", row.account],
        ];

  return (
    <section
      aria-label="Transaction detail"
      className={cn("space-y-6 rounded-lg border bg-card p-6 text-card-foreground", className)}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="flex items-center gap-2 text-caption text-muted-foreground">
            <RowIcons row={row} />
            {row.kind === "transfer" ? "Transfer" : row.kind === "income" ? "Income" : "Expense"}
          </p>
          <h2 className="truncate text-heading">{labelOf(row)}</h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      <Amount row={row} className={cn("block", figure ? "text-figure" : "text-heading")} />

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-body">
        <dt className="text-muted-foreground">Date</dt>
        <dd>{longDate(row.date)}</dd>
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="min-w-0 truncate">{value}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <Badge variant={row.pending ? "outline" : "secondary"}>{statusOf(row)}</Badge>
        </dd>
      </dl>

      <div className="flex gap-2">
        <Button>
          <Pencil />
          Edit {row.kind === "transfer" ? "transfer" : "transaction"}
        </Button>
        <Button variant="outline">Mark {row.pending ? "cleared" : "pending"}</Button>
      </div>
    </section>
  );
}
