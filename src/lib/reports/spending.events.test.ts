import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/dexie/db";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import {
  BANK,
  event,
  GROCERIES,
  transaction,
  txId,
  WALLET,
} from "@/lib/transactions/money.fixtures";
import { orders } from "@/test/permutations";
import { foldSpending } from "./spending";

const purchase = transaction("e-purchase", txId(1), 1000, {
  type: "expense",
  amountCents: 20000,
  accountId: BANK,
  categoryId: GROCERIES,
});
const purchaseEdited = transaction(
  "e-purchase-edited",
  txId(1),
  2000,
  { type: "expense", amountCents: 25000, accountId: BANK, categoryId: GROCERIES },
  "transaction.edited"
);
const refund = transaction("e-refund", txId(2), 1500, {
  type: "income",
  amountCents: 5000,
  accountId: BANK,
  categoryId: GROCERIES,
});
const transferToWallet = event("e-transfer", "transfer", txId(3), "transfer.created", 1200, {
  date: "2026-10-12",
  description: "",
  notes: "",
  status: "cleared",
  amountCents: 20000,
  fromAccountId: BANK,
  toAccountId: WALLET,
  envelope: { kind: "category", id: GROCERIES },
});

const EXPECTED = new Map([
  ["2026-10", new Map([[GROCERIES, { spent: 20000, spentToDay: 20000 }]])],
]);

const foldLocal = async () => foldSpending(await db.transactions.toArray(), "user-me", 30);

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("Spending folded from the projected events", () => {
  it.each(orders([purchase, purchaseEdited, refund, transferToWallet]))(
    "is the same grid in the order %j, with the transfer left out",
    async (_ids, order) => {
      for (const received of order) await receiveEvents([received], 0);

      expect((await foldLocal()).household).toEqual(EXPECTED);
    }
  );

  it("is unchanged by a duplicate event", async () => {
    await receiveEvents([purchase, purchaseEdited, refund, transferToWallet], 0);
    await receiveEvents([refund, purchase, refund], 0);

    expect((await foldLocal()).household).toEqual(EXPECTED);
  });
});
