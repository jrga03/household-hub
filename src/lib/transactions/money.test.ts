import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { listAccounts } from "@/lib/accounts/projection";
import { listAllocations } from "@/lib/allocations/projection";
import { listTransfers } from "@/lib/transfers/projection";
import { listTransactions } from "./projection";
import { readAccountMoney, sumAccountMoney, sumCategoryMoney } from "./money";
import {
  BANK,
  CARD,
  GROCERIES,
  RENT,
  WALLET,
  bank,
  card,
  event,
  expectBalanceEqualsEnvelopes,
  transaction,
  txId,
  wallet,
} from "./money.fixtures";

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("account money", () => {
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

  it("sums 10,000 transactions, allocations and transfers for the Categories screen in under 50 ms", async () => {
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
    const transfers = Array.from({ length: 500 }, (_, index) =>
      event(`x-${index}`, "transfer", crypto.randomUUID(), "transfer.created", 40_000 + index, {
        date: "2026-10-12",
        amountCents: 100 + index,
        fromAccountId: index % 2 === 0 ? BANK : WALLET,
        toAccountId: index % 2 === 0 ? WALLET : BANK,
        envelope: { kind: "category", id: GROCERIES },
        status: "cleared",
      })
    );
    await receiveEvents([bank, wallet, ...many, ...moves, ...transfers], 0);

    const [accounts, transactions, allocations, transferRows] = await Promise.all([
      listAccounts(),
      listTransactions(),
      listAllocations(),
      listTransfers(),
    ]);
    expect(transferRows).toHaveLength(500);
    const started = performance.now();
    const money = sumAccountMoney({
      accounts,
      transactions,
      allocations,
      transfers: transferRows,
      corrections: [],
    });
    const categoryMoney = sumCategoryMoney(money);
    const elapsed = performance.now() - started;

    expect(money.size).toBe(2);
    expect(categoryMoney.size).toBe(2);
    expect(elapsed).toBeLessThan(50);
  });
});
