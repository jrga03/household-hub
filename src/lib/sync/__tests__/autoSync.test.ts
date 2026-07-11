/**
 * Tests for AutoSyncManager's failure-toast transition tracking (review R3):
 * exactly ONE Sonner toast when a sync run's TERMINAL failures go 0 → >0,
 * no toasting for retryable failures that were merely rescheduled with
 * backoff, no re-toasting while failures persist, re-arming once failures
 * clear. Also covers the offline gating of the focus/visibility triggers
 * (offline events must not attempt network pushes and burn retry budget).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Mocks (network/UI boundaries only) ──────────
vi.mock("../processor", () => ({
  syncProcessor: { processQueue: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/realtime-sync", () => ({
  realtimeSync: { handleReconnection: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/offline/syncQueue", () => ({
  getFailedCount: vi.fn().mockResolvedValue(0),
}));

// ─── Imports (after mocks) ──────────────────────
import { AutoSyncManager } from "../autoSync";
import { syncProcessor } from "../processor";
import { getFailedCount } from "@/lib/offline/syncQueue";
import { toast } from "sonner";

/** Invoke the private unified trigger without going through DOM events. */
function trigger(manager: AutoSyncManager): Promise<void> {
  return (manager as unknown as { triggerSync(): Promise<void> }).triggerSync();
}

/** Invoke the private focus handler directly (bypasses DOM event plumbing). */
function focus(manager: AutoSyncManager): Promise<void> {
  return (manager as unknown as { handleFocus(): Promise<void> }).handleFocus();
}

/** Invoke the private visibilitychange handler directly. */
function visibilityChange(manager: AutoSyncManager): Promise<void> {
  return (
    manager as unknown as { handleVisibilityChange(): Promise<void> }
  ).handleVisibilityChange();
}

/**
 * Queue one drain result. `terminalFailures` defaults to 0: `failed` alone
 * means retryable errors rescheduled with backoff, which must NOT toast.
 */
function mockRunResult(synced: number, failed: number, terminalFailures = 0) {
  vi.mocked(syncProcessor.processQueue).mockResolvedValueOnce({
    synced,
    failed,
    terminalFailures,
  });
}

/** Shadow jsdom's navigator.onLine prototype getter with a fixed value. */
function setNavigatorOnLine(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function restoreNavigatorOnLine() {
  // Remove the own property so the prototype getter (always true in jsdom)
  // takes over again.
  delete (window.navigator as unknown as Record<string, unknown>)["onLine"];
}

describe("AutoSyncManager failure toast (R3)", () => {
  let manager: AutoSyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFailedCount).mockResolvedValue(0);
    vi.mocked(syncProcessor.processQueue).mockResolvedValue({
      synced: 0,
      failed: 0,
      terminalFailures: 0,
    });
    manager = new AutoSyncManager();
    manager.start("user-1");
  });

  afterEach(() => {
    manager.stop();
    restoreNavigatorOnLine();
  });

  it("toasts once when terminal failures transition 0 → >0", async () => {
    mockRunResult(1, 2, 2);

    await trigger(manager);

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "2 changes failed to sync",
      expect.objectContaining({ description: expect.stringContaining("sync status") })
    );
  });

  it("uses singular copy for one failure", async () => {
    mockRunResult(0, 1, 1);

    await trigger(manager);

    expect(toast.error).toHaveBeenCalledWith("1 change failed to sync", expect.anything());
  });

  it("does NOT toast for retryable failures that were only rescheduled", async () => {
    // e.g. a transient network blip: failed counts the rescheduled items,
    // but none entered terminal status - they self-heal via backoff, and a
    // toast would contradict the header status and the (empty) sync viewer
    mockRunResult(0, 2, 0);

    await trigger(manager);

    expect(toast.error).not.toHaveBeenCalled();
  });

  it("does not re-toast while runs keep failing terminally", async () => {
    mockRunResult(0, 1, 1);
    mockRunResult(0, 1, 1);
    mockRunResult(0, 3, 3);

    await trigger(manager);
    await trigger(manager);
    await trigger(manager);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("does not re-arm on a quiet run while failed items remain in the outbox", async () => {
    mockRunResult(0, 1, 1); // terminal failure → toast
    mockRunResult(0, 0, 0); // quiet run, but queue still holds failed items
    mockRunResult(0, 1, 1); // failing again → must NOT toast again
    vi.mocked(getFailedCount).mockResolvedValue(1);

    await trigger(manager);
    await trigger(manager);
    await trigger(manager);

    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("re-arms once failures clear, so a NEW failure toasts again", async () => {
    mockRunResult(0, 1, 1); // failure → toast #1
    mockRunResult(1, 0, 0); // clean run, outbox has no failed items → reset
    mockRunResult(0, 2, 2); // new failure → toast #2
    vi.mocked(getFailedCount).mockResolvedValue(0);

    await trigger(manager);
    await trigger(manager);
    await trigger(manager);

    expect(toast.error).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenLastCalledWith("2 changes failed to sync", expect.anything());
  });

  it("never toasts when no run fails", async () => {
    mockRunResult(2, 0, 0);
    mockRunResult(0, 0, 0);

    await trigger(manager);
    await trigger(manager);

    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("AutoSyncManager offline gating of focus/visibility triggers", () => {
  let manager: AutoSyncManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getFailedCount).mockResolvedValue(0);
    vi.mocked(syncProcessor.processQueue).mockResolvedValue({
      synced: 0,
      failed: 0,
      terminalFailures: 0,
    });
    manager = new AutoSyncManager();
    manager.start("user-1");
  });

  afterEach(() => {
    manager.stop();
    restoreNavigatorOnLine();
  });

  it("skips sync on focus while offline (no retry budget burned)", async () => {
    setNavigatorOnLine(false);

    await focus(manager);

    expect(syncProcessor.processQueue).not.toHaveBeenCalled();
  });

  it("syncs on focus while online", async () => {
    setNavigatorOnLine(true);

    await focus(manager);

    expect(syncProcessor.processQueue).toHaveBeenCalledWith("user-1");
  });

  it("skips sync on visibilitychange while offline", async () => {
    setNavigatorOnLine(false);
    // jsdom default: document.hidden === false (tab visible)

    await visibilityChange(manager);

    expect(syncProcessor.processQueue).not.toHaveBeenCalled();
  });

  it("syncs on visibilitychange while online and visible", async () => {
    setNavigatorOnLine(true);

    await visibilityChange(manager);

    expect(syncProcessor.processQueue).toHaveBeenCalledWith("user-1");
  });
});
