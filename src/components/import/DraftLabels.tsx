import { StatusBadge, type StatusTone } from "@/components/app/StatusBadge";
import { SUGGESTION_SOURCES, type SuggestionSource } from "@/lib/import/drafts";
import type { DraftFlag } from "@/lib/import/review";

export const isSuggested = (source: string | null): source is SuggestionSource =>
  SUGGESTION_SOURCES.some((suggested) => suggested === source);

export function SuggestedBadge() {
  return (
    <StatusBadge tone="outline" className="font-normal">
      Suggested
    </StatusBadge>
  );
}

const FLAG_BADGES: Record<DraftFlag["kind"], { label: string; tone: StatusTone }> = {
  "already-imported": { label: "Already imported", tone: "warning" },
  "might-be-recorded": { label: "Might already be recorded", tone: "outline" },
  "card-payment": { label: "Card payment", tone: "neutral" },
};

export function FlagBadge({ flag }: { flag: DraftFlag }) {
  const { label, tone } = FLAG_BADGES[flag.kind];
  const recorded = flag.kind === "card-payment" && flag.transfer !== null;
  return <StatusBadge tone={tone}>{recorded ? `${label} · recorded` : label}</StatusBadge>;
}
