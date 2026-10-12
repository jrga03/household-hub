import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import { createAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction, removeTransaction } from "@/lib/commands/transactions";
import { addTransfer } from "@/lib/commands/transfers";
import { readCategoryLedger, readLedgerRecord } from "./ledger";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

const peso = (amount: string): Cents => parsePHP(amount);

let bpiId: string;
let gcashId: string;
let groceriesId: string;

const allocateToGroceries = (date: string, amount: string) =>
  addAllocation(MEMBER, {
    date,
    accountId: bpiId,
    from: UNASSIGNED_ENVELOPE,
    to: { kind: "category", id: groceriesId },
    amountCents: peso(amount),
  });

const spendOnGroceries = (date: string, amount: string, accountId = bpiId) =>
  addTransaction(MEMBER, {
    date,
    type: "expense",
    amountCents: peso(amount),
    accountId,
    categoryId: groceriesId,
  });

const october = () => readCategoryLedger(groceriesId, "2026-10");

/** Each row's kind, change and balance after it, in ledger order. */
const steps = (ledger: Awaited<ReturnType<typeof october>>) =>
  ledger.rows.map(({ kind, change, balance }) => ({ kind, change, balance }));

beforeEach(async () => {
  await resetLocalDatabase();
  bpiId = (
    await createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: peso("50000") })
  ).id;
  gcashId = (
    await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: peso("0"),
    })
  ).id;
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
});

describe("category ledger", () => {
  it("shows the issue's demo: ₱2,000 opening, an allocation, an expense and a transfer, ₱8,800 closing", async () => {
    await allocateToGroceries("2026-09-20", "2000");
    await addTransfer(MEMBER, {
      date: "2026-10-10",
      amountCents: peso("500"),
      fromAccountId: bpiId,
      toAccountId: gcashId,
      envelope: { kind: "category", id: groceriesId },
    });
    await spendOnGroceries("2026-10-05", "1200");
    await allocateToGroceries("2026-10-01", "8000");

    const ledger = await october();

    expect(ledger.opening).toBe(200000);
    expect(steps(ledger)).toEqual([
      { kind: "allocation", change: 800000, balance: 1000000 },
      { kind: "transaction", change: -120000, balance: 880000 },
      { kind: "transfer", change: 0, balance: 880000 },
    ]);
    expect(ledger.closing).toBe(880000);
  });

  it("draws a card purchase and a refund from the category, in the card's Paying Account", async () => {
    const visaId = (
      await createAccount(MEMBER, {
        name: "Visa",
        type: "credit_card",
        startingBalanceCents: peso("0"),
        payingAccountId: bpiId,
      })
    ).id;
    await allocateToGroceries("2026-10-01", "3000");
    await spendOnGroceries("2026-10-07", "1500", visaId);
    await addTransaction(MEMBER, {
      date: "2026-10-09",
      type: "income",
      amountCents: peso("200"),
      accountId: visaId,
      categoryId: groceriesId,
    });

    const ledger = await october();

    expect(steps(ledger)).toEqual([
      { kind: "allocation", change: 300000, balance: 300000 },
      { kind: "transaction", change: -150000, balance: 150000 },
      { kind: "transaction", change: 20000, balance: 170000 },
    ]);
    expect(ledger.closing).toBe(170000);
  });

  it("subtracts money allocated out of the category", async () => {
    const restaurantsId = (
      await createCategory(MEMBER, {
        name: "Restaurants",
        groupId: (await createGroup(MEMBER, { name: "Eating out" })).id,
      })
    ).id;
    await allocateToGroceries("2026-10-01", "3000");
    await addAllocation(MEMBER, {
      date: "2026-10-15",
      accountId: bpiId,
      from: { kind: "category", id: groceriesId },
      to: { kind: "category", id: restaurantsId },
      amountCents: peso("1000"),
    });

    expect(steps(await october())).toEqual([
      { kind: "allocation", change: 300000, balance: 300000 },
      { kind: "allocation", change: -100000, balance: 200000 },
    ]);
  });

  it("leaves out other months, other categories and removed records", async () => {
    await allocateToGroceries("2026-09-30", "1000");
    await allocateToGroceries("2026-11-01", "700");
    const removed = await spendOnGroceries("2026-10-12", "400");
    await removeTransaction(MEMBER, removed.id);
    await addTransaction(MEMBER, {
      date: "2026-10-12",
      type: "expense",
      amountCents: peso("250"),
      accountId: bpiId,
      categoryId: null,
    });

    const ledger = await october();

    expect(ledger).toMatchObject({ opening: 100000, rows: [], closing: 100000 });
  });

  it("reads an opened record as it is now, and as null once removed", async () => {
    const { id } = await spendOnGroceries("2026-10-05", "1200");
    expect(await readLedgerRecord({ kind: "transaction", id })).toMatchObject({
      kind: "transaction",
      record: { id, amountCents: 120000 },
    });

    await removeTransaction(MEMBER, id);

    expect(await readLedgerRecord({ kind: "transaction", id })).toBeNull();
  });
});
