/**
 * PROTOTYPE (#259): throwaway chart pieces, hand-written per #257 and colored
 * per #261: `chart` for the series, `chart-muted` for comparison, `primary`
 * for the figure the drilldown shows, `border` gridlines, `muted-foreground` axis.
 */

import { Link, type LinkOptions } from "@tanstack/react-router";
import { format } from "date-fns";
import { spokenMoney } from "@/components/app/Money";
import { formatPHPAxisTick, ZERO_CENTS, type Cents } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { monthLabel, parseLocalDate } from "@/lib/utils/dates";

export const shortMonth = (month: string) => format(parseLocalDate(`${month}-01`), "MMM");

const spentLabel = (month: string, cents: Cents) =>
  `${monthLabel(month)}: ${spokenMoney({ kind: "balance", cents })} spent`;

export interface MonthBar {
  month: string;
  cents: Cents;
  /** The main series; false draws it as comparison. */
  main?: boolean;
  /** The bar the drilldown shows. */
  selected?: boolean;
  link?: LinkOptions;
  onSelect?: () => void;
}

/** Months side by side as HTML bars; each is a link or a button. */
export function MonthBars({
  bars,
  label,
  className,
}: {
  bars: MonthBar[];
  label: string;
  className?: string;
}) {
  const max = Math.max(1, ...bars.map((bar) => bar.cents));
  return (
    <figure aria-label={label} className={cn("space-y-1", className)}>
      <div className="relative h-40">
        <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
          <div className="flex items-start gap-2 border-t">
            <span className="text-caption text-muted-foreground tabular-nums">
              {formatPHPAxisTick(Math.round(max) as Cents)}
            </span>
          </div>
          <div className="border-t border-dashed" />
          <div className="border-t" />
        </div>
        <ol className="relative flex h-full items-end gap-1 pt-6 @[600px]:gap-2">
          {bars.map((bar) => {
            const height = `${(Math.max(0, bar.cents) / max) * 100}%`;
            const barClass = cn(
              "block w-full rounded-t-sm transition-colors",
              bar.selected ? "bg-primary" : bar.main ? "bg-chart" : "bg-chart-muted"
            );
            const target = cn(
              "group flex h-full w-full items-end rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            );
            return (
              <li key={bar.month} className="flex h-full min-w-0 flex-1">
                {bar.link ? (
                  <Link
                    {...bar.link}
                    aria-label={spentLabel(bar.month, bar.cents)}
                    aria-current={bar.selected ? "true" : undefined}
                    className={target}
                  >
                    <span className={barClass} style={{ height }} />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={bar.onSelect}
                    aria-label={spentLabel(bar.month, bar.cents)}
                    aria-pressed={bar.selected ?? false}
                    className={target}
                  >
                    <span className={barClass} style={{ height }} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <ol aria-hidden="true" className="flex gap-1 @[600px]:gap-2">
        {bars.map((bar) => (
          <li
            key={bar.month}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-caption text-muted-foreground",
              bar.selected && "font-semibold text-foreground"
            )}
          >
            {shortMonth(bar.month)}
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** A horizontal bar against the largest figure in its list, with an optional budget tick. */
export function HBar({
  cents,
  max,
  budget,
  tone = "chart",
  className,
}: {
  cents: Cents;
  max: Cents;
  budget?: Cents;
  tone?: "chart" | "chart-muted" | "primary";
  className?: string;
}) {
  const scale = Math.max(1, max, budget ?? ZERO_CENTS);
  const over = budget !== undefined && cents > budget;
  return (
    <div aria-hidden="true" className={cn("relative h-2 w-full", className)}>
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-sm",
          over
            ? "bg-shortfall"
            : tone === "primary"
              ? "bg-primary"
              : tone === "chart"
                ? "bg-chart"
                : "bg-chart-muted"
        )}
        style={{ width: `${(Math.max(0, cents) / scale) * 100}%` }}
      />
      {budget !== undefined && (
        <div
          className="absolute -inset-y-1 w-0.5 bg-foreground"
          style={{ left: `${(budget / scale) * 100}%` }}
        />
      )}
    </div>
  );
}

export interface TrendPoint {
  month: string;
  cents: Cents;
  selected?: boolean;
  link: LinkOptions;
}

/** A line over the months; each point is a focusable link. */
export function TrendLine({ points, label }: { points: TrendPoint[]; label: string }) {
  const max = Math.max(1, ...points.map((point) => point.cents));
  const x = (index: number) => (points.length === 1 ? 50 : (index / (points.length - 1)) * 100);
  const y = (cents: Cents) => 100 - (Math.max(0, cents) / max) * 90;
  const path = points.map((point, index) => `${x(index)},${y(point.cents)}`).join(" ");
  return (
    <figure aria-label={label} className="space-y-1">
      <div className="relative h-32 border-b">
        <svg
          aria-hidden="true"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <polyline
            points={path}
            fill="none"
            vectorEffect="non-scaling-stroke"
            className="stroke-chart"
            strokeWidth={2}
          />
        </svg>
        <ol>
          {points.map((point, index) => (
            <li
              key={point.month}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x(index)}%`, top: `${y(point.cents)}%` }}
            >
              <Link
                {...point.link}
                aria-label={spentLabel(point.month, point.cents)}
                aria-current={point.selected ? "true" : undefined}
                className="flex size-6 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span
                  className={cn(
                    "block rounded-full",
                    point.selected ? "size-3 bg-primary" : "size-2 bg-chart"
                  )}
                />
              </Link>
            </li>
          ))}
        </ol>
      </div>
      <ol aria-hidden="true" className="relative h-4">
        {points.map((point, index) => (
          <li
            key={point.month}
            className="absolute -translate-x-1/2 text-caption text-muted-foreground"
            style={{ left: `${x(index)}%` }}
          >
            {points.length <= 6 || (points.length - 1 - index) % 2 === 0
              ? shortMonth(point.month)
              : ""}
          </li>
        ))}
      </ol>
    </figure>
  );
}

/** A tiny decorative trend for a row; the row's own text carries the figures. */
export function Sparkline({ values, className }: { values: Cents[]; className?: string }) {
  const max = Math.max(1, ...values);
  const path = values
    .map(
      (value, index) =>
        `${(index / Math.max(1, values.length - 1)) * 100},${100 - (Math.max(0, value) / max) * 100}`
    )
    .join(" ");
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("h-6 w-16 overflow-visible", className)}
    >
      <polyline
        points={path}
        fill="none"
        vectorEffect="non-scaling-stroke"
        className="stroke-chart"
        strokeWidth={1.5}
      />
    </svg>
  );
}
