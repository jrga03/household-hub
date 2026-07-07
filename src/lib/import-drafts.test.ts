/**
 * Tests for Import Draft CRUD Helpers
 *
 * Focused on the discard/restore (Undo) cycle against the REAL local Dexie
 * store (fake-indexeddb): discardDraft is a soft status flip, and
 * restoreDraft/restoreDrafts reverse it while keeping the per-session
 * discarded_count counter consistent (review R2).
 *
 * @module import-drafts.test
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/dexie/db";
import {
  createImportSession,
  discardDraft,
  restoreDraft,
  restoreDrafts,
  resolveCategoryName,
} from "@/lib/import-drafts";
import type { ParsedTransactionRow } from "@/types/pdf-import";

const ACCOUNT_ID = "acct-1";

function makeRows(count: number, prefix = "Row"): ParsedTransactionRow[] {
  return Array.from({ length: count }, (_, i) => ({
    date: "2026-07-01",
    description: `${prefix} ${i + 1}`,
    amount: "1,500.50",
    type: "expense" as const,
    confidence: 0.95,
    rawText: `raw ${prefix} ${i + 1}`,
  }));
}

describe("Import draft discard/restore cycle", () => {
  beforeEach(async () => {
    await db.importDrafts.clear();
    await db.importSessions.clear();
  });

  it("restoreDraft flips a discarded draft back to pending and decrements the counter", async () => {
    const { sessionId, drafts } = await createImportSession(
      "statement.pdf",
      "bdo-credit-card",
      makeRows(2),
      ACCOUNT_ID
    );

    await discardDraft(drafts[0].id);

    let session = await db.importSessions.get(sessionId);
    expect(session?.discarded_count).toBe(1);
    expect((await db.importDrafts.get(drafts[0].id))?.draft_status).toBe("discarded");

    const restored = await restoreDraft(drafts[0].id);
    expect(restored).toBe(true);

    const draft = await db.importDrafts.get(drafts[0].id);
    expect(draft?.draft_status).toBe("pending");

    session = await db.importSessions.get(sessionId);
    expect(session?.discarded_count).toBe(0);
  });

  it("restoreDraft is a no-op for a draft that is not discarded", async () => {
    const { sessionId, drafts } = await createImportSession(
      "statement.pdf",
      "bdo-credit-card",
      makeRows(1),
      ACCOUNT_ID
    );

    const restored = await restoreDraft(drafts[0].id);
    expect(restored).toBe(false);

    const draft = await db.importDrafts.get(drafts[0].id);
    expect(draft?.draft_status).toBe("pending");

    const session = await db.importSessions.get(sessionId);
    expect(session?.discarded_count).toBe(0);
  });

  it("restoreDraft returns false for an unknown id", async () => {
    expect(await restoreDraft("does-not-exist")).toBe(false);
  });

  it("restoreDrafts restores a bulk-discarded batch and resets the counter", async () => {
    const { sessionId, drafts } = await createImportSession(
      "statement.pdf",
      "bdo-credit-card",
      makeRows(3),
      ACCOUNT_ID
    );
    const ids = drafts.map((d) => d.id);

    for (const id of ids) {
      await discardDraft(id);
    }
    expect((await db.importSessions.get(sessionId))?.discarded_count).toBe(3);

    const restoredCount = await restoreDrafts(ids);
    expect(restoredCount).toBe(3);

    const restored = await db.importDrafts.bulkGet(ids);
    for (const draft of restored) {
      expect(draft?.draft_status).toBe("pending");
    }
    expect((await db.importSessions.get(sessionId))?.discarded_count).toBe(0);
  });

  it("restoreDrafts skips non-discarded drafts and does not over-decrement", async () => {
    const { sessionId, drafts } = await createImportSession(
      "statement.pdf",
      "bdo-credit-card",
      makeRows(3),
      ACCOUNT_ID
    );

    // Only discard the first draft; the other two stay pending
    await discardDraft(drafts[0].id);
    expect((await db.importSessions.get(sessionId))?.discarded_count).toBe(1);

    const restoredCount = await restoreDrafts(drafts.map((d) => d.id));
    expect(restoredCount).toBe(1);

    expect((await db.importSessions.get(sessionId))?.discarded_count).toBe(0);
    const all = await db.importDrafts.bulkGet(drafts.map((d) => d.id));
    for (const draft of all) {
      expect(draft?.draft_status).toBe("pending");
    }
  });

  it("restoreDrafts decrements counters per session when ids span sessions", async () => {
    const a = await createImportSession("a.pdf", "bdo-credit-card", makeRows(2, "A"), ACCOUNT_ID);
    const b = await createImportSession("b.pdf", "bdo-credit-card", makeRows(1, "B"), ACCOUNT_ID);

    await discardDraft(a.drafts[0].id);
    await discardDraft(a.drafts[1].id);
    await discardDraft(b.drafts[0].id);

    const restoredCount = await restoreDrafts([a.drafts[0].id, a.drafts[1].id, b.drafts[0].id]);
    expect(restoredCount).toBe(3);

    expect((await db.importSessions.get(a.sessionId))?.discarded_count).toBe(0);
    expect((await db.importSessions.get(b.sessionId))?.discarded_count).toBe(0);
  });

  it("restoreDrafts never drives discarded_count below zero", async () => {
    const { sessionId, drafts } = await createImportSession(
      "statement.pdf",
      "bdo-credit-card",
      makeRows(1),
      ACCOUNT_ID
    );

    // Force an inconsistent state: draft marked discarded but counter at 0
    // (e.g. counter was clobbered elsewhere). Restore must clamp, not go -1.
    await db.importDrafts.update(drafts[0].id, { draft_status: "discarded" });
    expect((await db.importSessions.get(sessionId))?.discarded_count).toBe(0);

    const restoredCount = await restoreDrafts([drafts[0].id]);
    expect(restoredCount).toBe(1);
    expect((await db.importSessions.get(sessionId))?.discarded_count).toBe(0);
  });

  it("double Undo is safe: second restore of the same draft is a no-op", async () => {
    const { sessionId, drafts } = await createImportSession(
      "statement.pdf",
      "bdo-credit-card",
      makeRows(1),
      ACCOUNT_ID
    );

    await discardDraft(drafts[0].id);
    expect(await restoreDraft(drafts[0].id)).toBe(true);
    expect(await restoreDraft(drafts[0].id)).toBe(false);

    expect((await db.importSessions.get(sessionId))?.discarded_count).toBe(0);
    expect((await db.importDrafts.get(drafts[0].id))?.draft_status).toBe("pending");
  });
});

describe("resolveCategoryName", () => {
  const categories = [
    { id: "cat-food", name: "Food & Dining" },
    { id: "cat-transport", name: "Transportation" },
  ];

  it("resolves the category name when the id is in the list", () => {
    expect(resolveCategoryName("cat-food", categories)).toBe("Food & Dining");
    expect(resolveCategoryName("cat-transport", categories)).toBe("Transportation");
  });

  it("returns null when the draft has no category", () => {
    expect(resolveCategoryName(undefined, categories)).toBeNull();
    expect(resolveCategoryName(null, categories)).toBeNull();
    expect(resolveCategoryName("", categories)).toBeNull();
  });

  it("returns null when the id is not in the list (deleted category)", () => {
    expect(resolveCategoryName("cat-gone", categories)).toBeNull();
  });

  it("returns null when categories are not loaded yet", () => {
    expect(resolveCategoryName("cat-food", undefined)).toBeNull();
  });

  it("returns null for an empty category list", () => {
    expect(resolveCategoryName("cat-food", [])).toBeNull();
  });
});
