# D7 Implementation: Debt UI Components

**Time estimate**: 1.5 hours
**Prerequisites**: D1-D6 complete, shadcn/ui installed

---

## Step 0: Verify/Create Currency Utility (10 min)

Before building UI components, ensure currency formatting utility exists.

**File**: `src/lib/currency.ts` (CREATE if missing, SKIP if exists)

```typescript
/**
 * Currency utilities for PHP (Philippine Peso)
 *
 * All amounts stored as BIGINT cents (1 PHP = 100 cents)
 */

/**
 * Format cents to PHP currency string
 *
 * @param cents - Amount in cents (BIGINT)
 * @returns Formatted PHP string (e.g., "₱1,500.50")
 *
 * @example
 * formatPHP(150050) // "₱1,500.50"
 * formatPHP(0) // "₱0.00"
 * formatPHP(-5000) // "₱-50.00"
 */
export function formatPHP(cents: number): string {
  const isNegative = cents < 0;
  const absoluteCents = Math.abs(cents);
  const pesos = absoluteCents / 100;

  const formatted = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(pesos);

  // Handle negative amounts (₱-50.00 instead of -₱50.00)
  if (isNegative) {
    return formatted.replace("₱", "₱-").replace("-", "");
  }

  return formatted;
}

/**
 * Parse PHP string or number to cents
 *
 * @param input - PHP string ("₱1,500.50") or number (1500.5)
 * @returns Amount in cents (150050)
 *
 * @example
 * parsePHP("₱1,500.50") // 150050
 * parsePHP("1500.50") // 150050
 * parsePHP(1500.5) // 150050
 */
export function parsePHP(input: string | number): number {
  if (typeof input === "number") {
    return Math.round(input * 100);
  }

  // Remove currency symbol, commas, spaces
  const cleaned = input.replace(/[₱,\s]/g, "");
  const pesos = parseFloat(cleaned);

  if (isNaN(pesos)) {
    throw new Error(`Invalid PHP amount: ${input}`);
  }

  return Math.round(pesos * 100);
}

/**
 * Validate amount is within acceptable range
 *
 * @param cents - Amount in cents
 * @returns True if valid (0 to 999,999,999 cents = ₱9,999,999.99)
 */
export function validateAmount(cents: number): boolean {
  return cents >= 0 && cents <= 99999999900; // ₱999,999,999.00 max
}
```

**Verification**:

```typescript
import { formatPHP, parsePHP } from "@/lib/currency";

console.log(formatPHP(150050)); // "₱1,500.50"
console.log(formatPHP(-5000)); // "₱-50.00"
console.log(parsePHP("₱1,500.50")); // 150050
```

---

## Step 1: Install Required shadcn/ui Components (5 min)

Install shadcn/ui components if not already present.

```bash
# Install required components
npx shadcn@latest add card
npx shadcn@latest add badge
npx shadcn@latest add button
npx shadcn@latest add progress
npx shadcn@latest add separator
```

**Verify installation**:

```bash
ls src/components/ui/card.tsx
ls src/components/ui/badge.tsx
ls src/components/ui/button.tsx
ls src/components/ui/progress.tsx
```

---

## Step 2: Create DebtStatusBadge Component (10 min)

Simple status badge with color coding.

**File**: `src/components/debts/DebtStatusBadge.tsx` (NEW)

```tsx
import { Badge } from "@/components/ui/badge";
import type { DebtStatus } from "@/types/debt";

interface DebtStatusBadgeProps {
  status: DebtStatus;
  className?: string;
}

/**
 * Color-coded status badge for debts
 *
 * Status colors:
 * - active: Blue (default)
 * - paid_off: Green (success)
 * - archived: Gray (muted)
 */
export function DebtStatusBadge({ status, className }: DebtStatusBadgeProps) {
  const variants: Record<
    DebtStatus,
    { label: string; variant: "default" | "secondary" | "success" | "destructive" | "outline" }
  > = {
    active: {
      label: "Active",
      variant: "default",
    },
    paid_off: {
      label: "✓ Paid Off",
      variant: "success",
    },
    archived: {
      label: "Archived",
      variant: "secondary",
    },
  };

  const config = variants[status];

  return (
    <Badge variant={config.variant} className={className} aria-label={`Status: ${config.label}`}>
      {config.label}
    </Badge>
  );
}
```

**Note**: If your Badge component doesn't have a `success` variant, add it to `src/components/ui/badge.tsx`:

```tsx
// In badge.tsx variants object
success: 'bg-green-500 text-white hover:bg-green-600',
```

**Verification**:

```tsx
import { DebtStatusBadge } from '@/components/debts/DebtStatusBadge';

<DebtStatusBadge status="active" />
<DebtStatusBadge status="paid_off" />
<DebtStatusBadge status="archived" />
```

---

## Step 3: Create DebtBalanceDisplay Component (15 min)

Formatted balance with color coding and percentage paid.

**File**: `src/components/debts/DebtBalanceDisplay.tsx` (NEW)

```tsx
import { formatPHP } from "@/lib/currency";
import { cn } from "@/lib/utils";

interface DebtBalanceDisplayProps {
  /** Current balance in cents */
  balance: number;
  /** Original debt amount in cents */
  originalAmount: number;
  /** Show percentage paid */
  showPercentage?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Display debt balance with color coding
 *
 * Colors:
 * - Green: Paid off (balance = 0)
 * - Red: Overpaid (balance < 0)
 * - Default: Normal balance
 *
 * @example
 * <DebtBalanceDisplay balance={50000} originalAmount={100000} showPercentage />
 * // Displays: ₱500.00 / of ₱1,000.00 / 50% paid
 */
export function DebtBalanceDisplay({
  balance,
  originalAmount,
  showPercentage = true,
  className,
}: DebtBalanceDisplayProps) {
  const isPaidOff = balance === 0;
  const isOverpaid = balance < 0;
  const percentagePaid = ((originalAmount - balance) / originalAmount) * 100;

  // Color logic
  const balanceColor = cn(
    "text-3xl font-bold",
    isPaidOff && "text-green-600 dark:text-green-400",
    isOverpaid && "text-red-600 dark:text-red-400",
    !isPaidOff && !isOverpaid && "text-foreground"
  );

  return (
    <div className={cn("space-y-1", className)}>
      {/* Current balance */}
      <p className={balanceColor}>{formatPHP(balance)}</p>

      {/* Original amount */}
      <p className="text-sm text-muted-foreground">of {formatPHP(originalAmount)}</p>

      {/* Percentage paid */}
      {showPercentage && percentagePaid > 0 && (
        <p className="text-sm font-medium text-muted-foreground">
          {percentagePaid.toFixed(0)}% paid
        </p>
      )}

      {/* Overpayment warning */}
      {isOverpaid && (
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
          ⚠ Overpaid by {formatPHP(Math.abs(balance))}
        </p>
      )}
    </div>
  );
}
```

**Verification**:

```tsx
import { DebtBalanceDisplay } from '@/components/debts/DebtBalanceDisplay';

// Normal balance
<DebtBalanceDisplay balance={50000} originalAmount={100000} />

// Paid off
<DebtBalanceDisplay balance={0} originalAmount={100000} />

// Overpaid
<DebtBalanceDisplay balance={-5000} originalAmount={100000} />
```

---

## Step 4: Create DebtProgressBar Component (15 min)

Visual progress indicator with color gradient.

**File**: `src/components/debts/DebtProgressBar.tsx` (NEW)

```tsx
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface DebtProgressBarProps {
  /** Amount paid in cents */
  paid: number;
  /** Total debt amount in cents */
  total: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Visual progress bar for debt paydown
 *
 * Color gradient:
 * - 0-33%: Red (early progress)
 * - 34-66%: Amber (mid progress)
 * - 67-99%: Green (almost done)
 * - 100%: Green (paid off)
 * - >100%: Amber (overpaid)
 *
 * @example
 * <DebtProgressBar paid={75000} total={100000} />
 * // Shows 75% progress bar in green
 */
export function DebtProgressBar({ paid, total, className }: DebtProgressBarProps) {
  const percentage = Math.min((paid / total) * 100, 100);
  const isOverpaid = paid > total;

  // Color based on progress
  const getProgressColor = () => {
    if (isOverpaid) return "bg-amber-500";
    if (percentage >= 67) return "bg-green-500";
    if (percentage >= 34) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Progress
        value={percentage}
        className="h-2"
        indicatorClassName={getProgressColor()}
        aria-label={`${percentage.toFixed(0)}% paid`}
      />

      <p className="text-xs text-muted-foreground text-right">
        {isOverpaid
          ? `${((paid / total) * 100).toFixed(0)}% (overpaid)`
          : `${percentage.toFixed(0)}% paid`}
      </p>
    </div>
  );
}
```

**Note**: If your Progress component doesn't accept `indicatorClassName`, modify `src/components/ui/progress.tsx`:

```tsx
interface ProgressProps extends React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> {
  indicatorClassName?: string; // Add this
}

const Progress = React.forwardRef<React.ElementRef<typeof ProgressPrimitive.Root>, ProgressProps>(
  ({ className, value, indicatorClassName, ...props }, ref) => (
    <ProgressPrimitive.Root ref={ref} className={cn("...", className)} {...props}>
      <ProgressPrimitive.Indicator
        className={cn("...", indicatorClassName)} // Use here
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
);
```

**Verification**:

```tsx
import { DebtProgressBar } from '@/components/debts/DebtProgressBar';

// 25% progress (red)
<DebtProgressBar paid={25000} total={100000} />

// 50% progress (amber)
<DebtProgressBar paid={50000} total={100000} />

// 75% progress (green)
<DebtProgressBar paid={75000} total={100000} />

// Overpaid (amber)
<DebtProgressBar paid={125000} total={100000} />
```

---

## Step 5: Create DebtCard Component (20 min)

Main card component for debt display.

**File**: `src/components/debts/DebtCard.tsx` (NEW)

```tsx
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DebtStatusBadge } from "./DebtStatusBadge";
import { DebtBalanceDisplay } from "./DebtBalanceDisplay";
import { DebtProgressBar } from "./DebtProgressBar";
import type { Debt, InternalDebt } from "@/types/debt";

interface DebtCardProps {
  /** Debt data */
  debt: Debt | InternalDebt;
  /** Current balance in cents */
  balance: number;
  /** Click handler for view details */
  onViewDetails?: (debtId: string) => void;
  /** Click handler for make payment */
  onMakePayment?: (debtId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Card component for displaying debt information
 *
 * Shows:
 * - Debt name + status badge
 * - Current balance (color-coded)
 * - Progress bar
 * - Action buttons
 *
 * @example
 * <DebtCard
 *   debt={debt}
 *   balance={50000}
 *   onViewDetails={(id) => navigate(`/debts/${id}`)}
 *   onMakePayment={(id) => openPaymentDialog(id)}
 * />
 */
export function DebtCard({
  debt,
  balance,
  onViewDetails,
  onMakePayment,
  className,
}: DebtCardProps) {
  const isPaidOff = debt.status === "paid_off";
  const isArchived = debt.status === "archived";
  const amountPaid = debt.original_amount_cents - balance;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <h3 className="font-bold text-lg">{debt.name}</h3>
          {"from_type" in debt && <p className="text-sm text-muted-foreground">Internal debt</p>}
        </div>
        <DebtStatusBadge status={debt.status} />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Balance display */}
        <DebtBalanceDisplay
          balance={balance}
          originalAmount={debt.original_amount_cents}
          showPercentage
        />

        {/* Progress bar */}
        <DebtProgressBar paid={amountPaid} total={debt.original_amount_cents} />
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button variant="outline" onClick={() => onViewDetails?.(debt.id)} className="flex-1">
          View Details
        </Button>

        {!isArchived && (
          <Button
            variant={isPaidOff ? "outline" : "default"}
            onClick={() => onMakePayment?.(debt.id)}
            className="flex-1"
          >
            {isPaidOff ? "Make Another Payment" : "Make Payment"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
```

**Verification**:

```tsx
import { DebtCard } from "@/components/debts/DebtCard";

const debt = {
  id: "1",
  name: "Car Loan",
  original_amount_cents: 100000,
  status: "active" as const,
  household_id: "h1",
  created_at: "2025-11-01",
  updated_at: "2025-11-01",
};

<DebtCard
  debt={debt}
  balance={50000}
  onViewDetails={(id) => console.log("View", id)}
  onMakePayment={(id) => console.log("Pay", id)}
/>;
```

---

## Step 6: Create DebtList Component (15 min)

List component with filtering and empty states.

**File**: `src/components/debts/DebtList.tsx` (NEW)

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DebtCard } from "./DebtCard";
import type { Debt, InternalDebt, DebtStatus } from "@/types/debt";

interface DebtWithBalance {
  debt: Debt | InternalDebt;
  balance: number;
}

interface DebtListProps {
  /** Debts with calculated balances */
  debts: DebtWithBalance[];
  /** Click handler for view details */
  onViewDetails?: (debtId: string) => void;
  /** Click handler for make payment */
  onMakePayment?: (debtId: string) => void;
  /** Click handler for create debt */
  onCreateDebt?: () => void;
  /** Enable status filtering */
  showFilters?: boolean;
}

/**
 * Filterable list of debt cards
 *
 * Features:
 * - Status filter tabs
 * - Empty state with CTA
 * - Responsive grid layout
 *
 * @example
 * <DebtList
 *   debts={debtsWithBalances}
 *   onViewDetails={handleView}
 *   onMakePayment={handlePayment}
 *   onCreateDebt={handleCreate}
 *   showFilters
 * />
 */
export function DebtList({
  debts,
  onViewDetails,
  onMakePayment,
  onCreateDebt,
  showFilters = true,
}: DebtListProps) {
  const [statusFilter, setStatusFilter] = useState<DebtStatus | "all">("all");

  // Filter debts by status
  const filteredDebts = debts.filter((item) => {
    if (statusFilter === "all") return true;
    return item.debt.status === statusFilter;
  });

  // Empty state
  if (debts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 text-muted-foreground">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">No debts yet</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Create your first debt to start tracking payments and progress toward being debt-free.
        </p>
        {onCreateDebt && <Button onClick={onCreateDebt}>Create Your First Debt</Button>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status filters */}
      {showFilters && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            All ({debts.length})
          </Button>
          <Button
            variant={statusFilter === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("active")}
          >
            Active ({debts.filter((d) => d.debt.status === "active").length})
          </Button>
          <Button
            variant={statusFilter === "paid_off" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("paid_off")}
          >
            Paid Off ({debts.filter((d) => d.debt.status === "paid_off").length})
          </Button>
          <Button
            variant={statusFilter === "archived" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("archived")}
          >
            Archived ({debts.filter((d) => d.debt.status === "archived").length})
          </Button>
        </div>
      )}

      {/* Debt grid */}
      {filteredDebts.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No {statusFilter !== "all" && statusFilter} debts found
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDebts.map((item) => (
            <DebtCard
              key={item.debt.id}
              debt={item.debt}
              balance={item.balance}
              onViewDetails={onViewDetails}
              onMakePayment={onMakePayment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Verification**:

```tsx
import { DebtList } from "@/components/debts/DebtList";

const debtsWithBalances = [
  {
    debt: {
      id: "1",
      name: "Car Loan",
      original_amount_cents: 100000,
      status: "active" as const /* ... */,
    },
    balance: 50000,
  },
  {
    debt: {
      id: "2",
      name: "Credit Card",
      original_amount_cents: 50000,
      status: "paid_off" as const /* ... */,
    },
    balance: 0,
  },
];

<DebtList debts={debtsWithBalances} showFilters onCreateDebt={() => console.log("Create")} />;
```

---

## Step 7: Create PaymentHistoryList Component (20 min)

Timeline view of payment history with reversal indicators.

**File**: `src/components/debts/PaymentHistoryList.tsx` (NEW)

```tsx
import { formatPHP } from "@/lib/currency";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { DebtPayment } from "@/types/debt";

interface PaymentHistoryListProps {
  /** Payment records (newest first) */
  payments: DebtPayment[];
  /** Show device ID (for debugging) */
  showDeviceId?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Chronological payment history with reversal indicators
 *
 * Features:
 * - Newest first sorting
 * - Reversal indicators (strikethrough + reversal entry)
 * - Transaction links
 * - Optional device ID display
 * - Empty state
 *
 * @example
 * <PaymentHistoryList payments={payments} showDeviceId />
 */
export function PaymentHistoryList({
  payments,
  showDeviceId = false,
  className,
}: PaymentHistoryListProps) {
  // Empty state
  if (payments.length === 0) {
    return (
      <div className={cn("py-8 text-center text-muted-foreground", className)}>
        <p>No payments yet</p>
        <p className="text-sm mt-1">Make your first payment to get started</p>
      </div>
    );
  }

  // Sort by payment date (newest first)
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
  );

  // Build reversal map for strikethrough
  const reversedIds = new Set(
    payments.filter((p) => p.reverses_payment_id).map((p) => p.reverses_payment_id!)
  );

  return (
    <div className={cn("space-y-4", className)}>
      <h4 className="font-semibold">Payment History</h4>

      <div className="space-y-4">
        {sortedPayments.map((payment, index) => {
          const isReversed = reversedIds.has(payment.id);
          const isReversal = payment.is_reversal;

          return (
            <div key={payment.id}>
              {index > 0 && <Separator className="my-4" />}

              <div className="space-y-1">
                {/* Date */}
                <p className="text-sm text-muted-foreground">
                  {new Date(payment.payment_date).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </p>

                {/* Amount */}
                <p
                  className={cn(
                    "text-lg font-semibold",
                    isReversal && "text-amber-600 dark:text-amber-400",
                    isReversed && "line-through text-muted-foreground",
                    payment.is_overpayment && "text-red-600 dark:text-red-400"
                  )}
                >
                  {formatPHP(payment.amount_cents)}
                  {isReversal && " (Reversal)"}
                  {isReversed && " (Reversed)"}
                </p>

                {/* Transaction link */}
                {payment.transaction_id && (
                  <p className="text-xs text-muted-foreground">
                    Payment via Transaction #{payment.transaction_id.slice(0, 8)}
                  </p>
                )}

                {/* Overpayment warning */}
                {payment.is_overpayment && payment.overpayment_amount && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    ⚠ Overpaid by {formatPHP(payment.overpayment_amount)}
                  </p>
                )}

                {/* Reversal note */}
                {isReversal && payment.reverses_payment_id && (
                  <p className="text-xs text-muted-foreground">
                    Reverses payment #{payment.reverses_payment_id.slice(0, 8)}
                  </p>
                )}

                {/* Device ID (optional) */}
                {showDeviceId && payment.device_id && (
                  <p className="text-xs text-muted-foreground">
                    Device: {payment.device_id.slice(0, 8)}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Verification**:

```tsx
import { PaymentHistoryList } from "@/components/debts/PaymentHistoryList";

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
];

<PaymentHistoryList payments={payments} showDeviceId />;
```

---

## Step 8: Create Component Index (5 min)

Export all components from a central index file.

**File**: `src/components/debts/index.ts` (NEW)

```typescript
export { DebtCard } from "./DebtCard";
export { DebtList } from "./DebtList";
export { DebtStatusBadge } from "./DebtStatusBadge";
export { DebtBalanceDisplay } from "./DebtBalanceDisplay";
export { DebtProgressBar } from "./DebtProgressBar";
export { PaymentHistoryList } from "./PaymentHistoryList";
```

**Verification**:

```typescript
// Clean imports from single index
import {
  DebtCard,
  DebtList,
  DebtStatusBadge,
  DebtBalanceDisplay,
  PaymentHistoryList,
} from "@/components/debts";
```

---

## Step 9: Create Component Tests (Optional - 20 min)

Basic component tests with React Testing Library.

**File**: `src/components/debts/__tests__/DebtCard.test.tsx` (NEW)

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DebtCard } from "../DebtCard";
import type { Debt } from "@/types/debt";

describe("DebtCard", () => {
  const mockDebt: Debt = {
    id: "debt-1",
    household_id: "h1",
    name: "Test Debt",
    original_amount_cents: 100000,
    status: "active",
    created_at: "2025-11-01T00:00:00Z",
    updated_at: "2025-11-01T00:00:00Z",
  };

  it("should render debt name", () => {
    render(<DebtCard debt={mockDebt} balance={50000} />);
    expect(screen.getByText("Test Debt")).toBeInTheDocument();
  });

  it("should render status badge", () => {
    render(<DebtCard debt={mockDebt} balance={50000} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("should render balance correctly", () => {
    render(<DebtCard debt={mockDebt} balance={50000} />);
    expect(screen.getByText("₱500.00")).toBeInTheDocument();
  });

  it("should call onViewDetails when button clicked", () => {
    const handleView = vi.fn();
    render(<DebtCard debt={mockDebt} balance={50000} onViewDetails={handleView} />);

    fireEvent.click(screen.getByText("View Details"));
    expect(handleView).toHaveBeenCalledWith("debt-1");
  });

  it("should call onMakePayment when button clicked", () => {
    const handlePayment = vi.fn();
    render(<DebtCard debt={mockDebt} balance={50000} onMakePayment={handlePayment} />);

    fireEvent.click(screen.getByText("Make Payment"));
    expect(handlePayment).toHaveBeenCalledWith("debt-1");
  });

  it("should show paid off badge for paid debt", () => {
    const paidDebt = { ...mockDebt, status: "paid_off" as const };
    render(<DebtCard debt={paidDebt} balance={0} />);

    expect(screen.getByText("✓ Paid Off")).toBeInTheDocument();
  });

  it("should show overpayment warning for negative balance", () => {
    render(<DebtCard debt={mockDebt} balance={-5000} />);
    expect(screen.getByText(/Overpaid by/)).toBeInTheDocument();
  });
});
```

**Run tests**:

```bash
npm test src/components/debts/__tests__/DebtCard.test.tsx
# Expected: 7+ tests pass
```

---

## Final Verification

Test all components in a demo page:

**File**: `src/routes/debts/demo.tsx` (TEMPORARY - for verification only)

```tsx
import { DebtCard, DebtList, PaymentHistoryList } from "@/components/debts";
import type { Debt, DebtPayment } from "@/types/debt";

export function DebtsDemo() {
  const debts = [
    {
      debt: {
        id: "1",
        name: "Car Loan",
        original_amount_cents: 100000,
        status: "active",
        household_id: "h1",
        created_at: "2025-11-01",
        updated_at: "2025-11-01",
      } as Debt,
      balance: 50000,
    },
    {
      debt: {
        id: "2",
        name: "Credit Card",
        original_amount_cents: 50000,
        status: "paid_off",
        household_id: "h1",
        created_at: "2025-11-01",
        updated_at: "2025-11-01",
      } as Debt,
      balance: 0,
    },
  ];

  const payments: DebtPayment[] = [
    {
      id: "1",
      debt_id: "1",
      amount_cents: 50000,
      payment_date: "2025-11-10",
      is_reversal: false,
      transaction_id: "txn-123",
      device_id: "device-abc",
      created_at: "2025-11-10T10:00:00Z",
      updated_at: "2025-11-10T10:00:00Z",
    },
  ];

  return (
    <div className="container mx-auto py-8 space-y-8">
      <h1 className="text-3xl font-bold">Debt Components Demo</h1>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Debt List</h2>
        <DebtList
          debts={debts}
          showFilters
          onViewDetails={(id) => console.log("View", id)}
          onMakePayment={(id) => console.log("Pay", id)}
          onCreateDebt={() => console.log("Create")}
        />
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Payment History</h2>
        <PaymentHistoryList payments={payments} showDeviceId />
      </section>
    </div>
  );
}
```

**View in browser**:

```bash
npm run dev
# Navigate to /debts/demo
```

**Verify checklist**:

- [ ] DebtCard displays name, status, balance, progress
- [ ] Status badges color-coded correctly
- [ ] Balance shows green for paid off, red for overpaid
- [ ] Progress bar color transitions (red → amber → green)
- [ ] Filters work in DebtList
- [ ] Empty state shows with CTA button
- [ ] PaymentHistoryList shows payments chronologically
- [ ] Reversals indicated with strikethrough
- [ ] Mobile responsive (test at 375px width)

---

## Troubleshooting

### Issue: Currency not formatting correctly

**Symptom**: Balance shows "NaN" or "undefined".

**Cause**: `formatPHP` not handling cents correctly.

**Fix**: Verify cents → pesos conversion:

```typescript
const pesos = cents / 100; // NOT cents * 100
```

---

### Issue: Badge variant not found

**Symptom**: TypeScript error "variant 'success' does not exist".

**Cause**: Badge component missing `success` variant.

**Fix**: Add to `src/components/ui/badge.tsx`:

```tsx
success: 'bg-green-500 text-white hover:bg-green-600',
```

---

### Issue: Progress bar not showing color

**Symptom**: Progress bar always default color.

**Cause**: Progress component not accepting `indicatorClassName`.

**Fix**: Modify Progress component to accept custom indicator class (see Step 4).

---

## ★ Insight ─────────────────────────────────────

**Component Composition**: These components use the **compound component pattern** where smaller, focused components (DebtStatusBadge, DebtBalanceDisplay, DebtProgressBar) compose into larger components (DebtCard). This provides:

1. **Reusability**: Each component can be used independently
2. **Testability**: Easy to test small units in isolation
3. **Flexibility**: Consumers can remix components as needed

**Color Semantics for Accessibility**: We use color PLUS additional indicators (icons, text, strikethrough) to convey meaning. This ensures colorblind users can understand status:

- ✓ icon + "Paid Off" text (not just green)
- ⚠ icon + "Overpaid" text (not just red)
- Strikethrough + "(Reversed)" label

**Progressive Enhancement**: Components work at three levels:

1. **No JS**: Basic HTML structure and Tailwind classes render correctly
2. **Basic JS**: React hydration enables interactivity
3. **Enhanced**: Animations, hover states, dynamic calculations

─────────────────────────────────────────────────

---

**Time check**: You should have completed D7 in ~1.5 hours.

**Next**: Chunk D8 - Debt Forms
