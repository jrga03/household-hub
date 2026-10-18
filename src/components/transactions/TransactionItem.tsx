import { useRef, useTransition } from "react";
import { ArrowLeftRight, Circle, CircleCheck, Info, Scale } from "lucide-react";
import { toast } from "sonner";
import type { Actor } from "@/lib/commands/accounts";
import { setTransactionStatus } from "@/lib/commands/transactions";
import { setTransferStatus } from "@/lib/commands/transfers";
import { CORRECTION_LABEL } from "@/lib/corrections/events";
import type { TransactionStatus } from "@/lib/transactions/events";
import { isCorrection, isTransfer, statusOf, type ListRow } from "@/lib/transactions/filter";
import { cn, errorMessage } from "@/lib/utils";
import { removeCorrectionWithUndo } from "@/components/corrections/CorrectionDialog";
import { removeWithUndo } from "./removeWithUndo";
import type { RowDisplay } from "./rowDisplay";
import { AMOUNT_DIRECTION, spokenAmount, TransactionAmount } from "./TransactionAmount";
import { removeTransferWithUndo } from "./TransferDialog";
import { REVEAL_WIDTH, useRowGestures, type RevealedAction } from "./useRowGestures";

const OTHER_STATUS: Record<TransactionStatus, TransactionStatus> = {
  cleared: "pending",
  pending: "cleared",
};

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
  expenseInParentheses?: boolean;
}

/**
 * A swipe right reveals the status change and a swipe left reveals Remove;
 * neither happens until its button is tapped. The edit form does both by
 * keyboard or screen reader, and a long press starts selecting. A balance
 * correction is always cleared, so it only swipes to Remove.
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
  const status = statusOf(row);
  const toggleTo = OTHER_STATUS[status];
  const pending = status === "pending";
  const hasStatusAction = !isCorrection(row);
  const { label, detail, direction } = display;
  const spoken = spokenAmount(direction, row.amountCents);
  const gestures = useRowGestures({
    rowRef,
    revealed,
    onRevealChange: (action) =>
      onRevealChange(action === "status" && !hasStatusAction ? null : action),
    canSwipe: !selecting,
    onLongPress,
  });
  const { dragging, handlers } = gestures;
  const offset = hasStatusAction ? gestures.offset : Math.min(gestures.offset, 0);

  const toggleStatus = () =>
    startChanging(async () => {
      try {
        if (isCorrection(row)) return;
        if (isTransfer(row)) await setTransferStatus(actor, row.id, toggleTo);
        else await setTransactionStatus(actor, row.id, toggleTo);
        onRevealChange(null);
      } catch (caught) {
        toast.error(errorMessage(caught, "Couldn't change the status."));
      }
    });
  const remove = () => {
    if (isCorrection(row)) void removeCorrectionWithUndo(actor, row);
    else if (isTransfer(row)) void removeTransferWithUndo(actor, row, label);
    else void removeWithUndo(actor, row);
  };

  return (
    <div ref={rowRef} className="relative overflow-hidden">
      {offset > 0 && (
        <button
          type="button"
          className="absolute inset-y-0 left-0 bg-primary px-2 text-body font-medium text-primary-foreground"
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
          className="absolute inset-y-0 right-0 bg-destructive px-2 text-body font-medium text-white"
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
          !dragging && "transition-transform duration-move motion-reduce:transition-none",
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
          aria-label={`${selecting ? "Select" : isCorrection(row) ? "Open" : "Edit"} ${label}, ${spoken}${pending ? ", pending" : ""}`}
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
            {isCorrection(row) && (
              <Scale
                className="size-4 shrink-0 text-muted-foreground"
                role="img"
                aria-label={CORRECTION_LABEL}
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
                pending ? "text-muted-foreground" : AMOUNT_DIRECTION[direction].className
              )}
            >
              <TransactionAmount
                direction={direction}
                cents={row.amountCents}
                expenseInParentheses={expenseInParentheses}
              />
            </span>
          </span>
          <span className="block truncate text-body text-muted-foreground">{detail}</span>
        </button>
      </div>
    </div>
  );
}
