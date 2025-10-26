/**
 * Unit tests for account balance calculation logic
 * Tests the mathematical correctness of balance calculations
 */

import { describe, it, expect } from "vitest";

/**
 * Balance calculation test helper
 * Mimics the logic from useAccountBalance hook
 */
function calculateBalance(
  initialBalance: number,
  transactions: Array<{
    amount_cents: number;
    type: "income" | "expense";
    status: "pending" | "cleared";
  }>
) {
  let clearedBalanceDelta = 0;
  let pendingBalanceDelta = 0;
  let clearedCount = 0;
  let pendingCount = 0;

  transactions.forEach((t) => {
    // Income adds to balance, expense subtracts from balance
    const delta = t.type === "income" ? t.amount_cents : -t.amount_cents;

    if (t.status === "cleared") {
      clearedBalanceDelta += delta;
      clearedCount++;
    } else {
      pendingBalanceDelta += delta;
      pendingCount++;
    }
  });

  return {
    initialBalance,
    currentBalance: initialBalance + clearedBalanceDelta + pendingBalanceDelta,
    clearedBalance: initialBalance + clearedBalanceDelta,
    pendingBalance: pendingBalanceDelta,
    transactionCount: transactions.length,
    clearedCount,
    pendingCount,
  };
}

describe("Account Balance Calculation", () => {
  it("should handle empty account with no transactions", () => {
    const result = calculateBalance(0, []);

    expect(result.initialBalance).toBe(0);
    expect(result.currentBalance).toBe(0);
    expect(result.clearedBalance).toBe(0);
    expect(result.pendingBalance).toBe(0);
    expect(result.transactionCount).toBe(0);
  });

  it("should calculate balance with only initial balance", () => {
    const result = calculateBalance(1000000, []); // ₱10,000.00

    expect(result.initialBalance).toBe(1000000);
    expect(result.currentBalance).toBe(1000000);
    expect(result.clearedBalance).toBe(1000000);
    expect(result.pendingBalance).toBe(0);
  });

  it("should add income to balance", () => {
    const result = calculateBalance(1000000, [
      { amount_cents: 50000, type: "income", status: "cleared" }, // +₱500.00
    ]);

    expect(result.currentBalance).toBe(1050000); // ₱10,500.00
    expect(result.clearedBalance).toBe(1050000);
    expect(result.pendingBalance).toBe(0);
  });

  it("should subtract expense from balance", () => {
    const result = calculateBalance(1000000, [
      { amount_cents: 50000, type: "expense", status: "cleared" }, // -₱500.00
    ]);

    expect(result.currentBalance).toBe(950000); // ₱9,500.00
    expect(result.clearedBalance).toBe(950000);
    expect(result.pendingBalance).toBe(0);
  });

  it("should handle mixed income and expense transactions", () => {
    const result = calculateBalance(1000000, [
      { amount_cents: 50000, type: "income", status: "cleared" }, // +₱500.00
      { amount_cents: 30000, type: "expense", status: "cleared" }, // -₱300.00
      { amount_cents: 20000, type: "income", status: "cleared" }, // +₱200.00
    ]);

    // 1,000,000 + 50,000 - 30,000 + 20,000 = 1,040,000
    expect(result.currentBalance).toBe(1040000); // ₱10,400.00
    expect(result.clearedBalance).toBe(1040000);
    expect(result.transactionCount).toBe(3);
  });

  it("should separate cleared and pending transactions", () => {
    const result = calculateBalance(1000000, [
      { amount_cents: 50000, type: "expense", status: "cleared" }, // -₱500.00 cleared
      { amount_cents: 20000, type: "expense", status: "pending" }, // -₱200.00 pending
    ]);

    expect(result.clearedBalance).toBe(950000); // Initial - cleared expense
    expect(result.pendingBalance).toBe(-20000); // Pending expense (negative)
    expect(result.currentBalance).toBe(930000); // Initial - both expenses
    expect(result.clearedCount).toBe(1);
    expect(result.pendingCount).toBe(1);
  });

  it("should handle positive pending balance (pending income)", () => {
    const result = calculateBalance(1000000, [
      { amount_cents: 50000, type: "income", status: "pending" }, // +₱500.00 pending
    ]);

    expect(result.clearedBalance).toBe(1000000); // Initial only (no cleared)
    expect(result.pendingBalance).toBe(50000); // Pending income (positive)
    expect(result.currentBalance).toBe(1050000); // Initial + pending income
  });

  it("should handle transfers correctly (both income and expense)", () => {
    // Transfer scenario: ₱500 from Account A to Account B
    // Account A perspective (outflow)
    const accountA = calculateBalance(1000000, [
      { amount_cents: 50000, type: "expense", status: "cleared" }, // Transfer out
    ]);

    // Account B perspective (inflow)
    const accountB = calculateBalance(500000, [
      { amount_cents: 50000, type: "income", status: "cleared" }, // Transfer in
    ]);

    expect(accountA.currentBalance).toBe(950000); // ₱9,500.00
    expect(accountB.currentBalance).toBe(550000); // ₱5,500.00

    // Net worth unchanged: 950,000 + 550,000 = 1,500,000
    expect(accountA.currentBalance + accountB.currentBalance).toBe(1500000);
  });

  it("should handle large amounts without overflow", () => {
    const result = calculateBalance(99999999, [
      { amount_cents: 50000000, type: "income", status: "cleared" },
      { amount_cents: 30000000, type: "expense", status: "cleared" },
    ]);

    // 99,999,999 + 50,000,000 - 30,000,000 = 119,999,999
    expect(result.currentBalance).toBe(119999999);
  });

  it("should handle negative balance (overdraft)", () => {
    const result = calculateBalance(100000, [
      { amount_cents: 150000, type: "expense", status: "cleared" }, // Spend more than available
    ]);

    expect(result.currentBalance).toBe(-50000); // Negative balance (overdraft)
    expect(result.clearedBalance).toBe(-50000);
  });

  it("should handle complex scenario with multiple pending and cleared", () => {
    const result = calculateBalance(1000000, [
      { amount_cents: 50000, type: "income", status: "cleared" }, // +₱500.00 cleared
      { amount_cents: 30000, type: "expense", status: "cleared" }, // -₱300.00 cleared
      { amount_cents: 20000, type: "income", status: "pending" }, // +₱200.00 pending
      { amount_cents: 10000, type: "expense", status: "pending" }, // -₱100.00 pending
    ]);

    // Cleared balance: 1,000,000 + 50,000 - 30,000 = 1,020,000
    expect(result.clearedBalance).toBe(1020000);

    // Pending balance: +20,000 - 10,000 = +10,000
    expect(result.pendingBalance).toBe(10000);

    // Current balance: 1,020,000 + 10,000 = 1,030,000
    expect(result.currentBalance).toBe(1030000);

    expect(result.clearedCount).toBe(2);
    expect(result.pendingCount).toBe(2);
    expect(result.transactionCount).toBe(4);
  });

  it("should use integer arithmetic (no floating-point errors)", () => {
    // Test case that would fail with floating-point: 0.1 + 0.2 !== 0.3
    const result = calculateBalance(0, [
      { amount_cents: 10, type: "income", status: "cleared" }, // ₱0.10
      { amount_cents: 20, type: "income", status: "cleared" }, // ₱0.20
    ]);

    expect(result.currentBalance).toBe(30); // Exactly 30 cents (₱0.30)
  });

  it("should handle zero-amount transactions", () => {
    const result = calculateBalance(1000000, [
      { amount_cents: 0, type: "income", status: "cleared" },
      { amount_cents: 0, type: "expense", status: "cleared" },
    ]);

    expect(result.currentBalance).toBe(1000000); // Unchanged
    expect(result.transactionCount).toBe(2);
  });
});
