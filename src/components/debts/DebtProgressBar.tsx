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
  // Handle edge case where total is 0
  const percentage = total > 0 ? Math.min((paid / total) * 100, 100) : 0;
  const actualPercentage = total > 0 ? (paid / total) * 100 : 0;
  const isOverpaid = paid > total;

  // Determine color based on progress
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
        aria-label={`${Math.floor(percentage)}% paid`}
      />

      <p className="text-xs text-muted-foreground text-right">
        {isOverpaid
          ? `${Math.floor(actualPercentage)}% (overpaid)`
          : `${Math.floor(percentage)}% paid`}
      </p>
    </div>
  );
}
