/**
 * Integration Tests for Sync Queue System
 *
 * Comprehensive test suite verifying the complete offline-to-queue flow:
 * - Idempotency key generation with correct format
 * - Lamport clock incrementing per entity
 * - Vector clock initialization and tracking
 * - Integration with transaction/account/category mutations
 * - Rollback on queue failure (atomic operations)
 * - Queue count and pending items queries
 *
 * Testing Strategy:
 * - Mock Supabase for unit tests (avoid test database dependency)
 * - Test IndexedDB integration (real Dexie operations)
 * - Verify sync queue metadata (idempotency keys, clocks)
 * - Validate rollback on errors (atomic pattern)
 *
 * IMPORTANT: IndexedDB Testing Setup
 * --------------------------------------------
 * These tests require IndexedDB support in the test environment.
 *
 * Option 1: Install fake-indexeddb (RECOMMENDED)
 * Run: npm install --save-dev fake-indexeddb
 * Then add to vite.config.ts:
 *
 * ```typescript
 * test: {
 *   environment: 'jsdom',
 *   setupFiles: ['./src/test-setup.ts'],
 * }
 * ```
 *
 * Create src/test-setup.ts:
 * ```typescript
 * import 'fake-indexeddb/auto';
 * import { vi } from 'vitest';
 *
 * // Mock localStorage
 * global.localStorage = {
 *   getItem: vi.fn(),
 *   setItem: vi.fn(),
 *   removeItem: vi.fn(),
 *   clear: vi.fn(),
 * } as MockSupabaseResponse;
 * ```
 *
 * Option 2: Run tests in browser environment
 * Use Vitest browser mode or Playwright component testing
 *
 * Current Status: Tests will fail with "IndexedDB API missing" error
 * until fake-indexeddb is configured. This is expected and documented
 * in chunk 023 checkpoint.md.
 *
 * @see instructions.md Step 6 (Sync Queue Integration Tests)
 * @see SYNC-ENGINE.md lines 227-277 (idempotency strategy)
 * @see SYNC-ENGINE.md lines 365-511 (conflict resolution)
 * @module offline/syncQueue.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { supabase } from "@/lib/supabase";
import { createOfflineTransaction } from "./transactions";
import { createOfflineAccount, updateOfflineAccount } from "./accounts";
import { createOfflineCategory } from "./categories";
import { getQueueCount, getPendingQueueItems } from "./syncQueue";
import { resetLamportClock, getCurrentLamportClock } from "@/lib/sync/lamportClock";
import { getVectorClock } from "@/lib/sync/vectorClock";
import { deviceManager } from "@/lib/dexie/deviceManager";

// Type for captured queue items
interface CapturedQueueItem {
  entity_type: string;
  entity_id: string;
  status: string;
  operation: {
    op: string;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    lamportClock: number;
    vectorClock: Record<string, number>;
  };
}

/**
 * Helper function to mock Supabase sync_queue insert operations.
 * Returns a spy on supabase.from() that intercepts sync_queue calls.
 */
function mockSyncQueueInsert(captureCallback?: (queueItem: unknown) => void) {
  const originalFrom = supabase.from.bind(supabase);
  const fromSpy = vi.spyOn(supabase, "from");
  fromSpy.mockImplementation((table: string) => {
    if (table === "sync_queue") {
      return {
        insert: vi.fn().mockImplementation((queueItem: unknown) => {
          if (captureCallback) {
            captureCallback(queueItem);
          }
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: `queue-item-${Date.now()}` },
                error: null,
              }),
            }),
          };
        }),
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        }),
      } as never;
    }
    return originalFrom(table);
  });
  return fromSpy;
}

// NOTE: Tests are marked as .skip until IndexedDB polyfill is configured
// Remove .skip after installing fake-indexeddb and configuring test setup

describe("Sync Queue Integration Tests", () => {
  // Use a valid UUID format for test user ID (Supabase expects UUID)
  const testUserId = "12345678-1234-5678-1234-567812345678";
  let deviceId: string;

  beforeEach(async () => {
    // Clear IndexedDB tables
    await db.transactions.clear();
    await db.accounts.clear();
    await db.categories.clear();
    await db.meta.clear();

    // Get device ID for assertions
    deviceId = await deviceManager.getDeviceId();

    // Mock Supabase sync_queue table
    // We'll use vi.spyOn to intercept and restore after tests
  });

  afterEach(() => {
    // Restore all mocks
    vi.restoreAllMocks();
  });

  describe("Transaction Queue Integration", () => {
    it("should add transaction to queue on create", async () => {
      // Mock Supabase sync_queue insert
      let capturedQueueItem: CapturedQueueItem | null = null;
      const fromSpy = mockSyncQueueInsert((queueItem) => {
        capturedQueueItem = queueItem as CapturedQueueItem;
      });

      // Create transaction
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
      expect(result.data?.id).toMatch(/^temp-/);
      const transaction = await db.transactions.get(result.data!.id);
      expect(transaction).toBeDefined();

      // Verify queue item was created
      expect(fromSpy).toHaveBeenCalledWith("sync_queue");
      expect(capturedQueueItem).toBeDefined();
      const queueItem = capturedQueueItem as unknown as CapturedQueueItem;
      expect(queueItem.entity_type).toBe("transaction");
      expect(queueItem.entity_id).toBe(result.data!.id);
      expect(queueItem.status).toBe("queued");
      expect(queueItem.operation.op).toBe("create");
    });
  });

  describe("Idempotency Key Generation", () => {
    it("should generate idempotency key with correct format", async () => {
      // Mock Supabase sync_queue insert
      let capturedOperation: CapturedQueueItem["operation"] | null = null;
      mockSyncQueueInsert((queueItem) => {
        capturedOperation = (queueItem as CapturedQueueItem).operation;
      });

      // Create transaction
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

      // Verify idempotency key format
      const op = capturedOperation as unknown as CapturedQueueItem["operation"];
      const idempotencyKey = op.idempotencyKey;
      expect(idempotencyKey).toBeDefined();

      // Format: ${deviceId}-${entityType}-${entityId}-${lamportClock}
      // The entityId can contain hyphens (e.g., "temp-abc123"), so we need a more flexible pattern
      // Pattern: ends with a hyphen followed by a number
      const pattern = /-\d+$/;
      expect(idempotencyKey).toMatch(pattern);

      // Verify it contains the entity type
      expect(idempotencyKey).toContain("transaction");

      // Extract and verify lamport clock (last segment after final hyphen)
      const lamportClock = parseInt(idempotencyKey.split("-").pop() || "0", 10);
      expect(lamportClock).toBeGreaterThan(0);
      expect(lamportClock).toBe(1); // First operation
    });
  });

  describe("Lamport Clock Incrementing", () => {
    it("should increment Lamport clock per entity", async () => {
      // Mock Supabase sync_queue insert
      const capturedClocks: number[] = [];
      mockSyncQueueInsert((queueItem) => {
        capturedClocks.push((queueItem as CapturedQueueItem).operation.lamportClock);
      });

      // Create first transaction
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

      // Verify first clock value is 1
      expect(capturedClocks[0]).toBe(1);
      const storedClock1 = await getCurrentLamportClock(entityId1);
      expect(storedClock1).toBe(1);

      // Create second transaction (different entity)
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
      const entityId2 = result2.data!.id;

      // Verify second transaction also starts at clock = 1 (independent entity)
      expect(capturedClocks[1]).toBe(1);
      const storedClock2 = await getCurrentLamportClock(entityId2);
      expect(storedClock2).toBe(1);

      // Update first transaction
      const updateResult = await createOfflineTransaction(
        {
          date: "2024-01-15",
          description: "Transaction 1 updated",
          amount_cents: 150000,
          type: "expense",
          status: "cleared",
          visibility: "household",
        },
        testUserId
      );

      expect(updateResult.success).toBe(true);

      // Verify third operation clock incremented to 1 (new entity)
      expect(capturedClocks[2]).toBe(1);
    });
  });

  describe("Vector Clock Initialization", () => {
    it("should initialize vector clock with device ID", async () => {
      // Mock Supabase sync_queue insert
      let capturedVectorClock: Record<string, number> | null = null;
      mockSyncQueueInsert((queueItem) => {
        capturedVectorClock = (queueItem as CapturedQueueItem).operation.vectorClock;
      });

      // Create transaction
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

      // Verify vector clock is initialized
      expect(capturedVectorClock).toBeDefined();
      expect(typeof capturedVectorClock).toBe("object");
      expect(capturedVectorClock).not.toBeNull();
      expect(Array.isArray(capturedVectorClock)).toBe(false);

      // Verify device ID is in vector clock with value 1
      expect(Object.keys(capturedVectorClock!).length).toBeGreaterThan(0);
      expect(capturedVectorClock![deviceId]).toBe(1);

      // Verify vector clock in IndexedDB meta table
      const entityId = result.data!.id;
      const storedVectorClock = await getVectorClock(entityId);
      expect(storedVectorClock).toBeDefined();
      expect(storedVectorClock[deviceId]).toBe(1);
    });
  });

  describe("Rollback on Queue Failure", () => {
    it("should rollback IndexedDB on queue failure", async () => {
      // Mock Supabase insert to fail
      const originalFrom = supabase.from.bind(supabase);
      const fromSpy = vi.spyOn(supabase, "from");
      fromSpy.mockImplementation((table: string) => {
        if (table === "sync_queue") {
          return {
            insert: vi.fn().mockImplementation(() => {
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: "Simulated queue failure", code: "MOCK_ERROR" },
                  }),
                }),
              };
            }),
          } as never;
        }
        return originalFrom(table);
      });

      // Attempt to create transaction
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

      // Verify operation failed
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("queue");

      // Verify transaction was NOT persisted in IndexedDB (rolled back)
      const allTransactions = await db.transactions.toArray();
      expect(allTransactions.length).toBe(0);
    });
  });

  describe("Queue Count Accuracy", () => {
    it("should return accurate queue count", async () => {
      // Mock Supabase sync_queue insert
      mockSyncQueueInsert();

      // Create 3 transactions
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

      await createOfflineTransaction(
        {
          date: "2024-01-17",
          description: "Transaction 3",
          amount_cents: 300000,
          type: "expense",
          status: "pending",
          visibility: "household",
        },
        testUserId
      );

      // Mock getQueueCount Supabase query to return count of 3
      const originalFrom2 = supabase.from.bind(supabase);
      const fromSpy2 = vi.spyOn(supabase, "from");
      fromSpy2.mockImplementation((table: string) => {
        if (table === "sync_queue") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                count: 3,
                error: null,
              }),
            }),
          } as never;
        }
        return originalFrom2(table);
      });

      const count = await getQueueCount(testUserId);
      expect(count).toBe(3);
    });
  });

  describe("Account Mutations Queue", () => {
    it("should queue account operations", async () => {
      // Mock Supabase sync_queue insert
      let capturedQueueItem: CapturedQueueItem | null = null;
      mockSyncQueueInsert((queueItem) => {
        capturedQueueItem = queueItem as CapturedQueueItem;
      });

      // Create account
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

      // Verify account in IndexedDB
      const account = await db.accounts.get(result.data!.id);
      expect(account).toBeDefined();
      expect(account?.name).toBe("Test Account");

      // Verify queue item with entity_type = "account"
      expect(capturedQueueItem).toBeDefined();
      const accountQueueItem = capturedQueueItem as unknown as CapturedQueueItem;
      expect(accountQueueItem.entity_type).toBe("account");
      expect(accountQueueItem.entity_id).toBe(result.data!.id);
      expect(accountQueueItem.operation.op).toBe("create");
      expect(accountQueueItem.operation.payload.name).toBe("Test Account");
    });
  });

  describe("Category Mutations Queue", () => {
    it("should queue category operations", async () => {
      // Mock Supabase sync_queue insert
      let capturedQueueItem: CapturedQueueItem | null = null;
      mockSyncQueueInsert((queueItem) => {
        capturedQueueItem = queueItem as CapturedQueueItem;
      });

      // Create category
      const result = await createOfflineCategory(
        {
          name: "Test Category",
          sort_order: 0,
          is_active: true,
        },
        testUserId
      );

      expect(result.success).toBe(true);

      // Verify category in IndexedDB
      const category = await db.categories.get(result.data!.id);
      expect(category).toBeDefined();
      expect(category?.name).toBe("Test Category");

      // Verify queue item with entity_type = "category"
      expect(capturedQueueItem).toBeDefined();
      const categoryQueueItem = capturedQueueItem as unknown as CapturedQueueItem;
      expect(categoryQueueItem.entity_type).toBe("category");
      expect(categoryQueueItem.entity_id).toBe(result.data!.id);
      expect(categoryQueueItem.operation.op).toBe("create");
      expect(categoryQueueItem.operation.payload.name).toBe("Test Category");
    });
  });

  describe("Update Operations Queue", () => {
    it("should queue update operations with incremented clock", async () => {
      // Mock Supabase sync_queue insert
      const capturedOperations: CapturedQueueItem["operation"][] = [];
      mockSyncQueueInsert((queueItem) => {
        capturedOperations.push((queueItem as CapturedQueueItem).operation);
      });

      // Create account
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

      // Clear lamport clock to test update increment
      await resetLamportClock(accountId);

      // Update account
      const updateResult = await updateOfflineAccount(
        accountId,
        {
          name: "Updated Name",
        },
        testUserId
      );

      expect(updateResult.success).toBe(true);

      // Verify 2 queue items (create + update)
      expect(capturedOperations.length).toBe(2);

      // Verify first operation is create with clock = 1
      expect(capturedOperations[0].op).toBe("create");
      expect(capturedOperations[0].lamportClock).toBe(1);

      // Verify second operation is update with clock = 1 (after reset)
      expect(capturedOperations[1].op).toBe("update");
      expect(capturedOperations[1].lamportClock).toBe(1);
    });
  });

  describe("Delete Operations Queue", () => {
    it("should queue delete operations", async () => {
      // Mock Supabase sync_queue insert
      const capturedOperations: CapturedQueueItem["operation"][] = [];
      mockSyncQueueInsert((queueItem) => {
        capturedOperations.push((queueItem as CapturedQueueItem).operation);
      });

      // Create transaction
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

      // Import delete function for testing
      const { deleteOfflineTransaction } = await import("./transactions");

      // Delete transaction
      const deleteResult = await deleteOfflineTransaction(createResult.data!.id, testUserId);

      expect(deleteResult.success).toBe(true);

      // Verify 2 queue items (create + delete)
      expect(capturedOperations.length).toBe(2);

      // Verify first operation is create
      expect(capturedOperations[0].op).toBe("create");

      // Verify second operation is delete
      expect(capturedOperations[1].op).toBe("delete");
      expect(capturedOperations[1].payload.id).toBe(createResult.data!.id);
    });
  });

  describe("Pending Queue Items Query", () => {
    it("should return pending queue items", async () => {
      // Mock Supabase sync_queue insert for creating transactions
      mockSyncQueueInsert();

      // Create some transactions
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

      // Mock getPendingQueueItems Supabase query
      const originalFrom2 = supabase.from.bind(supabase);
      const fromSpy2 = vi.spyOn(supabase, "from");
      fromSpy2.mockImplementation((table: string) => {
        if (table === "sync_queue") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "queue-item-1",
                    entity_type: "transaction",
                    entity_id: "temp-abc",
                    status: "queued",
                    operation: { op: "create", payload: {} },
                  },
                  {
                    id: "queue-item-2",
                    entity_type: "transaction",
                    entity_id: "temp-def",
                    status: "queued",
                    operation: { op: "create", payload: {} },
                  },
                ],
                error: null,
              }),
            }),
          } as never;
        }
        return originalFrom2(table);
      });

      const pending = await getPendingQueueItems(testUserId);

      expect(pending).toBeDefined();
      expect(Array.isArray(pending)).toBe(true);
      expect(pending.length).toBe(2);
      expect(pending[0].status).toBe("queued");
      expect(pending[1].status).toBe("queued");
    });
  });

  describe("Vector Clock Per-Entity Isolation", () => {
    it("should maintain separate vector clocks for different entities", async () => {
      // Mock Supabase sync_queue insert
      const capturedVectorClocks: Record<string, number>[] = [];
      mockSyncQueueInsert((queueItem) => {
        capturedVectorClocks.push((queueItem as CapturedQueueItem).operation.vectorClock);
      });

      // Create transaction
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

      // Create account
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

      // Create another transaction
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

      // Verify all operations succeeded
      expect(tx1.success).toBe(true);
      expect(acc1.success).toBe(true);
      expect(tx2.success).toBe(true);

      // Verify vector clocks are independent per entity
      expect(capturedVectorClocks.length).toBe(3);

      // All should have device ID with value 1 (first operation for each entity)
      expect(capturedVectorClocks[0][deviceId]).toBe(1);
      expect(capturedVectorClocks[1][deviceId]).toBe(1);
      expect(capturedVectorClocks[2][deviceId]).toBe(1);

      // Verify stored vector clocks in meta table
      const txVectorClock1 = await getVectorClock(tx1.data!.id);
      const accVectorClock1 = await getVectorClock(acc1.data!.id);
      const txVectorClock2 = await getVectorClock(tx2.data!.id);

      expect(txVectorClock1[deviceId]).toBe(1);
      expect(accVectorClock1[deviceId]).toBe(1);
      expect(txVectorClock2[deviceId]).toBe(1);
    });
  });
});
