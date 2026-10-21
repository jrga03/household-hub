import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/utils";
import { TWO_PANES_FROM, TwoPanesContext } from "./pane";

type Variant = "single" | "supporting-pane" | "list-detail";

interface PageShellProps {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}

interface SlotProps {
  className?: string;
  children: ReactNode;
}

interface DetailProps extends SlotProps {
  ref?: Ref<HTMLElement>;
}

function Main({ className, children }: SlotProps) {
  return (
    <div data-slot="main" className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}

function Side({ className, children }: SlotProps) {
  return (
    <aside data-slot="side" className={cn("min-w-0", className)}>
      {children}
    </aside>
  );
}

function List({ className, children }: SlotProps) {
  return (
    <div data-slot="list" className={cn("min-w-0", className)}>
      {children}
    </div>
  );
}

function Detail({ className, children, ref }: DetailProps) {
  return (
    <aside ref={ref} data-slot="detail" className={cn("hidden min-w-0 @[840px]:block", className)}>
      {children}
    </aside>
  );
}

const variantClasses: Record<Variant, string> = {
  single: "max-w-3xl",
  "supporting-pane": "grid max-w-7xl gap-6 @[840px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
  "list-detail": cn(
    "grid max-w-7xl gap-6",
    "@[840px]:has-[>[data-slot=detail]]:grid-cols-[minmax(0,1fr)_360px]",
    "@[1200px]:has-[>[data-slot=detail]]:grid-cols-[minmax(0,1fr)_412px]"
  ),
};

/**
 * PageShell: the layout every route renders. Pick a variant by the page's job.
 *
 *   - single (default): one centered column, max-w-3xl. Slot: Main.
 *   - supporting-pane: Main and Side at about 2:1 from 840px, stacked below.
 *   - list-detail: a flexible List and a fixed Detail pane (360px from 840px,
 *     412px from 1200px). Detail shows only from 840px; with no Detail rendered
 *     the List takes the full width.
 *
 * The wide variants cap at max-w-7xl, centered. Breakpoints are container
 * queries (600, 840, 1200) on the shell, so the sidebar's width is already
 * taken out; slots and their children use the same thresholds. In list-detail,
 * `DetailPane` puts the open item in the Detail slot or a bottom sheet.
 */
export function PageShell({ variant = "single", className, children }: PageShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const twoPanes = useWidthFrom(variant === "list-detail" ? shellRef : null, TWO_PANES_FROM);
  // An element cannot query its own container, so the grid lives on an inner div.
  return (
    <div ref={shellRef} data-variant={variant} className="@container w-full">
      <div className={cn("mx-auto w-full px-4 py-8", variantClasses[variant], className)}>
        <TwoPanesContext value={twoPanes}>{children}</TwoPanesContext>
      </div>
    </div>
  );
}

/** Whether the element is at least `minWidth` wide, as its container queries see it. */
function useWidthFrom(ref: { current: HTMLElement | null } | null, minWidth: number) {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const element = ref?.current;
    if (!element) return;
    // Measured before paint, so a reload with an open item lands in the right place.
    setWide(element.getBoundingClientRect().width >= minWidth);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWide(entry.contentRect.width >= minWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, minWidth]);
  return wide;
}

PageShell.Main = Main;
PageShell.Side = Side;
PageShell.List = List;
PageShell.Detail = Detail;
