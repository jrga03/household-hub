import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DebtStatusBadge } from "./DebtStatusBadge";
import { DebtBalanceDisplay } from "./DebtBalanceDisplay";
import { DebtProgressBar } from "./DebtProgressBar";
import { getSyncStatusForDebt } from "@/lib/debts/sync";
import { Loader2, AlertCircle, Check, Clock } from "lucide-react";
import type { Debt, InternalDebt } from "@/types/debt";

interface DebtCardProps {
  /** Debt data */
  debt: Debt | InternalDebt;
  /** Current balance in cents */
  balance: number;
  /** Click handler for view details */
  onViewDetails?: (debtId: string) => void;
  /** Click handler for make payment */
  onMakePayment?: (debtId: string) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Card component for displaying debt information
 *
 * Shows:
 * - Debt name + status badge
 * - Current balance (color-coded)
 * - Progress bar
 * - Action buttons
 *
 * @example
 * <DebtCard
 *   debt={debt}
 *   balance={50000}
 *   onViewDetails={(id) => navigate(`/debts/${id}`)}
 *   onMakePayment={(id) => openPaymentDialog(id)}
 * />
 */
export function DebtCard({
  debt,
  balance,
  onViewDetails,
  onMakePayment,
  className,
}: DebtCardProps) {
  const isPaidOff = debt.status === "paid_off";
  const isArchived = debt.status === "archived";
  const amountPaid = debt.original_amount_cents - balance;

  // Check if this is an internal debt
  const isInternal = "from_type" in debt;

  // Determine entity type for sync status query
  const entityType: "debt" | "internal_debt" = isInternal ? "internal_debt" : "debt";

  // Query sync status
  const { data: syncStatus } = useQuery({
    queryKey: ["debt-sync-status", debt.id, entityType],
    queryFn: () => getSyncStatusForDebt(debt.id, entityType),
    refetchInterval: 5000, // Refresh every 5 seconds
    staleTime: 4000, // Consider stale after 4 seconds
  });

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2 flex-1">
          <div className="flex-1">
            <h3 className="font-bold text-lg leading-tight">{debt.name}</h3>
            {isInternal && <p className="text-sm text-muted-foreground">Internal debt</p>}
          </div>

          {/* Sync status indicator */}
          {syncStatus === "syncing" && (
            <Loader2
              className="h-4 w-4 animate-spin text-blue-500"
              aria-label="Syncing to server"
            />
          )}
          {syncStatus === "queued" && (
            <Clock className="h-4 w-4 text-amber-500" aria-label="Queued for sync" />
          )}
          {syncStatus === "failed" && (
            <AlertCircle className="h-4 w-4 text-red-500" aria-label="Sync failed" />
          )}
          {syncStatus === "synced" && (
            <Check className="h-4 w-4 text-green-500" aria-label="Synced successfully" />
          )}
        </div>

        <DebtStatusBadge status={debt.status} className="ml-2" />
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Balance display */}
        <DebtBalanceDisplay
          balance={balance}
          originalAmount={debt.original_amount_cents}
          showPercentage
        />

        {/* Progress bar */}
        <DebtProgressBar paid={amountPaid} total={debt.original_amount_cents} />
      </CardContent>

      <CardFooter className="flex gap-2">
        <Button variant="outline" onClick={() => onViewDetails?.(debt.id)} className="flex-1">
          View Details
        </Button>

        {!isArchived && (
          <Button
            variant={isPaidOff ? "outline" : "default"}
            onClick={() => onMakePayment?.(debt.id)}
            className="flex-1"
          >
            {isPaidOff ? "Make Another Payment" : "Make Payment"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
