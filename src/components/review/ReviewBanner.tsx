import { Link } from "@tanstack/react-router";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useReviewCount } from "@/hooks/useReviewCount";

/** Home's one-line pointer to Review, while anything waits there. */
export function ReviewBanner() {
  const count = useReviewCount();
  if (count === 0) return null;

  return (
    <Link
      to="/review"
      className="flex min-h-11 items-center gap-3 rounded-xl border bg-card px-4 py-2.5 text-body font-medium shadow-sm transition-colors hover:bg-accent active:bg-accent"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0 text-warning" />
      <span className="flex-1">
        {count} {count === 1 ? "item" : "items"} to review
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
