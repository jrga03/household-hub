import { UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import type { CategoryList } from "@/lib/categories/projection";

/** Radix Select holds strings: "unassigned", "category:<id>" or "card_payment:<id>". */
export const envelopeKey = (envelope: Envelope) =>
  envelope.kind === "unassigned" ? envelope.kind : `${envelope.kind}:${envelope.id}`;

export function envelopeFromKey(key: string): Envelope | null {
  if (key === "unassigned") return UNASSIGNED_ENVELOPE;
  const [kind, id] = key.split(":");
  if (!id || (kind !== "category" && kind !== "card_payment")) return null;
  return { kind, id };
}

/** Every category's name on this device, retired ones included, by category ID. */
export function categoryNames(list: CategoryList): Map<string, string> {
  const categories = [
    ...list.groups.flatMap((group) => group.categories),
    ...list.ungrouped,
    ...list.retiredCategories,
  ];
  return new Map(categories.map((category) => [category.id, category.name]));
}
