import { formatPHP } from "@/lib/currency";
import { CheckCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  currentBalance: number;
  clearedBalance: number;
  pendingBalance: number;
  size?: "small" | "large";
  showSplit?: boolean;
}

/**
 * AccountBalance Component
 *
 * Displays account balance with cleared/pending split.
 * Shows current balance prominently with optional breakdown
 * of cleared and pending amounts.
 *
 * @param currentBalance - Total balance including all transactions (cents)
 * @param clearedBalance - Balance from cleared transactions only (cents)
 * @param pendingBalance - Sum of pending transactions, can be +/- (cents)
 * @param size - Display size: "small" (compact) or "large" (prominent)
 * @param showSplit - Whether to show cleared/pending breakdown
 *
 * @example
 * // Large balance display with split (account detail page)
 * <AccountBalance
 *   currentBalance={1200000}
 *   clearedBalance={1300000}
 *   pendingBalance={-100000}
 *   size="large"
 *   showSplit={true}
 * />
 *
 * @example
 * // Small balance display without split (account list card)
 * <AccountBalance
 *   currentBalance={1200000}
 *   clearedBalance={1300000}
 *   pendingBalance={-100000}
 *   size="small"
 *   showSplit={false}
 * />
 */
export function AccountBalance({
  currentBalance,
  clearedBalance,
  pendingBalance,
  size = "large",
  showSplit = true,
}: Props) {
  const isPositive = currentBalance >= 0;

  return (
    <div className="space-y-2">
      {/* Current Balance */}
      <div className={cn("font-mono", size === "large" ? "text-3xl" : "text-xl")}>
        <div
          className={cn(
            "font-bold",
            isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          )}
        >
          {formatPHP(currentBalance)}
        </div>
        <div className="text-xs text-muted-foreground">Current Balance</div>
      </div>

      {/* Split Display */}
      {showSplit && (
        <div className="flex gap-4 text-sm">
          {/* Cleared Balance */}
          <div className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-600" />
            <span className="text-muted-foreground">Cleared:</span>
            <span className="font-mono font-medium">{formatPHP(clearedBalance)}</span>
          </div>

          {/* Pending Balance */}
          {pendingBalance !== 0 && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-yellow-600" />
              <span className="text-muted-foreground">Pending:</span>
              <span className="font-mono font-medium">{formatPHP(pendingBalance)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
