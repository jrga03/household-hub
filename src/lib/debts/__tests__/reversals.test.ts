import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import { createExternalDebt } from "../crud";
import { processDebtPayment } from "../payments";
import { calculateDebtBalance } from "../balance";
import {
  reverseDebtPayment,
  isPaymentReversed,
  getPaymentReversals,
  handleTransactionEdit,
  handleTransactionDelete,
} from "../reversals";

describe("Reversal System", () => {
  beforeEach(async () => {
    // Clear tables before each test
    await db.debts.clear();
    await db.debtPayments.clear();
    await db.internalDebts.clear();
  });

  describe("reverseDebtPayment", () => {
    it("should create reversal for normal payment", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const result = await reverseDebtPayment({ payment_id: payment.payment.id });

      expect(result.reversal.amount_cents).toBe(-50000);
      expect(result.reversal.is_reversal).toBe(true);
      expect(result.reversal.reverses_payment_id).toBe(payment.payment.id);
      expect(result.newBalance).toBe(100000); // Balance restored
    });

    it("should handle cascading reversal (reversing a reversal)", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      // First reversal
      const reversal1 = await reverseDebtPayment({ payment_id: payment.payment.id });
      expect(reversal1.reversal.amount_cents).toBe(-50000);

      // Reverse the reversal (double negative)
      const reversal2 = await reverseDebtPayment({
        payment_id: reversal1.reversal.id,
      });

      expect(reversal2.reversal.amount_cents).toBe(50000); // Positive!
      expect(reversal2.reversal.is_reversal).toBe(false); // Regular payment, not a reversal
      expect(reversal2.reversal.reverses_payment_id).toBeUndefined(); // No reversal link
      expect(reversal2.newBalance).toBe(50000); // Back to original
    });

    it("should be idempotent (reversing twice returns same reversal)", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const result1 = await reverseDebtPayment({ payment_id: payment.payment.id });
      const result2 = await reverseDebtPayment({ payment_id: payment.payment.id });

      expect(result1.reversal.id).toBe(result2.reversal.id);
      expect(result2.statusChanged).toBe(false);
    });

    it("should throw error if payment not found", async () => {
      await expect(reverseDebtPayment({ payment_id: "nonexistent" })).rejects.toThrow(
        "Payment nonexistent not found"
      );
    });

    it("should update debt status after reversal", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      // Pay off debt completely
      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const debtAfterPayment = await db.debts.get(debt.id);
      expect(debtAfterPayment?.status).toBe("paid_off");

      // Reverse payment
      const result = await reverseDebtPayment({ payment_id: payment.payment.id });

      expect(result.statusChanged).toBe(true);
      expect(result.newStatus).toBe("active");

      const debtAfterReversal = await db.debts.get(debt.id);
      expect(debtAfterReversal?.status).toBe("active");
    });

    it("should handle reversal with reason", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const result = await reverseDebtPayment({
        payment_id: payment.payment.id,
        reason: "transaction_edited",
      });

      expect(result.reversal.adjustment_reason).toBe("transaction_edited");
    });
  });

  describe("isPaymentReversed", () => {
    it("should return true for reversed payment", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      await reverseDebtPayment({ payment_id: payment.payment.id });

      const isReversed = await isPaymentReversed(payment.payment.id);
      expect(isReversed).toBe(true);
    });

    it("should return false for non-reversed payment", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const isReversed = await isPaymentReversed(payment.payment.id);
      expect(isReversed).toBe(false);
    });
  });

  describe("getPaymentReversals", () => {
    it("should return all reversals for payment", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const reversal1 = await reverseDebtPayment({ payment_id: payment.payment.id });

      const reversals = await getPaymentReversals(payment.payment.id);
      expect(reversals.length).toBe(1);
      expect(reversals[0].id).toBe(reversal1.reversal.id);
    });

    it("should return empty array for payment with no reversals", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const reversals = await getPaymentReversals(payment.payment.id);
      expect(reversals.length).toBe(0);
    });
  });

  describe("handleTransactionEdit", () => {
    it("should reverse old payment and create new payment", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const result = await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 30000,
        new_debt_id: debt.id,
        payment_date: "2025-11-10",
      });

      expect(result.reversalCreated).toBe(true);
      expect(result.paymentCreated).toBe(true);
      expect(result.operations.length).toBe(2);

      const balance = await calculateDebtBalance(debt.id, "external");
      expect(balance).toBe(70000); // 100000 - 30000
    });

    it("should handle debt link removal (only reversal)", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const result = await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 0, // Remove debt link
        payment_date: "2025-11-10",
      });

      expect(result.reversalCreated).toBe(true);
      expect(result.paymentCreated).toBe(false);

      const balance = await calculateDebtBalance(debt.id, "external");
      expect(balance).toBe(100000); // Balance restored
    });

    it("should handle debt link change (reverse on old, create on new)", async () => {
      const debt1 = await createExternalDebt({
        name: "Debt 1",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const debt2 = await createExternalDebt({
        name: "Debt 2",
        original_amount_cents: 200000,
        household_id: "h1",
      });

      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt1.id,
        household_id: "h1",
      });

      const result = await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 50000,
        new_debt_id: debt2.id, // Change to debt2
        payment_date: "2025-11-10",
      });

      expect(result.operations.length).toBe(2);

      const balance1 = await calculateDebtBalance(debt1.id, "external");
      const balance2 = await calculateDebtBalance(debt2.id, "external");

      expect(balance1).toBe(100000); // Debt 1 restored
      expect(balance2).toBe(150000); // Debt 2 reduced
    });

    it("should handle new debt link (no existing payment)", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const result = await handleTransactionEdit({
        transaction_id: "txn-new",
        new_amount_cents: 30000,
        new_debt_id: debt.id,
        payment_date: "2025-11-10",
      });

      expect(result.reversalCreated).toBe(false);
      expect(result.paymentCreated).toBe(true);
      expect(result.operations.length).toBe(1);

      const balance = await calculateDebtBalance(debt.id, "external");
      expect(balance).toBe(70000);
    });
  });

  describe("handleTransactionDelete", () => {
    it("should reverse payment when transaction deleted", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const result = await handleTransactionDelete({
        transaction_id: "txn-1",
      });

      expect(result).toBeDefined();
      expect(result?.reversal.amount_cents).toBe(-50000);
      expect(result?.newBalance).toBe(100000);
    });

    it("should return undefined if no payment found", async () => {
      const result = await handleTransactionDelete({
        transaction_id: "nonexistent",
      });

      expect(result).toBeUndefined();
    });

    it("should update status after reversal", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 100000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      const debtBefore = await db.debts.get(debt.id);
      expect(debtBefore?.status).toBe("paid_off");

      const result = await handleTransactionDelete({
        transaction_id: "txn-1",
      });

      expect(result?.statusChanged).toBe(true);
      expect(result?.newStatus).toBe("active");
    });
  });

  describe("Edge Cases", () => {
    it("should handle reversal of overpayment", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      // Overpayment
      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 150000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      expect(payment.wasOverpayment).toBe(true);
      expect(await calculateDebtBalance(debt.id, "external")).toBe(-50000);

      // Reverse overpayment
      const result = await reverseDebtPayment({ payment_id: payment.payment.id });

      expect(result.reversal.amount_cents).toBe(-150000);
      expect(result.newBalance).toBe(100000); // Restored
    });

    it("should handle multiple edits to same transaction", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      // Original payment
      await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      // First edit
      await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 30000,
        new_debt_id: debt.id,
        payment_date: "2025-11-10",
      });

      // Second edit
      await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 40000,
        new_debt_id: debt.id,
        payment_date: "2025-11-10",
      });

      // Balance should reflect final amount
      const balance = await calculateDebtBalance(debt.id, "external");
      expect(balance).toBe(60000); // 100000 - 40000
    });

    it("should handle reversal on archived debt with warning", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      // Archive debt
      await db.debts.update(debt.id, { status: "archived" });

      // Reversal should still work (soft restriction)
      const result = await reverseDebtPayment({ payment_id: payment.payment.id });

      expect(result.reversal).toBeDefined();
      expect(result.statusChanged).toBe(true);
      expect(result.newStatus).toBe("active"); // Unarchives!
    });

    it("should preserve complete audit trail", async () => {
      const debt = await createExternalDebt({
        name: "Test Debt",
        original_amount_cents: 100000,
        household_id: "h1",
      });

      // Original payment
      const payment = await processDebtPayment({
        transaction_id: "txn-1",
        amount_cents: 50000,
        payment_date: "2025-11-10",
        debt_id: debt.id,
        household_id: "h1",
      });

      // Edit (creates reversal + new payment)
      await handleTransactionEdit({
        transaction_id: "txn-1",
        new_amount_cents: 30000,
        new_debt_id: debt.id,
        payment_date: "2025-11-10",
      });

      // Get all payment records
      const allPayments = await db.debtPayments.where("debt_id").equals(debt.id).toArray();

      expect(allPayments.length).toBe(3); // Original + Reversal + New

      // Verify audit trail
      const original = allPayments.find((p) => !p.is_reversal && p.amount_cents === 50000);
      const reversal = allPayments.find((p) => p.is_reversal && p.amount_cents === -50000);
      const newPayment = allPayments.find((p) => !p.is_reversal && p.amount_cents === 30000);

      expect(original).toBeDefined();
      expect(reversal).toBeDefined();
      expect(newPayment).toBeDefined();
      expect(reversal?.reverses_payment_id).toBe(original?.id);
    });
  });
});
