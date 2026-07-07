import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TransactionDetailContent } from "./TransactionDetailPane";

interface TransactionDetailSheetProps {
  /** Transaction to inspect; null keeps the sheet closed */
  transactionId: string | null;
  onClose: () => void;
  /** Explicit Edit hand-off; the host closes the sheet and opens the form */
  onEdit: (id: string) => void;
  /** Per-transaction Delete (host owns confirm + close-on-success) */
  onDelete?: (id: string) => void;
  /** Pending ↔ cleared toggle; the sheet stays open with the new status */
  onToggleStatus?: (id: string) => void;
}

/**
 * Transaction inspection for narrow layouts (review R14/R38).
 *
 * Below the @[1500px] detail-pane breakpoint a row tap opens this bottom
 * sheet instead of jumping straight into the edit form, giving phones the
 * same inspect-before-edit contract the wide layout gets from the detail
 * pane. The sheet's own X (and swipe/overlay dismissal) close without side
 * effects; mutations happen only via the explicit Edit / status / Delete
 * buttons, which restore the 1-tap actions card mode dropped from rows.
 */
export function TransactionDetailSheet({
  transactionId,
  onClose,
  onEdit,
  onDelete,
  onToggleStatus,
}: TransactionDetailSheetProps) {
  return (
    <Sheet
      open={transactionId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="bottom" className="px-4 pt-4 pb-[calc(1rem+var(--safe-area-bottom))]">
        <SheetHeader className="sr-only p-0">
          <SheetTitle>Transaction details</SheetTitle>
          {/* Must not contain the word "Edit": Playwright `text=Edit` locators
              would first-match this sr-only copy instead of the button */}
          <SheetDescription>Transaction summary with quick actions.</SheetDescription>
        </SheetHeader>
        {transactionId !== null && (
          <TransactionDetailContent
            id={transactionId}
            onEdit={onEdit}
            onClear={onClose}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
            // The sheet already has its own top-right X close button
            showClose={false}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
