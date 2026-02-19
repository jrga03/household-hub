import { describe, it, expect, beforeEach } from "vitest";
import { useSyncIssuesStore, type SyncIssue } from "../syncIssuesStore";

function makeIssue(overrides: Partial<SyncIssue> = {}): SyncIssue {
  return {
    id: "issue-1",
    entityType: "transaction",
    entityId: "entity-1",
    issueType: "sync-failed",
    message: "Network error",
    timestamp: new Date().toISOString(),
    canRetry: true,
    ...overrides,
  };
}

describe("syncIssuesStore", () => {
  beforeEach(() => {
    useSyncIssuesStore.setState({ issues: [] });
  });

  describe("initial state", () => {
    it("starts with empty issues array", () => {
      expect(useSyncIssuesStore.getState().issues).toEqual([]);
    });
  });

  describe("addIssue", () => {
    it("appends an issue", () => {
      const issue = makeIssue();
      useSyncIssuesStore.getState().addIssue(issue);
      expect(useSyncIssuesStore.getState().issues).toHaveLength(1);
      expect(useSyncIssuesStore.getState().issues[0]).toBe(issue);
    });

    it("preserves existing issues when adding", () => {
      const i1 = makeIssue({ id: "i1" });
      const i2 = makeIssue({ id: "i2" });
      useSyncIssuesStore.getState().addIssue(i1);
      useSyncIssuesStore.getState().addIssue(i2);
      expect(useSyncIssuesStore.getState().issues).toHaveLength(2);
    });
  });

  describe("removeIssue", () => {
    it("removes an issue by ID", () => {
      const i1 = makeIssue({ id: "i1" });
      const i2 = makeIssue({ id: "i2" });
      useSyncIssuesStore.getState().addIssue(i1);
      useSyncIssuesStore.getState().addIssue(i2);

      useSyncIssuesStore.getState().removeIssue("i1");

      const remaining = useSyncIssuesStore.getState().issues;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe("i2");
    });

    it("does nothing if ID not found", () => {
      useSyncIssuesStore.getState().addIssue(makeIssue({ id: "i1" }));
      useSyncIssuesStore.getState().removeIssue("nonexistent");
      expect(useSyncIssuesStore.getState().issues).toHaveLength(1);
    });
  });

  describe("clearAll", () => {
    it("empties the issues array", () => {
      useSyncIssuesStore.getState().addIssue(makeIssue({ id: "i1" }));
      useSyncIssuesStore.getState().addIssue(makeIssue({ id: "i2" }));
      useSyncIssuesStore.getState().addIssue(makeIssue({ id: "i3" }));

      useSyncIssuesStore.getState().clearAll();
      expect(useSyncIssuesStore.getState().issues).toEqual([]);
    });
  });

  describe("issue types", () => {
    it("stores conflict-resolved issues", () => {
      const issue = makeIssue({
        issueType: "conflict-resolved",
        localValue: { amount: 100 },
        remoteValue: { amount: 200 },
        resolvedValue: { amount: 200 },
      });
      useSyncIssuesStore.getState().addIssue(issue);
      const stored = useSyncIssuesStore.getState().issues[0];
      expect(stored.issueType).toBe("conflict-resolved");
      expect(stored.localValue).toEqual({ amount: 100 });
      expect(stored.remoteValue).toEqual({ amount: 200 });
      expect(stored.resolvedValue).toEqual({ amount: 200 });
    });

    it("stores validation-error issues", () => {
      const issue = makeIssue({
        issueType: "validation-error",
        canRetry: false,
      });
      useSyncIssuesStore.getState().addIssue(issue);
      expect(useSyncIssuesStore.getState().issues[0].canRetry).toBe(false);
    });
  });
});
