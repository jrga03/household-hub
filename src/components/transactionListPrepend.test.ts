/**
 * Unit tests for the prepend scroll-anchor decision (finding 1).
 *
 * The layout effect that reads `start`/scrollTop needs real layout and is
 * verified on the manual device pass; the DECISION of whether to anchor at all
 * is pure and tested here. The critical regression it guards: an R9 overlay
 * insert of a just-created transaction (+1 row at the top, page 0 present)
 * must NOT anchor, or the new row is pushed out of view.
 */

import { describe, it, expect } from "vitest";
import { shouldAnchorPrepend } from "./transactionListPrepend";
import { TRANSACTIONS_PAGE_SIZE } from "@/lib/supabaseQueries";

describe("shouldAnchorPrepend", () => {
  it("does NOT anchor an R9-style +1 top insert (cameFromPrevFetch=false)", () => {
    // User at top creates a transaction → overlay injects it at index 0. The
    // list grows by 1 and the top id changes, but this is not a prepend.
    expect(
      shouldAnchorPrepend({
        prevRowCount: 50,
        rowCount: 51,
        prevFirstId: "old-top",
        firstId: "just-created",
        cameFromPrevFetch: false,
      })
    ).toBe(false);
  });

  it("anchors a fetchPreviousPage prepend with a full-page growth", () => {
    expect(
      shouldAnchorPrepend({
        prevRowCount: TRANSACTIONS_PAGE_SIZE * 2,
        rowCount: TRANSACTIONS_PAGE_SIZE * 3,
        prevFirstId: "was-first",
        firstId: "prepended-first",
        cameFromPrevFetch: true,
      })
    ).toBe(true);
  });

  it("does NOT anchor a +1 growth even if the prev-fetch flag is (mis-)armed", () => {
    // Defensive page-sized check: a stray +1 can never trigger the anchor even
    // if cameFromPrevFetch were somehow true.
    expect(
      shouldAnchorPrepend({
        prevRowCount: 50,
        rowCount: 51,
        prevFirstId: "old-top",
        firstId: "new-top",
        cameFromPrevFetch: true,
      })
    ).toBe(false);
  });

  it("does NOT anchor when the top id did not change (no top-prepend)", () => {
    expect(
      shouldAnchorPrepend({
        prevRowCount: 50,
        rowCount: 100,
        prevFirstId: "same-top",
        firstId: "same-top",
        cameFromPrevFetch: true,
      })
    ).toBe(false);
  });

  it("does NOT anchor when the list did not grow", () => {
    expect(
      shouldAnchorPrepend({
        prevRowCount: 100,
        rowCount: 100,
        prevFirstId: "a",
        firstId: "b",
        cameFromPrevFetch: true,
      })
    ).toBe(false);
  });

  it("does NOT anchor on first commit (no previous top id to anchor to)", () => {
    expect(
      shouldAnchorPrepend({
        prevRowCount: 0,
        rowCount: TRANSACTIONS_PAGE_SIZE,
        prevFirstId: undefined,
        firstId: "first-ever",
        cameFromPrevFetch: true,
      })
    ).toBe(false);
  });

  it("anchors a short tail prepend at/above the half-page floor", () => {
    // A prepend can be a short page; anything from ~half a page up still
    // anchors (a real evicted page is never just a couple of rows).
    const grew = TRANSACTIONS_PAGE_SIZE / 2;
    expect(
      shouldAnchorPrepend({
        prevRowCount: 100,
        rowCount: 100 + grew,
        prevFirstId: "was-first",
        firstId: "prepended-first",
        cameFromPrevFetch: true,
      })
    ).toBe(true);
  });
});
