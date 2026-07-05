/**
 * Unit Tests for Offline Transaction Operations
 *
 * Tests the offline transaction mutation functions to ensure:
 * - Client UUIDs are generated correctly (local ID == server ID)
 * - CRUD operations work with IndexedDB
 * - Every mutation lands an outbox item in db.syncQueue atomically
 * - Error handling is graceful
 *
 * No network mocks needed: the sync queue is a local Dexie table.
 *
 * @module offline/transactions.test
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  createOfflineTransaction,
  updateOfflineTransaction,
  deleteOfflineTransaction,
} from "./transactions";

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
