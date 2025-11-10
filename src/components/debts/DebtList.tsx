import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DebtCard } from "./DebtCard";
import type { Debt, InternalDebt, DebtStatus } from "@/types/debt";

interface DebtWithBalance {
  debt: Debt | InternalDebt;
  balance: number;
}

interface DebtListProps {
  /** Debts with calculated balances */
  debts: DebtWithBalance[];
  /** Click handler for view details */
  onViewDetails?: (debtId: string) => void;
  /** Click handler for make payment */
  onMakePayment?: (debtId: string) => void;
  /** Click handler for create debt */
  onCreateDebt?: () => void;
  /** Enable status filtering */
  showFilters?: boolean;
}

/**
 * Filterable list of debt cards
 *
 * Features:
 * - Status filter tabs
 * - Empty state with CTA
 * - Responsive grid layout
 *
 * @example
 * <DebtList
 *   debts={debtsWithBalances}
 *   onViewDetails={handleView}
 *   onMakePayment={handlePayment}
 *   onCreateDebt={handleCreate}
 *   showFilters
 * />
 */
export function DebtList({
  debts,
  onViewDetails,
  onMakePayment,
  onCreateDebt,
  showFilters = true,
}: DebtListProps) {
  const [statusFilter, setStatusFilter] = useState<DebtStatus | "all">("all");

  // Filter debts by status
  const filteredDebts = debts.filter((item) => {
    if (statusFilter === "all") return true;
    return item.debt.status === statusFilter;
  });

  // Empty state for no debts at all
  if (debts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-4 text-muted-foreground">
          {/* Simple wallet icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mx-auto"
          >
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2">No debts yet</h3>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Create your first debt to start tracking payments and progress toward being debt-free.
        </p>
        {onCreateDebt && <Button onClick={onCreateDebt}>Create Your First Debt</Button>}
      </div>
    );
  }

  // Count debts by status for filter buttons
  const statusCounts = {
    all: debts.length,
    active: debts.filter((d) => d.debt.status === "active").length,
    paid_off: debts.filter((d) => d.debt.status === "paid_off").length,
    archived: debts.filter((d) => d.debt.status === "archived").length,
  };

  return (
    <div className="space-y-4">
      {/* Status filters */}
      {showFilters && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <Button
            variant={statusFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("all")}
          >
            All ({statusCounts.all})
          </Button>
          <Button
            variant={statusFilter === "active" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("active")}
          >
            Active ({statusCounts.active})
          </Button>
          <Button
            variant={statusFilter === "paid_off" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("paid_off")}
          >
            Paid Off ({statusCounts.paid_off})
          </Button>
          <Button
            variant={statusFilter === "archived" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("archived")}
          >
            Archived ({statusCounts.archived})
          </Button>
        </div>
      )}

      {/* Debt grid or empty state for filtered results */}
      {filteredDebts.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">
          No {statusFilter !== "all" ? statusFilter.replace("_", " ") : ""} debts found
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredDebts.map((item) => (
            <DebtCard
              key={item.debt.id}
              debt={item.debt}
              balance={item.balance}
              onViewDetails={onViewDetails}
              onMakePayment={onMakePayment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
