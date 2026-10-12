import type { LoggedEvent } from "@/lib/events/log";

/** Every ordering of the items: projections must give the same rows for each. */
export function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ])
  );
}

/** `it.each` rows: each ordering of the events, named by their IDs. */
export const orders = (events: LoggedEvent[]) =>
  permutations(events).map((order) => [order.map((event) => event.id), order] as const);
