import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPHP } from "@/lib/currency";
import { useTransaction } from "@/lib/supabaseQueries";

interface FilterSummary {
  count: number;
  totalIn: number;
  totalOut: number;
}

interface TransactionDetailPaneProps {
  transactionId: string | null;
  filterSummary: FilterSummary;
  onEdit: (id: string) => void;
  onClear: () => void;
}

export function TransactionDetailPane({
  transactionId,
  filterSummary,
  onEdit,
  onClear,
}: TransactionDetailPaneProps) {
  if (!transactionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Filter summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <div className="text-sm text-muted-foreground">Transactions</div>
            <div className="text-xl font-mono tabular-nums">{filterSummary.count}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">In</div>
              <div className="font-mono tabular-nums text-green-600 dark:text-green-400">
                {formatPHP(filterSummary.totalIn)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Out</div>
              <div className="font-mono tabular-nums text-red-600 dark:text-red-400">
                {formatPHP(filterSummary.totalOut)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return <TransactionDetailContent id={transactionId} onEdit={onEdit} onClear={onClear} />;
}

function TransactionDetailContent({
  id,
  onEdit,
  onClear,
}: {
  id: string;
  onEdit: (id: string) => void;
  onClear: () => void;
}) {
  const { data, isLoading } = useTransaction(id);
  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">Loading…</CardContent>
      </Card>
    );
  }
  if (!data) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="min-w-0 truncate">{data.description || "Transaction"}</CardTitle>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Close
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-2xl font-mono tabular-nums">{formatPHP(data.amount_cents)}</div>
        <div className="text-sm text-muted-foreground">{data.date}</div>
        <Button variant="outline" className="w-full" onClick={() => onEdit(id)}>
          Edit
        </Button>
      </CardContent>
    </Card>
  );
}
