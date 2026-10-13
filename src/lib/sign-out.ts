/**
 * Sign-out flow shared by every sign-out button. Signing out wipes this
 * device, so changes the server doesn't have yet are offered as a JSON export
 * first, and unsaved drafts (device-only, ADR 0008) are warned about. Failures
 * surface as a toast.
 */

import { format } from "date-fns";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { reportError } from "@/lib/sentry";
import { confirmWithOutcome } from "@/lib/confirm";
import { listEventsNotPushed } from "@/lib/events/log";
import { countDrafts } from "@/lib/import/drafts";
import { syncBeforeSignOut } from "@/lib/sync";
import { countChanges, countOf, errorMessage } from "@/lib/utils";
import { downloadJson } from "@/lib/utils/download";

const unsavedDrafts = (count: number) => countOf(count, "unsaved draft", "unsaved drafts");

/** False when the member chose to stay signed in. */
async function offerExportOfUnpushed(): Promise<boolean> {
  await syncBeforeSignOut();
  const [unpushed, drafts] = await Promise.all([listEventsNotPushed(), countDrafts()]);
  if (unpushed.length === 0) {
    if (drafts === 0) return true;
    const outcome = await confirmWithOutcome({
      title: "Some drafts aren't saved",
      description: `${unsavedDrafts(drafts)} from a statement import are only on this device. Signing out deletes them.`,
      confirmLabel: "Sign out anyway",
      cancelLabel: "Cancel",
    });
    return outcome === "confirm";
  }

  const draftsNote =
    drafts > 0 ? ` It also deletes ${unsavedDrafts(drafts)} from a statement import.` : "";
  const outcome = await confirmWithOutcome({
    title: "Some changes haven't synced",
    description: `${countChanges(unpushed.length)} on this device haven't reached the server. Signing out deletes them from this device. Export them first to keep a copy.${draftsNote}`,
    confirmLabel: "Export and sign out",
    alternativeLabel: "Sign out anyway",
    cancelLabel: "Cancel",
  });
  if (outcome === "confirm") {
    downloadJson(`household-hub-unsynced-${format(new Date(), "yyyy-MM-dd")}.json`, {
      exportedAt: new Date().toISOString(),
      events: unpushed,
    });
  }
  return outcome === "confirm" || outcome === "alternative";
}

export async function signOutWithToast(): Promise<void> {
  try {
    if (!(await offerExportOfUnpushed())) return;
    await useAuthStore.getState().signOut();
  } catch (error) {
    console.error("Sign out failed:", error);
    reportError(error, { subsystem: "ui", operation: "sign-out" });
    toast.error(errorMessage(error, "Failed to sign out"));
  }
}
