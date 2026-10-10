import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SyncQueueItem, EntityType } from "@/types/sync";

// ─── Mocks ───────────────────────────────────────
// Only the network boundary is mocked; the local outbox (db.syncQueue) is the
// real Dexie table backed by fake-indexeddb, so these tests exercise the real
// enqueue → drain → status integration.
vi.mock("@/lib/supabase", () => {
  const supabase = { from: vi.fn() };
  return { supabase, untypedSupabase: supabase };
});

vi.mock("@/lib/sync/retry", () => ({
  calculateRetryDelay: vi.fn(() => 60_000), // predictable next_retry_at in tests
}));

// ─── Imports (after mocks) ──────────────────────
import { SyncProcessor } from "../processor";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/dexie/db";
import { getPendingQueueItems } from "@/lib/offline/syncQueue";
import { queryClient } from "@/lib/queryClient";
import { keysAfterWrite, queryKeys } from "@/lib/query-keys";
import { createTestPayment } from "@/lib/debts/__tests__/test-utils";
import { cents } from "@/test/cents";

// ─── Helpers ─────────────────────────────────────
function makeQueueItem(overrides: Partial<SyncQueueItem> = {}): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    entity_type: "transaction" as EntityType,
    entity_id: "entity-1",
    operation: {
      op: "create",
      payload: { id: "entity-1", description: "Test", amount_cents: 100 },
      idempotencyKey: `dev-1-transaction-entity-1-${Math.floor(Math.random() * 1e9)}`,
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
    next_retry_at: null,
    ...overrides,
  };
}

function makeSupabaseError(message: string, code?: string): Error & { code?: string } {
  return Object.assign(new Error(message), { code });
}

/**
 * Configure the supabase.from mock. The processor uses exactly three shapes:
 * - insert(payload)            → awaited directly
 * - upsert(payload, options)   → awaited directly (for budgets)
 * - update(payload).eq(...)    → awaited after .eq
 * - delete().eq(...)           → awaited after .eq
 */
function setupSupabaseMock(
  options: {
    insertError?: unknown;
    insertErrors?: unknown[];
    updateError?: unknown;
    deleteError?: unknown;
    upsertError?: unknown;
    onTable?: (table: string) => void;
    onInsert?: (payload: Record<string, unknown>) => void;
    onUpdate?: (payload: Record<string, unknown>) => void;
    onUpsert?: (payload: unknown, options: unknown) => void;
  } = {}
) {
  const {
    insertError = null,
    insertErrors,
    updateError = null,
    deleteError = null,
    upsertError = null,
    onTable,
    onInsert,
    onUpdate,
    onUpsert,
  } = options;

  let insertCalls = 0;
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    onTable?.(table);
    return {
      insert: vi.fn((payload: Record<string, unknown>) => {
        onInsert?.(payload);
        const error = insertErrors ? (insertErrors[insertCalls] ?? null) : insertError;
        insertCalls += 1;
        return Promise.resolve({ error });
      }),
      upsert: vi.fn((payload: unknown, upsertOptions: unknown) => {
        onUpsert?.(payload, upsertOptions);
        return Promise.resolve({ error: upsertError });
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        onUpdate?.(payload);
        return { eq: vi.fn(() => Promise.resolve({ error: updateError })) };
      }),
      delete: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: deleteError })) })),
    };
  }) as never);
}

describe("SyncProcessor (local outbox)", () => {
  let processor: SyncProcessor;

  beforeEach(async () => {
    processor = new SyncProcessor();
    vi.clearAllMocks();
    setupSupabaseMock();
    await db.syncQueue.clear();
    await db.meta.clear();
    await db.syncIssues.clear();
    await db.debtPayments.clear();
  });

  describe("processQueue", () => {
    it("returns an all-zero result with empty queue", async () => {
      const result = await processor.processQueue("user-1");
      expect(result).toEqual({ synced: 0, failed: 0, terminalFailures: 0 });
    });

    it("drains queued items and marks them completed locally", async () => {
      const item1 = makeQueueItem();
      const item2 = makeQueueItem({ entity_id: "entity-2" });
      await db.syncQueue.bulkAdd([item1, item2]);

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 2, failed: 0, terminalFailures: 0 });
      const stored1 = await db.syncQueue.get(item1.id);
      const stored2 = await db.syncQueue.get(item2.id);
      expect(stored1?.status).toBe("completed");
      expect(stored1?.synced_at).toBeTruthy();
      expect(stored2?.status).toBe("completed");
    });

    it("skips items scheduled for a future retry", async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      await db.syncQueue.add(makeQueueItem({ next_retry_at: future }));

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 0, failed: 0, terminalFailures: 0 });
      expect(vi.mocked(supabase.from)).not.toHaveBeenCalled();
    });

    it("skips items belonging to another user", async () => {
      await db.syncQueue.add(makeQueueItem({ user_id: "someone-else" }));

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 0, failed: 0, terminalFailures: 0 });
    });

    it("concurrent calls share one session (item processed once)", async () => {
      const tables: string[] = [];
      setupSupabaseMock({ onTable: (t) => tables.push(t) });
      await db.syncQueue.add(makeQueueItem());

      const [r1, r2] = await Promise.all([
        processor.processQueue("user-1"),
        processor.processQueue("user-1"),
      ]);

      expect(r1).toEqual(r2);
      expect(tables.filter((t) => t === "transactions")).toHaveLength(1);
    });

    it("runs one extra pass for writes queued while a drain is in flight", async () => {
      const lateItem = makeQueueItem({ entity_id: "entity-late" });
      const inserted: unknown[] = [];
      let lateCalls: Promise<unknown>[] = [];
      vi.mocked(supabase.from).mockImplementation((() => ({
        insert: vi.fn(async (payload: unknown) => {
          inserted.push(payload);
          if (inserted.length === 1) {
            await db.syncQueue.add(lateItem);
            lateCalls = [processor.processQueue("user-1"), processor.processQueue("user-1")];
          }
          return { error: null };
        }),
      })) as never);
      const passes = vi.spyOn(
        processor as unknown as { executeProcessing: (userId: string) => Promise<unknown> },
        "executeProcessing"
      );
      await db.syncQueue.add(makeQueueItem());

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 2, failed: 0, terminalFailures: 0 });
      expect(passes).toHaveBeenCalledTimes(2);
      expect(inserted).toHaveLength(2);
      expect((await db.syncQueue.get(lateItem.id))?.status).toBe("completed");
      expect(await Promise.all(lateCalls)).toEqual([result, result]);
    });

    it("resets items stranded in 'syncing' by a crash and processes them", async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const stranded = makeQueueItem({ status: "syncing", updated_at: staleTime });
      await db.syncQueue.add(stranded);

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 1, failed: 0, terminalFailures: 0 });
      const stored = await db.syncQueue.get(stranded.id);
      expect(stored?.status).toBe("completed");
    });

    it("counts a rescheduled retryable failure in failed but NOT terminalFailures", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("FetchError: network request failed") });
      await db.syncQueue.add(makeQueueItem());

      const result = await processor.processQueue("user-1");

      // Item went back to "queued" with backoff - it will self-heal, so it
      // must not be reported as a terminal failure (no user-facing alarm)
      expect(result).toEqual({ synced: 0, failed: 1, terminalFailures: 0 });
    });

    it("counts a non-retryable failure in BOTH failed and terminalFailures", async () => {
      setupSupabaseMock({
        insertError: makeSupabaseError("violates check constraint on amount_cents"),
      });
      await db.syncQueue.add(makeQueueItem());

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 0, failed: 1, terminalFailures: 1 });
    });

    it("counts a retry-exhausted failure as terminal", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("Network timeout") });
      await db.syncQueue.add(makeQueueItem({ retry_count: 3, max_retries: 3 }));

      const result = await processor.processQueue("user-1");

      expect(result).toEqual({ synced: 0, failed: 1, terminalFailures: 1 });
    });

    it("persists lastSyncTime in db.meta after a successful sync", async () => {
      await db.syncQueue.add(makeQueueItem());

      await processor.processQueue("user-1");

      const entry = await db.meta.get("lastSyncTime");
      expect(entry?.value).toBeTruthy();
    });

    it("invalidates what the synced entity types affect, once per key per drain", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      await db.syncQueue.bulkAdd([
        makeQueueItem(),
        makeQueueItem({ entity_id: "entity-2" }),
        makeQueueItem({ entity_id: "budget-1", entity_type: "budget" }),
      ]);

      await processor.processQueue("user-1");

      const keys = keysAfterWrite(["transaction", "budget"]);
      expect(invalidateSpy).toHaveBeenCalledTimes(keys.length);
      for (const queryKey of keys) expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    });

    it("invalidates only what the synced entity types affect", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      await db.syncQueue.add(makeQueueItem({ entity_id: "budget-1", entity_type: "budget" }));

      await processor.processQueue("user-1");

      expect(invalidateSpy).toHaveBeenCalledTimes(keysAfterWrite("budget").length);
      expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: queryKeys.transactions.all });
    });

    it("does not invalidate queries when nothing was pushed", async () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
      setupSupabaseMock({ insertError: makeSupabaseError("Network timeout") });
      await db.syncQueue.add(makeQueueItem());

      await processor.processQueue("user-1");

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe("processItem", () => {
    it("handles create: inserts payload into the entity table", async () => {
      const tables: string[] = [];
      setupSupabaseMock({ onTable: (t) => tables.push(t) });

      const result = await processor.processItem(makeQueueItem());

      expect(result.success).toBe(true);
      expect(tables).toContain("transactions");
    });

    it("treats duplicate primary key on create as already synced", async () => {
      setupSupabaseMock({
        insertError: makeSupabaseError(
          'duplicate key value violates unique constraint "transactions_pkey"',
          "23505"
        ),
      });
      const item = makeQueueItem();
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);

      expect(result.success).toBe(true);
      const stored = await db.syncQueue.get(item.id);
      expect(stored?.status).toBe("completed");
    });

    it("drops a local reversal when another device already reversed the payment", async () => {
      setupSupabaseMock({
        insertError: makeSupabaseError(
          'duplicate key value violates unique constraint "debt_payments_reverses_payment_id_unique"',
          "23505"
        ),
      });
      await db.debtPayments.put(
        createTestPayment({
          id: "rev-local",
          amount_cents: cents(-500),
          is_reversal: true,
          reverses_payment_id: "pay-1",
        })
      );
      const item = makeQueueItem({
        entity_type: "debt_payment",
        entity_id: "rev-local",
        operation: {
          op: "create",
          payload: { id: "rev-local", reverses_payment_id: "pay-1", amount_cents: -500 },
          idempotencyKey: "key-rev",
          lamportClock: 1,
          vectorClock: {},
        },
      });
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);

      expect(result.success).toBe(true);
      expect((await db.syncQueue.get(item.id))?.status).toBe("completed");
      expect(await db.debtPayments.get("rev-local")).toBeUndefined();
    });

    describe("debt payment whose transaction was deleted on the server", () => {
      const fkError = (constraint: string) =>
        makeSupabaseError(
          `insert or update on table "debt_payments" violates foreign key constraint "${constraint}"`,
          "23503"
        );

      async function queuePayment() {
        await db.debtPayments.put(
          createTestPayment({ id: "pay-local", transaction_id: "tx-gone" })
        );
        const item = makeQueueItem({
          entity_type: "debt_payment",
          entity_id: "pay-local",
          operation: {
            op: "create",
            payload: { id: "pay-local", transaction_id: "tx-gone" },
            idempotencyKey: "key-pay",
            lamportClock: 1,
            vectorClock: {},
          },
        });
        await db.syncQueue.add(item);
        return item;
      }

      it("retries once without the transaction link and clears it locally", async () => {
        const inserts: Record<string, unknown>[] = [];
        setupSupabaseMock({
          insertErrors: [fkError("debt_payments_transaction_id_fkey"), null],
          onInsert: (payload) => inserts.push(payload),
        });
        const item = await queuePayment();

        const result = await processor.processItem(item);

        expect(result.success).toBe(true);
        expect(inserts).toEqual([
          { id: "pay-local", transaction_id: "tx-gone" },
          { id: "pay-local", transaction_id: null },
        ]);
        expect((await db.syncQueue.get(item.id))?.status).toBe("completed");
        expect((await db.debtPayments.get("pay-local"))?.transaction_id).toBeNull();
      });

      it("still fails on a different foreign key", async () => {
        const inserts: Record<string, unknown>[] = [];
        setupSupabaseMock({
          insertError: fkError("debt_payments_debt_id_fkey"),
          onInsert: (payload) => inserts.push(payload),
        });
        const item = await queuePayment();

        const result = await processor.processItem(item);

        expect(result.success).toBe(false);
        expect(inserts).toHaveLength(1);
        expect((await db.debtPayments.get("pay-local"))?.transaction_id).toBe("tx-gone");
      });

      it("leaves the item queued when the retry fails transiently", async () => {
        setupSupabaseMock({
          insertErrors: [
            fkError("debt_payments_transaction_id_fkey"),
            makeSupabaseError("FetchError: network request failed"),
          ],
        });
        const item = await queuePayment();

        const result = await processor.processItem(item);

        expect(result.success).toBe(false);
        expect((await db.syncQueue.get(item.id))?.status).not.toBe("failed");
      });

      it("drops the local reversal when the retry hits the reversal index", async () => {
        setupSupabaseMock({
          insertErrors: [
            fkError("debt_payments_transaction_id_fkey"),
            makeSupabaseError(
              'duplicate key value violates unique constraint "debt_payments_reverses_payment_id_unique"',
              "23505"
            ),
          ],
        });
        const item = await queuePayment();

        const result = await processor.processItem(item);

        expect(result.success).toBe(true);
        expect((await db.syncQueue.get(item.id))?.status).toBe("completed");
        expect(await db.debtPayments.get("pay-local")).toBeUndefined();
      });

      it("keeps the error handling when the retry fails too", async () => {
        setupSupabaseMock({
          insertErrors: [
            fkError("debt_payments_transaction_id_fkey"),
            fkError("debt_payments_debt_id_fkey"),
          ],
        });
        const item = await queuePayment();

        const result = await processor.processItem(item);

        expect(result.success).toBe(false);
        expect((await db.debtPayments.get("pay-local"))?.transaction_id).toBe("tx-gone");
      });
    });

    it("still fails a debt payment on any other unique violation", async () => {
      setupSupabaseMock({
        insertError: makeSupabaseError(
          'duplicate key value violates unique constraint "debt_payments_other_unique"',
          "23505"
        ),
      });
      await db.debtPayments.put(createTestPayment({ id: "pay-local" }));
      const item = makeQueueItem({
        entity_type: "debt_payment",
        entity_id: "pay-local",
        operation: {
          op: "create",
          payload: { id: "pay-local" },
          idempotencyKey: "key-pay",
          lamportClock: 1,
          vectorClock: {},
        },
      });
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      expect(await db.debtPayments.get("pay-local")).toBeDefined();
    });

    it("handles update: calls Supabase update", async () => {
      const item = makeQueueItem({
        operation: {
          op: "update",
          payload: { description: "Updated" },
          idempotencyKey: "key-upd",
          lamportClock: 2,
          vectorClock: {},
        },
      });

      const result = await processor.processItem(item);
      expect(result.success).toBe(true);
    });

    it("sends a cleared (undefined) update field as null so the server clears it", async () => {
      const sent: Record<string, unknown>[] = [];
      setupSupabaseMock({ onUpdate: (payload) => sent.push(payload) });
      const item = makeQueueItem({
        entity_type: "account",
        operation: {
          op: "update",
          payload: { visibility: "household", owner_user_id: undefined },
          idempotencyKey: "key-clear",
          lamportClock: 2,
          vectorClock: {},
        },
      });
      await db.syncQueue.add(item);
      const stored = await db.syncQueue.get(item.id);

      const result = await processor.processItem(stored!);

      expect(result.success).toBe(true);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({ visibility: "household", owner_user_id: null });
      expect(JSON.parse(JSON.stringify(sent[0]))).toHaveProperty("owner_user_id", null);
    });

    it("sends only server columns for a transaction update", async () => {
      const sent: Record<string, unknown>[] = [];
      setupSupabaseMock({ onUpdate: (payload) => sent.push(payload) });
      const item = makeQueueItem({
        operation: {
          op: "update",
          payload: { description: "Edited", owner_user_id: undefined, notes: undefined },
          idempotencyKey: "key-txn-upd",
          lamportClock: 2,
          vectorClock: {},
        },
      });

      const result = await processor.processItem(item);

      expect(result.success).toBe(true);
      expect(sent).toEqual([{ description: "Edited", notes: null }]);
      expect(item.operation.payload).toHaveProperty("owner_user_id");
    });

    it("sends only server columns for a transaction create", async () => {
      const sent: Record<string, unknown>[] = [];
      setupSupabaseMock({ onInsert: (payload) => sent.push(payload) });
      const item = makeQueueItem({
        operation: {
          op: "create",
          payload: { id: "entity-1", description: "Test", amount_cents: 100, owner_user_id: "u" },
          idempotencyKey: "key-txn-create",
          lamportClock: 1,
          vectorClock: {},
        },
      });

      const result = await processor.processItem(item);

      expect(result.success).toBe(true);
      expect(sent).toEqual([{ id: "entity-1", description: "Test", amount_cents: 100 }]);
    });

    it("handles delete: calls Supabase delete", async () => {
      const item = makeQueueItem({
        operation: {
          op: "delete",
          payload: {},
          idempotencyKey: "key-del",
          lamportClock: 3,
          vectorClock: {},
        },
      });

      const result = await processor.processItem(item);
      expect(result.success).toBe(true);
    });

    it("returns error for unknown operation", async () => {
      const item = makeQueueItem({
        operation: {
          op: "unknown" as never,
          payload: {},
          idempotencyKey: "key-unk",
          lamportClock: 1,
          vectorClock: {},
        },
      });
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown operation");
    });
  });

  describe("error handling", () => {
    const nonRetryableMessages = [
      "violates check constraint on amount_cents",
      "violates foreign key constraint on account_id",
      "violates unique constraint on idempotency_key",
      "invalid input syntax for type uuid",
      "value too long for type character varying(200)",
    ];

    for (const message of nonRetryableMessages) {
      it(`fails permanently for: ${message.slice(0, 40)}...`, async () => {
        setupSupabaseMock({ insertError: makeSupabaseError(message) });
        const item = makeQueueItem();
        await db.syncQueue.add(item);

        const result = await processor.processItem(item);

        expect(result.success).toBe(false);
        expect(result.terminal).toBe(true);
        const stored = await db.syncQueue.get(item.id);
        expect(stored?.status).toBe("failed");
        expect(stored?.error_message).toContain(message.split(" on ")[0]);
      });
    }

    it("schedules a retry (next_retry_at, no inline sleep) for network errors", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("FetchError: network request failed") });
      const item = makeQueueItem();
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      expect(result.terminal).toBeUndefined(); // rescheduled, not terminal
      const stored = await db.syncQueue.get(item.id);
      expect(stored?.status).toBe("queued");
      expect(stored?.retry_count).toBe(1);
      expect(stored?.next_retry_at).toBeTruthy();
      expect(new Date(stored!.next_retry_at!).getTime()).toBeGreaterThan(Date.now());

      // Scheduled item is no longer due
      const due = await getPendingQueueItems("user-1");
      expect(due).toHaveLength(0);
    });

    it("fails permanently once retry_count reaches max_retries", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("Network timeout") });
      const item = makeQueueItem({ retry_count: 3, max_retries: 3 });
      await db.syncQueue.add(item);

      const result = await processor.processItem(item);

      expect(result.success).toBe(false);
      expect(result.terminal).toBe(true);
      expect(result.error).toContain("Max retries reached");
      const stored = await db.syncQueue.get(item.id);
      expect(stored?.status).toBe("failed");
    });

    it("logs a non-retryable sync issue on terminal constraint failure (R3)", async () => {
      setupSupabaseMock({
        insertError: makeSupabaseError("violates check constraint on amount_cents"),
      });
      const item = makeQueueItem();
      await db.syncQueue.add(item);

      await processor.processItem(item);

      const issues = await db.syncIssues.toArray();
      expect(issues).toHaveLength(1);
      expect(issues[0]!.issueType).toBe("sync-failed");
      expect(issues[0]!.entityType).toBe("transaction");
      expect(issues[0]!.entityId).toBe(item.entity_id);
      expect(issues[0]!.canRetry).toBe(false);
      expect(issues[0]!.message).toContain("violates check constraint");
    });

    it("logs a retryable sync issue when retries are exhausted (R3)", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("Network timeout") });
      const item = makeQueueItem({ retry_count: 3, max_retries: 3 });
      await db.syncQueue.add(item);

      await processor.processItem(item);

      const issues = await db.syncIssues.toArray();
      expect(issues).toHaveLength(1);
      expect(issues[0]!.issueType).toBe("sync-failed");
      expect(issues[0]!.entityId).toBe(item.entity_id);
      expect(issues[0]!.canRetry).toBe(true);
    });

    it("does NOT log a sync issue for a retryable failure that gets rescheduled", async () => {
      setupSupabaseMock({ insertError: makeSupabaseError("FetchError: network request failed") });
      const item = makeQueueItem();
      await db.syncQueue.add(item);

      await processor.processItem(item);

      expect(await db.syncIssues.count()).toBe(0);
    });
  });

  describe("budget creates", () => {
    it("upserts on household, category, and month instead of inserting", async () => {
      const upserts: Array<{ payload: unknown; options: unknown }> = [];
      setupSupabaseMock({ onUpsert: (payload, options) => upserts.push({ payload, options }) });
      const payload = { id: "b1", category_id: "c1", month: "2026-10-01", amount_cents: 5000 };
      await db.syncQueue.add(
        makeQueueItem({
          entity_type: "budget",
          entity_id: "b1",
          operation: {
            op: "create",
            payload,
            idempotencyKey: "dev-1-budget-b1-1",
            lamportClock: 1,
            vectorClock: {},
          },
        })
      );

      await processor.processQueue("user-1");

      expect(upserts).toEqual([
        { payload, options: { onConflict: "household_id,category_id,month" } },
      ]);
    });

    it("still inserts creates for other entities", async () => {
      const upserts: unknown[] = [];
      setupSupabaseMock({ onUpsert: (payload) => upserts.push(payload) });
      await db.syncQueue.add(makeQueueItem());

      const result = await processor.processQueue("user-1");

      expect(result.synced).toBe(1);
      expect(upserts).toHaveLength(0);
    });
  });

  describe("entity type to table mapping", () => {
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
        const tables: string[] = [];
        setupSupabaseMock({ onTable: (t) => tables.push(t) });

        await processor.processItem(makeQueueItem({ entity_type: entityType }));

        expect(tables).toContain(tableName);
      });
    }
  });
});
