/**
 * Browser Console Test Script for D3-Balance Calculation
 *
 * To test in browser console:
 * 1. Start dev server: npm run dev
 * 2. Open browser console
 * 3. Paste and run this script
 */

import { db } from "@/lib/dexie/db";
import { calculateDebtBalance, calculateDebtBalanceWithDetails } from "@/lib/debts/balance";
import { updateDebtStatusFromBalance } from "@/lib/debts/status";

export async function testDebtBalanceInBrowser() {
  console.log("🧪 Starting D3 Balance Calculation Browser Test");

  try {
    // Clean up any existing test data
    await db.debts.where("id").equals("test-debt-1").delete();
    await db.debtPayments.where("debt_id").equals("test-debt-1").delete();

    console.log("✅ Cleaned up existing test data");

    // Step 1: Create test debt
    await db.debts.add({
      id: "test-debt-1",
      household_id: "00000000-0000-0000-0000-000000000001",
      name: "Browser Test Debt",
      original_amount_cents: 100000, // ₱1,000
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    console.log("✅ Created test debt: ₱1,000");

    // Step 2: Check balance with no payments
    const balance1 = await calculateDebtBalance("test-debt-1", "external");
    console.log(`📊 Balance with no payments: ${balance1} cents (₱${balance1 / 100})`);
    console.assert(balance1 === 100000, "Initial balance should be 100000");

    // Step 3: Add first payment
    await db.debtPayments.add({
      id: "test-payment-1",
      household_id: "00000000-0000-0000-0000-000000000001",
      debt_id: "test-debt-1",
      transaction_id: "test-txn-1",
      amount_cents: 60000, // ₱600
      payment_date: "2025-11-10",
      device_id: "test-device",
      is_reversal: false,
      created_at: new Date().toISOString(),
    });

    console.log("✅ Added payment: ₱600");

    // Step 4: Check balance after payment
    const balance2 = await calculateDebtBalance("test-debt-1", "external");
    console.log(`📊 Balance after payment: ${balance2} cents (₱${balance2 / 100})`);
    console.assert(balance2 === 40000, "Balance after payment should be 40000");

    // Step 5: Get detailed breakdown
    const details = await calculateDebtBalanceWithDetails("test-debt-1", "external");
    console.log("📋 Detailed breakdown:", {
      original: `₱${details.original_amount_cents / 100}`,
      paid: `₱${details.total_paid_cents / 100}`,
      remaining: `₱${details.current_balance_cents / 100}`,
      payments: details.payment_count,
      reversals: details.reversal_count,
      overpaid: details.is_overpaid,
    });

    // Step 6: Update status (should stay active since balance > 0)
    const statusChanged1 = await updateDebtStatusFromBalance("test-debt-1", "external");
    const debt1 = await db.debts.get("test-debt-1");
    console.log(`📌 Status after partial payment: ${debt1?.status} (changed: ${statusChanged1})`);
    console.assert(debt1?.status === "active", "Status should remain active");

    // Step 7: Pay off remaining balance
    await db.debtPayments.add({
      id: "test-payment-2",
      household_id: "00000000-0000-0000-0000-000000000001",
      debt_id: "test-debt-1",
      transaction_id: "test-txn-2",
      amount_cents: 40000, // ₱400
      payment_date: "2025-11-11",
      device_id: "test-device",
      is_reversal: false,
      created_at: new Date().toISOString(),
    });

    console.log("✅ Added final payment: ₱400");

    // Step 8: Check balance is now zero
    const balance3 = await calculateDebtBalance("test-debt-1", "external");
    console.log(`📊 Balance after full payoff: ${balance3} cents`);
    console.assert(balance3 === 0, "Balance should be 0");

    // Step 9: Update status (should transition to paid_off)
    const statusChanged2 = await updateDebtStatusFromBalance("test-debt-1", "external");
    const debt2 = await db.debts.get("test-debt-1");
    console.log(`📌 Status after payoff: ${debt2?.status} (changed: ${statusChanged2})`);
    console.log(`📅 Closed at: ${debt2?.closed_at}`);
    console.assert(debt2?.status === "paid_off", "Status should be paid_off");
    console.assert(debt2?.closed_at !== null, "Closed_at should be set");

    // Step 10: Test reversal scenario
    await db.debtPayments.add({
      id: "test-reversal-1",
      household_id: "00000000-0000-0000-0000-000000000001",
      debt_id: "test-debt-1",
      transaction_id: "test-txn-2",
      amount_cents: -40000, // Reversal
      payment_date: "2025-11-12",
      device_id: "test-device",
      is_reversal: true,
      reverses_payment_id: "test-payment-2",
      adjustment_reason: "Transaction edited",
      created_at: new Date().toISOString(),
    });

    console.log("✅ Added reversal for last payment");

    // Step 11: Check balance after reversal
    const balance4 = await calculateDebtBalance("test-debt-1", "external");
    console.log(`📊 Balance after reversal: ${balance4} cents (₱${balance4 / 100})`);
    console.assert(balance4 === 40000, "Balance should be 40000 after reversal");

    // Step 12: Update status (should reactivate)
    const statusChanged3 = await updateDebtStatusFromBalance("test-debt-1", "external");
    const debt3 = await db.debts.get("test-debt-1");
    console.log(`📌 Status after reversal: ${debt3?.status} (changed: ${statusChanged3})`);
    console.assert(debt3?.status === "active", "Status should be active again");
    console.assert(debt3?.closed_at === null, "Closed_at should be cleared");

    // Step 13: Test overpayment
    await db.debtPayments.add({
      id: "test-payment-3",
      household_id: "00000000-0000-0000-0000-000000000001",
      debt_id: "test-debt-1",
      transaction_id: "test-txn-3",
      amount_cents: 60000, // ₱600 (overpays by ₱200)
      payment_date: "2025-11-13",
      device_id: "test-device",
      is_reversal: false,
      is_overpayment: true,
      overpayment_amount: 20000,
      created_at: new Date().toISOString(),
    });

    console.log("✅ Added overpayment: ₱600");

    // Step 14: Check negative balance
    const balance5 = await calculateDebtBalance("test-debt-1", "external");
    console.log(`📊 Balance after overpayment: ${balance5} cents (₱${balance5 / 100})`);
    console.assert(balance5 === -20000, "Balance should be -20000 (overpaid)");

    // Step 15: Get final details
    const finalDetails = await calculateDebtBalanceWithDetails("test-debt-1", "external");
    console.log("📋 Final details:", {
      balance: `₱${finalDetails.current_balance_cents / 100}`,
      overpaid: finalDetails.is_overpaid,
      overpayment: `₱${finalDetails.overpayment_amount_cents / 100}`,
      paymentCount: finalDetails.payment_count,
      reversalCount: finalDetails.reversal_count,
    });

    // Cleanup
    await db.debts.delete("test-debt-1");
    await db.debtPayments.where("debt_id").equals("test-debt-1").delete();
    console.log("✅ Cleaned up test data");

    console.log("🎉 All browser tests passed successfully!");
    return true;
  } catch (error) {
    console.error("❌ Test failed:", error);
    // Cleanup on error
    await db.debts.where("id").equals("test-debt-1").delete();
    await db.debtPayments.where("debt_id").equals("test-debt-1").delete();
    return false;
  }
}

// Export for use in browser console
if (typeof window !== "undefined") {
  (window as any).testDebtBalance = testDebtBalanceInBrowser;
  console.log("💡 Test function loaded. Run: testDebtBalance()");
}
