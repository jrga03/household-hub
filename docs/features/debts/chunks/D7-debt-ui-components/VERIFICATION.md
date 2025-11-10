# D7 Verification: Debt UI Components

## Quick Verification (3 minutes)

```bash
npm run dev
# Navigate to /debts/demo (create temporary demo route)
# Visually inspect all components
```

---

## Part 1: Currency Utility

### formatPHP Function

```typescript
import { formatPHP, parsePHP } from "@/lib/currency";

// Basic formatting
console.assert(formatPHP(150050) === "₱1,500.50", "Format ₱1,500.50");
console.assert(formatPHP(0) === "₱0.00", "Format zero");
console.assert(formatPHP(100) === "₱1.00", "Format ₱1.00");

// Negative amounts (overpayments)
console.assert(formatPHP(-5000) === "₱-50.00", "Format negative");

// Large amounts
console.assert(formatPHP(100000000) === "₱1,000,000.00", "Format millions");
```

### parsePHP Function

```typescript
// Parse formatted strings
console.assert(parsePHP("₱1,500.50") === 150050, "Parse formatted");
console.assert(parsePHP("1500.50") === 150050, "Parse unformatted");
console.assert(parsePHP(1500.5) === 150050, "Parse number");

// Error handling
try {
  parsePHP("invalid");
  console.assert(false, "Should throw error");
} catch (e) {
  console.assert(true, "Throws on invalid input");
}
```

---

## Part 2: DebtStatusBadge Component

### Visual Verification

```tsx
import { DebtStatusBadge } from "@/components/debts/DebtStatusBadge";

// Render all status variants
<div className="flex gap-2">
  <DebtStatusBadge status="active" /> {/* Blue badge: "Active" */}
  <DebtStatusBadge status="paid_off" /> {/* Green badge: "✓ Paid Off" */}
  <DebtStatusBadge status="archived" /> {/* Gray badge: "Archived" */}
</div>;
```

**Expected**:

- `active`: Blue/default color
- `paid_off`: Green with checkmark
- `archived`: Gray/muted color

### Accessibility Check

```tsx
// Check ARIA labels
const { container } = render(<DebtStatusBadge status="active" />);
const badge = container.querySelector("[aria-label]");
console.assert(badge?.getAttribute("aria-label") === "Status: Active");
```

---

## Part 3: DebtBalanceDisplay Component

### Normal Balance

```tsx
import { DebtBalanceDisplay } from "@/components/debts/DebtBalanceDisplay";

<DebtBalanceDisplay balance={50000} originalAmount={100000} showPercentage />;
```

**Expected**:

- Large text: "₱500.00" (default color)
- Small text: "of ₱1,000.00" (muted)
- Small text: "50% paid" (muted)

### Paid Off Balance

```tsx
<DebtBalanceDisplay balance={0} originalAmount={100000} showPercentage />
```

**Expected**:

- Large text: "₱0.00" (GREEN color)
- Small text: "of ₱1,000.00"
- Small text: "100% paid"

### Overpaid Balance

```tsx
<DebtBalanceDisplay balance={-5000} originalAmount={100000} showPercentage />
```

**Expected**:

- Large text: "₱-50.00" (RED color)
- Small text: "of ₱1,000.00"
- Small text: "125% paid"
- Warning: "⚠ Overpaid by ₱50.00" (amber color)

### Without Percentage

```tsx
<DebtBalanceDisplay balance={50000} originalAmount={100000} showPercentage={false} />
```

**Expected**:

- No "50% paid" text shown
- Balance and original amount still visible

---

## Part 4: DebtProgressBar Component

### Early Progress (0-33%)

```tsx
import { DebtProgressBar } from "@/components/debts/DebtProgressBar";

<DebtProgressBar paid={25000} total={100000} />;
```

**Expected**:

- Progress bar 25% filled
- RED color indicator
- Text: "25% paid"

### Mid Progress (34-66%)

```tsx
<DebtProgressBar paid={50000} total={100000} />
```

**Expected**:

- Progress bar 50% filled
- AMBER color indicator
- Text: "50% paid"

### Late Progress (67-99%)

```tsx
<DebtProgressBar paid={75000} total={100000} />
```

**Expected**:

- Progress bar 75% filled
- GREEN color indicator
- Text: "75% paid"

### Complete (100%)

```tsx
<DebtProgressBar paid={100000} total={100000} />
```

**Expected**:

- Progress bar 100% filled
- GREEN color indicator
- Text: "100% paid"

### Overpaid (>100%)

```tsx
<DebtProgressBar paid={125000} total={100000} />
```

**Expected**:

- Progress bar 100% filled (capped)
- AMBER color indicator
- Text: "125% (overpaid)"

---

## Part 5: DebtCard Component

### Active Debt Card

```tsx
import { DebtCard } from "@/components/debts/DebtCard";

const activeDebt = {
  id: "1",
  name: "Car Loan",
  original_amount_cents: 100000,
  status: "active" as const,
  household_id: "h1",
  created_at: "2025-11-01",
  updated_at: "2025-11-01",
};

<DebtCard
  debt={activeDebt}
  balance={50000}
  onViewDetails={(id) => console.log("View", id)}
  onMakePayment={(id) => console.log("Pay", id)}
/>;
```

**Expected**:

- Header: "Car Loan" + Blue "Active" badge
- Body: "₱500.00" + "of ₱1,000.00" + "50% paid"
- Progress bar: 50% amber
- Footer: "View Details" + "Make Payment" buttons

### Paid Off Debt Card

```tsx
const paidDebt = {
  ...activeDebt,
  status: "paid_off" as const,
};

<DebtCard debt={paidDebt} balance={0} />;
```

**Expected**:

- Green "✓ Paid Off" badge
- Green "₱0.00" balance
- 100% green progress bar
- "Make Another Payment" button (lighter variant)

### Archived Debt Card

```tsx
const archivedDebt = {
  ...activeDebt,
  status: "archived" as const,
};

<DebtCard debt={archivedDebt} balance={30000} />;
```

**Expected**:

- Gray "Archived" badge
- Only "View Details" button (no payment button)

### Internal Debt Card

```tsx
import type { InternalDebt } from "@/types/debt";

const internalDebt: InternalDebt = {
  id: "1",
  household_id: "h1",
  from_type: "user",
  from_id: "user-1",
  to_type: "user",
  to_id: "user-2",
  original_amount_cents: 50000,
  status: "active",
  created_at: "2025-11-01",
  updated_at: "2025-11-01",
};

<DebtCard debt={internalDebt} balance={25000} />;
```

**Expected**:

- Subtitle: "Internal debt" (muted text)

---

## Part 6: DebtList Component

### Non-Empty List

```tsx
import { DebtList } from "@/components/debts/DebtList";

const debts = [
  {
    debt: {
      id: "1",
      name: "Car Loan",
      original_amount_cents: 100000,
      status: "active" as const,
      household_id: "h1",
      created_at: "2025-11-01",
      updated_at: "2025-11-01",
    },
    balance: 50000,
  },
  {
    debt: {
      id: "2",
      name: "Credit Card",
      original_amount_cents: 50000,
      status: "paid_off" as const,
      household_id: "h1",
      created_at: "2025-11-01",
      updated_at: "2025-11-01",
    },
    balance: 0,
  },
];

<DebtList
  debts={debts}
  showFilters
  onViewDetails={(id) => console.log("View", id)}
  onMakePayment={(id) => console.log("Pay", id)}
  onCreateDebt={() => console.log("Create")}
/>;
```

**Expected**:

- Filter tabs: "All (2)", "Active (1)", "Paid Off (1)", "Archived (0)"
- Grid of 2 debt cards
- Responsive: 3 cols desktop, 2 cols tablet, 1 col mobile

### Empty List

```tsx
<DebtList debts={[]} onCreateDebt={() => console.log("Create")} />
```

**Expected**:

- Centered empty state with icon
- "No debts yet" heading
- Helpful description text
- "Create Your First Debt" button

### Status Filtering

```tsx
// Click "Active" filter tab
// Expected: Only active debts shown

// Click "Paid Off" filter tab
// Expected: Only paid off debts shown

// Click "All" filter tab
// Expected: All debts shown
```

---

## Part 7: PaymentHistoryList Component

### Normal Payment History

```tsx
import { PaymentHistoryList } from "@/components/debts/PaymentHistoryList";
import type { DebtPayment } from "@/types/debt";

const payments: DebtPayment[] = [
  {
    id: "1",
    debt_id: "debt-1",
    amount_cents: 50000,
    payment_date: "2025-11-10",
    is_reversal: false,
    transaction_id: "txn-123",
    device_id: "device-abc",
    created_at: "2025-11-10T10:00:00Z",
    updated_at: "2025-11-10T10:00:00Z",
  },
  {
    id: "2",
    debt_id: "debt-1",
    amount_cents: 30000,
    payment_date: "2025-11-05",
    is_reversal: false,
    transaction_id: "txn-456",
    device_id: "device-xyz",
    created_at: "2025-11-05T10:00:00Z",
    updated_at: "2025-11-05T10:00:00Z",
  },
];

<PaymentHistoryList payments={payments} showDeviceId />;
```

**Expected**:

- "Payment History" heading
- Nov 10 payment listed first (newest first)
- Each payment shows: date, amount, transaction link, device ID
- Separator between payments

### Payment with Reversal

```tsx
const paymentsWithReversal: DebtPayment[] = [
  {
    id: "1",
    debt_id: "debt-1",
    amount_cents: 50000,
    payment_date: "2025-11-10",
    is_reversal: false,
    transaction_id: "txn-123",
    device_id: "device-abc",
    created_at: "2025-11-10T10:00:00Z",
    updated_at: "2025-11-10T10:00:00Z",
  },
  {
    id: "2",
    debt_id: "debt-1",
    amount_cents: -50000,
    payment_date: "2025-11-15",
    is_reversal: true,
    reverses_payment_id: "1",
    device_id: "device-abc",
    created_at: "2025-11-15T10:00:00Z",
    updated_at: "2025-11-15T10:00:00Z",
  },
];

<PaymentHistoryList payments={paymentsWithReversal} />;
```

**Expected**:

- Original payment: "₱500.00 (Reversed)" with strikethrough
- Reversal: "₱-500.00 (Reversal)" in amber color
- Reversal note: "Reverses payment #1"

### Overpayment Indicator

```tsx
const overpaymentPayment: DebtPayment = {
  id: "1",
  debt_id: "debt-1",
  amount_cents: 150000,
  payment_date: "2025-11-10",
  is_reversal: false,
  is_overpayment: true,
  overpayment_amount: 50000,
  transaction_id: "txn-123",
  device_id: "device-abc",
  created_at: "2025-11-10T10:00:00Z",
  updated_at: "2025-11-10T10:00:00Z",
};

<PaymentHistoryList payments={[overpaymentPayment]} />;
```

**Expected**:

- Amount in RED color
- Warning: "⚠ Overpaid by ₱500.00" in amber

### Empty Payment History

```tsx
<PaymentHistoryList payments={[]} />
```

**Expected**:

- Centered text: "No payments yet"
- Subtext: "Make your first payment to get started"

---

## Part 8: Responsive Design

### Desktop (≥1024px)

```bash
# Resize browser to 1200px width
```

**Expected**:

- DebtList: 3-column grid
- All text visible
- Side-by-side buttons

### Tablet (768px-1023px)

```bash
# Resize browser to 800px width
```

**Expected**:

- DebtList: 2-column grid
- Condensed spacing

### Mobile (<768px)

```bash
# Resize browser to 375px width
```

**Expected**:

- DebtList: 1-column grid
- Full-width cards
- Stacked buttons
- Touch-friendly spacing (44px minimum tap targets)

---

## Part 9: Accessibility

### Keyboard Navigation

```bash
# Tab through DebtCard
```

**Expected**:

- Focus visible on all buttons
- Tab order: View Details → Make Payment
- Enter activates buttons

### Screen Reader

```bash
# Test with screen reader (VoiceOver/NVDA)
```

**Expected**:

- Status badge reads: "Status: Active"
- Balance reads full amount with currency
- Progress bar reads percentage

### Color Contrast

```bash
# Use browser dev tools: Inspect → Accessibility
```

**Expected**:

- All text meets WCAG 2.1 AA (4.5:1 contrast)
- Status colors distinguishable
- Icons supplement color

---

## Part 10: Interactive Verification

### Button Callbacks

```tsx
const handleView = (id: string) => console.log("Viewing debt:", id);
const handlePayment = (id: string) => console.log("Payment for:", id);

<DebtCard debt={debt} balance={50000} onViewDetails={handleView} onMakePayment={handlePayment} />;

// Click "View Details"
// Expected console: "Viewing debt: 1"

// Click "Make Payment"
// Expected console: "Payment for: 1"
```

### Filter Interaction

```tsx
<DebtList debts={debts} showFilters />

// Click "Active" filter
// Expected: Only active debts visible

// Click "Paid Off" filter
// Expected: Only paid off debts visible
```

---

## Edge Cases

### Edge Case 1: Very Long Debt Name

```tsx
const longNameDebt = {
  ...debt,
  name: "This is an extremely long debt name that should wrap to multiple lines or truncate",
};

<DebtCard debt={longNameDebt} balance={50000} />;
```

**Expected**:

- Name wraps to multiple lines
- Card layout not broken

### Edge Case 2: Very Small Balance

```tsx
<DebtBalanceDisplay balance={1} originalAmount={100000} />
```

**Expected**:

- "₱0.01" displayed correctly
- Progress bar shows minimal progress

### Edge Case 3: Exact 100% Paid

```tsx
<DebtProgressBar paid={100000} total={100000} />
```

**Expected**:

- Progress bar exactly 100% filled
- Green color
- "100% paid" text (NOT "100% (overpaid)")

### Edge Case 4: Zero Original Amount

```tsx
<DebtBalanceDisplay balance={0} originalAmount={0} />
```

**Expected**:

- No division by zero error
- Graceful handling (0% or hide percentage)

---

## Final Checklist

- [ ] Currency utilities work (formatPHP, parsePHP)
- [ ] DebtStatusBadge shows correct colors
- [ ] DebtBalanceDisplay color-codes balance
- [ ] DebtProgressBar shows color gradient
- [ ] DebtCard renders all sections correctly
- [ ] DebtList filters work
- [ ] DebtList empty state shows
- [ ] PaymentHistoryList shows chronological order
- [ ] Reversals indicated with strikethrough
- [ ] Responsive at all breakpoints
- [ ] Keyboard navigable
- [ ] Screen reader accessible
- [ ] Button callbacks fire correctly
- [ ] Component tests pass (if created)

**Status**: ✅ Chunk D7 Complete

**Next Chunk**: D8 - Debt Forms

---

## Integration Verification

Test components with real data:

```tsx
import { useQuery } from "@tanstack/react-query";
import { listDebts } from "@/lib/debts";
import { calculateDebtBalance } from "@/lib/debts";
import { DebtList } from "@/components/debts";

function DebtsPage() {
  const { data: debts } = useQuery({
    queryKey: ["debts", "household-1", "external"],
    queryFn: async () => {
      const debts = await listDebts("household-1", "external");

      // Calculate balances
      const debtsWithBalances = await Promise.all(
        debts.map(async (debt) => ({
          debt,
          balance: await calculateDebtBalance(debt.id, "external"),
        }))
      );

      return debtsWithBalances;
    },
  });

  if (!debts) return <div>Loading...</div>;

  return (
    <DebtList
      debts={debts}
      showFilters
      onViewDetails={(id) => navigate(`/debts/${id}`)}
      onMakePayment={(id) => openPaymentDialog(id)}
    />
  );
}
```

**Expected**:

- Real debts displayed
- Accurate balances shown
- Filters work with real data
- Click handlers navigate correctly
