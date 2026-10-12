import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { sumCents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents, type LoggedEvent } from "@/lib/events/log";
import { listAccounts } from "@/lib/accounts/projection";
import { listAllocations } from "@/lib/allocations/projection";
import { readAccountMoney, sumAccountMoney, sumCategoryMoney, type AccountMoney } from "./money";
import { listTransactions } from "./projection";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
const WALLET = "aaaaaaaa-0000-4000-8000-000000000002";
const CARD = "aaaaaaaa-0000-4000-8000-000000000003";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";
const RENT = "cccccccc-0000-4000-8000-000000000002";

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
  event(
    id,
    "transaction",
    entityId,
    eventType,
    millis,
    {
      date: "2026-10-12",
      categoryId: null,
      payingAccountId: null,
      description: "",
      notes: "",
      status: "cleared",
      ...details,
    },
    2
  );

const txId = (n: number) => `dddddddd-0000-4000-8000-00000000000${n}`;

function expectBalanceEqualsEnvelopes(money: Map<string, AccountMoney>, accountIds: string[]) {
  for (const accountId of accountIds) {
    const accountMoney = money.get(accountId);
    if (!accountMoney?.envelopes) throw new Error(`No envelopes for ${accountId}`);
    const { unassigned, categories, cardPayments } = accountMoney.envelopes;
    expect(accountMoney.balance).toBe(
      sumCents([unassigned, ...categories.values(), ...cardPayments.values()])
    );
  }
}

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
    payingAccountId: BANK,
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
        envelopes: {
          unassigned: 200000,
          categories: new Map([[GROCERIES, -45000]]),
          cardPayments: new Map([[CARD, 20000]]),
        },
      });
      expect(money.get(WALLET)).toEqual({
        balance: -30000,
        cleared: -30000,
        pending: 0,
        envelopes: {
          unassigned: 0,
          categories: new Map([[GROCERIES, -30000]]),
          cardPayments: new Map(),
        },
      });
      // A card's balance is what it owes: purchases raise it.
      expect(money.get(CARD)).toEqual({
        balance: 70000,
        cleared: 70000,
        pending: 0,
        envelopes: null,
      });
      expectBalanceEqualsEnvelopes(money, [BANK, WALLET]);
    }
  );

  describe("card transactions reserve money in the Paying Account they recorded", () => {
    const onCard = (details: Record<string, unknown>) => ({
      accountId: CARD,
      payingAccountId: BANK,
      categoryId: GROCERIES,
      ...details,
    });
    const purchase = transaction(
      "c-purchase",
      txId(1),
      1000,
      onCard({
        type: "expense",
        amountCents: 20000,
      })
    );
    const refund = transaction(
      "c-refund",
      txId(2),
      2000,
      onCard({
        type: "income",
        amountCents: 5000,
      })
    );
    const uncategorized = transaction(
      "c-uncategorized",
      txId(3),
      3000,
      onCard({
        type: "expense",
        amountCents: 10000,
        categoryId: null,
      })
    );
    const bankExpense = transaction("c-bank-expense", txId(4), 4000, {
      type: "expense",
      amountCents: 8000,
      accountId: BANK,
      categoryId: GROCERIES,
    });
    const movedOntoCard = transaction(
      "c-moved-onto-card",
      txId(4),
      4500,
      onCard({ type: "expense", amountCents: 8000 }),
      "transaction.edited"
    );
    const removedPurchase = transaction(
      "c-removed-purchase",
      txId(5),
      5000,
      onCard({
        type: "expense",
        amountCents: 4000,
      })
    );
    const removal = event("c-removal", "transaction", txId(5), "transaction.removed", 5500);
    const uncategorizedRefund = transaction(
      "c-uncategorized-refund",
      txId(6),
      6000,
      onCard({ type: "income", amountCents: 3000, categoryId: null })
    );
    const offCardLater = transaction(
      "c-off-card-later",
      txId(7),
      7000,
      onCard({ type: "expense", amountCents: 6000 })
    );
    const movedOffCard = transaction(
      "c-moved-off-card",
      txId(7),
      7500,
      { type: "expense", amountCents: 6000, accountId: WALLET, categoryId: GROCERIES },
      "transaction.edited"
    );
    const cardRepointed = event(
      "c-card-repointed",
      "account",
      CARD,
      "account.edited",
      6000,
      { name: "Card", type: "credit_card", startingBalanceCents: 50000, payingAccountId: WALLET },
      2
    );

    it.each(orders([refund, uncategorized, movedOntoCard, removal, movedOffCard, cardRepointed]))(
      "sums the same money from events in the order %j",
      async (_ids, order) => {
        await receiveEvents(
          [
            bank,
            wallet,
            card,
            purchase,
            bankExpense,
            removedPurchase,
            uncategorizedRefund,
            offCardLater,
          ],
          0
        );
        for (const arriving of order) await receiveEvents([arriving], 0);

        const money = await readAccountMoney();
        // The starting amount owed reserves nothing; members allocate it themselves.
        expect(money.get(CARD)).toEqual({
          balance: 80000,
          cleared: 80000,
          pending: 0,
          envelopes: null,
        });
        // The reservations stay in the Bank after the card's default moved to the Wallet.
        expect(money.get(BANK)).toEqual({
          balance: 100000,
          cleared: 100000,
          pending: 0,
          envelopes: {
            unassigned: 93000,
            categories: new Map([[GROCERIES, -23000]]),
            cardPayments: new Map([[CARD, 30000]]),
          },
        });
        expect(money.get(WALLET)).toEqual({
          balance: -6000,
          cleared: -6000,
          pending: 0,
          envelopes: {
            unassigned: 0,
            categories: new Map([[GROCERIES, -6000]]),
            cardPayments: new Map(),
          },
        });
        expectBalanceEqualsEnvelopes(money, [BANK, WALLET]);
      }
    );

    it("reserves nothing for a card transaction recorded before it carried the Paying Account", async () => {
      const recordedByV1 = event(
        "c-v1",
        "transaction",
        txId(8),
        "transaction.created",
        8000,
        {
          date: "2026-10-12",
          type: "expense",
          amountCents: 7000,
          accountId: CARD,
          categoryId: GROCERIES,
          description: "",
          notes: "",
          status: "cleared",
        },
        1
      );
      await receiveEvents([bank, card, recordedByV1], 0);

      const money = await readAccountMoney();
      expect(money.get(CARD)?.balance).toBe(57000);
      expect(money.get(BANK)?.envelopes).toEqual({
        unassigned: 100000,
        categories: new Map(),
        cardPayments: new Map(),
      });
    });
  });

  describe("allocations move money inside one account", () => {
    const allocationId = (n: number) => `eeeeeeee-0000-4000-8000-00000000000${n}`;
    const allocation = (
      id: string,
      entityId: string,
      millis: number,
      details: Record<string, unknown>,
      eventType = "allocation.created"
    ) =>
      event(id, "allocation", entityId, eventType, millis, {
        date: "2026-10-12",
        accountId: BANK,
        from: { kind: "unassigned" },
        ...details,
      });
    const toGroceries = { kind: "category", id: GROCERIES };

    const intoGroceries = allocation("m-groceries", allocationId(1), 1000, {
      to: toGroceries,
      amountCents: 30000,
    });
    const intoGroceriesEdited = allocation(
      "m-groceries-edited",
      allocationId(1),
      1500,
      { to: toGroceries, amountCents: 40000 },
      "allocation.edited"
    );
    const intoCardPayment = allocation("m-card-payment", allocationId(2), 2000, {
      from: toGroceries,
      to: { kind: "card_payment", id: CARD },
      amountCents: 10000,
    });
    const undone = allocation("m-undone", allocationId(3), 3000, {
      to: toGroceries,
      amountCents: 5000,
    });
    const undoneRemoved = event(
      "m-undone-removed",
      "allocation",
      allocationId(3),
      "allocation.removed",
      3500
    );
    const undoneRestored = event(
      "m-undone-restored",
      "allocation",
      allocationId(3),
      "allocation.restored",
      3800
    );
    const onCard = allocation("m-on-card", allocationId(4), 4000, {
      accountId: CARD,
      to: toGroceries,
      amountCents: 7000,
    });
    // More than the Bank's Unassigned holds: it goes negative.
    const overspent = allocation("m-overspent", allocationId(5), 5000, {
      to: { kind: "category", id: RENT },
      amountCents: 200000,
    });
    const inWallet = allocation("m-wallet", allocationId(6), 6000, {
      accountId: WALLET,
      to: toGroceries,
      amountCents: 2000,
    });
    const spent = transaction("m-spent", txId(1), 500, {
      type: "expense",
      amountCents: 15000,
      accountId: BANK,
      categoryId: GROCERIES,
    });

    it.each(
      orders([
        intoGroceries,
        intoGroceriesEdited,
        undoneRemoved,
        undoneRestored,
        intoCardPayment,
        overspent,
      ])
    )("sums the same money from events in the order %j", async (_ids, order) => {
      await receiveEvents([bank, wallet, card, spent, undone, onCard, inWallet], 0);
      for (const arriving of order) await receiveEvents([arriving], 0);

      const money = await readAccountMoney();
      expect(money.get(BANK)).toEqual({
        balance: 85000,
        cleared: 85000,
        pending: 0,
        envelopes: {
          unassigned: -145000,
          categories: new Map([
            [GROCERIES, 20000],
            [RENT, 200000],
          ]),
          cardPayments: new Map([[CARD, 10000]]),
        },
      });
      expect(money.get(WALLET)?.envelopes?.unassigned).toBe(-2000);
      // An allocation on a card moves nothing: a card holds no envelopes.
      expect(money.get(CARD)).toMatchObject({ balance: 50000, envelopes: null });
      expectBalanceEqualsEnvelopes(money, [BANK, WALLET]);

      expect(sumCategoryMoney(money)).toEqual(
        new Map([
          [
            GROCERIES,
            {
              total: 22000,
              byAccount: new Map([
                [BANK, 20000],
                [WALLET, 2000],
              ]),
            },
          ],
          [RENT, { total: 200000, byAccount: new Map([[BANK, 200000]]) }],
        ])
      );
    });
  });

  it("sums 10,000 transactions for the Categories screen in under 50 ms", async () => {
    const many = Array.from({ length: 10_000 }, (_, index) =>
      transaction(`t-${index}`, crypto.randomUUID(), 10_000 + index, {
        type: index % 3 === 0 ? "income" : "expense",
        amountCents: 100 + index,
        accountId: index % 2 === 0 ? BANK : WALLET,
        categoryId: index % 4 === 0 ? null : GROCERIES,
      })
    );
    const moves = Array.from({ length: 500 }, (_, index) =>
      event(`m-${index}`, "allocation", crypto.randomUUID(), "allocation.created", 30_000 + index, {
        date: "2026-10-12",
        accountId: index % 2 === 0 ? BANK : WALLET,
        from: { kind: "unassigned" },
        to: { kind: "category", id: index % 3 === 0 ? RENT : GROCERIES },
        amountCents: 100 + index,
      })
    );
    await receiveEvents([bank, wallet, ...many, ...moves], 0);

    const [accounts, transactions, allocations] = await Promise.all([
      listAccounts(),
      listTransactions(),
      listAllocations(),
    ]);
    const started = performance.now();
    const money = sumAccountMoney(accounts, transactions, allocations);
    const categoryMoney = sumCategoryMoney(money);
    const elapsed = performance.now() - started;

    expect(money.size).toBe(2);
    expect(categoryMoney.size).toBe(2);
    expect(elapsed).toBeLessThan(50);
  });
});
