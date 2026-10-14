import { beforeEach, describe, expect, it } from "vitest";
import { negateCents, parsePHP, sumCents, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import type { Envelope } from "@/lib/allocations/events";
import { readAccountMoney, type AccountMoney } from "@/lib/transactions/money";
import { listUnpushed, receiveEvents } from "@/lib/events/log";
import { getBalanceCorrection, listBalanceCorrections } from "@/lib/corrections/projection";
import { createAccount, retireAccount } from "./accounts";
import { createCategory, createGroup, retireCategory } from "./categories";
import {
  recordBalanceCorrection,
  removeBalanceCorrection,
  removeBalanceCorrections,
  restoreBalanceCorrection,
  restoreBalanceCorrections,
  type CorrectionInput,
} from "./corrections";
import { addTransaction } from "./transactions";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

const peso = (amount: string): Cents => parsePHP(amount);

let bankId: string;
let groceriesId: string;

const category = (id: string): Envelope & { kind: "category" } => ({ kind: "category", id });

const correction = (overrides: Partial<CorrectionInput> = {}): CorrectionInput => ({
  accountId: bankId,
  date: "2026-10-12",
  actualBalanceCents: peso("9650"),
  envelope: category(groceriesId),
  ...overrides,
});

const spend = (amount: string, date: string, overrides: Record<string, unknown> = {}) =>
  addTransaction(MEMBER, {
    date,
    type: "expense",
    amountCents: peso(amount),
    accountId: bankId,
    categoryId: groceriesId,
    description: "Market",
    ...overrides,
  });

async function account(name: string, overrides: Record<string, unknown> = {}) {
  return (
    await createAccount(MEMBER, {
      name,
      type: "bank",
      startingBalanceCents: peso("0"),
      ...overrides,
    })
  ).id;
}

/** Balance = Unassigned + category money + Card Payments. */
function envelopesTotal(money: AccountMoney | undefined): Cents | undefined {
  const envelopes = money?.envelopes;
  if (!envelopes) return undefined;
  return sumCents([
    envelopes.unassigned,
    ...envelopes.categories.values(),
    ...envelopes.cardPayments.values(),
  ]);
}

beforeEach(async () => {
  await resetLocalDatabase();
  bankId = await account("BPI", { startingBalanceCents: peso("10000") });
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
});

describe("recordBalanceCorrection", () => {
  it("records the shortfall so the cleared balance equals the one entered", async () => {
    await recordBalanceCorrection(MEMBER, correction());

    const bank = (await readAccountMoney()).get(bankId);
    expect(bank).toMatchObject({ cleared: 965000, balance: 965000 });
    expect(bank?.envelopes?.categories.get(groceriesId)).toBe(-35000);
    expect(envelopesTotal(bank)).toBe(965000);
  });

  it("records the account, date, signed difference and envelope, seen like its account", async () => {
    const recorded = await recordBalanceCorrection(MEMBER, correction());

    expect(await listBalanceCorrections()).toMatchObject([
      {
        id: recorded?.id,
        accountId: bankId,
        date: "2026-10-12",
        amountCents: 35000,
        direction: "lower",
        envelope: category(groceriesId),
        payingAccountId: null,
        visibility: "household",
        ownerUserId: null,
      },
    ]);
  });

  it("adds a surplus to Unassigned", async () => {
    await recordBalanceCorrection(
      MEMBER,
      correction({ actualBalanceCents: peso("10500"), envelope: { kind: "unassigned" } })
    );

    const bank = (await readAccountMoney()).get(bankId);
    expect(bank).toMatchObject({ cleared: 1050000 });
    expect(bank?.envelopes?.unassigned).toBe(1050000);
    expect(envelopesTotal(bank)).toBe(1050000);
  });

  it("draws a shortfall below zero from the chosen category", async () => {
    await recordBalanceCorrection(MEMBER, correction({ actualBalanceCents: peso("9000") }));

    const bank = (await readAccountMoney()).get(bankId);
    expect(bank?.envelopes?.categories.get(groceriesId)).toBe(-100000);
    expect(envelopesTotal(bank)).toBe(900000);
  });

  it("measures against the cleared balance at the end of the date, not later ones", async () => {
    await spend("200", "2026-10-10");
    await spend("300", "2026-10-13");

    await recordBalanceCorrection(
      MEMBER,
      correction({ date: "2026-10-11", actualBalanceCents: peso("9700") })
    );

    expect(await listBalanceCorrections()).toMatchObject([
      { amountCents: 10000, direction: "lower" },
    ]);
    expect((await readAccountMoney()).get(bankId)).toMatchObject({ cleared: 940000 });
  });

  it("ignores pending transactions", async () => {
    await spend("500", "2026-10-11", { status: "pending" });

    await recordBalanceCorrection(MEMBER, correction({ actualBalanceCents: peso("10000") }));

    expect(await listBalanceCorrections()).toEqual([]);
  });

  it("records nothing when the balance already matches", async () => {
    const recorded = await recordBalanceCorrection(
      MEMBER,
      correction({ actualBalanceCents: peso("10000") })
    );

    expect(recorded).toBeNull();
    expect(
      (await listUnpushed(1000)).filter((event) => event.entityType === "balance_correction")
    ).toEqual([]);
  });

  it("counts an earlier correction in the balance it measures against", async () => {
    await recordBalanceCorrection(MEMBER, correction({ date: "2026-10-10" }));

    const again = await recordBalanceCorrection(MEMBER, correction());

    expect(again).toBeNull();
  });

  it("is reversed by a removal and brought back by a restore", async () => {
    const recorded = await recordBalanceCorrection(MEMBER, correction());
    const id = recorded?.id ?? "";

    await removeBalanceCorrection(MEMBER, id);
    expect((await readAccountMoney()).get(bankId)).toMatchObject({ cleared: 1000000 });
    expect(await getBalanceCorrection(id)).toMatchObject({ removed: true });

    await restoreBalanceCorrection(MEMBER, id);
    expect((await readAccountMoney()).get(bankId)).toMatchObject({ cleared: 965000 });
  });

  it("removes and restores several, skipping one already removed", async () => {
    const first = await recordBalanceCorrection(MEMBER, correction({ date: "2026-10-10" }));
    const second = await recordBalanceCorrection(
      MEMBER,
      correction({ actualBalanceCents: peso("9000") })
    );
    const ids = [first?.id ?? "", second?.id ?? ""];
    await removeBalanceCorrection(MEMBER, ids[0] ?? "");

    expect(await removeBalanceCorrections(MEMBER, ids)).toEqual({
      changed: [ids[1]],
      failed: [],
    });
    expect(await listBalanceCorrections()).toEqual([]);

    expect((await restoreBalanceCorrections(MEMBER, ids)).changed).toEqual(ids);
    expect((await readAccountMoney()).get(bankId)).toMatchObject({ cleared: 900000 });
  });

  it.each([
    ["a future date", { date: "2999-01-01" }, "Choose today or an earlier date."],
    ["an impossible date", { date: "2026-02-30" }, "Choose a date."],
  ])("refuses %s", async (_case, overrides, message) => {
    await expect(recordBalanceCorrection(MEMBER, correction(overrides))).rejects.toThrow(message);
  });

  it("refuses a retired account", async () => {
    await retireAccount(MEMBER, bankId);

    await expect(recordBalanceCorrection(MEMBER, correction())).rejects.toThrow("BPI is retired");
  });

  it("refuses a retired category", async () => {
    await retireCategory(MEMBER, groceriesId);

    await expect(recordBalanceCorrection(MEMBER, correction())).rejects.toThrow(
      "Groceries is retired"
    );
  });

  it("refuses a category the account's people don't see", async () => {
    const mine = await createGroup(MEMBER, { name: "Mine", visibility: "personal" });
    const travelId = (await createCategory(MEMBER, { name: "Travel", groupId: mine.id })).id;

    await expect(
      recordBalanceCorrection(MEMBER, correction({ envelope: category(travelId) }))
    ).rejects.toThrow("Choose a Household category for BPI.");
  });

  it("refuses a difference larger than any record can hold", async () => {
    await expect(
      recordBalanceCorrection(MEMBER, correction({ actualBalanceCents: peso("9999999") }))
    ).resolves.not.toBeNull();
    await expect(
      recordBalanceCorrection(
        MEMBER,
        correction({ actualBalanceCents: negateCents(peso("9999999")) })
      )
    ).rejects.toThrow("The amount must be more than zero");
  });
});

describe("recordBalanceCorrection on a credit card", () => {
  let cardId: string;

  beforeEach(async () => {
    cardId = await account("Visa", { type: "credit_card", payingAccountId: bankId });
  });

  it("moves what the card owes more from the envelope into its Card Payment", async () => {
    await recordBalanceCorrection(
      MEMBER,
      correction({ accountId: cardId, actualBalanceCents: peso("1200") })
    );

    const money = await readAccountMoney();
    expect(money.get(cardId)).toMatchObject({ cleared: 120000, balance: 120000 });
    const bank = money.get(bankId);
    expect(bank).toMatchObject({ balance: 1000000 });
    expect(bank?.envelopes?.categories.get(groceriesId)).toBe(-120000);
    expect(bank?.envelopes?.cardPayments.get(cardId)).toBe(120000);
    expect(envelopesTotal(bank)).toBe(1000000);
    expect(await listBalanceCorrections()).toMatchObject([
      { direction: "raise", payingAccountId: bankId },
    ]);
  });

  it("moves what it owes less back from the Card Payment into the envelope", async () => {
    await addTransaction(MEMBER, {
      date: "2026-10-10",
      type: "expense",
      amountCents: peso("1000"),
      accountId: cardId,
      categoryId: groceriesId,
      description: "Market",
    });

    await recordBalanceCorrection(
      MEMBER,
      correction({ accountId: cardId, actualBalanceCents: peso("800") })
    );

    const money = await readAccountMoney();
    expect(money.get(cardId)).toMatchObject({ cleared: 80000 });
    expect(money.get(bankId)?.envelopes?.cardPayments.get(cardId)).toBe(80000);
    expect(money.get(bankId)?.envelopes?.categories.get(groceriesId)).toBe(-80000);
  });

  it("refuses a card whose Paying Account isn't on this device yet", async () => {
    const elsewhereCard = "aaaaaaaa-0000-4000-8000-0000000000c1";
    await receiveEvents(
      [
        {
          id: crypto.randomUUID(),
          householdId: HOUSEHOLD,
          visibility: "household",
          ownerUserId: null,
          entityType: "account",
          entityId: elsewhereCard,
          eventType: "account.created",
          eventVersion: 2,
          hlc: "000000000001000-000000-device-b",
          deviceId: "device-b",
          actorUserId: "user-b",
          payload: {
            name: "Amex",
            type: "credit_card",
            startingBalanceCents: 0,
            payingAccountId: "aaaaaaaa-0000-4000-8000-0000000000ff",
          },
        },
      ],
      0
    );

    await expect(
      recordBalanceCorrection(
        MEMBER,
        correction({ accountId: elsewhereCard, actualBalanceCents: peso("100") })
      )
    ).rejects.toThrow("Choose the account Amex is paid from first.");
  });
});
