import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/utils";

/** Runs a save or discard with its toast; `busy` holds the buttons while it runs. */
export function useDraftAction() {
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>, done: string, failed: string) {
    setBusy(true);
    try {
      await action();
      toast.success(done);
      return true;
    } catch (error) {
      toast.error(errorMessage(error, failed));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, run };
}
