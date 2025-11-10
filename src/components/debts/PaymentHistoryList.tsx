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

  // Build reversal map for strikethrough display
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

                {/* Amount with appropriate styling */}
                <p
                  className={cn(
                    "text-lg font-semibold",
                    isReversal && "text-amber-600 dark:text-amber-400",
                    isReversed && "line-through text-muted-foreground",
                    payment.is_overpayment && !isReversal && "text-red-600 dark:text-red-400"
                  )}
                >
                  {formatPHP(Math.abs(payment.amount_cents))}
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

                {/* Adjustment reason if provided */}
                {payment.adjustment_reason && (
                  <p className="text-xs text-muted-foreground italic">
                    Reason: {payment.adjustment_reason}
                  </p>
                )}

                {/* Device ID (optional, for debugging) */}
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
