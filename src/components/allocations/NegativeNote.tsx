import type { Cents } from "@/lib/currency";

export const OVERDRAWN_UNASSIGNED = "Allocated more than this account has";

/** The reason a negative amount is red, on its own line beneath the row. */
export function NegativeNote({ cents, label }: { cents: Cents; label: string }) {
  if (cents >= 0) return null;
  return <p className="text-right text-caption text-shortfall">{label}</p>;
}
