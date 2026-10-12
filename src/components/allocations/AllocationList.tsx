import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllocations } from "@/hooks/useAllocations";
import type { AllocationRow } from "@/lib/allocations/projection";
import { formatPHP } from "@/lib/currency";
import { parseLocalDate } from "@/lib/utils/dates";
import { envelopeLabel } from "./envelopes";

/** Every allocation, newest first, each editable. */
export function AllocationList({
  categoryNames,
  accountNames,
  onEdit,
}: {
  categoryNames: Map<string, string>;
  accountNames: Map<string, string>;
  onEdit: (allocation: AllocationRow) => void;
}) {
  const allocations = useAllocations();
  if (!allocations || allocations.length === 0) return null;

  const label = (allocation: AllocationRow, side: "from" | "to") =>
    envelopeLabel(allocation[side], categoryNames, accountNames);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocations</CardTitle>
        <CardDescription>Money moved between envelopes, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul aria-label="Allocations" className="divide-y rounded-md border">
          {allocations.map((allocation) => (
            <li key={allocation.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {label(allocation, "from")} → {label(allocation, "to")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {format(parseLocalDate(allocation.date), "MMM d, yyyy")} ·{" "}
                  {accountNames.get(allocation.accountId) ?? "An account"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="tabular-nums">{formatPHP(allocation.amountCents)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Edit the ${formatPHP(allocation.amountCents)} allocation to ${label(allocation, "to")}`}
                  onClick={() => onEdit(allocation)}
                >
                  Edit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
