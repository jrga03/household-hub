/**
 * Checkpoint Tests for Chunk 019: Dexie Setup
 *
 * Verifies all checkpoint criteria from checkpoint.md
 * Note: Schema now has 12 tables:
 * - Original 7: transactions, accounts, categories, syncQueue, events, meta, logs
 * - Version 2: syncIssues
 * - Version 3: conflicts
 * - Version 4: debts, internalDebts, debtPayments (debt tracking feature)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db";
import { deviceManager } from "../deviceManager";

describe("Checkpoint 019: Dexie Setup", () => {
  beforeEach(async () => {
    // Clear test data before each test
    await db.transactions.clear();
    await db.meta.clear();
  });

  afterEach(async () => {
    // Clean up after tests
    await db.transactions.clear();
    await db.meta.clear();
  });

  it("1. Database opens without errors", async () => {
    // Database should already be open (auto-open on import)
    expect(db.isOpen()).toBe(true);

    // Should be able to explicitly open again without errors
    await expect(db.open()).resolves.toBeDefined();
  });

  it("2. All 12 tables exist", () => {
    const tableNames = db.tables.map((t) => t.name);

    // Original 7 tables
    expect(tableNames).toContain("transactions");
    expect(tableNames).toContain("accounts");
    expect(tableNames).toContain("categories");
    expect(tableNames).toContain("syncQueue");
    expect(tableNames).toContain("events");
    expect(tableNames).toContain("meta");
    expect(tableNames).toContain("logs");

    // Version 2-3 additions
    expect(tableNames).toContain("syncIssues");
    expect(tableNames).toContain("conflicts");

    // Version 4 additions (debt tracking)
    expect(tableNames).toContain("debts");
    expect(tableNames).toContain("internalDebts");
    expect(tableNames).toContain("debtPayments");

    expect(tableNames.length).toBe(12);
  });

  it("3. Can store and retrieve transaction data", async () => {
    const testTransaction = {
      id: "test-tx-1",
      household_id: "00000000-0000-0000-0000-000000000001",
      date: "2024-01-15",
      description: "Test Transaction",
      amount_cents: 10000,
      type: "expense" as const,
      currency_code: "PHP",
      status: "pending" as const,
      visibility: "household" as const,
      created_by_user_id: "test-user-1",
      tagged_user_ids: [],
      device_id: "test-device-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Add transaction
    await db.transactions.add(testTransaction);

    // Retrieve transaction
    const retrieved = await db.transactions.get("test-tx-1");

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("test-tx-1");
    expect(retrieved?.description).toBe("Test Transaction");
    expect(retrieved?.amount_cents).toBe(10000);
    expect(retrieved?.type).toBe("expense");

    // Clean up
    await db.transactions.delete("test-tx-1");
  });

  it("4. Device ID persists across calls", async () => {
    // Clear any existing device ID
    await deviceManager.clearDeviceId();

    // First call - should generate and store device ID
    const deviceId1 = await deviceManager.getDeviceId();
    expect(deviceId1).toBeTruthy();
    expect(typeof deviceId1).toBe("string");

    // Second call - should return same device ID (from cache)
    const deviceId2 = await deviceManager.getDeviceId();
    expect(deviceId2).toBe(deviceId1);

    // Third call - should still return same device ID
    const deviceId3 = await deviceManager.getDeviceId();
    expect(deviceId3).toBe(deviceId1);
  });

  it("5. Device ID stored in both IndexedDB and localStorage", async () => {
    // Clear and regenerate
    await deviceManager.clearDeviceId();
    const deviceId = await deviceManager.getDeviceId();

    // Check IndexedDB
    const storedInDb = await db.meta.get("deviceId");
    expect(storedInDb).toBeDefined();
    expect(storedInDb?.value).toBe(deviceId);

    // Check localStorage
    const storedInLocal = localStorage.getItem("household_hub_device_id");
    expect(storedInLocal).toBe(deviceId);

    // Both should match
    expect(storedInDb?.value).toBe(storedInLocal);
  });

  it('6. Data persists after simulated "refresh" (re-query)', async () => {
    // Add test data
    const testData = {
      id: "persist-test-1",
      household_id: "00000000-0000-0000-0000-000000000001",
      date: "2024-01-15",
      description: "Persistence Test",
      amount_cents: 5000,
      type: "income" as const,
      currency_code: "PHP",
      status: "cleared" as const,
      visibility: "household" as const,
      created_by_user_id: "test-user",
      tagged_user_ids: [],
      device_id: "test-device",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.transactions.add(testData);

    // Query again (simulates page refresh where data would be re-fetched)
    const retrieved = await db.transactions.get("persist-test-1");

    expect(retrieved).toBeDefined();
    expect(retrieved?.description).toBe("Persistence Test");

    // Clean up
    await db.transactions.delete("persist-test-1");
  });

  it("7. Index queries work efficiently", async () => {
    // Add test transactions
    await db.transactions.bulkAdd([
      {
        id: "1",
        household_id: "00000000-0000-0000-0000-000000000001",
        date: "2024-01-01",
        description: "Expense 1",
        amount_cents: 1000,
        type: "expense",
        currency_code: "PHP",
        status: "pending",
        visibility: "household",
        created_by_user_id: "user-1",
        tagged_user_ids: [],
        device_id: "device-1",
        created_at: new Date("2024-01-01").toISOString(),
        updated_at: new Date("2024-01-01").toISOString(),
      },
      {
        id: "2",
        household_id: "00000000-0000-0000-0000-000000000001",
        date: "2024-01-02",
        description: "Income 1",
        amount_cents: 5000,
        type: "income",
        currency_code: "PHP",
        status: "cleared",
        visibility: "household",
        created_by_user_id: "user-1",
        tagged_user_ids: [],
        device_id: "device-1",
        created_at: new Date("2024-01-02").toISOString(),
        updated_at: new Date("2024-01-02").toISOString(),
      },
      {
        id: "3",
        household_id: "00000000-0000-0000-0000-000000000001",
        date: "2024-01-03",
        description: "Expense 2",
        amount_cents: 2000,
        type: "expense",
        currency_code: "PHP",
        status: "pending",
        visibility: "household",
        created_by_user_id: "user-1",
        tagged_user_ids: [],
        device_id: "device-1",
        created_at: new Date("2024-01-03").toISOString(),
        updated_at: new Date("2024-01-03").toISOString(),
      },
    ]);

    // Query by type (uses index)
    const expenses = await db.transactions.where("type").equals("expense").toArray();
    expect(expenses.length).toBe(2);
    expect(expenses.every((t) => t.type === "expense")).toBe(true);

    // Query by date range (uses index)
    const jan = await db.transactions
      .where("date")
      .between("2024-01-01", "2024-01-31", true, true)
      .toArray();
    expect(jan.length).toBe(3);

    // Query by status (uses index)
    const pending = await db.transactions.where("status").equals("pending").toArray();
    expect(pending.length).toBe(2);

    // Clean up
    await db.transactions.clear();
  });

  it("8. Storage quota is accessible", async () => {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();

      expect(estimate).toBeDefined();
      expect(typeof estimate.usage).toBe("number");
      expect(typeof estimate.quota).toBe("number");
      expect(estimate.quota).toBeGreaterThan(0);

      // Calculate percentage
      const percentage = (estimate.usage! / estimate.quota!) * 100;
      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    } else {
      // Skip if Storage API not available (some test environments)
      console.warn("Storage API not available in test environment");
    }
  });

  it("9. Meta table can store key-value pairs", async () => {
    // Store various types of values
    await db.meta.put({ key: "lastSync", value: new Date().toISOString() });
    await db.meta.put({ key: "syncCount", value: 42 });
    await db.meta.put({ key: "appVersion", value: "1.0.0" });
    await db.meta.put({ key: "settings", value: { theme: "dark", language: "en" } });

    // Retrieve values
    const lastSync = await db.meta.get("lastSync");
    const syncCount = await db.meta.get("syncCount");
    const appVersion = await db.meta.get("appVersion");
    const settings = await db.meta.get("settings");

    expect(lastSync?.value).toBeTruthy();
    expect(syncCount?.value).toBe(42);
    expect(appVersion?.value).toBe("1.0.0");
    expect(settings?.value).toEqual({ theme: "dark", language: "en" });

    // Clean up
    await db.meta.bulkDelete(["lastSync", "syncCount", "appVersion", "settings"]);
  });
});
