import { cn } from "@/lib/utils";
import { formatPHP } from "@/lib/currency";

interface AccountListItemProps {
  name: string;
  type: string;
  balanceCents: number;
  selected: boolean;
  onSelect: () => void;
}

export function AccountListItem({
  name,
  type,
  balanceCents,
  selected,
  onSelect,
}: AccountListItemProps) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border px-4 py-3 text-left transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        selected && "bg-accent text-accent-foreground ring-2 ring-ring"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground capitalize">{type}</div>
        </div>
        <div className="font-mono tabular-nums">{formatPHP(balanceCents)}</div>
      </div>
    </button>
  );
}
