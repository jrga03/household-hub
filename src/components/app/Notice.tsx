import { useId, type ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface NoticeProps {
  tone?: "neutral" | "warning";
  title?: string;
  children: ReactNode;
  className?: string;
}

/** A boxed note. Use `warning` when something needs attention but nothing is broken. */
export function Notice({ tone = "neutral", title, children, className }: NoticeProps) {
  const titleId = useId();
  const Icon = tone === "warning" ? TriangleAlert : Info;

  return (
    <div
      role="note"
      aria-labelledby={title ? titleId : undefined}
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3 text-body",
        tone === "warning" ? "border-warning/50 bg-warning-surface" : "bg-card",
        className
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "warning" ? "text-warning" : "text-muted-foreground"
        )}
      />
      <div className="min-w-0 space-y-1">
        {title && (
          <p id={titleId} className="font-medium">
            {title}
          </p>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}
