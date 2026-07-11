/**
 * Pure single-open swipe-row state for the transactions card list.
 *
 * The list keeps ONE `openRowId`; a row is open iff `openRowId === txn.id`, so
 * opening row B implicitly closes row A (single-valued state). Extracted so the
 * transition is unit-testable without driving the virtualizer/gesture in jsdom.
 */

/**
 * Next openRowId after a SwipeableRow reports an open-state change.
 * - open  → this row becomes the single open row (closes any other).
 * - close → clear only if THIS row was the open one (a stale close from a
 *   recycled/other row must not wipe a different row's open state).
 */
export function nextOpenRowId(current: string | null, id: string, open: boolean): string | null {
  if (open) return id;
  return current === id ? null : current;
}
