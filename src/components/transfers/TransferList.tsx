import { Card, CardContent } from "@/components/ui/card";
import { formatPHP } from "@/lib/currency";
import { ArrowRight } from "lucide-react";
import { useTransfers } from "@/hooks/useTransfers";

export function TransferList({ householdId }: { householdId: string }) {
  const { data: transfers, isLoading } = useTransfers(householdId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading transfers...
      </div>
    );
  }

  if (!transfers || transfers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-muted-foreground">No transfers found</p>
        <p className="text-sm text-muted-foreground mt-1">
          Create your first transfer to move money between accounts
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {transfers.map((transfer) => (
        <Card key={transfer.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <span className="font-medium">{transfer.from_account_name}</span>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{transfer.to_account_name}</span>
            </div>
            <div className="text-right">
              <div className="font-bold">{formatPHP(transfer.amount_cents)}</div>
              <div className="text-sm text-muted-foreground">
                {new Date(transfer.date).toLocaleDateString()}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
