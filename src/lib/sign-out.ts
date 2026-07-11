/**
 * Component-layer sign-out flow shared by every sign-out button (MobileNav,
 * AppSidebar).
 *
 * Lifted out of authStore (review R39): when unsynced offline changes exist,
 * the user is asked — via the app-level AlertDialog — whether to export a CSV
 * backup first, then `signOut({ exportFirst })` runs. Only an explicit button
 * click proceeds: "Export & sign out" exports then signs out, "Sign out
 * without export" signs out immediately, and dismissing the dialog
 * (Escape/close) ABORTS the sign-out entirely — dismissal must never silently
 * discard unsynced changes. If the export fails the logout is aborted and the
 * error surfaces as a toast.
 */

import { toast } from "sonner";
import { confirmWithOutcome } from "@/lib/confirm";
import { useAuthStore, checkUnsyncedData } from "@/stores/authStore";

export async function signOutWithConfirm(): Promise<void> {
  let exportFirst = false;

  if (await checkUnsyncedData()) {
    const choice = await confirmWithOutcome({
      title: "You have unsynced changes",
      description:
        "Offline changes that haven't synced yet will be lost when you sign out. " +
        "Export them as a CSV backup first?",
      confirmLabel: "Export & sign out",
      cancelLabel: "Sign out without export",
    });
    // Escape / dismissing the dialog means "stay signed in"
    if (choice === "dismiss") return;
    exportFirst = choice === "confirm";
  }

  try {
    await useAuthStore.getState().signOut({ exportFirst });
  } catch (error) {
    console.error("Sign out failed:", error);
    toast.error(error instanceof Error ? error.message : "Failed to sign out");
  }
}
