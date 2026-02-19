import { describe, it, expect, beforeEach } from "vitest";
import { useSyncStore } from "../syncStore";

describe("syncStore", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "online",
      lastSyncTime: null,
      pendingChanges: 0,
    });
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = useSyncStore.getState();
      expect(state.status).toBe("online");
      expect(state.lastSyncTime).toBeNull();
      expect(state.pendingChanges).toBe(0);
    });
  });

  describe("setStatus", () => {
    it("updates status to offline", () => {
      useSyncStore.getState().setStatus("offline");
      expect(useSyncStore.getState().status).toBe("offline");
    });

    it("updates status to syncing", () => {
      useSyncStore.getState().setStatus("syncing");
      expect(useSyncStore.getState().status).toBe("syncing");
    });

    it("updates status to error", () => {
      useSyncStore.getState().setStatus("error");
      expect(useSyncStore.getState().status).toBe("error");
    });
  });

  describe("setLastSyncTime", () => {
    it("records the sync timestamp", () => {
      const now = new Date();
      useSyncStore.getState().setLastSyncTime(now);
      expect(useSyncStore.getState().lastSyncTime).toBe(now);
    });
  });

  describe("setPendingChanges", () => {
    it("updates the pending changes count", () => {
      useSyncStore.getState().setPendingChanges(5);
      expect(useSyncStore.getState().pendingChanges).toBe(5);
    });

    it("can be set back to zero", () => {
      useSyncStore.getState().setPendingChanges(10);
      useSyncStore.getState().setPendingChanges(0);
      expect(useSyncStore.getState().pendingChanges).toBe(0);
    });
  });
});
