import { Badge } from "@/components/ui/badge";
import type { DebtStatus } from "@/types/debt";

interface DebtStatusBadgeProps {
  status: DebtStatus;
  className?: string;
}

/**
 * Color-coded status badge for debts
 *
 * Status colors:
 * - active: Blue (default)
 * - paid_off: Green (success)
 * - archived: Gray (muted)
 *
 * Accessibility: ARIA labels included for screen readers
 */
export function DebtStatusBadge({ status, className }: DebtStatusBadgeProps) {
  const variants: Record<
    DebtStatus,
    {
      label: string;
      variant: "default" | "secondary" | "success" | "destructive" | "outline";
    }
  > = {
    active: {
      label: "Active",
      variant: "default",
    },
    paid_off: {
      label: "✓ Paid Off",
      variant: "success",
    },
    archived: {
      label: "Archived",
      variant: "secondary",
    },
  };

  const config = variants[status];

  return (
    <Badge variant={config.variant} className={className} aria-label={`Status: ${config.label}`}>
      {config.label}
    </Badge>
  );
}
