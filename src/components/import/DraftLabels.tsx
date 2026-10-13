import { Badge } from "@/components/ui/badge";
import type { SuggestionSource } from "@/lib/import/drafts";
import type { DraftFlag } from "@/lib/import/review";

export const isSuggested = (source: string | null): source is SuggestionSource =>
  source === "history" || source === "llm";

export function SuggestedBadge() {
  return (
    <Badge variant="outline" className="font-normal">
      Suggested
    </Badge>
  );
}

const FLAG_BADGES = {
  "already-imported": { label: "Already imported", variant: "destructive" },
  "might-be-recorded": { label: "Might already be recorded", variant: "outline" },
  "card-payment": { label: "Card payment", variant: "secondary" },
} as const;

export function FlagBadge({ flag }: { flag: DraftFlag }) {
  const { label, variant } = FLAG_BADGES[flag.kind];
  const recorded = flag.kind === "card-payment" && flag.transfer !== null;
  return (
    <Badge variant={variant}>
      {label}
      {recorded && " · recorded"}
    </Badge>
  );
}
