import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Edit, Trash2, CheckCircle, Circle, X } from "lucide-react";
import {
  useTransactions,
  useToggleTransactionStatus,
  useDeleteTransaction,
} from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";
import { hasActiveTransactionFilters } from "@/lib/utils/filters";
import type { TransactionFilters } from "@/types/transactions";
import { toast } from "sonner";
import { handleTransactionDelete } from "@/lib/debts";
import { useQueryClient } from "@tanstack/react-query";
import { SyncBadge } from "@/components/sync/SyncBadge";
import { cn } from "@/lib/utils";

interface Props {
  filters?: TransactionFilters;
  onEdit: (id: string) => void;
}

export function TransactionList({ filters, onEdit }: Props) {
  const { data: transactions, isLoading } = useTransactions(filters);
  const toggleStatus = useToggleTransactionStatus();
  const deleteTransaction = useDeleteTransaction();
  const queryClient = useQueryClient();

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleSelectAll = (checked: boolean) => {
    if (checked && transactions) {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelection = new Set(selectedIds);
    if (checked) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    setSelectedIds(newSelection);
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = async () => {
    const count = selectedIds.size;
    if (
      window.confirm(
        `Delete ${count} transaction${count > 1 ? "s" : ""}?\n\nThis will also reverse any debt payments linked to these transactions.`
      )
    ) {
      try {
        const promises = Array.from(selectedIds).map(async (id) => {
          // Reverse debt payment FIRST (if linked)
          await handleTransactionDelete({ transaction_id: id });
          // Then delete transaction
          await deleteTransaction.mutateAsync(id);
        });

        await Promise.all(promises);

        queryClient.invalidateQueries({ queryKey: ["debts"] });
        queryClient.invalidateQueries({ queryKey: ["debt-balance"] });
        toast.success(`Deleted ${count} transaction${count > 1 ? "s" : ""}`);
        clearSelection();
      } catch (error) {
        console.error("Failed to bulk delete:", error);
        toast.error(error instanceof Error ? error.message : "Failed to delete transactions");
      }
    }
  };

  const handleBulkStatusUpdate = async (status: "pending" | "cleared") => {
    const count = selectedIds.size;
    try {
      const promises = Array.from(selectedIds).map((id) => toggleStatus.mutateAsync(id));

      await Promise.all(promises);

      toast.success(`Marked ${count} transaction${count > 1 ? "s" : ""} as ${status}`);
      clearSelection();
    } catch (error) {
      console.error("Failed to bulk update status:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  };

  const handleDelete = async (id: string, description: string) => {
    if (
      window.confirm(
        `Delete transaction "${description}"?\n\nThis will also reverse any debt payments linked to this transaction.`
      )
    ) {
      try {
        // Reverse debt payment FIRST (if linked)
        const reversalResult = await handleTransactionDelete({ transaction_id: id });

        // Then delete transaction
        await deleteTransaction.mutateAsync(id);

        // Invalidate debt queries if payment was reversed
        if (reversalResult) {
          queryClient.invalidateQueries({ queryKey: ["debts"] });
          queryClient.invalidateQueries({ queryKey: ["debt-balance"] });
          toast.success("Transaction deleted and debt balance restored");
        } else {
          toast.success("Transaction deleted");
        }
      } catch (error) {
        console.error("Failed to delete:", error);
        toast.error(error instanceof Error ? error.message : "Failed to delete transaction");
      }
    }
  };

  // Enhanced loading state with spinner
  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-8">
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // Enhanced empty state - differentiate between no data vs filtered out
  if (!transactions || transactions.length === 0) {
    const hasFilters = hasActiveTransactionFilters(filters);

    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {hasFilters ? "No transactions match your filters" : "No transactions yet"}
        </p>
        {hasFilters && (
          <p className="mt-2 text-sm text-muted-foreground">
            Try adjusting your filters or clear them to see all transactions
          </p>
        )}
      </div>
    );
  }

  // Set up virtual scrolling
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: transactions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 73, // Estimated row height in pixels
    overscan: 5, // Render 5 extra items above/below visible area
  });

  const hasSelection = selectedIds.size > 0;
  const allSelected = transactions && selectedIds.size === transactions.length;

  return (
    <div className="space-y-4">
      {/* Bulk Actions Toolbar */}
      {hasSelection && (
        <div className="rounded-lg border bg-muted/50 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                {selectedIds.size} transaction{selectedIds.size > 1 ? "s" : ""} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleBulkStatusUpdate("cleared")}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark Cleared
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkStatusUpdate("pending")}>
                <Circle className="mr-2 h-4 w-4" />
                Mark Pending
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card">
        {/* Fixed table header */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead className="w-[100px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
        </Table>

        {/* Virtualized scrollable body */}
        <div
          ref={parentRef}
          className="overflow-auto"
          style={{
            height: `${Math.min(600, rowVirtualizer.getTotalSize())}px`, // Max 600px height
          }}
        >
          <Table>
            <TableBody
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const transaction = transactions[virtualRow.index];

                return (
                  <TableRow
                    key={transaction.id}
                    data-index={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <TableCell className="w-[50px]">
                      <Checkbox
                        checked={selectedIds.has(transaction.id)}
                        onCheckedChange={(checked: boolean) =>
                          handleSelectOne(transaction.id, checked)
                        }
                        aria-label={`Select ${transaction.description}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm w-[100px]">
                      {format(parseISO(transaction.date), "MMM dd")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{transaction.description}</div>
                          {transaction.notes && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">
                              {transaction.notes}
                            </div>
                          )}
                        </div>
                        <SyncBadge status="synced" size="xs" />
                      </div>
                    </TableCell>
                    <TableCell>
                      {transaction.category ? (
                        <Badge variant="outline">{transaction.category.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {transaction.account ? (
                        <span className="text-sm">{transaction.account.name}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono",
                        transaction.type === "income"
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {transaction.type === "income" ? "+" : "-"}
                      {formatPHP(transaction.amount_cents)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus.mutate(transaction.id)}
                        className="h-8 w-8 p-0"
                      >
                        {transaction.status === "cleared" ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onEdit(transaction.id)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(transaction.id, transaction.description)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
