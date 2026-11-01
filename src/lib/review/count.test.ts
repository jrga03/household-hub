import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { loggedEvent } from "@/test/events";
import { negateCents, parsePHP } from "@/lib/currency";
import { createImport } from "@/lib/import/drafts";
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { HOUSEHOLD } from "@/test/events";
import { countLocalReviewItems, readOwed, readUnassigned, totalReviewItems } from "./count";

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

const ANA = "user-ana";
const BEN = "user-ben";

const outOfPocket = (
  entityId: string,
  paidByUserId: string,
  amountCents: number,
  type: "expense" | "income" = "expense"
) => ({
  ...transactionEvent(entityId, "transaction.created", {
    date: "2026-10-12",
    type,
    amountCents,
    accountId: BANK,
    categoryId: GROCERIES,
    payingAccountId: null,
    description: "Groceries",
    notes: "",
    status: "pending",
    importKey: null,
    paidByUserId,
  }),
  eventVersion: 4,
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
    expect(await countLocalReviewItems()).toEqual({
      uncategorized: 0,
      payBack: 0,
      drafts: 0,
      unassigned: 0,
      unassignedCents: 0,
    });
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

  it("counts one item per member the household owes", async () => {
    await receiveEvents(
      [
        outOfPocket("t-1", ANA, 100000),
        outOfPocket("t-2", ANA, 200000),
        outOfPocket("t-3", BEN, 50000),
      ],
      0
    );

    expect((await countLocalReviewItems()).payBack).toBe(2);
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

describe("Unassigned money", () => {
  const MEMBER = { householdId: HOUSEHOLD, userId: "user-me" };
  const account = (name: string, type: string, pesos: string, payingAccountId?: string) =>
    createAccount(MEMBER, {
      name,
      type,
      startingBalanceCents: parsePHP(pesos),
      payingAccountId,
    });

  it("is no item while every account's Unassigned is zero", async () => {
    await account("BPI", "bank", "0");

    expect(await readUnassigned()).toBe(0);
    expect((await countLocalReviewItems()).unassigned).toBe(0);
  });

  it("is one item for money across accounts, and leaves out cards", async () => {
    const bpi = await account("BPI", "bank", "3000");
    await account("GCash", "e_wallet", "2000");
    await account("Visa", "credit_card", "700", bpi.id);

    expect(await countLocalReviewItems()).toMatchObject({
      unassigned: 1,
      unassignedCents: parsePHP("5000"),
    });
  });

  it("counts a retired account still holding money", async () => {
    const cash = await account("Cash", "cash", "400");
    await retireAccount(MEMBER, cash.id);

    expect(await readUnassigned()).toBe(parsePHP("400"));
  });

  it("is one item when more is assigned than the accounts hold", async () => {
    const bpi = await account("BPI", "bank", "0");
    const food = await createGroup(MEMBER, { name: "Food" });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
    await addAllocation(MEMBER, {
      date: "2026-10-05",
      accountId: bpi.id,
      from: { kind: "unassigned" },
      to: { kind: "category", id: groceries.id },
      amountCents: parsePHP("200"),
    });

    expect(await readUnassigned()).toBe(negateCents(parsePHP("200")));
    expect((await countLocalReviewItems()).unassigned).toBe(1);
  });
});

describe("totalReviewItems", () => {
  it("adds up every kind", () => {
    expect(
      totalReviewItems({
        uncategorized: 2,
        payBack: 2,
        drafts: 3,
        joinRequests: 1,
        unassigned: 1,
        unassignedCents: parsePHP("5000"),
      })
    ).toBe(9);
  });
});

describe("readOwed", () => {
  it("totals each payer's open out-of-pocket expenses and counts them", async () => {
    await receiveEvents(
      [
        outOfPocket("t-1", ANA, 100000),
        outOfPocket("t-2", ANA, 200050),
        outOfPocket("t-3", BEN, 50000),
      ],
      0
    );

    const owed = await readOwed();

    expect(owed.get(ANA)).toEqual({ totalCents: 300050, count: 2 });
    expect(owed.get(BEN)).toEqual({ totalCents: 50000, count: 1 });
  });

  it("leaves out expenses paid back or removed, and pending ones nobody paid for", async () => {
    await receiveEvents(
      [
        outOfPocket("t-1", ANA, 100000),
        transactionEvent("t-1", "transaction.marked_cleared"),
        outOfPocket("t-2", BEN, 50000),
        transactionEvent("t-2", "transaction.removed"),
        created("t-3", { type: "expense", categoryId: GROCERIES }),
        transactionEvent("t-3", "transaction.marked_pending"),
      ],
      0
    );

    expect((await readOwed()).size).toBe(0);
    expect((await countLocalReviewItems()).payBack).toBe(0);
  });

  it("owes nothing for an income that names a payer", async () => {
    await receiveEvents([outOfPocket("t-1", ANA, 100000, "income")], 0);

    expect((await readOwed()).size).toBe(0);
  });

  it("owes an expense again once it is marked pending again", async () => {
    await receiveEvents(
      [
        outOfPocket("t-1", ANA, 100000),
        transactionEvent("t-1", "transaction.marked_cleared"),
        transactionEvent("t-1", "transaction.marked_pending"),
      ],
      0
    );

    expect((await readOwed()).get(ANA)).toEqual({ totalCents: 100000, count: 1 });
  });
});
