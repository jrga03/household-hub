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

  // Calculate percentage paid, handling edge case of zero original amount
  const percentagePaid =
    originalAmount > 0 ? ((originalAmount - balance) / originalAmount) * 100 : 0;

  // Color logic for balance display
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
          {percentagePaid > 100
            ? `${Math.floor(percentagePaid)}% paid`
            : `${Math.floor(percentagePaid)}% paid`}
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
