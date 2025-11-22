/**
 * Tests for Debt CRUD Operations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  createExternalDebt,
  createInternalDebt,
  getDebt,
  getDebtWithBalance,
  listDebts,
  searchDebtsByName,
  updateDebtName,
  archiveDebt,
  unarchiveDebt,
  deleteDebt,
  getDebtsWithBalances,
} from "../crud";
import type { LocalCategory, LocalAccount } from "@/lib/dexie/db";

// Mock console.log to reduce test noise
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

describe("Debt CRUD Operations", () => {
  beforeEach(async () => {
    // Clear all relevant tables
    await db.debts.clear();
    await db.internalDebts.clear();
    await db.debtPayments.clear();
    await db.categories.clear();
    await db.accounts.clear();
    await db.syncQueue.clear();
  });

  describe("createExternalDebt", () => {
    it("should create external debt with valid data", async () => {
      const debt = await createExternalDebt({
        name: "Car Loan",
        original_amount_cents: 500000,
        household_id: "household-1",
      });

      expect(debt.id).toBeDefined();
      expect(debt.name).toBe("Car Loan");
      expect(debt.original_amount_cents).toBe(500000);
      expect(debt.status).toBe("active");
      expect(debt.household_id).toBe("household-1");
      expect(debt.created_at).toBeDefined();
      expect(debt.updated_at).toBeDefined();

      // Verify in database
      const retrieved = await db.debts.get(debt.id);
      expect(retrieved).toEqual(debt);
    });

    it("should trim whitespace from name", async () => {
      const debt = await createExternalDebt({
        name: "  Car Loan  ",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      expect(debt.name).toBe("Car Loan");
    });

    it("should reject invalid amount", async () => {
      await expect(
        createExternalDebt({
          name: "Test",
          original_amount_cents: 50, // Below minimum
          household_id: "household-1",
        })
      ).rejects.toThrow("at least ₱1.00");
    });

    it("should reject duplicate active name", async () => {
      await createExternalDebt({
        name: "Car Loan",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await expect(
        createExternalDebt({
          name: "Car Loan",
          original_amount_cents: 200000,
          household_id: "household-1",
        })
      ).rejects.toThrow("already exists");
    });

    it("should reject empty name", async () => {
      await expect(
        createExternalDebt({
          name: "",
          original_amount_cents: 100000,
          household_id: "household-1",
        })
      ).rejects.toThrow("Name is required");
    });
  });

  describe("createInternalDebt", () => {
    beforeEach(async () => {
      // Add test entities
      const cat1: LocalCategory = {
        id: "cat-1",
        household_id: "household-1",
        name: "Groceries",
        color: "#000000",
        icon: "shopping-cart",
        sort_order: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const cat2: LocalCategory = {
        id: "cat-2",
        household_id: "household-1",
        name: "Entertainment",
        color: "#FF0000",
        icon: "game",
        sort_order: 2,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.categories.bulkAdd([cat1, cat2]);

      const acc1: LocalAccount = {
        id: "acc-1",
        household_id: "household-1",
        name: "Checking",
        type: "bank",
        initial_balance_cents: 100000,
        currency_code: "PHP",
        visibility: "household",
        color: "#0000FF",
        icon: "bank",
        sort_order: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.accounts.add(acc1);
    });

    it("should create internal debt between categories", async () => {
      const debt = await createInternalDebt({
        name: "Category Borrowing",
        original_amount_cents: 50000,
        household_id: "household-1",
        from_type: "category",
        from_id: "cat-1",
        to_type: "category",
        to_id: "cat-2",
      });

      expect(debt.id).toBeDefined();
      expect(debt.name).toBe("Category Borrowing");
      expect(debt.from_type).toBe("category");
      expect(debt.from_id).toBe("cat-1");
      expect(debt.from_display_name).toBe("Groceries");
      expect(debt.to_type).toBe("category");
      expect(debt.to_id).toBe("cat-2");
      expect(debt.to_display_name).toBe("Entertainment");
      expect(debt.status).toBe("active");

      // Verify in database
      const retrieved = await db.internalDebts.get(debt.id);
      expect(retrieved).toEqual(debt);
    });

    it("should create internal debt between account and category", async () => {
      const debt = await createInternalDebt({
        name: "Account to Category",
        original_amount_cents: 25000,
        household_id: "household-1",
        from_type: "account",
        from_id: "acc-1",
        to_type: "category",
        to_id: "cat-2",
      });

      expect(debt.from_display_name).toBe("Checking");
      expect(debt.to_display_name).toBe("Entertainment");
    });

    it("should use provided display names if given", async () => {
      const debt = await createInternalDebt({
        name: "Custom Names",
        original_amount_cents: 10000,
        household_id: "household-1",
        from_type: "category",
        from_id: "cat-1",
        from_display_name: "Custom From Name",
        to_type: "category",
        to_id: "cat-2",
        to_display_name: "Custom To Name",
      });

      expect(debt.from_display_name).toBe("Custom From Name");
      expect(debt.to_display_name).toBe("Custom To Name");
    });

    it("should reject self-borrowing", async () => {
      await expect(
        createInternalDebt({
          name: "Self Borrowing",
          original_amount_cents: 10000,
          household_id: "household-1",
          from_type: "category",
          from_id: "cat-1",
          to_type: "category",
          to_id: "cat-1",
        })
      ).rejects.toThrow("Cannot borrow from the same entity");
    });

    it("should reject non-existent entities", async () => {
      await expect(
        createInternalDebt({
          name: "Invalid Entity",
          original_amount_cents: 10000,
          household_id: "household-1",
          from_type: "category",
          from_id: "non-existent",
          to_type: "category",
          to_id: "cat-2",
        })
      ).rejects.toThrow("Invalid category selected");
    });
  });

  describe("getDebt", () => {
    it("should retrieve external debt by ID", async () => {
      const created = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      const retrieved = await getDebt(created.id, "external");
      expect(retrieved).toEqual(created);
    });

    it("should retrieve internal debt by ID", async () => {
      // Setup categories first
      const cat1: LocalCategory = {
        id: "cat-1",
        household_id: "household-1",
        name: "Cat 1",
        color: "#000000",
        icon: "icon",
        sort_order: 1,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const cat2: LocalCategory = {
        id: "cat-2",
        household_id: "household-1",
        name: "Cat 2",
        color: "#FF0000",
        icon: "icon",
        sort_order: 2,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.categories.bulkAdd([cat1, cat2]);

      const created = await createInternalDebt({
        name: "Test Internal",
        original_amount_cents: 50000,
        household_id: "household-1",
        from_type: "category",
        from_id: "cat-1",
        to_type: "category",
        to_id: "cat-2",
      });

      const retrieved = await getDebt(created.id, "internal");
      expect(retrieved).toEqual(created);
    });

    it("should return undefined for non-existent debt", async () => {
      const retrieved = await getDebt("non-existent", "external");
      expect(retrieved).toBeUndefined();
    });
  });

  describe("getDebtWithBalance", () => {
    it("should include calculated balance field", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      const withBalance = await getDebtWithBalance(debt.id, "external");
      expect(withBalance).toBeDefined();
      expect(withBalance?.current_balance_cents).toBe(100000); // No payments yet
    });

    it("should calculate balance with payments", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      // Add payment
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: debt.id,
        transaction_id: "txn-1",
        amount_cents: 30000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      const withBalance = await getDebtWithBalance(debt.id, "external");
      expect(withBalance?.current_balance_cents).toBe(70000); // 100000 - 30000
    });

    it("should return undefined for non-existent debt", async () => {
      const withBalance = await getDebtWithBalance("non-existent", "external");
      expect(withBalance).toBeUndefined();
    });
  });

  describe("listDebts", () => {
    beforeEach(async () => {
      // Create multiple debts
      await createExternalDebt({
        name: "Debt 1",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay for different timestamps

      await createExternalDebt({
        name: "Debt 2",
        original_amount_cents: 200000,
        household_id: "household-1",
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const debt3 = await createExternalDebt({
        name: "Debt 3",
        original_amount_cents: 300000,
        household_id: "household-1",
      });

      // Archive one debt
      await archiveDebt(debt3.id, "external");
    });

    it("should list all debts for household", async () => {
      const debts = await listDebts("household-1", "external");
      expect(debts).toHaveLength(3);
    });

    it("should filter by status", async () => {
      const activeDebts = await listDebts("household-1", "external", { status: "active" });
      expect(activeDebts).toHaveLength(2);
      expect(activeDebts.every((d) => d.status === "active")).toBe(true);

      const archivedDebts = await listDebts("household-1", "external", { status: "archived" });
      expect(archivedDebts).toHaveLength(1);
      expect(archivedDebts[0].status).toBe("archived");
    });

    it("should sort by updated_at DESC", async () => {
      const debts = await listDebts("household-1", "external");
      // The archived debt (Debt 3) should be first as it was updated most recently
      expect(debts[0].name).toBe("Debt 3");
    });

    it("should apply pagination", async () => {
      const page1 = await listDebts("household-1", "external", { limit: 2, offset: 0 });
      expect(page1).toHaveLength(2);

      const page2 = await listDebts("household-1", "external", { limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });

    it("should return empty array for household with no debts", async () => {
      const debts = await listDebts("household-2", "external");
      expect(debts).toHaveLength(0);
    });
  });

  describe("searchDebtsByName", () => {
    beforeEach(async () => {
      await createExternalDebt({
        name: "Car Loan",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await createExternalDebt({
        name: "Home Loan",
        original_amount_cents: 200000,
        household_id: "household-1",
      });

      await createExternalDebt({
        name: "Personal Credit",
        original_amount_cents: 50000,
        household_id: "household-1",
      });
    });

    it("should find debts by partial name", async () => {
      const results = await searchDebtsByName("household-1", "external", "Loan");
      expect(results).toHaveLength(2);
      expect(results.map((d) => d.name)).toContain("Car Loan");
      expect(results.map((d) => d.name)).toContain("Home Loan");
    });

    it("should be case-insensitive", async () => {
      const results = await searchDebtsByName("household-1", "external", "loan");
      expect(results).toHaveLength(2);
    });

    it("should return empty array for no matches", async () => {
      const results = await searchDebtsByName("household-1", "external", "xyz");
      expect(results).toHaveLength(0);
    });

    it("should search full name", async () => {
      const results = await searchDebtsByName("household-1", "external", "Personal Credit");
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("Personal Credit");
    });
  });

  describe("updateDebtName", () => {
    it("should update debt name", async () => {
      const debt = await createExternalDebt({
        name: "Old Name",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      await updateDebtName(debt.id, "external", "New Name");

      const updated = await getDebt(debt.id, "external");
      expect(updated?.name).toBe("New Name");
      expect(new Date(updated!.updated_at).getTime()).toBeGreaterThan(
        new Date(debt.updated_at).getTime()
      );
    });

    it("should trim new name", async () => {
      const debt = await createExternalDebt({
        name: "Old Name",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await updateDebtName(debt.id, "external", "  New Name  ");

      const updated = await getDebt(debt.id, "external");
      expect(updated?.name).toBe("New Name");
    });

    it("should reject duplicate name", async () => {
      await createExternalDebt({
        name: "Existing",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      const debt2 = await createExternalDebt({
        name: "To Rename",
        original_amount_cents: 200000,
        household_id: "household-1",
      });

      await expect(updateDebtName(debt2.id, "external", "Existing")).rejects.toThrow(
        "already exists"
      );
    });

    it("should allow keeping same name", async () => {
      const debt = await createExternalDebt({
        name: "Same Name",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await expect(updateDebtName(debt.id, "external", "Same Name")).resolves.toBeUndefined();
    });

    it("should throw error for non-existent debt", async () => {
      await expect(updateDebtName("non-existent", "external", "New Name")).rejects.toThrow(
        "Debt not found"
      );
    });
  });

  describe("archiveDebt", () => {
    it("should archive active debt", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await archiveDebt(debt.id, "external");

      const updated = await getDebt(debt.id, "external");
      expect(updated?.status).toBe("archived");
      expect(updated?.closed_at).toBeDefined();
    });

    it("should be idempotent for already archived debt", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await archiveDebt(debt.id, "external");
      const firstArchive = await getDebt(debt.id, "external");

      await archiveDebt(debt.id, "external");
      const secondArchive = await getDebt(debt.id, "external");

      expect(secondArchive?.closed_at).toBe(firstArchive?.closed_at);
    });

    it("should throw error for non-existent debt", async () => {
      await expect(archiveDebt("non-existent", "external")).rejects.toThrow("Debt not found");
    });
  });

  describe("unarchiveDebt", () => {
    it("should unarchive debt and set status based on balance", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await archiveDebt(debt.id, "external");
      await unarchiveDebt(debt.id, "external");

      const updated = await getDebt(debt.id, "external");
      expect(updated?.status).toBe("active"); // Balance > 0
    });

    it("should set status to paid_off if balance is zero", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      // Add payment to fully pay off
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: debt.id,
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      await archiveDebt(debt.id, "external");
      await unarchiveDebt(debt.id, "external");

      const updated = await getDebt(debt.id, "external");
      expect(updated?.status).toBe("paid_off");
      expect(updated?.closed_at).toBeDefined(); // Keeps closed_at for paid_off
    });

    it("should do nothing if debt is not archived", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await unarchiveDebt(debt.id, "external");

      const updated = await getDebt(debt.id, "external");
      expect(updated?.status).toBe("active");
    });

    it("should throw error for non-existent debt", async () => {
      await expect(unarchiveDebt("non-existent", "external")).rejects.toThrow("Debt not found");
    });
  });

  describe("deleteDebt", () => {
    it("should delete debt with no payments", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      await deleteDebt(debt.id, "external");

      const retrieved = await getDebt(debt.id, "external");
      expect(retrieved).toBeUndefined();
    });

    it("should reject deletion with payment history", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      // Add payment
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: debt.id,
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      await expect(deleteDebt(debt.id, "external")).rejects.toThrow("payment history");
    });

    it("should reject deletion with pending sync", async () => {
      const debt = await createExternalDebt({
        name: "Test",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      // Add pending sync
      await db.syncQueue.add({
        id: "sync-1",
        household_id: "household-1",
        entity_type: "transaction",
        entity_id: debt.id,
        operation: {
          op: "update",
          payload: { name: "Updated" },
        },
        device_id: "device-1",
        status: "queued",
        retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await expect(deleteDebt(debt.id, "external")).rejects.toThrow("pending sync");
    });

    it("should throw error for non-existent debt", async () => {
      await expect(deleteDebt("non-existent", "external")).rejects.toThrow("Debt not found");
    });
  });

  describe("getDebtsWithBalances", () => {
    it("should return all debts with calculated balances", async () => {
      const debt1 = await createExternalDebt({
        name: "Debt 1",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      const debt2 = await createExternalDebt({
        name: "Debt 2",
        original_amount_cents: 200000,
        household_id: "household-1",
      });

      // Add payment to debt1
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: debt1.id,
        transaction_id: "txn-1",
        amount_cents: 30000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      const debtsWithBalances = await getDebtsWithBalances("household-1", "external");

      expect(debtsWithBalances).toHaveLength(2);

      const debt1WithBalance = debtsWithBalances.find((d) => d.id === debt1.id);
      expect(debt1WithBalance?.current_balance_cents).toBe(70000); // 100000 - 30000

      const debt2WithBalance = debtsWithBalances.find((d) => d.id === debt2.id);
      expect(debt2WithBalance?.current_balance_cents).toBe(200000); // No payments
    });

    it("should filter by status", async () => {
      const debt1 = await createExternalDebt({
        name: "Active Debt",
        original_amount_cents: 100000,
        household_id: "household-1",
      });

      const debt2 = await createExternalDebt({
        name: "Archived Debt",
        original_amount_cents: 200000,
        household_id: "household-1",
      });

      await archiveDebt(debt2.id, "external");

      const activeDebts = await getDebtsWithBalances("household-1", "external", {
        status: "active",
      });

      expect(activeDebts).toHaveLength(1);
      expect(activeDebts[0].id).toBe(debt1.id);
    });
  });
});
