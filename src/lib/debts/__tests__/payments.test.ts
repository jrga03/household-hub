// src/lib/debts/__tests__/payments.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import { processDebtPayment, getDebtPayments } from "../payments";
import { createExternalDebt } from "../crud";
import type { Debt } from "@/types/debt";

describe("Payment Processing", () => {
  let testDebt: Debt;

  beforeEach(async () => {
    await db.debts.clear();
    await db.debtPayments.clear();
    await db.meta.put({ key: "lamport_clock", value: 0 });

    // Create test debt
    testDebt = await createExternalDebt({
      name: "Test Debt",
      original_amount_cents: 100000, // ₱1,000
      household_id: "household-1",
    });
  });

  describe("processDebtPayment", () => {
    it("should create payment record", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000, // ₱500
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.payment.id).toBeDefined();
      expect(result.payment.amount_cents).toBe(50000);
      expect(result.payment.is_reversal).toBe(false);
      expect(result.wasOverpayment).toBe(false);
      expect(result.newBalance).toBe(50000); // ₱1,000 - ₱500
    });

    it("should detect overpayment", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 150000, // ₱1,500 (exceeds ₱1,000 debt)
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.wasOverpayment).toBe(true);
      expect(result.overpaymentAmount).toBe(50000); // ₱500 over
      expect(result.payment.is_overpayment).toBe(true);
      expect(result.payment.overpayment_amount).toBe(50000);
      expect(result.newBalance).toBe(-50000); // Negative balance
    });

    it("should detect exact payoff (no overpayment)", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000, // Exact balance
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.wasOverpayment).toBe(false);
      expect(result.overpaymentAmount).toBe(0);
      expect(result.newBalance).toBe(0);
      expect(result.newStatus).toBe("paid_off");
      expect(result.statusChanged).toBe(true);
    });

    it("should update debt status to paid_off when balance reaches 0", async () => {
      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      const debt = await db.debts.get(testDebt.id);
      expect(debt?.status).toBe("paid_off");
      expect(debt?.closed_at).toBeDefined();
    });

    it("should generate idempotency key", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      // Payment should have been created
      expect(result.payment.id).toBeDefined();
      expect(result.payment.device_id).toBeDefined();

      // Idempotency key format: ${deviceId}-debt_payment-${paymentId}-${lamportClock}
      // We can't check the exact key here, but we can verify it was generated
      // by checking lamport clock incremented
      const meta = await db.meta.get("lamport_clock");
      expect(meta?.value).toBeGreaterThan(0);
    });

    it("should track device ID", async () => {
      const result = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.payment.device_id).toBeDefined();
      expect(typeof result.payment.device_id).toBe("string");
      expect(result.payment.device_id.length).toBeGreaterThan(0);
    });

    it("should reject payment to archived debt", async () => {
      // Archive debt
      await db.debts.update(testDebt.id, {
        status: "archived",
        closed_at: new Date().toISOString(),
      });

      await expect(
        processDebtPayment({
          transaction_id: "txn-1",
          amount_cents: 50000,
          payment_date: "2025-11-10",
          debt_id: testDebt.id,
          household_id: "household-1",
        })
      ).rejects.toThrow("archived");
    });

    it("should reject negative payment amount", async () => {
      await expect(
        processDebtPayment({
          transaction_id: "txn-1",
          amount_cents: -50000,
          payment_date: "2025-11-10",
          debt_id: testDebt.id,
          household_id: "household-1",
        })
      ).rejects.toThrow("positive");
    });

    it("should handle multiple payments correctly", async () => {
      // First payment: ₱400
      const result1 = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 40000,
        payment_date: "2025-11-01",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result1.newBalance).toBe(60000); // ₱600 remaining

      // Second payment: ₱300
      const result2 = await processDebtPayment({
        transaction_id: "txn-2",
        amount_cents: 30000,
        payment_date: "2025-11-05",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result2.newBalance).toBe(30000); // ₱300 remaining

      // Third payment: ₱400 (overpayment)
      const result3 = await processDebtPayment({
        transaction_id: "txn-3",
        amount_cents: 40000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result3.wasOverpayment).toBe(true);
      expect(result3.overpaymentAmount).toBe(10000); // ₱100 over
      expect(result3.newBalance).toBe(-10000); // Overpaid by ₱100
    });

    it("should detect overpayment when balance is already 0", async () => {
      // Pay off debt completely
      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-01",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      // Try to make another payment (entire amount is overpayment)
      const result = await processDebtPayment({
        transaction_id: "txn-2",
        amount_cents: 50000,
        payment_date: "2025-11-05",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      expect(result.wasOverpayment).toBe(true);
      expect(result.overpaymentAmount).toBe(50000); // Entire amount
      expect(result.newBalance).toBe(-50000);
    });
  });

  describe("getDebtPayments", () => {
    it("should return payments for debt sorted by date", async () => {
      // Create 3 payments
      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 20000,
        payment_date: "2025-11-01",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      await processDebtPayment({
        transaction_id: "txn-2",
        amount_cents: 30000,
        payment_date: "2025-11-05",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      await processDebtPayment({
        transaction_id: "txn-3",
        amount_cents: 25000,
        payment_date: "2025-11-10",
        debt_id: testDebt.id,
        household_id: "household-1",
      });

      const payments = await getDebtPayments(testDebt.id, "external");

      expect(payments).toHaveLength(3);
      // Should be sorted by payment_date DESC
      expect(payments[0].payment_date).toBe("2025-11-10");
      expect(payments[1].payment_date).toBe("2025-11-05");
      expect(payments[2].payment_date).toBe("2025-11-01");
    });
  });
});
