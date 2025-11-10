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

  // Check if this is an internal debt
  const isInternal = "from_type" in debt;

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex-1">
          <h3 className="font-bold text-lg leading-tight">{debt.name}</h3>
          {isInternal && <p className="text-sm text-muted-foreground">Internal debt</p>}
        </div>
        <DebtStatusBadge status={debt.status} className="ml-2" />
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
