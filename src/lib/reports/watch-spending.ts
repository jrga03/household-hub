import { reportError } from "@/lib/sentry";
import type { SpendingGrids } from "./spending";

export interface SpendingRequest {
  userId: string;
  /** Today's day of the month, for the previous period's cut. */
  todayDay: number;
}

export type SpendingResponse = { ok: true; grids: SpendingGrids } | { ok: false; detail: string };

/**
 * Folds Spending in a Web Worker, so reading every transaction never blocks
 * the page (#269). The worker's live query reruns after each local write or
 * synced event, and each run calls `onGrids`. A failed run or worker calls
 * `onFailure`. Returns the stop function.
 */
export function watchSpending(
  request: SpendingRequest,
  onGrids: (grids: SpendingGrids) => void,
  onFailure: () => void
): () => void {
  const worker = new Worker(new URL("./spending.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<SpendingResponse>) => {
    if (event.data.ok) onGrids(event.data.grids);
    else {
      reportError(new Error(event.data.detail), { subsystem: "reports", operation: "fold" });
      onFailure();
    }
  };
  worker.onerror = (event) => {
    reportError(new Error(event.message || "The Reports worker failed."), {
      subsystem: "reports",
      operation: "worker",
    });
    onFailure();
  };
  worker.postMessage(request);
  return () => worker.terminate();
}
