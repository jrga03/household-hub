import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { readAccountMoney, sumCategoryMoney } from "./money";
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
  describe("transfers move money and its envelope between accounts", () => {
    const transferId = (n: number) => `ffffffff-0000-4000-8000-00000000000${n}`;
    const transfer = (
      id: string,
      entityId: string,
      millis: number,
      details: Record<string, unknown>,
      eventType = "transfer.created"
    ) =>
      event(id, "transfer", entityId, eventType, millis, {
        date: "2026-10-12",
        description: "",
        notes: "",
        ...(eventType === "transfer.created" ? { status: "cleared" } : {}),
        ...details,
      });
    const groceriesEnvelope = { kind: "category", id: GROCERIES };

    const intoGroceries = event("x-allocated", "allocation", txId(9), "allocation.created", 500, {
      date: "2026-10-12",
      accountId: BANK,
      from: { kind: "unassigned" },
      to: groceriesEnvelope,
      amountCents: 50000,
    });
    const cardPurchase = transaction("x-card-purchase", txId(1), 600, {
      type: "expense",
      amountCents: 20000,
      accountId: CARD,
      categoryId: GROCERIES,
      payingAccountId: BANK,
    });
    const toWallet = transfer("x-to-wallet", transferId(1), 1000, {
      amountCents: 20000,
      fromAccountId: BANK,
      toAccountId: WALLET,
      envelope: groceriesEnvelope,
    });
    const toWalletEdited = transfer(
      "x-to-wallet-edited",
      transferId(1),
      1500,
      { amountCents: 30000, fromAccountId: BANK, toAccountId: WALLET, envelope: groceriesEnvelope },
      "transfer.edited"
    );
    const toWalletPending = event(
      "x-to-wallet-pending",
      "transfer",
      transferId(1),
      "transfer.marked_pending",
      1800
    );
    const back = transfer("x-back", transferId(2), 2000, {
      amountCents: 5000,
      fromAccountId: WALLET,
      toAccountId: BANK,
      envelope: { kind: "unassigned" },
    });
    const backRemoved = event(
      "x-back-removed",
      "transfer",
      transferId(2),
      "transfer.removed",
      2500
    );
    // Paying the card: from the Bank's Card Payment for it, into the card.
    const payCard = transfer("x-pay-card", transferId(3), 3000, {
      amountCents: 15000,
      fromAccountId: BANK,
      toAccountId: CARD,
      envelope: { kind: "card_payment", id: CARD },
    });

    it.each(orders([toWallet, toWalletEdited, toWalletPending, back, backRemoved, payCard]))(
      "sums the same money from events in the order %j",
      async (_ids, order) => {
        await receiveEvents([bank, wallet, card, intoGroceries, cardPurchase], 0);
        for (const arriving of order) await receiveEvents([arriving], 0);

        const money = await readAccountMoney();
        expect(money.get(BANK)).toEqual({
          balance: 55000,
          cleared: 85000,
          pending: -30000,
          envelopes: {
            unassigned: 50000,
            categories: new Map([[GROCERIES, 0]]),
            cardPayments: new Map([[CARD, 5000]]),
          },
        });
        expect(money.get(WALLET)).toEqual({
          balance: 30000,
          cleared: 0,
          pending: 30000,
          envelopes: {
            unassigned: 0,
            categories: new Map([[GROCERIES, 30000]]),
            cardPayments: new Map(),
          },
        });
        // Paying the card lowers what it owes.
        expect(money.get(CARD)).toEqual({
          balance: 55000,
          cleared: 55000,
          pending: 0,
          envelopes: null,
        });
        expectBalanceEqualsEnvelopes(money, [BANK, WALLET]);
        // Groceries keeps its total, split differently per account.
        expect(sumCategoryMoney(money).get(GROCERIES)).toEqual({
          total: 30000,
          byAccount: new Map([
            [BANK, 0],
            [WALLET, 30000],
          ]),
        });
      }
    );

    it("counts a transfer received twice once", async () => {
      await receiveEvents([bank, wallet, toWallet, toWalletEdited], 0);
      await receiveEvents([toWallet, toWalletEdited, toWallet], 0);

      const money = await readAccountMoney();
      expect(money.get(BANK)?.balance).toBe(70000);
      expect(money.get(WALLET)?.balance).toBe(30000);
      expectBalanceEqualsEnvelopes(money, [BANK, WALLET]);
    });

    it("raises what a card owes when money leaves it", async () => {
      const outOfCard = transfer("x-out-of-card", transferId(4), 4000, {
        amountCents: 10000,
        fromAccountId: CARD,
        toAccountId: WALLET,
        envelope: { kind: "unassigned" },
      });
      await receiveEvents([bank, wallet, card, outOfCard], 0);

      const money = await readAccountMoney();
      expect(money.get(CARD)?.balance).toBe(60000);
      expect(money.get(WALLET)?.envelopes?.unassigned).toBe(10000);
      expectBalanceEqualsEnvelopes(money, [BANK, WALLET]);
    });

    it("moves only the side whose account is on this device", async () => {
      const elsewhere = "aaaaaaaa-0000-4000-8000-000000000009";
      const toUnknown = transfer("x-to-unknown", transferId(5), 5000, {
        amountCents: 10000,
        fromAccountId: BANK,
        toAccountId: elsewhere,
        envelope: { kind: "unassigned" },
      });
      await receiveEvents([bank, toUnknown], 0);

      const money = await readAccountMoney();
      expect(money.get(BANK)?.balance).toBe(90000);
      expectBalanceEqualsEnvelopes(money, [BANK]);
    });
  });
});
