import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** An item's facts as term and value pairs in two columns, as a detail pane shows them. */
export function Facts({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <dl className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-3 text-body", className)}>
      {children}
    </dl>
  );
}

export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
