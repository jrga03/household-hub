import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readAccountMoney, sumCategoryMoney } from "./money";
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
});
