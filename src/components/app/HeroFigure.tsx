import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface HeroFigureProps {
  label: string;
  /** Usually a `Money`. */
  value: ReactNode;
  caption?: ReactNode;
  className?: string;
}

/** The one large figure on a screen: an account balance, a month total. */
export function HeroFigure({ label, value, caption, className }: HeroFigureProps) {
  const labelId = useId();

  return (
    <section aria-labelledby={labelId} className={cn("space-y-1", className)}>
      <p id={labelId} className="text-label text-muted-foreground">
        {label}
      </p>
      <p className="text-figure tabular-nums">{value}</p>
      {caption && <p className="text-body text-muted-foreground tabular-nums">{caption}</p>}
    </section>
  );
}
