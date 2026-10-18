import { formatPHP, type Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";

export const OVERDRAWN_UNASSIGNED = "Allocated more than this account has";

/**
 * The shortfall color for a negative amount. A credit card's figure is the amount owed,
 * so pass `owed` for it: a negative owed amount is a credit, not money short.
 */
export function shortfallClass(cents: Cents, { owed = false }: { owed?: boolean } = {}) {
  return !owed && cents < 0 ? "text-shortfall" : undefined;
}

/** An amount, red when negative unless it is `owed` on a credit card. */
export function MoneyAmount({
  cents,
  owed = false,
  className,
}: {
  cents: Cents;
  owed?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("whitespace-nowrap tabular-nums", shortfallClass(cents, { owed }), className)}
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
