import { Check, Clock, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type SyncStatus = "synced" | "pending" | "syncing" | "failed";

interface SyncBadgeProps {
  status: SyncStatus;
  /**
   * Optional className for additional styling
   */
  className?: string;
  /**
   * Show label text alongside icon
   * @default false
   */
  showLabel?: boolean;
  /**
   * Size variant
   * @default "sm"
   */
  size?: "xs" | "sm" | "md";
}

const statusConfig = {
  synced: {
    icon: Check,
    label: "Synced",
    tooltip: "Changes saved to cloud",
    className: "text-green-600 dark:text-green-500",
    bgClassName: "bg-green-50 dark:bg-green-950/30",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    tooltip: "Waiting to sync",
    className: "text-amber-600 dark:text-amber-500",
    bgClassName: "bg-amber-50 dark:bg-amber-950/30",
  },
  syncing: {
    icon: Loader2,
    label: "Syncing",
    tooltip: "Syncing to cloud...",
    className: "text-blue-600 dark:text-blue-500 animate-spin",
    bgClassName: "bg-blue-50 dark:bg-blue-950/30",
  },
  failed: {
    icon: AlertCircle,
    label: "Failed",
    tooltip: "Sync failed - will retry",
    className: "text-red-600 dark:text-red-500",
    bgClassName: "bg-red-50 dark:bg-red-950/30",
  },
} as const;

const sizeConfig = {
  xs: {
    icon: "h-3 w-3",
    text: "text-[10px]",
    padding: "px-1.5 py-0.5",
    gap: "gap-1",
  },
  sm: {
    icon: "h-3.5 w-3.5",
    text: "text-xs",
    padding: "px-2 py-0.5",
    gap: "gap-1.5",
  },
  md: {
    icon: "h-4 w-4",
    text: "text-sm",
    padding: "px-2.5 py-1",
    gap: "gap-2",
  },
} as const;

/**
 * SyncBadge Component
 *
 * Displays the sync status of a transaction or other entity with visual indicators.
 * Uses color-coded icons and optional tooltips to communicate sync state.
 *
 * @example
 * // Minimal usage
 * <SyncBadge status="synced" />
 *
 * @example
 * // With label
 * <SyncBadge status="pending" showLabel />
 *
 * @example
 * // Custom size
 * <SyncBadge status="syncing" size="md" showLabel />
 */
export function SyncBadge({ status, className, showLabel = false, size = "sm" }: SyncBadgeProps) {
  const config = statusConfig[status];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const badge = (
    <div
      className={cn(
        "inline-flex items-center rounded-full font-medium transition-colors",
        sizeStyles.gap,
        sizeStyles.padding,
        showLabel && config.bgClassName,
        className
      )}
      role="status"
      aria-label={config.tooltip}
    >
      <Icon className={cn(sizeStyles.icon, config.className)} aria-hidden="true" />
      {showLabel && <span className={cn(sizeStyles.text, config.className)}>{config.label}</span>}
    </div>
  );

  // Only show tooltip if not showing label
  if (showLabel) {
    return badge;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {config.tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
