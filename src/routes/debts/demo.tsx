import { createFileRoute } from "@tanstack/react-router";
import { DebtCard, DebtList, PaymentHistoryList } from "@/components/debts";
import type { Debt, DebtPayment, InternalDebt } from "@/types/debt";

/**
 * Demo page for testing debt UI components
 *
 * This is a temporary page for verifying all debt components work correctly.
 * Shows various states: active, paid off, archived, overpaid debts,
 * and payment history with reversals.
 */
export const Route = createFileRoute("/debts/demo")({
  component: DebtsDemo,
});

function DebtsDemo() {
  // Sample debt data for testing
  const sampleDebts = [
    {
      debt: {
        id: "1",
        name: "Car Loan",
        original_amount_cents: 10000000, // ₱100,000
        status: "active",
        household_id: "h1",
        created_at: "2025-11-01T00:00:00Z",
        updated_at: "2025-11-01T00:00:00Z",
      } as Debt,
      balance: 7500050, // ₱75,000.50
    },
    {
      debt: {
        id: "2",
        name: "Credit Card",
        original_amount_cents: 5000000, // ₱50,000
        status: "paid_off",
        household_id: "h1",
        created_at: "2025-10-01T00:00:00Z",
        updated_at: "2025-11-05T00:00:00Z",
      } as Debt,
      balance: 0,
    },
    {
      debt: {
        id: "3",
        name: "Medical Bill",
        original_amount_cents: 2000000, // ₱20,000
        status: "active",
        household_id: "h1",
        created_at: "2025-09-15T00:00:00Z",
        updated_at: "2025-11-01T00:00:00Z",
      } as Debt,
      balance: -500000, // Overpaid by ₱5,000
    },
    {
      debt: {
        id: "4",
        name: "Personal Loan",
        original_amount_cents: 3000000, // ₱30,000
        status: "archived",
        household_id: "h1",
        created_at: "2025-06-01T00:00:00Z",
        updated_at: "2025-10-01T00:00:00Z",
        closed_at: "2025-10-01T00:00:00Z",
      } as Debt,
      balance: 1000000, // ₱10,000 remaining
    },
    {
      debt: {
        id: "5",
        household_id: "h1",
        name: "Category Borrowing: Groceries from Entertainment",
        original_amount_cents: 1500000, // ₱15,000
        from_type: "category",
        from_id: "cat-1",
        from_display_name: "Entertainment",
        to_type: "category",
        to_id: "cat-2",
        to_display_name: "Groceries",
        status: "active",
        created_at: "2025-10-20T00:00:00Z",
        updated_at: "2025-11-01T00:00:00Z",
      } as InternalDebt,
      balance: 500000, // ₱5,000
    },
  ];

  // Sample payment history
  const samplePayments: DebtPayment[] = [
    {
      id: "p1",
      household_id: "h1",
      debt_id: "1",
      transaction_id: "txn-123",
      amount_cents: 5000000, // ₱50,000
      payment_date: "2025-11-10",
      device_id: "device-abc-123",
      is_reversal: false,
      created_at: "2025-11-10T10:00:00Z",
      updated_at: "2025-11-10T10:00:00Z",
      idempotency_key: "device-abc-123-payment-p1-1",
    },
    {
      id: "p2",
      household_id: "h1",
      debt_id: "1",
      transaction_id: "txn-456",
      amount_cents: 3000000, // ₱30,000
      payment_date: "2025-11-05",
      device_id: "device-xyz-789",
      is_reversal: false,
      created_at: "2025-11-05T14:30:00Z",
      updated_at: "2025-11-05T14:30:00Z",
      idempotency_key: "device-xyz-789-payment-p2-1",
    },
    // Reversed payment
    {
      id: "p3",
      household_id: "h1",
      debt_id: "1",
      transaction_id: "txn-789",
      amount_cents: 2000000, // ₱20,000
      payment_date: "2025-11-03",
      device_id: "device-abc-123",
      is_reversal: false,
      created_at: "2025-11-03T09:00:00Z",
      updated_at: "2025-11-03T09:00:00Z",
      idempotency_key: "device-abc-123-payment-p3-1",
    },
    // Reversal payment
    {
      id: "p4",
      household_id: "h1",
      debt_id: "1",
      transaction_id: "txn-790",
      amount_cents: -2000000, // -₱20,000 (reversal)
      payment_date: "2025-11-04",
      device_id: "device-abc-123",
      is_reversal: true,
      reverses_payment_id: "p3",
      adjustment_reason: "Transaction amount corrected",
      created_at: "2025-11-04T10:00:00Z",
      updated_at: "2025-11-04T10:00:00Z",
      idempotency_key: "device-abc-123-payment-p4-1",
    },
    // Overpayment
    {
      id: "p5",
      household_id: "h1",
      debt_id: "3",
      transaction_id: "txn-999",
      amount_cents: 2500000, // ₱25,000 (overpays by ₱5,000)
      payment_date: "2025-11-08",
      device_id: "device-abc-123",
      is_reversal: false,
      is_overpayment: true,
      overpayment_amount: 500000, // ₱5,000
      created_at: "2025-11-08T11:00:00Z",
      updated_at: "2025-11-08T11:00:00Z",
      idempotency_key: "device-abc-123-payment-p5-1",
    },
  ];

  return (
    <div className="container mx-auto py-8 space-y-12 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold mb-2">Debt Components Demo</h1>
        <p className="text-muted-foreground">
          Testing D7 debt UI components with various states and configurations
        </p>
      </div>

      {/* Section: Debt List with Filters */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Debt List with Filters</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Shows all debts with status filtering. Includes active, paid off, archived, and overpaid
          debts.
        </p>
        <DebtList
          debts={sampleDebts}
          showFilters
          onViewDetails={(id) => console.log("View debt:", id)}
          onMakePayment={(id) => console.log("Make payment for debt:", id)}
          onCreateDebt={() => console.log("Create new debt")}
        />
      </section>

      {/* Section: Individual Debt Cards */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Individual Debt Cards</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Different debt states shown individually
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Active Debt */}
          <div>
            <h3 className="text-sm font-medium mb-2">Active Debt</h3>
            <DebtCard
              debt={sampleDebts[0].debt}
              balance={sampleDebts[0].balance}
              onViewDetails={() => console.log("View details")}
              onMakePayment={() => console.log("Make payment")}
            />
          </div>

          {/* Paid Off Debt */}
          <div>
            <h3 className="text-sm font-medium mb-2">Paid Off Debt</h3>
            <DebtCard
              debt={sampleDebts[1].debt}
              balance={sampleDebts[1].balance}
              onViewDetails={() => console.log("View details")}
              onMakePayment={() => console.log("Make payment")}
            />
          </div>

          {/* Overpaid Debt */}
          <div>
            <h3 className="text-sm font-medium mb-2">Overpaid Debt</h3>
            <DebtCard
              debt={sampleDebts[2].debt}
              balance={sampleDebts[2].balance}
              onViewDetails={() => console.log("View details")}
              onMakePayment={() => console.log("Make payment")}
            />
          </div>

          {/* Internal Debt */}
          <div>
            <h3 className="text-sm font-medium mb-2">Internal Debt</h3>
            <DebtCard
              debt={sampleDebts[4].debt}
              balance={sampleDebts[4].balance}
              onViewDetails={() => console.log("View details")}
              onMakePayment={() => console.log("Make payment")}
            />
          </div>
        </div>
      </section>

      {/* Section: Payment History */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Payment History Examples</h2>

        <div className="grid gap-6 md:grid-cols-2">
          {/* With payments */}
          <div>
            <h3 className="text-sm font-medium mb-4">With Payments (including reversal)</h3>
            <div className="border rounded-lg p-4">
              <PaymentHistoryList payments={samplePayments} showDeviceId />
            </div>
          </div>

          {/* Empty payment history */}
          <div>
            <h3 className="text-sm font-medium mb-4">Empty Payment History</h3>
            <div className="border rounded-lg p-4">
              <PaymentHistoryList payments={[]} />
            </div>
          </div>
        </div>
      </section>

      {/* Section: Empty State */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Empty State</h2>
        <p className="text-sm text-muted-foreground mb-6">Shows when user has no debts</p>
        <div className="border rounded-lg p-4">
          <DebtList debts={[]} onCreateDebt={() => console.log("Create first debt")} />
        </div>
      </section>
    </div>
  );
}
