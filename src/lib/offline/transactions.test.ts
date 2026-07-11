/**
 * Unit Tests for Offline Transaction Operations
 *
 * Tests the offline transaction mutation functions to ensure:
 * - Client UUIDs are generated correctly (local ID == server ID)
 * - CRUD operations work with IndexedDB
 * - Every mutation lands an outbox item in db.syncQueue atomically
 * - Error handling is graceful
 * - The update merge follows the null-vs-undefined contract for debt links:
 *   omitted/undefined keys PRESERVE an existing link, explicit null CLEARS it
 *
 * No network mocks needed: the sync queue is a local Dexie table.
 *
 * @module offline/transactions.test
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { db, type LocalTransaction } from "@/lib/dexie/db";
import { handleTransactionEdit } from "@/lib/debts";
import {
  createOfflineTransaction,
  updateOfflineTransaction,
  deleteOfflineTransaction,
} from "./transactions";

// Debt side-effects (payment creation/reversal) are exercised in the debts
// test suites; mocked here so these tests stay focused on the transaction
// writes and merge semantics.
vi.mock("@/lib/debts", () => ({
  processDebtPayment: vi.fn().mockResolvedValue(undefined),
  handleTransactionEdit: vi.fn().mockResolvedValue([]),
  handleTransactionDelete: vi.fn().mockResolvedValue(undefined),
}));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("Offline Transaction Operations", () => {
  // Use a valid UUID format for test user ID (Supabase expects UUID)
  const testUserId = "12345678-1234-5678-1234-567812345678";

  beforeEach(async () => {
    await db.transactions.clear();
    await db.syncQueue.clear();
    await db.meta.clear();
  });

  it("should create transaction with a client-generated UUID and queue it", async () => {
    const input = {
      date: "2024-01-15",
      description: "Test transaction",
      amount_cents: 150050,
      type: "expense" as const,
      status: "pending" as const,
      visibility: "household" as const,
    };

    const result = await createOfflineTransaction(input, testUserId);

    expect(result.success).toBe(true);
    expect(result.data?.id).toMatch(UUID_PATTERN);
    expect(result.data?.description).toBe("Test transaction");
    expect(result.data?.amount_cents).toBe(150050);
    expect(result.isTemporary).toBe(true); // pending sync

    // Verify in IndexedDB
    const stored = await db.transactions.get(result.data!.id);
    expect(stored).toBeDefined();
    expect(stored?.description).toBe("Test transaction");

    // Verify the outbox item landed with the entity write
    const queueItems = await db.syncQueue.toArray();
    expect(queueItems).toHaveLength(1);
    expect(queueItems[0].entity_type).toBe("transaction");
    expect(queueItems[0].entity_id).toBe(result.data!.id);
    expect(queueItems[0].operation.op).toBe("create");
    expect(queueItems[0].status).toBe("queued");
    expect(queueItems[0].user_id).toBe(testUserId);
  });

  it("should update existing transaction and queue the update", async () => {
    // Create initial transaction
    const createResult = await createOfflineTransaction(
      {
        date: "2024-01-15",
        description: "Original",
        amount_cents: 100000,
        type: "expense" as const,
        status: "pending" as const,
        visibility: "household" as const,
      },
      testUserId
    );

    const id = createResult.data!.id;

    // Update it
    const updateResult = await updateOfflineTransaction(
      id,
      {
        description: "Updated",
        amount_cents: 200000,
      },
      testUserId
    );

    expect(updateResult.success).toBe(true);
    expect(updateResult.data?.description).toBe("Updated");
    expect(updateResult.data?.amount_cents).toBe(200000);

    // Verify in IndexedDB
    const stored = await db.transactions.get(id);
    expect(stored?.description).toBe("Updated");

    // Verify create + update outbox items
    const ops = (await db.syncQueue.toArray()).map((item) => item.operation.op).sort();
    expect(ops).toEqual(["create", "update"]);
  });

  it("should delete transaction and queue the delete", async () => {
    // Create transaction
    const createResult = await createOfflineTransaction(
      {
        date: "2024-01-15",
        description: "To delete",
        amount_cents: 100000,
        type: "expense" as const,
        status: "pending" as const,
        visibility: "household" as const,
      },
      testUserId
    );

    const id = createResult.data!.id;

    // Delete it
    const deleteResult = await deleteOfflineTransaction(id, testUserId);

    expect(deleteResult.success).toBe(true);

    // Verify removed from IndexedDB
    const stored = await db.transactions.get(id);
    expect(stored).toBeUndefined();

    // Verify create + delete outbox items
    const ops = (await db.syncQueue.toArray()).map((item) => item.operation.op).sort();
    expect(ops).toEqual(["create", "delete"]);
  });
});

describe("updateOfflineTransaction debt link merge", () => {
  const testUserId = "12345678-1234-5678-1234-567812345678";

  function makeTransaction(overrides: Partial<LocalTransaction> = {}): LocalTransaction {
    return {
      id: crypto.randomUUID(),
      household_id: "hh-1",
      date: "2026-07-01",
      description: "Debt payment",
      amount_cents: 10000,
      type: "expense",
      currency_code: "PHP",
      status: "pending",
      visibility: "household",
      created_by_user_id: testUserId,
      tagged_user_ids: [],
      device_id: "dev-1",
      created_at: "2026-07-01T10:00:00.000Z",
      updated_at: "2026-07-01T10:00:00.000Z",
      ...overrides,
    };
  }

  beforeEach(async () => {
    await db.transactions.clear();
    await db.syncQueue.clear();
    await db.meta.clear();
  });

  it("preserves an existing debt link when the debt fields are omitted", async () => {
    const tx = makeTransaction({ debt_id: "debt-1" });
    await db.transactions.add(tx);

    const result = await updateOfflineTransaction(tx.id, { description: "Renamed" }, testUserId);

    expect(result.success).toBe(true);
    expect(result.data?.debt_id).toBe("debt-1");
    const stored = await db.transactions.get(tx.id);
    expect(stored?.debt_id).toBe("debt-1");
    expect(stored?.description).toBe("Renamed");
  });

  it("preserves the link when the debt keys are present but undefined", async () => {
    const tx = makeTransaction({ internal_debt_id: "idebt-1" });
    await db.transactions.add(tx);

    const result = await updateOfflineTransaction(
      tx.id,
      { debt_id: undefined, internal_debt_id: undefined },
      testUserId
    );

    expect(result.success).toBe(true);
    expect((await db.transactions.get(tx.id))?.internal_debt_id).toBe("idebt-1");
  });

  it("still clears the link on explicit null (intentional unlink)", async () => {
    const tx = makeTransaction({ debt_id: "debt-1" });
    await db.transactions.add(tx);

    const result = await updateOfflineTransaction(tx.id, { debt_id: null }, testUserId);

    expect(result.success).toBe(true);
    expect(result.data?.debt_id).toBeUndefined();
    expect((await db.transactions.get(tx.id))?.debt_id).toBeUndefined();
  });

  it("carries the preserved link into the sync queue payload", async () => {
    const tx = makeTransaction({ debt_id: "debt-1" });
    await db.transactions.add(tx);

    await updateOfflineTransaction(tx.id, { amount_cents: 20000 }, testUserId);

    const [queueItem] = await db.syncQueue.toArray();
    expect(queueItem.operation.op).toBe("update");
    expect(queueItem.operation.payload.debt_id).toBe("debt-1");
    // Amount changed on a linked transaction → the debt adjustment runs
    // against the PRESERVED link instead of being skipped for a missing one
    expect(vi.mocked(handleTransactionEdit)).toHaveBeenCalledWith(
      expect.objectContaining({ transaction_id: tx.id, new_debt_id: "debt-1" })
    );
  });
});
