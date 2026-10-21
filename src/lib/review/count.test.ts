import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { loggedEvent } from "@/test/events";
import { parsePHP } from "@/lib/currency";
import { createImport } from "@/lib/import/drafts";
import { countLocalReviewItems, totalReviewItems } from "./count";

const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

let eventCount = 0;

function transactionEvent(
  entityId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  eventCount += 1;
  return loggedEvent({
    id: `e-${eventCount}`,
    entityType: "transaction",
    entityId,
    eventType,
    millis: 1000 + eventCount,
    payload,
  });
}

const created = (
  entityId: string,
  details: { type: "expense" | "income"; categoryId: string | null }
) =>
  transactionEvent(entityId, "transaction.created", {
    date: "2026-10-12",
    amountCents: 25000,
    accountId: BANK,
    description: "Lunch",
    notes: "",
    status: "cleared",
    ...details,
  });

beforeEach(async () => {
  await resetLocalDatabase();
});

const statementLine = (description: string) => ({
  purchaseDate: "2026-09-03",
  postingDate: "2026-09-05",
  description,
  amount: parsePHP("3200"),
  type: "expense" as const,
  isCardPayment: false,
});

describe("countLocalReviewItems", () => {
  it("is zero with nothing recorded", async () => {
    expect(await countLocalReviewItems()).toEqual({ uncategorized: 0, drafts: 0 });
  });

  it("counts expenses with no category", async () => {
    await receiveEvents(
      [
        created("t-1", { type: "expense", categoryId: null }),
        created("t-2", { type: "expense", categoryId: null }),
        created("t-3", { type: "expense", categoryId: GROCERIES }),
        created("t-4", { type: "income", categoryId: null }),
      ],
      0
    );

    expect((await countLocalReviewItems()).uncategorized).toBe(2);
  });

  it("leaves out removed expenses", async () => {
    await receiveEvents(
      [
        created("t-1", { type: "expense", categoryId: null }),
        transactionEvent("t-1", "transaction.removed"),
      ],
      0
    );

    expect((await countLocalReviewItems()).uncategorized).toBe(0);
  });

  it("counts every open draft, across imports", async () => {
    await createImport({
      formatId: "bdo-credit-card-pdf",
      fileName: "september.pdf",
      accountId: BANK,
      lines: [statementLine("MERALCO"), statementLine("GRAB")],
    });
    await createImport({
      formatId: "bdo-credit-card-pdf",
      fileName: "october.pdf",
      accountId: BANK,
      lines: [statementLine("JOLLIBEE")],
    });

    expect((await countLocalReviewItems()).drafts).toBe(3);
  });
});

describe("totalReviewItems", () => {
  it("adds up every kind", () => {
    expect(totalReviewItems({ uncategorized: 2, drafts: 3, joinRequests: 1 })).toBe(6);
  });
});
