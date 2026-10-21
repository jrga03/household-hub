import { useId, type ReactNode } from "react";
import { Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type NoticeTone = "neutral" | "warning";

const toneStyles: Record<NoticeTone, { Icon: LucideIcon; box: string; icon: string }> = {
  neutral: { Icon: Info, box: "bg-card", icon: "text-muted-foreground" },
  warning: {
    Icon: TriangleAlert,
    box: "border-warning/50 bg-warning-surface",
    icon: "text-warning",
  },
};

interface NoticeProps {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** A boxed note. Use `warning` when something needs attention but nothing is broken. */
export function Notice({ tone = "neutral", title, children, className }: NoticeProps) {
  const titleId = useId();
  const { Icon, box, icon } = toneStyles[tone];

  return (
    <div
      role="note"
      aria-labelledby={title ? titleId : undefined}
      className={cn("flex gap-3 rounded-lg border px-4 py-3 text-body", box, className)}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", icon)} />
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
