import { beforeEach, describe, expect, it } from "vitest";
import { negateCents, parsePHP, sumCents, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed, receiveEvents } from "@/lib/events/log";
import { permutations } from "@/test/permutations";
import { readAccountMoney } from "@/lib/transactions/money";
import { createAccount, retireAccount } from "./accounts";
import { payCard, type PayCardInput } from "./cards";
import { addTransaction } from "./transactions";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

const peso = (amount: string): Cents => parsePHP(amount);

let bpiId: string;
let gcashId: string;
let visaId: string;

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

const payment = (overrides: Partial<PayCardInput> = {}): PayCardInput => ({
  cardId: visaId,
  fromAccountId: bpiId,
  amountCents: peso("3000"),
  date: "2026-10-12",
  ...overrides,
});

async function moneyOf(accountId: string) {
  const money = (await readAccountMoney()).get(accountId);
  if (!money) throw new Error(`No money for ${accountId}`);
  return money;
}

const cardPayment = async (accountId: string) =>
  (await moneyOf(accountId)).envelopes?.cardPayments.get(visaId);

const unassigned = async (accountId: string) => (await moneyOf(accountId)).envelopes?.unassigned;

beforeEach(async () => {
  await resetLocalDatabase();
  bpiId = await account("BPI", { startingBalanceCents: peso("20000") });
  gcashId = await account("GCash", { startingBalanceCents: peso("8000") });
  visaId = await account("Visa", { type: "credit_card", payingAccountId: bpiId });
  // ₱5,000 of card spending reserves ₱5,000 in BPI's Card Payment.
  await addTransaction(MEMBER, {
    type: "expense",
    amountCents: peso("5000"),
    accountId: visaId,
    categoryId: null,
    date: "2026-10-10",
  });
});

describe("payCard from the Paying Account", () => {
  it("writes one transfer and leaves the rest reserved", async () => {
    const before = (await listUnpushed(1000)).length;

    await payCard(MEMBER, payment());

    const written = (await listUnpushed(1000)).slice(before);
    expect(written.map((event) => event.eventType)).toEqual(["transfer.created"]);
    expect((await moneyOf(visaId)).balance).toBe(peso("2000"));
    expect(await cardPayment(bpiId)).toBe(peso("2000"));
    expect((await moneyOf(bpiId)).balance).toBe(peso("17000"));
    expect(await unassigned(bpiId)).toBe(peso("15000"));
  });
});

describe("payCard from another account", () => {
  it("moves the reservation there first, then pays: two allocations and the transfer", async () => {
    await payCard(MEMBER, payment());
    const before = (await listUnpushed(1000)).length;

    await payCard(MEMBER, payment({ fromAccountId: gcashId, amountCents: peso("2000") }));

    const written = (await listUnpushed(1000)).slice(before);
    expect(written.map((event) => [event.eventType, event.payload.accountId])).toEqual([
      ["allocation.created", bpiId],
      ["allocation.created", gcashId],
      ["transfer.created", undefined],
    ]);
    expect((await moneyOf(visaId)).balance).toBe(peso("0"));
    expect(await cardPayment(bpiId)).toBe(peso("0"));
    expect(await unassigned(bpiId)).toBe(peso("17000"));
    expect((await moneyOf(bpiId)).balance).toBe(peso("17000"));
    expect((await moneyOf(gcashId)).balance).toBe(peso("6000"));
    expect(await cardPayment(gcashId)).toBe(peso("0"));
    expect(await unassigned(gcashId)).toBe(peso("6000"));
  });
});

describe("a payment from another account on a second device", () => {
  it("keeps balance = Unassigned + category money + Card Payments in every arrival order", async () => {
    await payCard(MEMBER, payment());
    const setup = await listUnpushed(1000);
    await payCard(MEMBER, payment({ fromAccountId: gcashId, amountCents: peso("2000") }));
    const paying = (await listUnpushed(1000)).slice(setup.length);
    expect(paying).toHaveLength(3);

    for (const order of permutations(paying)) {
      await resetLocalDatabase();
      await receiveEvents(setup, 0);
      for (const arriving of order) {
        await receiveEvents([arriving], 0);
        const money = await readAccountMoney();
        for (const accountId of [bpiId, gcashId]) {
          const accountMoney = money.get(accountId);
          if (!accountMoney?.envelopes) throw new Error(`No envelopes for ${accountId}`);
          const { unassigned, categories, cardPayments } = accountMoney.envelopes;
          expect(accountMoney.balance).toBe(
            sumCents([unassigned, ...categories.values(), ...cardPayments.values()])
          );
        }
      }
      expect((await moneyOf(visaId)).balance).toBe(peso("0"));
      expect(await cardPayment(bpiId)).toBe(peso("0"));
      expect(await unassigned(bpiId)).toBe(peso("17000"));
      expect((await moneyOf(gcashId)).balance).toBe(peso("6000"));
      expect(await unassigned(gcashId)).toBe(peso("6000"));
    }
  });
});

describe("payCard from another account frees only what the Paying Account holds", () => {
  it("frees the whole reservation when paying more than it", async () => {
    await payCard(MEMBER, payment({ fromAccountId: gcashId, amountCents: peso("6000") }));

    expect(await cardPayment(bpiId)).toBe(peso("0"));
    expect(await unassigned(bpiId)).toBe(peso("20000"));
    expect(await unassigned(gcashId)).toBe(peso("2000"));
    // ₱1,000 more than it owed: the card now holds a credit.
    expect((await moneyOf(visaId)).balance).toBe(negateCents(peso("1000")));
  });

  it("moves nothing out of the Paying Account when it holds nothing", async () => {
    await payCard(MEMBER, payment({ amountCents: peso("5000") }));
    const before = (await listUnpushed(1000)).length;

    await payCard(MEMBER, payment({ fromAccountId: gcashId, amountCents: peso("1000") }));

    const written = (await listUnpushed(1000)).slice(before);
    expect(written.map((event) => [event.eventType, event.payload.accountId])).toEqual([
      ["allocation.created", gcashId],
      ["transfer.created", undefined],
    ]);
    expect(await cardPayment(bpiId)).toBe(peso("0"));
    expect(await unassigned(bpiId)).toBe(peso("15000"));
  });
});

describe("payCard refuses", () => {
  const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };

  async function expectRefused(input: PayCardInput, message: string) {
    const before = await listUnpushed(1000);
    await expect(payCard(MEMBER, input)).rejects.toThrow(message);
    expect(await listUnpushed(1000)).toEqual(before);
  }

  it("a destination that isn't a credit card", async () => {
    await expectRefused(payment({ cardId: gcashId }), "GCash isn't a credit card.");
  });

  it("a card as the payer", async () => {
    const mastercardId = await account("Mastercard", {
      type: "credit_card",
      payingAccountId: bpiId,
    });
    await expectRefused(
      payment({ fromAccountId: mastercardId }),
      "Pay Visa from a bank, cash or e-wallet account."
    );
  });

  it("a payer of another visibility", async () => {
    const mineId = await account("My savings", { visibility: "personal" });
    await expectRefused(
      payment({ fromAccountId: mineId }),
      "Choose an account seen by the same people as Visa."
    );
  });

  it("a personal payer of another owner", async () => {
    const theirsId = (
      await createAccount(OTHER_MEMBER, {
        name: "Their savings",
        type: "bank",
        startingBalanceCents: peso("0"),
        visibility: "personal",
      })
    ).id;
    const theirCardId = (
      await createAccount(OTHER_MEMBER, {
        name: "Their Visa",
        type: "credit_card",
        startingBalanceCents: peso("0"),
        payingAccountId: theirsId,
        visibility: "personal",
      })
    ).id;
    const mineId = await account("My savings", { visibility: "personal" });
    await expectRefused(
      payment({ cardId: theirCardId, fromAccountId: mineId }),
      "Choose an account seen by the same people as Their Visa."
    );
  });

  it("a retired payer", async () => {
    await retireAccount(MEMBER, gcashId);
    await expectRefused(payment({ fromAccountId: gcashId }), "GCash is retired.");
  });

  it("a retired card, before moving any reservation", async () => {
    await retireAccount(MEMBER, visaId);
    await expectRefused(payment({ fromAccountId: gcashId }), "Visa is retired.");
  });
});
