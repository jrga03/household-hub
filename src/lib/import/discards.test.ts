import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePHP } from "@/lib/currency";
import { createAccount } from "@/lib/commands/accounts";
import { saveDrafts } from "@/lib/commands/drafts";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { switchHousehold } from "@/lib/events/log";
import { HOUSEHOLD } from "@/test/events";
import { countDrafts, createImport, discardDrafts, listDrafts } from "./drafts";
import { readImportReview } from "./review";

vi.mock("@/lib/sentry", () => ({ reportError: vi.fn() }));

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

let cardId: string;

beforeEach(async () => {
  await resetLocalDatabase();
  await switchHousehold(HOUSEHOLD);
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
});

afterEach(() => {
  vi.useRealTimers();
});

const importStatement = () =>
  createImport({
    formatId: "bdo-credit-card-pdf",
    fileName: "september.pdf",
    accountId: cardId,
    lines: [
      {
        purchaseDate: "2026-09-03",
        postingDate: "2026-09-05",
        description: "MERALCO",
        amount: parsePHP("3200"),
        type: "expense",
        isCardPayment: false,
      },
    ],
  });

const onDate = (iso: string) => vi.useFakeTimers({ now: new Date(iso), toFake: ["Date"] });

async function importAndDiscard() {
  const importId = await importStatement();
  await discardDrafts((await listDrafts(importId)).map((draft) => draft.id));
}

async function reimportedFlag() {
  await importStatement();
  const [statement] = await readImportReview();
  return statement?.drafts[0]?.flag ?? null;
}

describe("a discarded line, imported again on this device", () => {
  it("reads Discarded before", async () => {
    await importAndDiscard();

    expect(await reimportedFlag()).toEqual({ kind: "discarded-before" });
  });

  it("is not remembered when the draft was saved", async () => {
    const importId = await importStatement();
    const [draft] = await listDrafts(importId);
    await saveDrafts(MEMBER, [draft!.id]);

    expect((await reimportedFlag())?.kind).toBe("already-imported");
  });

  it("is forgotten 6 months after the discard", async () => {
    onDate("2026-01-10T00:00:00Z");
    await importAndDiscard();

    onDate("2026-07-11T00:00:00Z");

    expect(await reimportedFlag()).toBeNull();
  });

  it("is remembered for 6 months from its latest discard", async () => {
    onDate("2026-01-10T00:00:00Z");
    await importAndDiscard();
    onDate("2026-06-01T00:00:00Z");
    await importAndDiscard();

    onDate("2026-07-11T00:00:00Z");

    expect(await reimportedFlag()).toEqual({ kind: "discarded-before" });
  });

  it("is forgotten on a household switch, and never counts as unsaved work", async () => {
    await importAndDiscard();
    expect(await countDrafts()).toBe(0);

    await switchHousehold("22222222-2222-4222-8222-222222222222");
    await switchHousehold(HOUSEHOLD);

    expect(await reimportedFlag()).toBeNull();
  });
});
