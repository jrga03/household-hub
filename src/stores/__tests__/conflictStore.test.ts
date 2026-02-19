import { describe, it, expect, beforeEach } from "vitest";
import { useConflictStore } from "../conflictStore";
import type { Conflict } from "@/types/sync";

function makeConflict(overrides: Partial<Conflict> = {}): Conflict {
  return {
    id: "conflict-1",
    entity_type: "transaction",
    entity_id: "entity-1",
    detected_at: new Date().toISOString(),
    local_event: {} as Conflict["local_event"],
    remote_event: {} as Conflict["remote_event"],
    resolution: "pending",
    resolved_value: null,
    resolved_at: null,
    ...overrides,
  };
}

describe("conflictStore", () => {
  beforeEach(() => {
    useConflictStore.setState({ conflicts: [] });
  });

  describe("initial state", () => {
    it("starts with empty conflicts array", () => {
      expect(useConflictStore.getState().conflicts).toEqual([]);
    });
  });

  describe("addConflict", () => {
    it("appends a conflict to the array", () => {
      const conflict = makeConflict();
      useConflictStore.getState().addConflict(conflict);
      expect(useConflictStore.getState().conflicts).toHaveLength(1);
      expect(useConflictStore.getState().conflicts[0]).toBe(conflict);
    });

    it("appends multiple conflicts preserving order", () => {
      const c1 = makeConflict({ id: "c1" });
      const c2 = makeConflict({ id: "c2" });
      useConflictStore.getState().addConflict(c1);
      useConflictStore.getState().addConflict(c2);
      const ids = useConflictStore.getState().conflicts.map((c) => c.id);
      expect(ids).toEqual(["c1", "c2"]);
    });
  });

  describe("removeConflict", () => {
    it("removes a conflict by ID", () => {
      const c1 = makeConflict({ id: "c1" });
      const c2 = makeConflict({ id: "c2" });
      useConflictStore.getState().addConflict(c1);
      useConflictStore.getState().addConflict(c2);

      useConflictStore.getState().removeConflict("c1");

      const remaining = useConflictStore.getState().conflicts;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("c2");
    });

    it("does nothing if ID not found", () => {
      const c1 = makeConflict({ id: "c1" });
      useConflictStore.getState().addConflict(c1);
      useConflictStore.getState().removeConflict("nonexistent");
      expect(useConflictStore.getState().conflicts).toHaveLength(1);
    });
  });

  describe("clearConflicts", () => {
    it("empties the array", () => {
      useConflictStore.getState().addConflict(makeConflict({ id: "c1" }));
      useConflictStore.getState().addConflict(makeConflict({ id: "c2" }));
      useConflictStore.getState().clearConflicts();
      expect(useConflictStore.getState().conflicts).toEqual([]);
    });
  });

  describe("getPendingCount", () => {
    it("returns count of pending conflicts only", () => {
      useConflictStore.getState().addConflict(makeConflict({ id: "c1", resolution: "pending" }));
      useConflictStore
        .getState()
        .addConflict(
          makeConflict({ id: "c2", resolution: "local-wins" as Conflict["resolution"] })
        );
      useConflictStore.getState().addConflict(makeConflict({ id: "c3", resolution: "pending" }));

      expect(useConflictStore.getState().getPendingCount()).toBe(2);
    });

    it("returns 0 when no conflicts exist", () => {
      expect(useConflictStore.getState().getPendingCount()).toBe(0);
    });

    it("returns 0 when all conflicts are resolved", () => {
      useConflictStore
        .getState()
        .addConflict(
          makeConflict({ id: "c1", resolution: "local-wins" as Conflict["resolution"] })
        );
      expect(useConflictStore.getState().getPendingCount()).toBe(0);
    });
  });
});
