import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  title: ReactNode;
  level?: 2 | 3 | 4;
  /** A right-aligned link or amount. */
  action?: ReactNode;
  /** Pins the header right under the app header while its section scrolls. */
  sticky?: boolean;
  /** Makes the title a button that shows or hides the content with id `controls`. */
  toggle?: { expanded: boolean; controls: string; onToggle: () => void };
  className?: string;
}

export function SectionHeader({
  title,
  level = 2,
  action,
  sticky = false,
  toggle,
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
      <Heading className="min-w-0 truncate text-heading">
        {toggle ? (
          <button
            type="button"
            aria-expanded={toggle.expanded}
            aria-controls={toggle.controls}
            onClick={toggle.onToggle}
            className="flex max-w-full items-center gap-1 rounded-sm pointer-coarse:min-h-11 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn(
                "size-4 shrink-0 transition-transform",
                !toggle.expanded && "-rotate-90"
              )}
            />
            <span className="min-w-0 truncate">{title}</span>
          </button>
        ) : (
          title
        )}
      </Heading>
      {action && <div className="shrink-0 tabular-nums">{action}</div>}
    </div>
  );
}
