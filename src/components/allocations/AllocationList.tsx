import { format } from "date-fns";
import { ListRow } from "@/components/app/ListRow";
import { Money } from "@/components/app/Money";
import { SectionHeader } from "@/components/app/SectionHeader";
import { useAllocations } from "@/hooks/useAllocations";
import { envelopeLabel } from "@/lib/allocations/envelope";
import type { AllocationRow } from "@/lib/allocations/projection";
import { parseLocalDate } from "@/lib/utils/dates";

/** Every allocation, newest first; a row opens it for editing. */
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
    <section className="space-y-2">
      <div className="space-y-1">
        <SectionHeader title="Allocations" />
        <p className="text-body text-muted-foreground">
          Money moved between categories, newest first.
        </p>
      </div>
      <ul aria-label="Allocations" className="divide-y border-y">
        {allocations.map((allocation) => (
          <li key={allocation.id}>
            <ListRow
              onClick={() => onEdit(allocation)}
              label={`${label(allocation, "from")} → ${label(allocation, "to")}`}
              amount={<Money kind="balance" cents={allocation.amountCents} />}
              detail={`${format(parseLocalDate(allocation.date), "MMM d, yyyy")} · ${
                accountNames.get(allocation.accountId) ?? "An account"
              }`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
