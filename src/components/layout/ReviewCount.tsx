import { SidebarTrigger } from "@/components/ui/sidebar";
import { useReviewCount } from "@/hooks/useReviewCount";
import { cn } from "@/lib/utils";

/** The Review entry's visible count; the entry names it with `reviewLabel`. */
export function ReviewCountBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      aria-hidden
      data-testid="review-count"
      className={cn(
        "min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-medium leading-5 text-primary-foreground",
        className
      )}
    >
      {count}
    </span>
  );
}

/** A nav entry's accessible name, with the review count when it carries one. */
export const reviewLabel = (label: string, count: number) =>
  count > 0 ? `${label}, ${count} to review` : undefined;

/** A dot on a menu button while anything waits for review; the button names the count. */
export function ReviewDot({ className }: { className?: string }) {
  const count = useReviewCount();
  if (count === 0) return null;
  return (
    <span
      data-testid="review-dot"
      className={cn(
        "pointer-events-none absolute right-1.5 top-1.5 size-2 rounded-full bg-primary ring-2 ring-background",
        className
      )}
    />
  );
}

/** The tablet header's sidebar toggle, with the review dot. */
export function SidebarTriggerWithReview({ className }: { className?: string }) {
  const count = useReviewCount();
  return (
    <span className={cn("relative inline-flex", className)}>
      <SidebarTrigger
        aria-label={count > 0 ? `Toggle Sidebar, ${count} to review` : "Toggle Sidebar"}
      />
      <ReviewDot className="right-0.5 top-0.5" />
    </span>
  );
}
