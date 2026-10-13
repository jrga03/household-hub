import type { Envelope } from "@/lib/allocations/events";

export function envelopeLabel(
  envelope: Envelope,
  categories: Map<string, string>,
  accounts: Map<string, string>
): string {
  if (envelope.kind === "unassigned") return "Unassigned";
  if (envelope.kind === "category") return categories.get(envelope.id) ?? "A category";
  return `Card Payment · ${accounts.get(envelope.id) ?? "A card"}`;
}
