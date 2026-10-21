import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: ReactNode;
  level?: 2 | 3 | 4;
  /** A right-aligned link or amount. */
  action?: ReactNode;
  /** Pins the header right under the app header while its section scrolls. */
  sticky?: boolean;
  className?: string;
}

export function SectionHeader({
  title,
  level = 2,
  action,
  sticky = false,
  className,
}: SectionHeaderProps) {
  const Heading = `h${level}` as const;

  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-2",
        sticky && "sticky top-[var(--app-header)] z-10 bg-background py-2",
        className
      )}
    >
      <Heading className="min-w-0 truncate text-heading">{title}</Heading>
      {action && <div className="shrink-0 tabular-nums">{action}</div>}
    </div>
  );
}
