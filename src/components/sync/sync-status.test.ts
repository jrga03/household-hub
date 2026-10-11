import { describe, expect, it } from "vitest";
import { summarizeSyncStatus } from "./sync-status";

describe("the sync indicator's summary", () => {
  it.each([
    [{ online: true, waiting: 0, stuckCount: 0 }, "Synced", "synced"],
    [{ online: true, waiting: 2, stuckCount: 0 }, "2 waiting", "waiting"],
    [{ online: false, waiting: 0, stuckCount: 0 }, "Offline", "offline"],
    [{ online: false, waiting: 2, stuckCount: 0 }, "Offline · 2 waiting", "offline"],
    [{ online: true, waiting: 0, stuckCount: 1 }, "1 stuck", "attention"],
    [{ online: false, waiting: 3, stuckCount: 1 }, "Offline · 3 waiting · 1 stuck", "attention"],
  ] as const)("%o reads %s", (status, label, tone) => {
    expect(summarizeSyncStatus(status)).toEqual({ label, tone });
  });
});
