import { useRef, useTransition } from "react";
import { ArrowLeftRight, Circle, CircleCheck, Info } from "lucide-react";
import { toast } from "sonner";
import type { Actor } from "@/lib/commands/accounts";
import { setTransactionStatus } from "@/lib/commands/transactions";
import { setTransferStatus } from "@/lib/commands/transfers";
import type { TransactionStatus } from "@/lib/transactions/events";
import { isTransfer, type ListRow } from "@/lib/transactions/filter";
import { cn, errorMessage } from "@/lib/utils";
import { removeWithUndo } from "./removeWithUndo";
import { spokenAmount, TransactionAmount, type AmountDirection } from "./TransactionAmount";
import { removeTransferWithUndo } from "./TransferDialog";
import { REVEAL_WIDTH, useRowGestures, type RevealedAction } from "./useRowGestures";

const OTHER_STATUS: Record<TransactionStatus, TransactionStatus> = {
  cleared: "pending",
  pending: "cleared",
};

const AMOUNT_COLOR: Record<AmountDirection, string> = {
  in: "text-income",
  out: "",
  moved: "text-muted-foreground",
};

/** What a row shows: its name, the muted line beneath it and which way its money went. */
export interface RowDisplay {
  label: string;
  detail: string;
  direction: AmountDirection;
}

interface TransactionItemProps {
  actor: Actor;
  row: ListRow;
  display: RowDisplay;
  open: boolean;
  selecting: boolean;
  selected: boolean;
  revealed: RevealedAction | null;
  onRevealChange: (revealed: RevealedAction | null) => void;
  /** A tap: opens the row, or toggles it while selecting. */
  onTap: () => void;
  onLongPress: () => void;
  /** "(₱250.00)" instead of "−₱250.00"; only the Transactions page asks for it. */
  expenseInParentheses?: boolean;
}

/**
 * A swipe right reveals the status change and a swipe left reveals Remove;
 * neither happens until its button is tapped. The edit form does both by
 * keyboard or screen reader, and a long press starts selecting.
 */
export function TransactionItem({
  actor,
  row,
  display,
  open,
  selecting,
  selected,
  revealed,
  onRevealChange,
  onTap,
  onLongPress,
  expenseInParentheses = false,
}: TransactionItemProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [changing, startChanging] = useTransition();
  const toggleTo = OTHER_STATUS[row.status];
  const pending = row.status === "pending";
  const { label, detail, direction } = display;
  const spoken = spokenAmount(direction, row.amountCents);
  const { offset, dragging, handlers } = useRowGestures({
    rowRef,
    revealed,
    onRevealChange,
    canSwipe: !selecting,
    onLongPress,
  });

  const toggleStatus = () =>
    startChanging(async () => {
      try {
        if (isTransfer(row)) await setTransferStatus(actor, row.id, toggleTo);
        else await setTransactionStatus(actor, row.id, toggleTo);
        onRevealChange(null);
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't change the status."));
      }
    });
  const remove = () =>
    void (isTransfer(row) ? removeTransferWithUndo(actor, row, label) : removeWithUndo(actor, row));

  return (
    <div ref={rowRef} className="relative overflow-hidden">
      {offset > 0 && (
        <button
          type="button"
          className="absolute inset-y-0 left-0 bg-primary px-2 text-sm font-medium text-primary-foreground"
          style={{ width: REVEAL_WIDTH }}
          disabled={changing}
          onClick={toggleStatus}
        >
          Mark {toggleTo}
        </button>
      )}
      {offset < 0 && (
        <button
          type="button"
          className="absolute inset-y-0 right-0 bg-destructive px-2 text-sm font-medium text-white"
          style={{ width: REVEAL_WIDTH }}
          onClick={remove}
        >
          Remove
        </button>
      )}
      <div
        {...handlers}
        className={cn(
          "relative flex touch-pan-y select-none items-center gap-3 bg-background px-3 py-2 [-webkit-touch-callout:none]",
          !dragging && "transition-transform duration-200 motion-reduce:transition-none",
          selected && "bg-accent",
          open && !selecting && "bg-accent ring-2 ring-inset ring-ring"
        )}
        style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
      >
        {selecting &&
          (selected ? (
            <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
          ) : (
            <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          ))}
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-label={`${selecting ? "Select" : "Edit"} ${label}, ${spoken}${pending ? ", pending" : ""}`}
          aria-pressed={selecting ? selected : undefined}
          aria-current={(open && !selecting) || undefined}
          onClick={onTap}
        >
          <span className="flex items-center gap-2">
            {isTransfer(row) && (
              <ArrowLeftRight
                className="size-4 shrink-0 text-muted-foreground"
                role="img"
                aria-label="Transfer"
              />
            )}
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-medium",
                pending && "text-muted-foreground"
              )}
            >
              {label}
            </span>
            {pending && (
              <Info
                className="size-4 shrink-0 text-muted-foreground"
                role="img"
                aria-label="Pending"
              />
            )}
            <span
              className={cn(
                "shrink-0 tabular-nums",
                pending ? "text-muted-foreground" : AMOUNT_COLOR[direction]
              )}
            >
              <TransactionAmount
                direction={direction}
                cents={row.amountCents}
                expenseInParentheses={expenseInParentheses}
              />
            </span>
          </span>
          <span className="block truncate text-sm text-muted-foreground">{detail}</span>
        </button>
      </div>
    </div>
  );
}
