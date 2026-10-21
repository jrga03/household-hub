import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** One plain sentence saying what is missing. */
  children: ReactNode;
  /** The next step, usually a button or link. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ children, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-start gap-3 py-6", className)}>
      <p className="text-body text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}
