import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { useConfirmStore, type ConfirmRequest } from "@/lib/confirm";

/**
 * Renders the pending `confirm()` request (see `@/lib/confirm`) as an
 * AlertDialog. Mounted ONCE at app level (AuthProvider); call sites never
 * render this themselves — they just `await confirm({...})`.
 */
export function ConfirmDialogHost() {
  const request = useConfirmStore((state) => state.request);
  const settle = useConfirmStore((state) => state.settle);

  // Keep the last request around while the close animation plays so the
  // dialog doesn't blank out mid-fade after settling (adjust-state-during-
  // render pattern; ref reads during render are disallowed here)
  const [lastRequest, setLastRequest] = useState<ConfirmRequest | null>(request);
  if (request && request !== lastRequest) {
    setLastRequest(request);
  }
  const display = request ?? lastRequest;

  return (
    <AlertDialog
      open={request !== null}
      onOpenChange={(open) => {
        // Escape (Radix alert dialogs don't close on outside click) =
        // dismissed without choosing. Distinct from the explicit cancel
        // button so callers using `distinguishDismiss` (sign-out) can treat
        // dismissal as "abort" rather than as the cancel action. After a
        // button click this fires too, but settle() is already a no-op then.
        if (!open) settle("dismiss");
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{display?.title}</AlertDialogTitle>
          {display?.description && (
            <AlertDialogDescription className="whitespace-pre-line">
              {display.description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle("cancel")}>
            {display?.cancelLabel ?? "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction
            className={
              display?.destructive ? buttonVariants({ variant: "destructive" }) : undefined
            }
            onClick={() => settle("confirm")}
          >
            {display?.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
