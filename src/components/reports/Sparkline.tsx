import type { Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";

/** A category's months as one `chart` line, oldest first. Decorative: the row carries the figures. */
export function Sparkline({ values, className }: { values: Cents[]; className?: string }) {
  const max = Math.max(1, ...values);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - (Math.max(0, value) / max) * 100;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden
      data-testid="sparkline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("h-6 w-16 overflow-visible", className)}
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        className="stroke-chart"
      />
    </svg>
  );
}
