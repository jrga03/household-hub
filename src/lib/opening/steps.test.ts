import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { addAllocation, removeAllocation } from "@/lib/commands/allocations";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { setBudget } from "@/lib/commands/budgets";
import { readOpeningSteps } from "./steps";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("readOpeningSteps", () => {
  it("leaves every step open for a new household", async () => {
    expect(await readOpeningSteps()).toEqual({
      startingBalances: false,
      distributed: false,
      budgets: false,
      distributeAccountId: null,
    });
  });

  it("ticks starting balances off once an account has one, and opens Distribute on it", async () => {
    await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });
    const bpi = await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("40000"),
    });
    await createAccount(MEMBER, {
      name: "BDO Card",
      type: "credit_card",
      startingBalanceCents: parsePHP("2000"),
      payingAccountId: bpi.id,
    });

    expect(await readOpeningSteps()).toMatchObject({
      startingBalances: true,
      distributeAccountId: bpi.id,
    });
  });

  it("doesn't count a retired account's starting balance", async () => {
    const bpi = await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("40000"),
    });
    await retireAccount(MEMBER, bpi.id);

    expect(await readOpeningSteps()).toMatchObject({
      startingBalances: false,
      distributeAccountId: null,
    });
  });

  describe("distributed", () => {
    let bpi: string;
    let groceries: string;
    let utilities: string;

    const allocate = (from: Envelope, to: Envelope) =>
      addAllocation(MEMBER, {
        date: "2026-10-01",
        accountId: bpi,
        from,
        to,
        amountCents: parsePHP("5000"),
      });

    beforeEach(async () => {
      bpi = (
        await createAccount(MEMBER, {
          name: "BPI",
          type: "bank",
          startingBalanceCents: parsePHP("40000"),
        })
      ).id;
      const food = await createGroup(MEMBER, { name: "Food" });
      groceries = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
      utilities = (await createCategory(MEMBER, { name: "Utilities", groupId: food.id })).id;
    });

    it("ticks off once money moves out of Unassigned into an envelope", async () => {
      await allocate(UNASSIGNED_ENVELOPE, { kind: "category", id: groceries });

      expect(await readOpeningSteps()).toMatchObject({ distributed: true });
    });

    it("doesn't count money moved between categories", async () => {
      await allocate({ kind: "category", id: groceries }, { kind: "category", id: utilities });

      expect(await readOpeningSteps()).toMatchObject({ distributed: false });
    });

    it("doesn't count a removed allocation", async () => {
      const { id } = await allocate(UNASSIGNED_ENVELOPE, { kind: "category", id: groceries });
      await removeAllocation(MEMBER, id);

      expect(await readOpeningSteps()).toMatchObject({ distributed: false });
    });
  });

  describe("budgets", () => {
    let bpi: string;
    let groceries: string;

    const budget = (amount: string | null) =>
      setBudget(MEMBER, {
        categoryId: groceries,
        fromMonth: "2026-10",
        amountCents: amount === null ? null : parsePHP(amount),
        accountId: bpi,
      });

    beforeEach(async () => {
      bpi = (
        await createAccount(MEMBER, {
          name: "BPI",
          type: "bank",
          startingBalanceCents: parsePHP("0"),
        })
      ).id;
      const food = await createGroup(MEMBER, { name: "Food" });
      groceries = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
    });

    it("ticks off once a category has a budget", async () => {
      await budget("8000");

      expect(await readOpeningSteps()).toMatchObject({ budgets: true });
    });

    it("doesn't count a budget that was cleared", async () => {
      await budget("8000");
      await budget(null);

      expect(await readOpeningSteps()).toMatchObject({ budgets: false });
    });
  });
});
