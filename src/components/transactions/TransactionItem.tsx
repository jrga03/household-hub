import { useRef } from "react";
import { ArrowLeftRight, Circle, CircleCheck, Info, Scale } from "lucide-react";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import type { Actor } from "@/lib/commands/accounts";
import { CORRECTION_LABEL } from "@/lib/corrections/events";
import { isCorrection, isTransfer, statusOf, type ListRow as Row } from "@/lib/transactions/filter";
import { cn } from "@/lib/utils";
import { removeRow, RowQuickActions, useStatusToggle } from "./rowActions";
import type { RowDisplay } from "./rowDisplay";
import { REVEAL_WIDTH, useRowGestures, type RevealedAction } from "./useRowGestures";

interface TransactionItemProps {
  actor: Actor;
  row: Row;
  display: RowDisplay;
  open: boolean;
  selecting: boolean;
  selected: boolean;
  revealed: RevealedAction | null;
  onRevealChange: (revealed: RevealedAction | null) => void;
  /** A tap: opens the row, or toggles it while selecting. */
  onTap: () => void;
  onLongPress: () => void;
}

/** The icons before a row's label: transfer, correction and pending. */
export function RowIcons({ row }: { row: Row }) {
  return (
    <>
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
      {statusOf(row) === "pending" && (
        <Info className="size-4 shrink-0 text-muted-foreground" role="img" aria-label="Pending" />
      )}
    </>
  );
}

/**
 * A two-line row of the phone list. A swipe right reveals the status change
 * and a swipe left reveals Remove; neither happens until its button is
 * tapped. The detail does both by keyboard or screen reader, and a long press
 * starts selecting. A balance correction is always cleared, so it only swipes
 * to Remove.
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
}: TransactionItemProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const { canToggle, toggleTo, changing, toggle } = useStatusToggle(actor, row);
  const pending = statusOf(row) === "pending";
  const { label, detail, amount } = display;
  const gestures = useRowGestures({
    rowRef,
    revealed,
    onRevealChange: (action) => onRevealChange(action === "status" && !canToggle ? null : action),
    canSwipe: !selecting,
    onLongPress,
  });
  const { dragging, handlers } = gestures;
  const offset = canToggle ? gestures.offset : Math.min(gestures.offset, 0);
  const highlighted = selected || (open && !selecting);

  return (
    <div ref={rowRef} className="relative overflow-hidden">
      {offset > 0 && (
        <button
          type="button"
          className="absolute inset-y-0 left-0 bg-primary px-2 text-body font-medium text-primary-foreground"
          style={{ width: REVEAL_WIDTH }}
          disabled={changing}
          onClick={() => toggle(() => onRevealChange(null))}
        >
          Mark {toggleTo}
        </button>
      )}
      {offset < 0 && (
        <button
          type="button"
          className="absolute inset-y-0 right-0 bg-destructive px-2 text-body font-medium text-destructive-foreground"
          style={{ width: REVEAL_WIDTH }}
          onClick={() => void removeRow(actor, row, label)}
        >
          Remove
        </button>
      )}
      <div
        {...handlers}
        className={cn(
          "relative touch-pan-y select-none [-webkit-touch-callout:none]",
          !dragging && "transition-transform duration-move motion-reduce:transition-none"
        )}
        style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
      >
        <ListRow
          onClick={onTap}
          open={open && !selecting}
          pressed={selecting ? selected : undefined}
          className={highlighted ? "bg-accent" : "bg-background"}
          leading={
            <>
              {selecting &&
                (selected ? (
                  <CircleCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
                ) : (
                  <Circle className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ))}
              <RowIcons row={row} />
            </>
          }
          label={label}
          muted={pending}
          amount={
            <Money
              {...amount}
              cents={row.amountCents}
              className={cn(pending && "text-muted-foreground")}
            />
          }
          detail={detail}
          actions={
            selecting ? undefined : <RowQuickActions actor={actor} row={row} label={label} />
          }
        />
      </div>
    </div>
  );
}
