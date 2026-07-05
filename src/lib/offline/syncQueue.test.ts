/**
 * Integration Tests for the Local Sync Queue (Outbox)
 *
 * Verifies the complete offline-to-outbox flow against the REAL local Dexie
 * queue (fake-indexeddb) - no network mocks, because enqueueing never
 * touches the network:
 * - Idempotency key generation with correct format
 * - Lamport clock incrementing per entity
 * - Integration with transaction/account/category mutations
 * - Atomicity of entity write + enqueue
 * - Queue count and pending items queries
 *
 * @module offline/syncQueue.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { createOfflineTransaction, deleteOfflineTransaction } from "./transactions";
import { createOfflineAccount, updateOfflineAccount } from "./accounts";
import { createOfflineCategory } from "./categories";
import {
  getQueueCount,
  getPendingQueueItems,
  getOutstandingQueueItems,
  resetStaleSyncingItems,
  cleanupCompletedItems,
} from "./syncQueue";
import { resetLamportClock, getCurrentLamportClock } from "@/lib/sync/lamportClock";
import { deviceManager } from "@/lib/dexie/deviceManager";

describe("Sync Queue Integration Tests", () => {
  // Use a valid UUID format for test user ID (Supabase expects UUID)
  const testUserId = "12345678-1234-5678-1234-567812345678";

  beforeEach(async () => {
    // Clear IndexedDB tables
    await db.transactions.clear();
    await db.accounts.clear();
    await db.categories.clear();
    await db.syncQueue.clear();
    await db.meta.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Transaction Queue Integration", () => {
    it("should add transaction to the local queue on create", async () => {
      const result = await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Test transaction",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      // Verify transaction exists in IndexedDB
      expect(result.success).toBe(true);
      const transaction = await db.transactions.get(result.data!.id);
      expect(transaction).toBeDefined();

      // Verify queue item was created locally
      const queueItems = await db.syncQueue.toArray();
      expect(queueItems).toHaveLength(1);
      expect(queueItems[0].entity_type).toBe("transaction");
      expect(queueItems[0].entity_id).toBe(result.data!.id);
      expect(queueItems[0].status).toBe("queued");
      expect(queueItems[0].operation.op).toBe("create");
    });
  });

  describe("Idempotency Key Generation", () => {
    it("should generate idempotency key with correct format", async () => {
      const result = await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Test",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      expect(result.success).toBe(true);

      const [queueItem] = await db.syncQueue.toArray();
      const idempotencyKey = queueItem.operation.idempotencyKey;
      expect(idempotencyKey).toBeDefined();

      // Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
      // (entityId can contain hyphens, so anchor on the trailing clock)
      expect(idempotencyKey).toMatch(/-\d+$/);
      expect(idempotencyKey).toContain("transaction");

      const lamportClock = parseInt(idempotencyKey.split("-").pop() || "0", 10);
      expect(lamportClock).toBe(1); // First operation for this entity
    });
  });

  describe("Lamport Clock Incrementing", () => {
    it("should increment Lamport clock per entity", async () => {
      const result1 = await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Transaction 1",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      expect(result1.success).toBe(true);
      const entityId1 = result1.data!.id;

      const storedClock1 = await getCurrentLamportClock(entityId1);
      expect(storedClock1).toBe(1);

      // Different entity starts its own clock at 1
      const result2 = await createOfflineTransaction(
        {
          date: "2024-01-16",
          description: "Transaction 2",
          amount_cents: 200000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      expect(result2.success).toBe(true);
      const storedClock2 = await getCurrentLamportClock(result2.data!.id);
      expect(storedClock2).toBe(1);

      const clocks = (await db.syncQueue.toArray()).map((item) => item.operation.lamportClock);
      expect(clocks).toEqual([1, 1]);
    });
  });

  describe("Atomicity of Entity Write + Enqueue", () => {
    it("should write neither the entity nor a queue item when metadata assembly fails", async () => {
      // Force buildSyncQueueItem to fail before anything is written
      vi.spyOn(deviceManager, "getDeviceId").mockResolvedValue("" as never);

      const result = await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Should fail",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Neither side of the atomic pair exists
      expect(await db.transactions.count()).toBe(0);
      expect(await db.syncQueue.count()).toBe(0);
    });
  });

  describe("Queue Count Accuracy", () => {
    it("should return accurate local queue count", async () => {
      for (const [i, description] of ["One", "Two", "Three"].entries()) {
        await createOfflineTransaction(
          {
            date: `2024-01-1${5 + i}`,
            description,
            amount_cents: 100000 * (i + 1),
            type: "expense",
            status: "pending",
            visibility: "household",
          },
          testUserId
        );
      }

      const count = await getQueueCount(testUserId);
      expect(count).toBe(3);
    });
  });

  describe("Account Mutations Queue", () => {
    it("should queue account operations", async () => {
      const result = await createOfflineAccount(
        {
          name: "Test Account",
          type: "bank",
          initial_balance_cents: 500000,
          visibility: "household",
          is_active: true,
        },
        testUserId
      );

      expect(result.success).toBe(true);

      const account = await db.accounts.get(result.data!.id);
      expect(account).toBeDefined();
      expect(account?.name).toBe("Test Account");

      const [queueItem] = await db.syncQueue.toArray();
      expect(queueItem.entity_type).toBe("account");
      expect(queueItem.entity_id).toBe(result.data!.id);
      expect(queueItem.operation.op).toBe("create");
      expect((queueItem.operation.payload as { name: string }).name).toBe("Test Account");
    });
  });

  describe("Category Mutations Queue", () => {
    it("should queue category operations", async () => {
      const result = await createOfflineCategory(
        {
          name: "Test Category",
          sort_order: 0,
          is_active: true,
        },
        testUserId
      );

      expect(result.success).toBe(true);

      const category = await db.categories.get(result.data!.id);
      expect(category).toBeDefined();

      const [queueItem] = await db.syncQueue.toArray();
      expect(queueItem.entity_type).toBe("category");
      expect(queueItem.entity_id).toBe(result.data!.id);
      expect(queueItem.operation.op).toBe("create");
    });
  });

  describe("Update Operations Queue", () => {
    it("should queue update operations with incremented clock", async () => {
      const createResult = await createOfflineAccount(
        {
          name: "Original Name",
          type: "bank",
          initial_balance_cents: 500000,
          visibility: "household",
          is_active: true,
        },
        testUserId
      );

      expect(createResult.success).toBe(true);
      const accountId = createResult.data!.id;

      // Clear lamport clock to test update increment from a known state
      await resetLamportClock(accountId);

      const updateResult = await updateOfflineAccount(
        accountId,
        { name: "Updated Name" },
        testUserId
      );

      expect(updateResult.success).toBe(true);

      const operations = (await db.syncQueue.toArray())
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((item) => item.operation);

      expect(operations).toHaveLength(2);
      expect(operations[0].op).toBe("create");
      expect(operations[0].lamportClock).toBe(1);
      expect(operations[1].op).toBe("update");
      expect(operations[1].lamportClock).toBe(1); // After reset
    });
  });

  describe("Delete Operations Queue", () => {
    it("should queue delete operations", async () => {
      const createResult = await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "To delete",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      expect(createResult.success).toBe(true);

      const deleteResult = await deleteOfflineTransaction(createResult.data!.id, testUserId);
      expect(deleteResult.success).toBe(true);

      const operations = (await db.syncQueue.toArray())
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((item) => item.operation);

      expect(operations).toHaveLength(2);
      expect(operations[0].op).toBe("create");
      expect(operations[1].op).toBe("delete");
      expect((operations[1].payload as { id: string }).id).toBe(createResult.data!.id);
    });
  });

  describe("Pending Queue Items Query", () => {
    it("should return due queued items in FIFO order, excluding scheduled and failed", async () => {
      await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Transaction 1",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      await createOfflineTransaction(
        {
          date: "2024-01-16",
          description: "Transaction 2",
          amount_cents: 200000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      const pending = await getPendingQueueItems(testUserId);
      expect(pending).toHaveLength(2);
      expect(pending[0].status).toBe("queued");
      expect(pending[0].created_at <= pending[1].created_at).toBe(true);

      // Schedule the first for a future retry: no longer due
      await db.syncQueue.update(pending[0].id, {
        next_retry_at: new Date(Date.now() + 60_000).toISOString(),
      });
      expect(await getPendingQueueItems(testUserId)).toHaveLength(1);

      // Fail the second permanently: not due either, but still outstanding
      await db.syncQueue.update(pending[1].id, { status: "failed" });
      expect(await getPendingQueueItems(testUserId)).toHaveLength(0);
      expect(await getOutstandingQueueItems(testUserId)).toHaveLength(2);
    });
  });

  describe("Stale Syncing Recovery", () => {
    it("should reset only stale 'syncing' items back to 'queued'", async () => {
      const staleTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const freshTime = new Date().toISOString();

      await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Stale",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );
      const [item] = await db.syncQueue.toArray();
      await db.syncQueue.update(item.id, { status: "syncing", updated_at: staleTime });

      await createOfflineTransaction(
        {
          date: "2024-01-16",
          description: "Fresh",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );
      const fresh = (await db.syncQueue.toArray()).find((i) => i.id !== item.id)!;
      await db.syncQueue.update(fresh.id, { status: "syncing", updated_at: freshTime });

      const resetCount = await resetStaleSyncingItems();
      expect(resetCount).toBe(1);

      expect((await db.syncQueue.get(item.id))?.status).toBe("queued");
      expect((await db.syncQueue.get(fresh.id))?.status).toBe("syncing");
    });
  });

  describe("Completed Items Cleanup", () => {
    it("should delete completed items older than the retention period", async () => {
      await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Old completed",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );
      const [item] = await db.syncQueue.toArray();
      const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await db.syncQueue.update(item.id, { status: "completed", synced_at: oldDate });

      const deleted = await cleanupCompletedItems(7);
      expect(deleted).toBe(1);
      expect(await db.syncQueue.count()).toBe(0);
    });
  });

  describe("Lamport Clock Per-Entity Isolation", () => {
    it("should maintain independent clocks for different entities", async () => {
      const tx1 = await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Transaction 1",
          amount_cents: 100000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      const acc1 = await createOfflineAccount(
        {
          name: "Account 1",
          type: "bank",
          initial_balance_cents: 500000,
          visibility: "household",
          is_active: true,
        },
        testUserId
      );

      const tx2 = await createOfflineTransaction(
        {
          date: "2024-01-16",
          description: "Transaction 2",
          amount_cents: 200000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      expect(tx1.success).toBe(true);
      expect(acc1.success).toBe(true);
      expect(tx2.success).toBe(true);

      // Each entity's first operation carries an independent clock of 1
      const clocks = (await db.syncQueue.toArray()).map((item) => item.operation.lamportClock);
      expect(clocks).toEqual([1, 1, 1]);

      expect(await getCurrentLamportClock(tx1.data!.id)).toBe(1);
      expect(await getCurrentLamportClock(acc1.data!.id)).toBe(1);
      expect(await getCurrentLamportClock(tx2.data!.id)).toBe(1);
    });
  });
});
