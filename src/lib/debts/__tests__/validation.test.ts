/**
 * Tests for Debt Validation Logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  validateAmount,
  validateDebtName,
  validateEntityExists,
  validateDebtCreation,
  validateInternalDebtCreation,
  validateDebtDeletion,
  getEntityDisplayName,
} from "../validation";
import type { LocalCategory, LocalAccount } from "@/lib/dexie/db";

describe("Debt Validation", () => {
  beforeEach(async () => {
    // Clear all relevant tables
    await db.debts.clear();
    await db.internalDebts.clear();
    await db.debtPayments.clear();
    await db.categories.clear();
    await db.accounts.clear();
    await db.syncQueue.clear();
  });

  describe("validateAmount", () => {
    it("should accept valid amounts", () => {
      expect(validateAmount(100, "debt").valid).toBe(true); // ₱1.00
      expect(validateAmount(100000, "debt").valid).toBe(true); // ₱1,000
      expect(validateAmount(999999999, "debt").valid).toBe(true); // Max
    });

    it("should reject amounts below minimum", () => {
      const result = validateAmount(99, "debt");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Amount must be at least ₱1.00");
    });

    it("should reject amounts above maximum", () => {
      const result = validateAmount(1000000000, "debt");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("exceeds maximum");
    });

    it("should reject non-integer amounts", () => {
      const result = validateAmount(100.5, "debt");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Amount must be in whole cents (no fractions)");
    });

    it("should reject negative amounts", () => {
      const result = validateAmount(-100, "debt");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Amount must be at least ₱1.00");
    });
  });

  describe("validateDebtName", () => {
    it("should accept valid names", async () => {
      const result = await validateDebtName("Car Loan", "household-1", "external");
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject empty names", async () => {
      const result = await validateDebtName("", "household-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Name is required");
    });

    it("should reject whitespace-only names", async () => {
      const result = await validateDebtName("   ", "household-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Name is required");
    });

    it("should reject names over 100 characters", async () => {
      const longName = "A".repeat(101);
      const result = await validateDebtName(longName, "household-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("100 characters");
    });

    it("should reject duplicate active debt names", async () => {
      // Create existing debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtName("Car Loan", "household-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("already exists");
    });

    it("should reject duplicate active debt names case-insensitively", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtName("car loan", "household-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("already exists");
    });

    it("should allow duplicate names if one is archived", async () => {
      // Create archived debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "archived",
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtName("Car Loan", "household-1", "external");
      expect(result.valid).toBe(true);
    });

    it("should allow duplicate names if one is paid_off", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "paid_off",
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtName("Car Loan", "household-1", "external");
      expect(result.valid).toBe(true);
    });

    it("should allow same name when excluding self (edit)", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Editing debt-1, name unchanged
      const result = await validateDebtName("Car Loan", "household-1", "external", "debt-1");
      expect(result.valid).toBe(true);
    });

    it("should check internal debts table when type is internal", async () => {
      await db.internalDebts.add({
        id: "internal-1",
        household_id: "household-1",
        name: "Category Borrowing",
        original_amount_cents: 50000,
        from_type: "category",
        from_id: "cat-1",
        from_display_name: "Groceries",
        to_type: "category",
        to_id: "cat-2",
        to_display_name: "Entertainment",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtName("Category Borrowing", "household-1", "internal");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("already exists");
    });
  });

  describe("validateEntityExists", () => {
    beforeEach(async () => {
      // Add test category
      const testCategory: LocalCategory = {
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
      await db.categories.add(testCategory);

      // Add test account
      const testAccount: LocalAccount = {
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
      await db.accounts.add(testAccount);
    });

    it("should validate existing active category", async () => {
      const exists = await validateEntityExists("category", "cat-1");
      expect(exists).toBe(true);
    });

    it("should reject non-existent category", async () => {
      const exists = await validateEntityExists("category", "non-existent");
      expect(exists).toBe(false);
    });

    it("should reject inactive category", async () => {
      await db.categories.update("cat-1", { is_active: false });
      const exists = await validateEntityExists("category", "cat-1");
      expect(exists).toBe(false);
    });

    it("should validate existing active account", async () => {
      const exists = await validateEntityExists("account", "acc-1");
      expect(exists).toBe(true);
    });

    it("should reject non-existent account", async () => {
      const exists = await validateEntityExists("account", "non-existent");
      expect(exists).toBe(false);
    });

    it("should return false for member type (no profiles table)", async () => {
      const exists = await validateEntityExists("member", "user-1");
      expect(exists).toBe(false); // Always false since profiles table doesn't exist
    });
  });

  describe("getEntityDisplayName", () => {
    beforeEach(async () => {
      // Add test entities
      const testCategory: LocalCategory = {
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
      await db.categories.add(testCategory);

      const testAccount: LocalAccount = {
        id: "acc-1",
        household_id: "household-1",
        name: "Checking Account",
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
      await db.accounts.add(testAccount);
    });

    it("should return category name", async () => {
      const name = await getEntityDisplayName("category", "cat-1");
      expect(name).toBe("Groceries");
    });

    it("should return account name", async () => {
      const name = await getEntityDisplayName("account", "acc-1");
      expect(name).toBe("Checking Account");
    });

    it("should return placeholder for non-existent category", async () => {
      const name = await getEntityDisplayName("category", "non-existent");
      expect(name).toBe("Unknown category");
    });

    it("should return placeholder for non-existent account", async () => {
      const name = await getEntityDisplayName("account", "non-existent");
      expect(name).toBe("Unknown account");
    });

    it("should return placeholder for member", async () => {
      const name = await getEntityDisplayName("member", "user-123");
      expect(name).toContain("Member");
    });
  });

  describe("validateDebtCreation", () => {
    it("should accept valid external debt data", async () => {
      const result = await validateDebtCreation({
        name: "Car Loan",
        original_amount_cents: 500000,
        household_id: "household-1",
      });
      expect(result.valid).toBe(true);
    });

    it("should reject invalid external debt data", async () => {
      const result = await validateDebtCreation({
        name: "", // Invalid name
        original_amount_cents: 50, // Below minimum
        household_id: "household-1",
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Name is required");
      expect(result.errors).toContain("Amount must be at least ₱1.00");
    });
  });

  describe("validateInternalDebtCreation", () => {
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
    });

    it("should accept valid internal debt data", async () => {
      const result = await validateInternalDebtCreation({
        name: "Category Borrowing",
        original_amount_cents: 10000,
        household_id: "household-1",
        from_type: "category",
        from_id: "cat-1",
        to_type: "category",
        to_id: "cat-2",
      });
      expect(result.valid).toBe(true);
    });

    it("should reject self-borrowing", async () => {
      const result = await validateInternalDebtCreation({
        name: "Self Borrowing",
        original_amount_cents: 10000,
        household_id: "household-1",
        from_type: "category",
        from_id: "cat-1",
        to_type: "category",
        to_id: "cat-1", // Same as from_id
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Cannot borrow from the same entity");
    });

    it("should reject invalid entity types", async () => {
      const result = await validateInternalDebtCreation({
        name: "Invalid Type",
        original_amount_cents: 10000,
        household_id: "household-1",
        from_type: "invalid" as any,
        from_id: "cat-1",
        to_type: "category",
        to_id: "cat-2",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid from_type");
    });

    it("should reject non-existent entities", async () => {
      const result = await validateInternalDebtCreation({
        name: "Non-existent Entity",
        original_amount_cents: 10000,
        household_id: "household-1",
        from_type: "category",
        from_id: "non-existent",
        to_type: "category",
        to_id: "cat-2",
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Invalid category selected");
    });
  });

  describe("validateDebtDeletion", () => {
    it("should allow deletion of debt with no payments", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const result = await validateDebtDeletion("debt-1", "external");
      expect(result.valid).toBe(true);
    });

    it("should block deletion of debt with payment history", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      const result = await validateDebtDeletion("debt-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("payment history");
      expect(result.errors[0]).toContain("Archive");
    });

    it("should block deletion of debt with pending sync", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add pending sync
      await db.syncQueue.add({
        id: "sync-1",
        household_id: "household-1",
        entity_type: "transaction",
        entity_id: "debt-1",
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

      const result = await validateDebtDeletion("debt-1", "external");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("pending sync operations");
    });

    it("should check internal_debt_id for internal debts", async () => {
      await db.internalDebts.add({
        id: "internal-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        from_type: "category",
        from_id: "cat-1",
        from_display_name: "Cat 1",
        to_type: "category",
        to_id: "cat-2",
        to_display_name: "Cat 2",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment for internal debt
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        internal_debt_id: "internal-1",
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
      });

      const result = await validateDebtDeletion("internal-1", "internal");
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("payment history");
    });
  });
});
