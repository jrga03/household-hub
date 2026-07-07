import { describe, it, expect } from "vitest";
import { getSyncStatusConfig, type SyncStatusInputs } from "./GlobalSyncStatus";

function inputs(overrides: Partial<SyncStatusInputs> = {}): SyncStatusInputs {
  return {
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    lastSyncTime: null,
    ...overrides,
  };
}

describe("getSyncStatusConfig", () => {
  it("shows Offline when disconnected, with pending count in the sublabel", () => {
    const status = getSyncStatusConfig(inputs({ isOnline: false, pendingCount: 3 }));
    expect(status.label).toBe("Offline");
    expect(status.sublabel).toBe("3 pending");
  });

  it("shows Offline with locally-saved copy when nothing is pending", () => {
    const status = getSyncStatusConfig(inputs({ isOnline: false }));
    expect(status.label).toBe("Offline");
    expect(status.sublabel).toBe("All changes saved locally");
  });

  it("shows Syncing with animation while a sync is in flight", () => {
    const status = getSyncStatusConfig(inputs({ isSyncing: true, pendingCount: 2 }));
    expect(status.label).toBe("Syncing");
    expect(status.sublabel).toBe("2 items");
    expect(status.animate).toBe(true);
  });

  it("surfaces failures with an exact count (review R3)", () => {
    const status = getSyncStatusConfig(inputs({ failedCount: 2 }));
    expect(status.label).toBe("Sync failed");
    expect(status.sublabel).toBe("2 changes failed to sync");
    expect(status.className).toContain("red");
  });

  it("uses singular phrasing for a single failure", () => {
    const status = getSyncStatusConfig(inputs({ failedCount: 1 }));
    expect(status.sublabel).toBe("1 change failed to sync");
  });

  it("failed wins over pending", () => {
    const status = getSyncStatusConfig(inputs({ failedCount: 1, pendingCount: 5 }));
    expect(status.label).toBe("Sync failed");
  });

  it("failed wins over the green All synced state", () => {
    const status = getSyncStatusConfig(
      inputs({ failedCount: 1, lastSyncTime: new Date("2026-07-07T00:00:00Z") })
    );
    expect(status.label).toBe("Sync failed");
    expect(status.className).not.toContain("green");
  });

  it("shows Pending sync when items are queued and nothing failed", () => {
    const status = getSyncStatusConfig(inputs({ pendingCount: 1 }));
    expect(status.label).toBe("Pending sync");
    expect(status.sublabel).toBe("1 item");
  });

  it("shows All synced with relative time when the queue is clear", () => {
    const status = getSyncStatusConfig(
      inputs({ lastSyncTime: new Date(Date.now() - 5 * 60 * 1000) })
    );
    expect(status.label).toBe("All synced");
    expect(status.sublabel).toMatch(/^Updated .*ago$/);
  });

  it("shows Up to date when the queue is clear but no sync time is recorded", () => {
    const status = getSyncStatusConfig(inputs());
    expect(status.label).toBe("All synced");
    expect(status.sublabel).toBe("Up to date");
  });
});
