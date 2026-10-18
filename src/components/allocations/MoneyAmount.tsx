import { formatPHP, type Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";

export const OVERDRAWN_UNASSIGNED = "Allocated more than this account has";

/** An amount, red when negative. */
export function MoneyAmount({ cents, className }: { cents: Cents; className?: string }) {
  return (
    <span
      className={cn("whitespace-nowrap tabular-nums", cents < 0 && "text-shortfall", className)}
    >
      {formatPHP(cents)}
    </span>
  );
}

/** The reason a negative amount is red, on its own line beneath the row. */
export function NegativeNote({ cents, label }: { cents: Cents; label: string }) {
  if (cents >= 0) return null;
  return <p className="text-right text-caption text-shortfall">{label}</p>;
}
