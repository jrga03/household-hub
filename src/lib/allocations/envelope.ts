import { sameEnvelope, type Envelope } from "@/lib/allocations/events";

export function envelopeLabel(
  envelope: Envelope,
  categories: Map<string, string>,
  accounts: Map<string, string>
): string {
  if (envelope.kind === "unassigned") return "Unassigned";
  if (envelope.kind === "category") return categories.get(envelope.id) ?? "A category";
  return `Card Payment · ${accounts.get(envelope.id) ?? "A card"}`;
}

/** A transfer's envelope, or "from → to" when it arrives in a different one (ADR 0013). */
export function transferEnvelopeLabel(
  transfer: { fromEnvelope: Envelope; toEnvelope: Envelope },
  categories: Map<string, string>,
  accounts: Map<string, string>
): string {
  const from = envelopeLabel(transfer.fromEnvelope, categories, accounts);
  if (sameEnvelope(transfer.fromEnvelope, transfer.toEnvelope)) return from;
  return `${from} → ${envelopeLabel(transfer.toEnvelope, categories, accounts)}`;
}
