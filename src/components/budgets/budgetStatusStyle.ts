import type { ComponentProps } from "react";
import type { ProgressBar } from "@/components/app/ProgressBar";
import type { StatusTone } from "@/components/app/StatusBadge";
import type { BudgetStatus } from "@/lib/budgets/progress";

interface StatusStyle {
  bar: NonNullable<ComponentProps<typeof ProgressBar>["tone"]>;
  /** A fine budget needs no badge. */
  badge: { tone: StatusTone; text: string } | null;
  /** The text color for the status, such as Home's Close and Over counts. */
  color: string | undefined;
}

/** How each budget status shows on Budget and Home. */
export const BUDGET_STATUS_STYLE = {
  fine: { bar: "primary", badge: null, color: undefined },
  close: { bar: "warning", badge: { tone: "warning", text: "Close" }, color: "text-warning" },
  over: {
    bar: "shortfall",
    badge: { tone: "shortfall", text: "Over budget" },
    color: "text-shortfall",
  },
} as const satisfies Record<BudgetStatus, StatusStyle>;
