import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePHP } from "@/lib/currency";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction } from "@/lib/commands/transactions";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { switchHousehold } from "@/lib/events/log";
import { countDrafts, createImport, editDraft, listDrafts, listImports } from "./drafts";
import { suggestDrafts } from "./suggest-drafts";
import { historySuggester, type DraftSuggester } from "./suggestions";
import { HOUSEHOLD } from "@/test/events";

vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

let cardId: string;
let utilitiesId: string;
let diningId: string;

const statementLine = (description: string) => ({
  purchaseDate: "2026-09-03",
  postingDate: "2026-09-05",
  description,
  amount: parsePHP("3200"),
  type: "expense" as const,
  isCardPayment: false,
});

beforeEach(async () => {
  await resetLocalDatabase();
  const bank = await createAccount(MEMBER, {
    name: "Bank",
    type: "bank",
    startingBalanceCents: parsePHP("1000"),
  });
  cardId = (
    await createAccount(MEMBER, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: parsePHP("0"),
      payingAccountId: bank.id,
    })
  ).id;
  const bills = await createGroup(MEMBER, { name: "Bills" });
  utilitiesId = (await createCategory(MEMBER, { name: "Utilities", groupId: bills.id })).id;
  diningId = (await createCategory(MEMBER, { name: "Dining", groupId: bills.id })).id;
  await addTransaction(MEMBER, {
    date: "2026-08-03",
    type: "expense",
    amountCents: parsePHP("3100"),
    accountId: cardId,
    categoryId: utilitiesId,
    description: "MERALCO 0812",
  });
});

const importMeralco = () =>
  createImport({
    formatId: "bdo-credit-card-pdf",
    fileName: "september.pdf",
    accountId: cardId,
    lines: [statementLine("MERALCO 0912")],
  });

const suggestDining: DraftSuggester = (drafts) =>
  Promise.resolve(
    drafts.map((draft) => ({
      draftId: draft.id,
      categoryId: diningId,
      description: "Electricity",
      source: "llm" as const,
    }))
  );

describe("suggestDrafts", () => {
  it("fills a category from history and marks it suggested", async () => {
    const importId = await importMeralco();

    await suggestDrafts(importId);

    expect(await listDrafts(importId)).toMatchObject([
      { categoryId: utilitiesId, categorySource: "history" },
    ]);
  });

  it("lets an earlier suggester's value stand, and fills only what's still open", async () => {
    const importId = await importMeralco();

    await suggestDrafts(importId, [historySuggester, suggestDining]);

    expect(await listDrafts(importId)).toMatchObject([
      {
        categoryId: utilitiesId,
        categorySource: "history",
        description: "Electricity",
        descriptionSource: "llm",
      },
    ]);
  });

  it("never replaces what the member chose", async () => {
    const importId = await importMeralco();
    const [draft] = await listDrafts(importId);
    await editDraft(draft!.id, { categoryId: null, description: "Power bill" });

    await suggestDrafts(importId, [suggestDining]);

    expect(await listDrafts(importId)).toMatchObject([
      { categoryId: null, categorySource: "member", description: "Power bill" },
    ]);
  });

  it("carries on past a suggester that fails", async () => {
    const importId = await importMeralco();

    await suggestDrafts(importId, [() => Promise.reject(new Error("offline")), suggestDining]);

    expect(await listDrafts(importId)).toMatchObject([{ categoryId: diningId }]);
  });
});

describe("drafts on a household switch", () => {
  it("are wiped, with their imports", async () => {
    await switchHousehold(HOUSEHOLD);
    await importMeralco();
    expect(await countDrafts()).toBe(1);

    await switchHousehold("22222222-2222-4222-8222-222222222222");

    expect(await countDrafts()).toBe(0);
    expect(await listImports()).toEqual([]);
  });
});
