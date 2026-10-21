import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { createImport, editDraft, listDrafts, listImports } from "@/lib/import/drafts";
import type { StatementLine } from "@/lib/import/statement";
import { listTransactions } from "@/lib/transactions/projection";
import { createAccount } from "./accounts";
import { createCategory, createGroup, retireCategory } from "./categories";
import { saveDrafts } from "./drafts";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

const peso = (amount: string): Cents => parsePHP(amount);

const line = (description: string, amount: string, overrides: Partial<StatementLine> = {}) => ({
  purchaseDate: "2026-09-03",
  postingDate: "2026-09-05",
  description,
  amount: peso(amount),
  type: "expense" as const,
  isCardPayment: false,
  ...overrides,
});

let cardId: string;
let groceriesId: string;

beforeEach(async () => {
  await resetLocalDatabase();
  const bank = await createAccount(MEMBER, {
    name: "Bank",
    type: "bank",
    startingBalanceCents: peso("1000"),
  });
  cardId = (
    await createAccount(MEMBER, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: peso("0"),
      payingAccountId: bank.id,
    })
  ).id;
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
});

async function importLines(lines: StatementLine[]) {
  const importId = await createImport({
    formatId: "bdo-credit-card-pdf",
    fileName: "statement.pdf",
    accountId: cardId,
    lines,
  });
  return { importId, drafts: await listDrafts(importId) };
}

describe("saveDrafts", () => {
  it("records each draft as a cleared transaction on its purchase date, stamped with its import key", async () => {
    const { drafts } = await importLines([line("SM SUPERMARKET", "2540.75")]);
    const [market] = drafts;
    await editDraft(market!.id, { description: "Groceries run", categoryId: groceriesId });

    await saveDrafts(MEMBER, [market!.id]);

    expect(await listTransactions()).toMatchObject([
      {
        date: "2026-09-03",
        type: "expense",
        amountCents: 254075,
        accountId: cardId,
        categoryId: groceriesId,
        description: "Groceries run",
        status: "cleared",
        importKey: market!.importKey,
      },
    ]);
    const created = (await listUnpushed(100)).find(
      (event) => event.eventType === "transaction.created"
    );
    expect(created).toMatchObject({ eventVersion: 3, payload: { importKey: market!.importKey } });
  });

  it("deletes saved drafts, and the import once nothing is left", async () => {
    const { importId, drafts } = await importLines([line("A", "1"), line("B", "2")]);
    const [first, second] = drafts;

    await saveDrafts(MEMBER, [first!.id]);
    expect((await listDrafts(importId)).map((draft) => draft.id)).toEqual([second!.id]);
    expect(await listImports()).toHaveLength(1);

    await saveDrafts(MEMBER, [second!.id]);
    expect(await listDrafts(importId)).toEqual([]);
    expect(await listImports()).toEqual([]);
  });

  it("keeps nothing when one draft is refused", async () => {
    const { importId, drafts } = await importLines([line("A", "1"), line("B", "2")]);
    const [first, second] = drafts;
    await editDraft(second!.id, { categoryId: groceriesId });
    await retireCategory(MEMBER, groceriesId);

    await expect(saveDrafts(MEMBER, [first!.id, second!.id])).rejects.toThrow(/retired/);

    expect(await listTransactions()).toEqual([]);
    expect(await listDrafts(importId)).toHaveLength(2);
    expect(await listUnpushed(100)).not.toContainEqual(
      expect.objectContaining({ eventType: "transaction.created" })
    );
  });

  it("keeps nothing when a draft has no description", async () => {
    const { importId, drafts } = await importLines([line("A", "1"), line("", "2")]);

    await expect(
      saveDrafts(
        MEMBER,
        drafts.map((draft) => draft.id)
      )
    ).rejects.toThrow("Add a description.");

    expect(await listTransactions()).toEqual([]);
    expect(await listDrafts(importId)).toHaveLength(2);
  });

  it("saves a blank statement line once the member describes it", async () => {
    const { drafts } = await importLines([line("", "2")]);
    const [blank] = drafts;
    await editDraft(blank!.id, { description: "Parking" });

    await saveDrafts(MEMBER, [blank!.id]);

    expect(await listTransactions()).toMatchObject([{ description: "Parking" }]);
  });

  it("refuses to save a card payment as income", async () => {
    const { importId, drafts } = await importLines([
      line("A", "1"),
      line("PAYMENT RECEIVED", "5000", { type: "income", isCardPayment: true }),
    ]);

    await expect(
      saveDrafts(
        MEMBER,
        drafts.map((draft) => draft.id)
      )
    ).rejects.toThrow(/card payment/i);

    expect(await listTransactions()).toEqual([]);
    expect(await listDrafts(importId)).toHaveLength(2);
  });
});
