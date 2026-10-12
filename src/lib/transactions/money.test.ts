import { beforeEach, describe, expect, it } from "vitest";
import { sumCents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { listAccounts } from "@/lib/accounts/projection";
import { readAccountMoney, sumAccountMoney, type AccountMoney } from "./money";
import { listTransactions } from "./projection";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
const WALLET = "aaaaaaaa-0000-4000-8000-000000000002";
const CARD = "aaaaaaaa-0000-4000-8000-000000000003";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

const hlcAt = (millis: number) => `${String(millis).padStart(15, "0")}-000000-device-b`;

function event(
  id: string,
  entityType: string,
  entityId: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {},
  eventVersion = 1
): LoggedEvent {
  return {
    id,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    entityType,
    entityId,
    eventType,
    eventVersion,
    hlc: hlcAt(millis),
    deviceId: "device-b",
    actorUserId: "user-b",
    payload,
  };
}

const account = (id: string, entityId: string, millis: number, details: Record<string, unknown>) =>
  event(
    id,
    "account",
    entityId,
    "account.created",
    millis,
    { payingAccountId: null, ...details },
    2
  );

const transaction = (
  id: string,
  entityId: string,
  millis: number,
  details: Record<string, unknown>,
  eventType = "transaction.created"
) =>
  event(id, "transaction", entityId, eventType, millis, {
    date: "2026-10-12",
    categoryId: null,
    description: "",
    notes: "",
    status: "cleared",
    ...details,
  });

const txId = (n: number) => `dddddddd-0000-4000-8000-00000000000${n}`;

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ])
  );
}

const orders = (events: LoggedEvent[]) =>
  permutations(events).map((order) => [order.map((event) => event.id), order] as const);

const categoryTotal = (money: AccountMoney) =>
  money.envelopes ? sumCents(money.envelopes.categories.values()) : 0;

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("account money", () => {
  const bank = account("a-bank", BANK, 100, {
    name: "Bank",
    type: "bank",
    startingBalanceCents: 100000,
  });
  const wallet = account("a-wallet", WALLET, 200, {
    name: "Wallet",
    type: "cash",
    startingBalanceCents: 0,
  });
  const card = account("a-card", CARD, 300, {
    name: "Card",
    type: "credit_card",
    startingBalanceCents: 50000,
    payingAccountId: BANK,
  });
  const groceries = transaction("t-groceries", txId(1), 1000, {
    type: "expense",
    amountCents: 25000,
    accountId: BANK,
    categoryId: GROCERIES,
  });
  const salary = transaction("t-salary", txId(2), 2000, {
    type: "income",
    amountCents: 100000,
    accountId: BANK,
    status: "pending",
  });
  const snack = transaction("t-snack", txId(3), 3000, {
    type: "expense",
    amountCents: 30000,
    accountId: BANK,
  });
  // Recorded on the bank, then moved to the wallet and given a category.
  const snackMoved = transaction(
    "t-snack-moved",
    txId(3),
    3500,
    { type: "expense", amountCents: 30000, accountId: WALLET, categoryId: GROCERIES },
    "transaction.edited"
  );
  const refund = transaction("t-refund", txId(4), 4000, {
    type: "income",
    amountCents: 5000,
    accountId: BANK,
    categoryId: GROCERIES,
  });
  const refundRemoved = event(
    "t-refund-removed",
    "transaction",
    txId(4),
    "transaction.removed",
    4500
  );
  const cardPurchase = transaction("t-card", txId(5), 5000, {
    type: "expense",
    amountCents: 20000,
    accountId: CARD,
    categoryId: GROCERIES,
  });

  it.each(orders([wallet, salary, snack, snackMoved, refund, refundRemoved]))(
    "sums the same money from events in the order %j",
    async (_ids, order) => {
      await receiveEvents([bank, card, groceries, cardPurchase], 0);
      for (const arriving of order) await receiveEvents([arriving], 0);

      const money = await readAccountMoney();
      expect(money.get(BANK)).toEqual({
        balance: 175000,
        cleared: 75000,
        pending: 100000,
        envelopes: { unassigned: 200000, categories: new Map([[GROCERIES, -25000]]) },
      });
      expect(money.get(WALLET)).toEqual({
        balance: -30000,
        cleared: -30000,
        pending: 0,
        envelopes: { unassigned: 0, categories: new Map([[GROCERIES, -30000]]) },
      });
      // A card's balance is what it owes: purchases raise it. Its envelopes come with #50.
      expect(money.get(CARD)).toEqual({
        balance: 70000,
        cleared: 70000,
        pending: 0,
        envelopes: null,
      });
      for (const accountId of [BANK, WALLET]) {
        const accountMoney = money.get(accountId);
        if (!accountMoney?.envelopes) throw new Error(`No envelopes for ${accountId}`);
        expect(accountMoney.balance).toBe(
          accountMoney.envelopes.unassigned + categoryTotal(accountMoney)
        );
      }
    }
  );

  it("sums 10,000 transactions for the Categories screen in under 50 ms", async () => {
    const many = Array.from({ length: 10_000 }, (_, index) =>
      transaction(`t-${index}`, crypto.randomUUID(), 10_000 + index, {
        type: index % 3 === 0 ? "income" : "expense",
        amountCents: 100 + index,
        accountId: index % 2 === 0 ? BANK : WALLET,
        categoryId: index % 4 === 0 ? null : GROCERIES,
      })
    );
    await receiveEvents([bank, wallet, ...many], 0);

    const [accounts, transactions] = await Promise.all([listAccounts(), listTransactions()]);
    const started = performance.now();
    const money = sumAccountMoney(accounts, transactions);
    const elapsed = performance.now() - started;

    expect(money.size).toBe(2);
    expect(elapsed).toBeLessThan(50);
  });
});
