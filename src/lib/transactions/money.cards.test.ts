import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readAccountMoney } from "./money";
import {
  BANK,
  CARD,
  GROCERIES,
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
});
