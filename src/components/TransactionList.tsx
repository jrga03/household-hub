import { format, parseISO } from "date-fns";
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
import { Edit, Trash2, CheckCircle, Circle } from "lucide-react";
import {
  useTransactions,
  useToggleTransactionStatus,
  useDeleteTransaction,
} from "@/lib/supabaseQueries";
import { formatPHP } from "@/lib/currency";
import { hasActiveTransactionFilters } from "@/lib/utils/filters";
import type { TransactionFilters } from "@/types/transactions";
import { toast } from "sonner";

interface Props {
  filters?: TransactionFilters;
  onEdit: (id: string) => void;
}

export function TransactionList({ filters, onEdit }: Props) {
  const { data: transactions, isLoading } = useTransactions(filters);
  const toggleStatus = useToggleTransactionStatus();
  const deleteTransaction = useDeleteTransaction();

  const handleDelete = async (id: string, description: string) => {
    if (window.confirm(`Delete transaction "${description}"?`)) {
      try {
        await deleteTransaction.mutateAsync(id);
        toast.success("Transaction deleted");
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

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Account</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => (
          <TableRow key={transaction.id}>
            <TableCell className="font-mono text-sm">
              {format(parseISO(transaction.date), "MMM dd")}
            </TableCell>
            <TableCell>
              <div className="font-medium">{transaction.description}</div>
              {transaction.notes && (
                <div className="text-xs text-muted-foreground truncate max-w-xs">
                  {transaction.notes}
                </div>
              )}
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
              className={`text-right font-mono ${
                transaction.type === "income"
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
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
        ))}
      </TableBody>
    </Table>
  );
}
