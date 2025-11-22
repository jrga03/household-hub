import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  updateDebtStatusFromBalance,
  getExpectedStatus,
  isValidStatusTransition,
  recoverInvalidDebtStates,
} from "../status";

describe("Status Transitions", () => {
  beforeEach(async () => {
    await db.debts.clear();
    await db.debtPayments.clear();
  });

  describe("updateDebtStatusFromBalance", () => {
    it("should transition active → paid_off when balance reaches 0", async () => {
      // Create debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment for full balance
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 100000, // Pays off fully
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      // Update status based on balance
      const changed = await updateDebtStatusFromBalance("debt-1", "external");

      expect(changed).toBe(true);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("paid_off");
      expect(debt?.closed_at).toBeDefined();
    });

    it("should transition paid_off → active when reversal creates balance", async () => {
      // Create paid-off debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "paid_off",
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment (to create paid-off state)
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-01",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      // Add reversal (creates balance again)
      await db.debtPayments.add({
        id: "reversal-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: -100000,
        payment_date: "2025-11-02",
        device_id: "device-1",
        is_reversal: true,
        reverses_payment_id: "payment-1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-reversal-1-1",
      });

      // Update status
      const changed = await updateDebtStatusFromBalance("debt-1", "external");

      expect(changed).toBe(true);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("active");
      expect(debt?.closed_at).toBeNull();
    });

    it("should NOT auto-transition archived debts", async () => {
      // Create archived debt
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "archived",
        closed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Update status (should not change)
      const changed = await updateDebtStatusFromBalance("debt-1", "external");

      expect(changed).toBe(false);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("archived"); // Still archived
    });

    it("should handle overpayment (negative balance → paid_off)", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Overpay
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 150000, // Overpaid by ₱500
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        is_overpayment: true,
        overpayment_amount: 50000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      const changed = await updateDebtStatusFromBalance("debt-1", "external");

      expect(changed).toBe(true);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("paid_off"); // Even though overpaid
    });
  });

  describe("getExpectedStatus", () => {
    it("should return paid_off for zero balance", () => {
      expect(getExpectedStatus(0, "active")).toBe("paid_off");
    });

    it("should return paid_off for negative balance", () => {
      expect(getExpectedStatus(-5000, "active")).toBe("paid_off");
    });

    it("should return active for positive balance", () => {
      expect(getExpectedStatus(10000, "paid_off")).toBe("active");
    });

    it("should preserve archived status", () => {
      expect(getExpectedStatus(10000, "archived")).toBe("archived");
      expect(getExpectedStatus(0, "archived")).toBe("archived");
    });
  });

  describe("isValidStatusTransition", () => {
    it("should allow active → paid_off", () => {
      expect(isValidStatusTransition("active", "paid_off")).toBe(true);
    });

    it("should allow paid_off → active", () => {
      expect(isValidStatusTransition("paid_off", "active")).toBe(true);
    });

    it("should allow any → archived", () => {
      expect(isValidStatusTransition("active", "archived")).toBe(true);
      expect(isValidStatusTransition("paid_off", "archived")).toBe(true);
    });

    it("should NOT allow archived → any", () => {
      expect(isValidStatusTransition("archived", "active")).toBe(false);
      expect(isValidStatusTransition("archived", "paid_off")).toBe(false);
    });

    it("should allow same status", () => {
      expect(isValidStatusTransition("active", "active")).toBe(true);
      expect(isValidStatusTransition("paid_off", "paid_off")).toBe(true);
    });
  });

  describe("recoverInvalidDebtStates", () => {
    it("should fix debts with incorrect status", async () => {
      // Create debt with mismatched status (balance = 0 but status = active)
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Mismatched",
        original_amount_cents: 100000,
        status: "active", // Should be paid_off
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      // Add payment that fully pays off debt
      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      // Run recovery
      const fixedCount = await recoverInvalidDebtStates("external");

      expect(fixedCount).toBe(1);

      const debt = await db.debts.get("debt-1");
      expect(debt?.status).toBe("paid_off"); // Fixed!
    });
  });
});
