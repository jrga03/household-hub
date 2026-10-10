/** Sign-out flow shared by every sign-out button: failures surface as a toast. */

import { toast } from "sonner";
import { useAuthStore } from "@/stores/authStore";
import { reportError } from "@/lib/sentry";
import { errorMessage } from "@/lib/utils";

export async function signOutWithToast(): Promise<void> {
  try {
    await useAuthStore.getState().signOut();
  } catch (error) {
    console.error("Sign out failed:", error);
    reportError(error, { subsystem: "ui", operation: "sign-out" });
    toast.error(errorMessage(error, "Failed to sign out"));
  }
}
