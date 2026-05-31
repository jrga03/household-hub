import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Variant = "centered" | "rail" | "split" | "nav-content" | "triple";

interface PageShellProps {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}

interface SlotProps {
  className?: string;
  children: ReactNode;
}

function Main({ className, children }: SlotProps) {
  return (
    <div data-slot="main" className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}

function LeftAside({ className, children }: SlotProps) {
  return (
    <aside data-slot="left-aside" className={cn("min-w-0", className)}>
      {children}
    </aside>
  );
}

function RightAside({ className, children }: SlotProps) {
  return (
    <aside data-slot="right-aside" className={cn("min-w-0", className)}>
      {children}
    </aside>
  );
}

/**
 * PageShell — layout primitive used by every page.
 *
 * Variants:
 *   - centered: single column, max-w-7xl. Default.
 *   - rail: main + right rail. Rail collapses below the main on narrow widths.
 *   - split: master-detail. Aside is the detail pane; collapses to main-only on narrow.
 *   - nav-content: left section nav + main content. Nav becomes horizontal tabs on narrow.
 *   - triple: left aside + main + right aside (Transactions only). Collapses progressively.
 *
 * Uses container queries (`@container`) so layouts react to actual page width,
 * not viewport width (the global sidebar can collapse and shift content width).
 *
 * See docs/plans/2026-05-30-wide-screen-layout-design.md for the full design.
 */
export function PageShell({ variant = "centered", className, children }: PageShellProps) {
  return (
    <div
      data-variant={variant}
      className={cn(
        "@container",
        variant === "centered" && "mx-auto w-full max-w-7xl px-4 py-8",
        variant === "rail" &&
          "grid gap-6 px-4 py-8 mx-auto w-full max-w-7xl @[1100px]:max-w-none @[1100px]:grid-cols-[1fr_320px] @[1500px]:grid-cols-[1fr_380px]",
        variant === "split" &&
          "grid gap-6 px-4 py-8 mx-auto w-full max-w-7xl @[1100px]:max-w-none @[1100px]:grid-cols-2 @[1500px]:grid-cols-[55fr_45fr]",
        variant === "nav-content" &&
          "grid gap-6 px-4 py-8 mx-auto w-full max-w-7xl @[900px]:grid-cols-[200px_1fr] @[1500px]:grid-cols-[240px_1fr]",
        variant === "triple" &&
          "grid gap-6 px-4 py-8 mx-auto w-full max-w-7xl @[1100px]:max-w-none @[1100px]:grid-cols-[240px_1fr] @[1500px]:grid-cols-[260px_1fr_480px]",
        className
      )}
    >
      {children}
    </div>
  );
}

PageShell.Main = Main;
PageShell.LeftAside = LeftAside;
PageShell.RightAside = RightAside;
