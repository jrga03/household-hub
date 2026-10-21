import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "outline" | "warning" | "shortfall" | "success";

const toneStyles: Record<
  StatusTone,
  { variant: "secondary" | "outline" | "warning" | "success"; className?: string }
> = {
  neutral: { variant: "secondary" },
  outline: { variant: "outline" },
  warning: { variant: "warning" },
  shortfall: { variant: "outline", className: "border-shortfall/50 text-shortfall" },
  success: { variant: "success" },
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: string;
  /** Decorative; the text carries the meaning. */
  icon?: LucideIcon;
  className?: string;
}

/** A status in one of a few tones. Never `destructive`: a status is not an error. */
export function StatusBadge({ tone, children, icon: Icon, className }: StatusBadgeProps) {
  const { variant, className: toneClassName } = toneStyles[tone];

  return (
    <Badge variant={variant} className={cn(toneClassName, className)}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </Badge>
  );
}
