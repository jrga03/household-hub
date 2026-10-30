import { Link, type LinkOptions } from "@tanstack/react-router";
import { spokenMoney } from "@/components/app/Money";
import { formatPHPAxisTick, ZERO_CENTS, type Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { formatMonth, monthLabel } from "@/lib/utils/dates";

export interface MonthBar {
  /** "yyyy-MM". */
  month: string;
  cents: Cents;
  /** `primary` marks the bar the pane shows. */
  tone: "chart" | "chart-muted" | "primary";
  link: LinkOptions;
}

const TONE_CLASS: Record<MonthBar["tone"], string> = {
  chart: "bg-chart",
  "chart-muted": "bg-chart-muted",
  primary: "bg-primary",
};

/** Months side by side, oldest first; each bar is a link named by its month and amount. */
export function MonthBars({ bars, label }: { bars: MonthBar[]; label: string }) {
  const top = bars.reduce((most, bar) => (bar.cents > most ? bar.cents : most), ZERO_CENTS);
  const scale = Math.max(1, top);
  return (
    <figure aria-label={label} className="relative">
      {/* Gridlines span the bars' area: above the month labels (h-5 and gap-1). */}
      <div aria-hidden className="absolute inset-x-0 top-6 bottom-6 flex flex-col justify-between">
        <div className="relative border-t">
          <span className="absolute top-0 left-0 -translate-y-full text-caption text-muted-foreground tabular-nums">
            {formatPHPAxisTick(top)}
          </span>
        </div>
        <div className="border-t" />
        <div className="border-t" />
      </div>
      <ol className="relative flex h-48 gap-1 pt-6 @[600px]:gap-2">
        {bars.map((bar) => (
          <li key={bar.month} className="flex min-w-0 flex-1">
            <Link
              {...bar.link}
              aria-label={`${monthLabel(bar.month)}: ${spokenMoney({ kind: "balance", cents: bar.cents })} spent`}
              aria-current={bar.tone === "primary" ? "true" : undefined}
              className="group flex w-full flex-col gap-1 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex w-full flex-1 items-end">
                <span
                  className={cn("w-full rounded-t-sm", TONE_CLASS[bar.tone])}
                  style={{ height: `${(Math.max(0, bar.cents) / scale) * 100}%` }}
                />
              </span>
              <span
                aria-hidden
                className="h-5 truncate text-center text-caption text-muted-foreground group-hover:underline"
              >
                {formatMonth(bar.month, "MMM")}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </figure>
  );
}
