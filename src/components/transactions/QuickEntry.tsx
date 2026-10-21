import { Plus } from "lucide-react";
import { Button } from "@/components/app/Button";
import { useHousehold } from "@/hooks/useHousehold";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useQuickEntryStore } from "@/stores/quickEntryStore";
import { TransactionDialog } from "./TransactionDialog";

/** Floating above the tab bar on phones; a header button on wide screens. */
export function AddTransactionButton({ floating }: { floating?: boolean }) {
  const setOpen = useQuickEntryStore((state) => state.setOpen);
  return (
    <Button
      onClick={() => setOpen(true)}
      aria-label="Add transaction"
      aria-keyshortcuts="n"
      size={floating ? "icon" : "sm"}
      className={cn(
        floating &&
          "fixed right-4 bottom-[calc(1rem+var(--bottom-chrome))] z-40 size-14 rounded-full shadow-float"
      )}
    >
      <Plus className={floating ? "size-6" : "size-4"} aria-hidden="true" />
      {!floating && "Add transaction"}
    </Button>
  );
}

/** The shell's Add transaction dialog, opened by the button or `n` from any screen. */
export function QuickEntryDialog() {
  const { open, setOpen } = useQuickEntryStore();
  const { household } = useHousehold();
  const userId = useAuthStore((state) => state.user?.id);
  if (!open || !household || !userId) return null;

  return (
    <TransactionDialog
      actor={{ householdId: household.id, userId }}
      onClose={() => setOpen(false)}
    />
  );
}
