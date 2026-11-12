import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { createImport, editDraft, listDrafts, listImports } from "@/lib/import/drafts";
import type { StatementLine } from "@/lib/import/statement";
import { readAccountMoney } from "@/lib/transactions/money";
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

let bankId: string;
let walletId: string;
let cardId: string;
let groceriesId: string;

beforeEach(async () => {
  await resetLocalDatabase();
  const bank = await createAccount(MEMBER, {
    name: "Bank",
    type: "bank",
    startingBalanceCents: peso("1000"),
  });
  bankId = bank.id;
  walletId = (
    await createAccount(MEMBER, { name: "Wallet", type: "cash", startingBalanceCents: peso("0") })
  ).id;
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
    expect(created).toMatchObject({ eventVersion: 5, payload: { importKey: market!.importKey } });
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

  describe("Statement Text and Pin", () => {
    const createdPayloads = async () =>
      (await listUnpushed(100))
        .filter((event) => event.eventType === "transaction.created")
        .map((event) => event.payload);

    it("stamps the line's normalized Statement Text, and the pin, on a single save", async () => {
      const { drafts } = await importLines([line("Jollibee  QC 1234", "250")]);
      const [jollibee] = drafts;
      await editDraft(jollibee!.id, { description: "Jollibee" });

      await saveDrafts(MEMBER, [jollibee!.id], true);

      expect(await listTransactions()).toMatchObject([
        { description: "Jollibee", statementText: "JOLLIBEE QC", pinned: true },
      ]);
      const payloads = await createdPayloads();
      expect(JSON.stringify(payloads)).not.toContain("1234");
    });

    it("saves without a pin unless the member ticks it", async () => {
      const { drafts } = await importLines([line("JOLLIBEE QC 1234", "250")]);

      await saveDrafts(MEMBER, [drafts[0]!.id]);

      expect(await listTransactions()).toMatchObject([
        { statementText: "JOLLIBEE QC", pinned: false },
      ]);
    });

    it("never pins a bulk save", async () => {
      const { drafts } = await importLines([line("JOLLIBEE 1", "1"), line("MCDO 2", "2")]);

      await saveDrafts(
        MEMBER,
        drafts.map((draft) => draft.id),
        true
      );

      expect(
        (await listTransactions()).map(({ statementText, pinned }) => ({ statementText, pinned }))
      ).toEqual(
        expect.arrayContaining([
          { statementText: "JOLLIBEE", pinned: false },
          { statementText: "MCDO", pinned: false },
        ])
      );
    });

    it("records no Statement Text for a line that is only numbers or blank", async () => {
      const { drafts } = await importLines([line("12345", "2")]);
      await editDraft(drafts[0]!.id, { description: "Parking" });

      await saveDrafts(MEMBER, [drafts[0]!.id]);

      expect(await listTransactions()).toMatchObject([{ statementText: null }]);
    });
  });
});

describe("saveDrafts, Paid from", () => {
  it("records each draft's Paid from, the card's usual Paying Account unless changed", async () => {
    const { drafts } = await importLines([line("A", "100"), line("B", "40")]);
    const [first, second] = drafts;
    await editDraft(first!.id, { paidFromId: walletId });

    await saveDrafts(MEMBER, [first!.id, second!.id]);

    const transactions = await listTransactions();
    expect(transactions.find((row) => row.description === "A")).toMatchObject({
      accountId: cardId,
      payingAccountId: walletId,
    });
    expect(transactions.find((row) => row.description === "B")).toMatchObject({
      accountId: cardId,
      payingAccountId: bankId,
    });
  });

  it("holds the line in the chosen account's Card Payment money", async () => {
    const { drafts } = await importLines([line("A", "100")]);
    const [first] = drafts;
    await editDraft(first!.id, { paidFromId: walletId });

    await saveDrafts(MEMBER, [first!.id]);

    const money = await readAccountMoney();
    expect(money.get(walletId)?.envelopes?.cardPayments.get(cardId)).toBe(peso("100"));
    expect(money.get(bankId)?.envelopes?.cardPayments.get(cardId)).toBeUndefined();
  });

  it("keeps nothing when a draft's Paid from can't pay the card", async () => {
    const { importId, drafts } = await importLines([line("A", "100")]);
    const [first] = drafts;
    await editDraft(first!.id, { paidFromId: cardId });

    await expect(saveDrafts(MEMBER, [first!.id])).rejects.toThrow(/to pay this card from/);

    expect(await listTransactions()).toEqual([]);
    expect(await listDrafts(importId)).toHaveLength(1);
  });
});
