import { TRANSACTIONS_PAGE_SIZE } from "@/lib/supabaseQueries";

/**
 * Inputs to the prepend scroll-anchor decision (all read at the layout-effect
 * that runs after a list-growing commit).
 */
export interface ShouldAnchorPrependArgs {
  /** Flattened row count at the PREVIOUS commit. */
  prevRowCount: number;
  /** Flattened row count at THIS commit. */
  rowCount: number;
  /** id at index 0 at the PREVIOUS commit (the pre-prepend top row). */
  prevFirstId: string | undefined;
  /** id at index 0 at THIS commit. */
  firstId: string | undefined;
  /**
   * True only when this growth was driven by a fetchPreviousPage prepend
   * (armed in the same handler that calls fetchPreviousPage). An R9 overlay
   * insert of a just-created transaction leaves this false.
   */
  cameFromPrevFetch: boolean;
}

/**
 * Decides whether the prepend scroll-anchor compensation should run for a
 * list that just grew at the top.
 *
 * The scroll-anchor exists to cancel the viewport jump when fetchPreviousPage
 * prepends an evicted earlier page (~a full page of rows shifts every index
 * down). It must NOT run for an R9 overlay insert of a just-created
 * transaction: that also grows the list and changes the top id, but there the
 * user is at the true top (page 0 present, no previous page) and the new row
 * SHOULD scroll into view — anchoring would push it back out (finding 1).
 *
 * The two cases are cleanly separable, so we gate on an explicit signal rather
 * than inferring from hasPreviousPage (which may have flipped by the time the
 * layout effect runs):
 * - `cameFromPrevFetch`: set in the same handler that calls fetchPreviousPage;
 *   an R9 top-insert never sets it.
 * - page-sized growth: a real prepend adds ~TRANSACTIONS_PAGE_SIZE rows, so a
 *   stray +1 (overlay) can never anchor even if the flag were ever mis-armed.
 *
 * Pure function — exported for unit tests (the scroll-anchoring itself needs
 * real layout and is verified on the manual device pass).
 */
export function shouldAnchorPrepend({
  prevRowCount,
  rowCount,
  prevFirstId,
  firstId,
  cameFromPrevFetch,
}: ShouldAnchorPrependArgs): boolean {
  // Only a fetchPreviousPage prepend anchors. An R9 overlay insert (or any
  // other non-prepend growth) leaves the flag unset and must fall through.
  if (!cameFromPrevFetch) return false;

  // Must actually have grown at the top: more rows AND a changed index-0 id,
  // with a known previous top row to anchor to.
  const grewAtTop = rowCount > prevRowCount && prevFirstId !== undefined && firstId !== prevFirstId;
  if (!grewAtTop) return false;

  // Defensive: a real prepend adds close to a full page. Require the growth to
  // be near a page so a stray +1 (e.g. an overlay insert that somehow raced a
  // mis-armed flag) never triggers the anchor. The tail page can be short, so
  // allow anything from a couple of rows up to a full page.
  const grew = rowCount - prevRowCount;
  return grew >= TRANSACTIONS_PAGE_SIZE / 2;
}
