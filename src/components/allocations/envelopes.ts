import { UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import { categoriesInUse, type CategoryList } from "@/lib/categories/projection";
import type { Cents } from "@/lib/currency";
import { byName } from "@/lib/utils/sort";

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
  const categories = [...categoriesInUse(list), ...list.retiredCategories];
  return new Map(categories.map((category) => [category.id, category.name]));
}

/** Non-zero amounts by card ID, named and sorted by name (id breaks ties). */
export function namedAmounts(byId: Map<string, Cents> | undefined, names: Map<string, string>) {
  return [...(byId ?? [])]
    .filter(([, cents]) => cents !== 0)
    .map(([id, cents]) => ({ id, cents, name: names.get(id) ?? "A card" }))
    .sort(byName);
}
