import { StatusBadge } from "@/components/app/StatusBadge";
import type { GroupRow } from "@/lib/categories/projection";

/** A group or category's name, badged when Personal, and when retired if `showRetired`. */
export function RecordName({ record, showRetired }: { record: GroupRow; showRetired?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-medium">{record.name}</span>
      {record.visibility === "personal" && <StatusBadge tone="neutral">Personal</StatusBadge>}
      {showRetired && record.retired && (
        <StatusBadge tone="outline" className="font-normal text-muted-foreground">
          Retired
        </StatusBadge>
      )}
    </span>
  );
}
