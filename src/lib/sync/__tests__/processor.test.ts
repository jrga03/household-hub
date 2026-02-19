import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SyncQueueItem, EntityType } from "@/types/sync";

// ─── Mocks ───────────────────────────────────────
vi.mock("@/lib/supabase", () => {
  const mockChain = () => {
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.single = vi.fn(() => Promise.resolve({ data: { id: "server-uuid-1" }, error: null }));
    // For delete().select() returning array
    chain.then = undefined; // Prevent accidental thenable behavior
    return chain;
  };

  return {
    supabase: {
      from: vi.fn(() => mockChain()),
    },
  };
});

vi.mock("@/lib/offline/syncQueue", () => ({
  getPendingQueueItems: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/sync/idMapping", () => ({
  idMapping: {
    load: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    replaceIds: vi.fn((obj: unknown) => obj),
    get: vi.fn((id: string) => id),
  },
}));

vi.mock("@/lib/sync/retry", () => ({
  calculateRetryDelay: vi.fn(() => 0), // Instant retries in tests
  sleep: vi.fn().mockResolvedValue(undefined),
}));

// ─── Imports (after mocks) ──────────────────────
import { SyncProcessor } from "../processor";
import { supabase } from "@/lib/supabase";
import { getPendingQueueItems } from "@/lib/offline/syncQueue";
import { idMapping } from "../idMapping";

// ─── Helpers ─────────────────────────────────────
function makeQueueItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: "queue-1",
    household_id: "hh-1",
    entity_type: "transaction" as EntityType,
    entity_id: "entity-1",
    operation: {
      op: "create",
      payload: { description: "Test", amount_cents: 100 },
      idempotencyKey: "dev-1-transaction-entity-1-1",
      lamportClock: 1,
      vectorClock: { "dev-1": 1 },
    },
    device_id: "dev-1",
    user_id: "user-1",
    status: "queued",
    retry_count: 0,
    max_retries: 3,
    error_message: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    synced_at: null,
    ...overrides,
  };
}

/** Setup supabase.from() to return a proper chainable mock */
function setupSupabaseMock(
  options: {
    insertResult?: { data: unknown; error: unknown };
    updateResult?: { error: unknown };
    deleteResult?: { data: unknown; error: unknown };
  } = {}
) {
  const { insertResult, updateResult, deleteResult } = options;

  vi.mocked(supabase.from).mockImplementation(() => {
    const chain: Record<string, unknown> = {};

    chain.insert = vi.fn(() => chain);
    chain.update = vi.fn(() => chain);
    chain.delete = vi.fn(() => chain);
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.lt = vi.fn(() => chain);
    chain.single = vi.fn(() =>
      Promise.resolve(insertResult ?? { data: { id: "server-uuid-1" }, error: null })
    );

    // For update/delete operations that don't call .single()
    if (updateResult) {
      // The chain resolves to the update result when awaited
      (chain as { then: unknown }).then = (
        resolve: (v: unknown) => void,
        reject: (e: unknown) => void
      ) => {
        if (updateResult.error) reject(updateResult.error);
        else resolve(updateResult);
      };
    }
    if (deleteResult) {
      (chain as { then: unknown }).then = (
        resolve: (v: unknown) => void,
        reject: (e: unknown) => void
      ) => {
        if (deleteResult.error) reject(deleteResult.error);
        else resolve(deleteResult);
      };
    }

    return chain as never;
  });
}

describe("SyncProcessor", () => {
  let processor: SyncProcessor;

  beforeEach(() => {
    processor = new SyncProcessor();
    vi.clearAllMocks();
    setupSupabaseMock();
  });

  describe("processQueue", () => {
    it("returns {synced: 0, failed: 0} with empty queue", async () => {
      vi.mocked(getPendingQueueItems).mockResolvedValue([]);
      const result = await processor.processQueue("user-1");
      expect(result).toEqual({ synced: 0, failed: 0 });
    });

    it("processes items sequentially (FIFO)", async () => {
      const order: string[] = [];
      const item1 = makeQueueItem({ id: "q1" });
      const item2 = makeQueueItem({ id: "q2" });
      vi.mocked(getPendingQueueItems).mockResolvedValue([item1, item2]);

      // Track order via supabase.from() calls
      vi.mocked(supabase.from).mockImplementation((table) => {
        if (table !== "sync_queue") {
          order.push(table);
        }
        const chain: Record<string, unknown> = {};
        chain.insert = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        chain.delete = vi.fn(() => chain);
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.lt = vi.fn(() => chain);
        chain.single = vi.fn(() =>
          Promise.resolve({ data: { id: `server-${order.length}` }, error: null })
        );
        return chain as never;
      });

      const result = await processor.processQueue("user-1");
      expect(result.synced).toBe(2);
      // Both should target "transactions" table in order
      expect(order.filter((t) => t === "transactions")).toHaveLength(2);
    });

    it("concurrent calls return the same promise", async () => {
      const item = makeQueueItem();
      vi.mocked(getPendingQueueItems).mockResolvedValue([item]);

      // Start two concurrent calls
      const p1 = processor.processQueue("user-1");
      const p2 = processor.processQueue("user-1");

      const [r1, r2] = await Promise.all([p1, p2]);
      // Both should get the same result
      expect(r1).toEqual(r2);
      // getPendingQueueItems should only be called once
      expect(getPendingQueueItems).toHaveBeenCalledTimes(1);
    });

    it("loads ID mappings at start and clears at end", async () => {
      vi.mocked(getPendingQueueItems).mockResolvedValue([]);
      await processor.processQueue("user-1");
      expect(idMapping.load).toHaveBeenCalled();
      expect(idMapping.clear).toHaveBeenCalled();
    });
  });

  describe("processItem", () => {
    it("handles create: inserts to Supabase and stores ID mapping", async () => {
      const item = makeQueueItem({
        operation: {
          op: "create",
          payload: { description: "Test" },
          idempotencyKey: "key-1",
          lamportClock: 1,
          vectorClock: {},
        },
      });

      const result = await processor.processItem(item);

      expect(result.success).toBe(true);
      expect(supabase.from).toHaveBeenCalledWith("transactions");
      expect(idMapping.add).toHaveBeenCalledWith("entity-1", "server-uuid-1");
    });

    it("handles update: calls Supabase update", async () => {
      const item = makeQueueItem({
        operation: {
          op: "update",
          payload: { description: "Updated" },
          idempotencyKey: "key-1",
          lamportClock: 2,
          vectorClock: {},
        },
      });

      // For update, the chain is awaited without .single()
      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.update = vi.fn(() => chain);
        chain.insert = vi.fn(() => chain);
        chain.delete = vi.fn(() => chain);
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => Promise.resolve({ error: null }));
        chain.lt = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
        return chain as never;
      });

      const result = await processor.processItem(item);
      expect(result.success).toBe(true);
      // Should NOT store ID mapping for updates
      expect(idMapping.add).not.toHaveBeenCalled();
    });

    it("handles delete: calls Supabase delete", async () => {
      const item = makeQueueItem({
        operation: {
          op: "delete",
          payload: {},
          idempotencyKey: "key-1",
          lamportClock: 3,
          vectorClock: {},
        },
      });

      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.delete = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        chain.insert = vi.fn(() => chain);
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => Promise.resolve({ error: null }));
        chain.lt = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
        return chain as never;
      });

      const result = await processor.processItem(item);
      expect(result.success).toBe(true);
    });

    it("replaces temp IDs before syncing", async () => {
      const item = makeQueueItem({
        operation: {
          op: "create",
          payload: { account_id: "temp-abc", description: "Test" },
          idempotencyKey: "key-1",
          lamportClock: 1,
          vectorClock: {},
        },
      });

      await processor.processItem(item);
      expect(idMapping.replaceIds).toHaveBeenCalledWith({
        account_id: "temp-abc",
        description: "Test",
      });
    });

    it("returns error for unknown operation", async () => {
      const item = makeQueueItem({
        operation: {
          op: "unknown" as never,
          payload: {},
          idempotencyKey: "key-1",
          lamportClock: 1,
          vectorClock: {},
        },
      });

      const result = await processor.processItem(item);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown operation");
    });
  });

  describe("error handling", () => {
    function setupCreateError(errorMessage: string) {
      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.insert = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        chain.delete = vi.fn(() => chain);
        chain.select = vi.fn(() => chain);
        chain.eq = vi.fn(() => Promise.resolve({ error: null }));
        chain.lt = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: null, error: new Error(errorMessage) }));
        return chain as never;
      });
    }

    it("fails immediately for non-retryable constraint errors", async () => {
      setupCreateError("violates check constraint on amount_cents");

      const item = makeQueueItem({ retry_count: 0 });
      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      expect(result.error).toContain("violates check constraint");
    });

    it("fails immediately for foreign key violations", async () => {
      setupCreateError("violates foreign key constraint on account_id");

      const item = makeQueueItem({ retry_count: 0 });
      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      expect(result.error).toContain("violates foreign key constraint");
    });

    it("fails immediately for unique constraint violations", async () => {
      setupCreateError("violates unique constraint on idempotency_key");

      const item = makeQueueItem({ retry_count: 0 });
      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
    });

    it("fails immediately for invalid input syntax", async () => {
      setupCreateError("invalid input syntax for type uuid");

      const item = makeQueueItem({ retry_count: 0 });
      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
    });

    it("fails immediately for value too long", async () => {
      setupCreateError("value too long for type character varying(200)");

      const item = makeQueueItem({ retry_count: 0 });
      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
    });

    it("retries on retryable network errors", async () => {
      setupCreateError("FetchError: network request failed");

      const item = makeQueueItem({ retry_count: 0 });
      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      // Should have slept (exponential backoff)
      const { sleep } = await import("@/lib/sync/retry");
      expect(sleep).toHaveBeenCalled();
    });

    it("fails permanently when max retries reached", async () => {
      setupCreateError("Network timeout");

      const item = makeQueueItem({ retry_count: 2 }); // Already retried twice, +1 = 3 >= MAX_RETRIES
      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Max retries reached");
    });
  });

  describe("cleanupCompleted", () => {
    it("deletes old completed items", async () => {
      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.delete = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.lt = vi.fn(() => chain);
        chain.select = vi.fn(() =>
          Promise.resolve({ data: [{ id: "old-1" }, { id: "old-2" }], error: null })
        );
        chain.insert = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
        return chain as never;
      });

      const count = await processor.cleanupCompleted(7);
      expect(count).toBe(2);
    });

    it("returns 0 on error", async () => {
      vi.mocked(supabase.from).mockImplementation(() => {
        const chain: Record<string, unknown> = {};
        chain.delete = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.lt = vi.fn(() => chain);
        chain.select = vi.fn(() => Promise.resolve({ data: null, error: new Error("DB error") }));
        chain.insert = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        chain.single = vi.fn(() => Promise.resolve({ data: null, error: null }));
        return chain as never;
      });

      const count = await processor.cleanupCompleted();
      expect(count).toBe(0);
    });
  });

  describe("entity type to table mapping", () => {
    // Test indirectly through processItem create operations
    const mappings: [EntityType, string][] = [
      ["transaction", "transactions"],
      ["account", "accounts"],
      ["category", "categories"],
      ["budget", "budgets"],
      ["debt", "debts"],
      ["internal_debt", "internal_debts"],
      ["debt_payment", "debt_payments"],
    ];

    for (const [entityType, tableName] of mappings) {
      it(`maps ${entityType} → ${tableName}`, async () => {
        const item = makeQueueItem({ entity_type: entityType });
        await processor.processItem(item);

        // First call is updateQueueStatus (sync_queue),
        // then the actual operation targets the entity table
        const calls = vi.mocked(supabase.from).mock.calls;
        const tableCalls = calls.map(([t]) => t);
        expect(tableCalls).toContain(tableName);
      });
    }
  });
});
