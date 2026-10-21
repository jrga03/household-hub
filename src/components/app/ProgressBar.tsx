import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type ProgressTone = "primary" | "warning" | "shortfall";

const toneStyles: Record<ProgressTone, { track?: string; indicator: string }> = {
  primary: { indicator: "bg-primary" },
  warning: { indicator: "bg-warning" },
  shortfall: { track: "bg-shortfall/20", indicator: "bg-shortfall" },
};

interface ProgressBarProps {
  /** The accessible name, such as "Groceries budget spent". */
  label: string;
  /** Percent, 0 to 100. Larger values show full. */
  value: number;
  tone?: ProgressTone;
  className?: string;
}

export function ProgressBar({ label, value, tone = "primary", className }: ProgressBarProps) {
  const { track, indicator } = toneStyles[tone];

  return (
    <Progress
      aria-label={label}
      value={Math.min(100, Math.max(0, value))}
      className={cn(track, className)}
      indicatorClassName={indicator}
    />
  );
}
