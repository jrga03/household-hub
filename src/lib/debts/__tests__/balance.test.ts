import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  calculateDebtBalance,
  calculateDebtBalanceWithDetails,
  calculateMultipleBalances,
} from "../balance";
import type { Debt, DebtPayment } from "@/types/debt";

describe("Balance Calculation", () => {
  beforeEach(async () => {
    // Clear database before each test
    await db.debts.clear();
    await db.debtPayments.clear();
  });

  describe("calculateDebtBalance", () => {
    it("should return full balance when no payments exist", async () => {
      const debt: Debt = {
        id: "debt-1",
        household_id: "household-1",
        name: "Test Debt",
        original_amount_cents: 100000, // ₱1,000
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await db.debts.add(debt);

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(100000); // Full balance
    });

    it("should calculate balance with single payment", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 25000, // ₱250 paid
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(75000); // ₱1,000 - ₱250 = ₱750
    });

    it("should calculate balance with multiple payments", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.bulkAdd([
        {
          id: "payment-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: 25000,
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          idempotency_key: "device-1-debt_payment-payment-1-1",
        },
        {
          id: "payment-2",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-2",
          amount_cents: 30000,
          payment_date: "2025-11-05",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          idempotency_key: "device-1-debt_payment-payment-2-2",
        },
      ]);

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(45000); // ₱1,000 - ₱250 - ₱300 = ₱450
    });

    it("should exclude reversal records from calculation", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.bulkAdd([
        {
          id: "payment-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: 25000, // Original payment
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          idempotency_key: "device-1-debt_payment-payment-1-1",
        },
        {
          id: "reversal-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: -25000, // Reversal (negative)
          payment_date: "2025-11-02",
          device_id: "device-1",
          is_reversal: true,
          reverses_payment_id: "payment-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          idempotency_key: "device-1-debt_payment-reversal-1-2",
        },
      ]);

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(100000); // Both excluded, back to full balance
    });

    it("should support negative balance (overpayment)", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000, // ₱1,000
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 150000, // ₱1,500 paid (overpaid by ₱500)
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        is_overpayment: true,
        overpayment_amount: 50000,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      const balance = await calculateDebtBalance("debt-1", "external");
      expect(balance).toBe(-50000); // Overpaid by ₱500
    });

    it("should return 0 for non-existent debt", async () => {
      const balance = await calculateDebtBalance("non-existent", "external");
      expect(balance).toBe(0);
    });
  });

  describe("calculateDebtBalanceWithDetails", () => {
    it("should return detailed breakdown", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.bulkAdd([
        {
          id: "payment-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: 30000,
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          idempotency_key: "device-1-debt_payment-payment-1-1",
        },
        {
          id: "payment-2",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-2",
          amount_cents: 20000,
          payment_date: "2025-11-05",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          idempotency_key: "device-1-debt_payment-payment-2-2",
        },
      ]);

      const details = await calculateDebtBalanceWithDetails("debt-1", "external");

      expect(details.original_amount_cents).toBe(100000);
      expect(details.total_paid_cents).toBe(50000);
      expect(details.current_balance_cents).toBe(50000);
      expect(details.payment_count).toBe(2);
      expect(details.reversal_count).toBe(0);
      expect(details.is_overpaid).toBe(false);
      expect(details.overpayment_amount_cents).toBe(0);
    });

    it("should detect overpayment in details", async () => {
      await db.debts.add({
        id: "debt-1",
        household_id: "household-1",
        name: "Test",
        original_amount_cents: 100000,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await db.debtPayments.add({
        id: "payment-1",
        household_id: "household-1",
        debt_id: "debt-1",
        transaction_id: "txn-1",
        amount_cents: 125000, // Overpaid
        payment_date: "2025-11-10",
        device_id: "device-1",
        is_reversal: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        idempotency_key: "device-1-debt_payment-payment-1-1",
      });

      const details = await calculateDebtBalanceWithDetails("debt-1", "external");

      expect(details.is_overpaid).toBe(true);
      expect(details.overpayment_amount_cents).toBe(25000); // ₱250 over
      expect(details.current_balance_cents).toBe(-25000);
    });
  });

  describe("calculateMultipleBalances", () => {
    it("should calculate balances for multiple debts efficiently", async () => {
      // Add 3 debts
      await db.debts.bulkAdd([
        {
          id: "debt-1",
          household_id: "household-1",
          name: "Debt 1",
          original_amount_cents: 100000,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "debt-2",
          household_id: "household-1",
          name: "Debt 2",
          original_amount_cents: 200000,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: "debt-3",
          household_id: "household-1",
          name: "Debt 3",
          original_amount_cents: 150000,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);

      // Add payments for debt-1 and debt-2 (debt-3 has no payments)
      await db.debtPayments.bulkAdd([
        {
          id: "payment-1",
          household_id: "household-1",
          debt_id: "debt-1",
          transaction_id: "txn-1",
          amount_cents: 25000,
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          idempotency_key: "device-1-debt_payment-payment-1-1",
        },
        {
          id: "payment-2",
          household_id: "household-1",
          debt_id: "debt-2",
          transaction_id: "txn-2",
          amount_cents: 100000,
          payment_date: "2025-11-01",
          device_id: "device-1",
          is_reversal: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          idempotency_key: "device-1-debt_payment-payment-2-2",
        },
      ]);

      const balances = await calculateMultipleBalances(["debt-1", "debt-2", "debt-3"], "external");

      expect(balances.get("debt-1")).toBe(75000); // 100k - 25k
      expect(balances.get("debt-2")).toBe(100000); // 200k - 100k
      expect(balances.get("debt-3")).toBe(150000); // No payments
    });
  });
});
