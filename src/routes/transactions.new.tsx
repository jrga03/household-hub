import { createFileRoute, redirect } from "@tanstack/react-router";
import { useNavStore } from "@/stores/navStore";

/**
 * Target of the PWA manifest "Add Transaction" shortcut (vite.config.ts).
 * Opens the quick-add dialog (AppLayout's QuickAddTransactionDialog consumes
 * navStore.quickAddOpen) and redirects to /transactions before rendering
 * anything — same legacy-redirect pattern as dashboard.tsx.
 */
export const Route = createFileRoute("/transactions/new")({
  beforeLoad: () => {
    useNavStore.getState().setQuickAddOpen(true);
    throw redirect({ to: "/transactions", replace: true });
  },
});
