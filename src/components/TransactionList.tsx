import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, Trash2, CheckCircle, Circle, X, Plus } from "lucide-react";
import {
  useTransactions,
  useToggleTransactionStatus,
  useSetTransactionStatus,
  useDeleteTransaction,
} from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";
import { hasActiveTransactionFilters } from "@/lib/utils/filters";
import type { TransactionFilters } from "@/types/transactions";
import { toast } from "sonner";
import { confirm } from "@/lib/confirm";
import { handleTransactionDelete } from "@/lib/debts";
import { confirmAndDeleteTransaction } from "@/lib/delete-transaction";
import { useQueryClient } from "@tanstack/react-query";
import { SyncBadge } from "@/components/sync/SyncBadge";
import { buildEntitySyncStatusMap } from "@/components/sync/queueBadgeStatus";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/dexie/db";
import { useNavStore } from "@/stores/navStore";
import { useContainerNarrow } from "@/hooks/useContainerWidth";
import { cn } from "@/lib/utils";

/**
 * Start fetching the next page when the last rendered virtual row is within
 * this many rows of the end of the loaded list (TanStack Virtual +
 * useInfiniteQuery pattern, review R10).
 */
const NEXT_PAGE_FETCH_THRESHOLD = 10;

interface Props {
  filters?: TransactionFilters;
  /**
   * Row/card tap: the host decides what "open" means (detail pane selection,
   * read-only detail sheet, or edit form).
   */
  onEdit: (id: string) => void;
  /**
   * Explicit Edit pencil: always an edit intent. Hosts whose onEdit is an
   * inspect action (e.g. the transactions route's read-only sheet on narrow
   * containers) pass this so the pencil still opens the edit form directly.
   * Falls back to onEdit when absent.
   */
  onRequestEdit?: (id: string) => void;
  /**
   * Exact server-side count of rows matching the filters (from
   * transactions_filter_summary). The list only loads pages on demand, so
   * selection covers loaded rows; this keeps the "N of M selected" label
   * honest about the full filtered set (review R10). Falls back to the
   * loaded-row count when the host has no server answer.
   */
  totalCount?: number;
}

export function TransactionList({ filters, onEdit, onRequestEdit, totalCount }: Props) {
  const requestEdit = onRequestEdit ?? onEdit;
  const {
    data: transactions,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTransactions(filters);
  const toggleStatus = useToggleTransactionStatus();
  const setStatus = useSetTransactionStatus();
  const deleteTransaction = useDeleteTransaction();
  const queryClient = useQueryClient();
  const setQuickAddOpen = useNavStore((state) => state.setQuickAddOpen);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Transactions with outstanding outbox items (reactive, local IndexedDB).
  // Rows absent from the map have no pending local changes; failed items
  // surface as "failed" instead of an indefinite "pending" (review R3).
  const rowSyncStatuses = useLiveQuery(async () => {
    const items = await db.syncQueue.where("status").anyOf("queued", "syncing", "failed").toArray();
    return buildEntitySyncStatusMap(items, "transaction");
  }, []);

  // Presentation mode is decided by the list's OWN container width, not the
  // viewport: this component embeds in hosts of very different widths (the
  // transactions main column, the account detail page), so a viewport query
  // would lie whenever the host is narrower than the window (review R6).
  // Below 640px the 8-column table pushes the amount off-screen, so we render
  // a card list instead.
  const [containerRef, isNarrowContainer] = useContainerNarrow(640);
  const presentation = isNarrowContainer ? "cards" : "table";

  // Set up virtual scrolling (must be before early returns)
  const parentRef = useRef<HTMLDivElement>(null);

  // ONE virtualizer instance shared by both presentations. Do NOT swap to
  // CSS-only hiding of one of them: measureElement on display:none rows
  // returns 0 heights and corrupts the offset math (review R6).
  // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizer returns a mutable instance; no compatible alternative exists
  const rowVirtualizer = useVirtualizer({
    count: transactions?.length ?? 0,
    getScrollElement: () => parentRef.current,
    // Initial estimates; real heights measured below
    estimateSize: () => (presentation === "cards" ? 84 : 73),
    overscan: 5, // Render 5 extra items above/below visible area
    // Measure actual row heights so rows with a notes line (two-line cells)
    // don't overlap or leave gaps against the fixed estimate (UI-08)
    measureElement:
      typeof window !== "undefined" && navigator.userAgent.indexOf("Firefox") === -1
        ? (el) => el?.getBoundingClientRect().height
        : undefined,
  });

  // Row heights differ between table rows and cards, so cached measurements
  // from the previous mode would corrupt positioning after a switch.
  // measure() drops the measurements cache; the scroll container below is
  // also keyed by mode so the virtualizer re-observes a fresh element.
  useEffect(() => {
    rowVirtualizer.measure();
  }, [presentation, rowVirtualizer]);

  // Infinite scroll: when the last rendered virtual row approaches the end
  // of the loaded rows, pull the next page (review R10). The virtualizer
  // re-renders on scroll, so lastVirtualIndex advances as the user scrolls.
  const rowCount = transactions?.length ?? 0;
  const virtualItems = rowVirtualizer.getVirtualItems();
  const lastVirtualIndex =
    virtualItems.length > 0 ? virtualItems[virtualItems.length - 1].index : -1;
  useEffect(() => {
    if (lastVirtualIndex < 0 || !hasNextPage || isFetchingNextPage) return;
    if (lastVirtualIndex >= rowCount - NEXT_PAGE_FETCH_THRESHOLD) {
      fetchNextPage();
    }
  }, [lastVirtualIndex, rowCount, hasNextPage, isFetchingNextPage, fetchNextPage]);

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
    const includesTransferLeg = transactions?.some(
      (t) => selectedIds.has(t.id) && t.transfer_group_id
    );
    const transferNote = includesTransferLeg
      ? " Some selections are transfers: deleting one side removes BOTH sides to keep balances consistent."
      : "";
    const confirmed = await confirm({
      title: `Delete ${count} transaction${count > 1 ? "s" : ""}?`,
      description: `This will also reverse any debt payments linked to these transactions.${transferNote}`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) {
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
      await setStatus.mutateAsync({ ids: Array.from(selectedIds), status });

      toast.success(`Marked ${count} transaction${count > 1 ? "s" : ""} as ${status}`);
      clearSelection();
    } catch (error) {
      console.error("Failed to bulk update status:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update status");
    }
  };

  const handleDelete = (id: string, description: string, isTransferLeg: boolean) =>
    // Shared with the detail sheet's Delete button (review R38)
    confirmAndDeleteTransaction({
      id,
      description,
      isTransferLeg,
      deleteTransaction: deleteTransaction.mutateAsync,
      queryClient,
    });

  // Loading state: skeleton rows shaped like the active presentation (cards
  // on narrow containers, table rows on wide) so the layout doesn't jump when
  // real rows arrive (review R41). containerRef stays attached so the
  // container measurement keeps driving the presentation during loading.
  if (isLoading) {
    return (
      <div ref={containerRef} aria-busy="true">
        <span role="status" className="sr-only">
          Loading transactions
        </span>
        {presentation === "cards" ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                <Skeleton className="size-4 rounded-[4px]" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-2/5" />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
                <Skeleton className="size-4 rounded-[4px]" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 max-w-xs flex-1" />
                <Skeleton className="ml-auto h-4 w-24" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Enhanced empty state - differentiate between no data vs filtered out
  if (!transactions || transactions.length === 0) {
    const hasFilters = hasActiveTransactionFilters(filters);

    return (
      <div ref={containerRef} className="rounded-lg border bg-card p-12 text-center">
        <p className="text-lg font-medium text-muted-foreground">
          {hasFilters ? "No transactions match your filters" : "No transactions yet"}
        </p>
        {hasFilters ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Try adjusting your filters or clear them to see all transactions
          </p>
        ) : (
          <Button onClick={() => setQuickAddOpen(true)} className="mt-4">
            <Plus className="mr-2 h-4 w-4" />
            Add your first transaction
          </Button>
        )}
      </div>
    );
  }

  const hasSelection = selectedIds.size > 0;
  const allSelected = transactions && selectedIds.size === transactions.length;

  // Keyboard access for tappable rows/cards. Guarded to the row element
  // itself so Enter on an inner control doesn't double-fire through bubbling.
  const handleRowKeyDown = (id: string) => (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit(id);
    }
  };

  return (
    <div ref={containerRef} className="space-y-4">
      {/* Bulk Actions Toolbar */}
      {hasSelection && (
        <div className="rounded-lg border bg-muted/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Honest count: selection covers LOADED rows only, so show the
                selection against the full filtered count from the server
                summary when the host provides it (review R10) */}
            <span className="text-sm font-medium">
              {selectedIds.size} of {totalCount ?? transactions.length} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => handleBulkStatusUpdate("cleared")}>
                <CheckCircle className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Mark </span>Cleared
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkStatusUpdate("pending")}>
                <Circle className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Mark </span>Pending
              </Button>
              <Button variant="outline" size="sm" onClick={handleBulkDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                aria-label="Clear selection"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={cn(presentation === "table" && "rounded-lg border bg-card overflow-x-auto")}>
        {presentation === "table" ? (
          /* Fixed table header */
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
                <TableHead className="hidden md:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Account</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
          </Table>
        ) : (
          /* Card-mode select-all keeps bulk actions reachable (review R6) */
          <div className="flex items-center gap-3 px-3 pb-2">
            <Checkbox
              checked={allSelected}
              onCheckedChange={handleSelectAll}
              aria-label="Select all"
            />
            <span className="text-sm text-muted-foreground">Select all</span>
          </div>
        )}

        {/* Virtualized scrollable body. Fills the available viewport height
            instead of a hardcoded 600px cap, so the tall triple-column layout
            isn't wasted (UI-08); shrinks to content when the list is short.
            Keyed by presentation so a mode switch remounts the scroll element
            (fresh observation + scroll reset) alongside the measure() reset. */}
        <div
          key={presentation}
          ref={parentRef}
          className="overflow-auto"
          style={{
            height: `min(${rowVirtualizer.getTotalSize()}px, calc(100dvh - 16rem))`,
          }}
        >
          {presentation === "table" ? (
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
                      data-testid="transaction-row"
                      ref={rowVirtualizer.measureElement}
                      // Whole row tappable: opens the detail pane / detail
                      // sheet / edit form depending on the host (review R14)
                      onClick={() => onEdit(transaction.id)}
                      onKeyDown={handleRowKeyDown(transaction.id)}
                      tabIndex={0}
                      className="cursor-pointer"
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        // No fixed height: measureElement reads each row's real
                        // height so notes rows get the space they need (UI-08)
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <TableCell className="w-[50px]">
                        <Checkbox
                          checked={selectedIds.has(transaction.id)}
                          onCheckedChange={(checked: boolean) =>
                            handleSelectOne(transaction.id, checked)
                          }
                          onClick={(e) => e.stopPropagation()}
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
                          <SyncBadge
                            status={rowSyncStatuses?.get(transaction.id) ?? "synced"}
                            size="xs"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {transaction.category ? (
                          <Badge variant="outline">{transaction.category.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {transaction.account ? (
                          <span className="text-sm">{transaction.account.name}</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono",
                          transaction.type === "income" ? "text-income" : "text-expense"
                        )}
                      >
                        {transaction.type === "income" ? "+" : "-"}
                        {formatPHP(transaction.amount_cents)}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStatus.mutate(transaction.id);
                          }}
                          className="h-8 w-8 p-0"
                          aria-label={`Mark ${transaction.description} as ${
                            transaction.status === "cleared" ? "pending" : "cleared"
                          }`}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              requestEdit(transaction.id);
                            }}
                            aria-label={`Edit ${transaction.description}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(
                                transaction.id,
                                transaction.description,
                                !!transaction.transfer_group_id
                              );
                            }}
                            aria-label={`Delete ${transaction.description}`}
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
          ) : (
            /* Card list for narrow containers: description + meta on the
               left, signed colored amount right, checkbox selection, sync
               badge; the whole card is tappable (review R6). Follows the
               RecentTransactions row pattern. */
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                position: "relative",
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const transaction = transactions[virtualRow.index];

                return (
                  <div
                    key={transaction.id}
                    data-index={virtualRow.index}
                    data-testid="transaction-row"
                    ref={rowVirtualizer.measureElement}
                    // Padding (not margin) so measureElement includes the gap
                    className="pb-2"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onEdit(transaction.id)}
                      onKeyDown={handleRowKeyDown(transaction.id)}
                      aria-label={`View ${transaction.description}`}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 active:bg-accent"
                    >
                      <Checkbox
                        checked={selectedIds.has(transaction.id)}
                        onCheckedChange={(checked: boolean) =>
                          handleSelectOne(transaction.id, checked)
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${transaction.description}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium">{transaction.description}</p>
                          <SyncBadge
                            status={rowSyncStatuses?.get(transaction.id) ?? "synced"}
                            size="xs"
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{format(parseISO(transaction.date), "MMM d")}</span>
                          {transaction.category && (
                            <>
                              <span>•</span>
                              <span className="truncate">{transaction.category.name}</span>
                            </>
                          )}
                          {transaction.account && (
                            <>
                              <span>•</span>
                              <span className="truncate">{transaction.account.name}</span>
                            </>
                          )}
                        </div>
                        {transaction.notes && (
                          <div className="truncate text-xs text-muted-foreground">
                            {transaction.notes}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "font-mono font-semibold",
                            transaction.type === "income" ? "text-income" : "text-expense"
                          )}
                        >
                          {transaction.type === "income" ? "+" : "-"}
                          {formatPHP(transaction.amount_cents)}
                        </p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {transaction.status}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Next-page indicator: small, below the scroll area so it is never
            clipped by the virtualizer's computed height (review R10) */}
        {isFetchingNextPage && (
          <div
            role="status"
            className="flex items-center justify-center p-3 text-sm text-muted-foreground"
          >
            Loading more transactions…
          </div>
        )}
      </div>
    </div>
  );
}
