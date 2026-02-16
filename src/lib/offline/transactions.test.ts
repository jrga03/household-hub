/**
 * Unit Tests for Offline Transaction Operations
 *
 * Tests the offline transaction mutation functions to ensure:
 * - Temporary IDs are generated correctly
 * - CRUD operations work with IndexedDB
 * - Data persistence is correct
 * - Error handling is graceful
 *
 * @see instructions.md Step 6 (lines 799-914)
 * @module offline/transactions.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import { supabase } from "@/lib/supabase";
import {
  createOfflineTransaction,
  updateOfflineTransaction,
  deleteOfflineTransaction,
} from "./transactions";

/**
 * Helper function to mock Supabase sync_queue insert operations.
 * Returns a spy on supabase.from() that intercepts sync_queue calls.
 */
function mockSyncQueueInsert() {
  const originalFrom = supabase.from.bind(supabase);
  const fromSpy = vi.spyOn(supabase, "from");
  fromSpy.mockImplementation((table: string) => {
    if (table === "sync_queue") {
      return {
        insert: vi.fn().mockImplementation(() => {
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: `queue-item-${Date.now()}` },
                error: null,
              }),
            }),
          };
        }),
      } as never;
    }
    return originalFrom(table);
  });
  return fromSpy;
}

describe("Offline Transaction Operations", () => {
  // Use a valid UUID format for test user ID (Supabase expects UUID)
  const testUserId = "12345678-1234-5678-1234-567812345678";

  beforeEach(async () => {
    // Clear test database before each test
    await db.transactions.clear();

    // Mock Supabase sync_queue operations
    mockSyncQueueInsert();
  });

  afterEach(async () => {
    // Clean up after each test
    await db.transactions.clear();

    // Restore all mocks
    vi.restoreAllMocks();
  });

  it("should create transaction with temporary ID", async () => {
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
    expect(result.data?.id).toMatch(/^temp-/);
    expect(result.data?.description).toBe("Test transaction");
    expect(result.data?.amount_cents).toBe(150050);
    expect(result.isTemporary).toBe(true);

    // Verify in IndexedDB
    const stored = await db.transactions.get(result.data!.id);
    expect(stored).toBeDefined();
    expect(stored?.description).toBe("Test transaction");
  });

  it("should update existing transaction", async () => {
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
  });

  it("should delete transaction", async () => {
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
  });
});
