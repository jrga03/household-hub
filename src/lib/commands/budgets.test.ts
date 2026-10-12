import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, type Cents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { budgetId } from "@/lib/budgets/events";
import { budgetInForce } from "@/lib/budgets/inForce";
import { getBudget, listBudgets } from "@/lib/budgets/projection";
import { createAccount, retireAccount } from "./accounts";
import { createCategory, createGroup, retireCategory } from "./categories";
import { setBudget, type BudgetInput } from "./budgets";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };

const peso = (amount: string): Cents => parsePHP(amount);

let bpiId: string;
let groceriesId: string;

const budget = (overrides: Partial<BudgetInput> = {}): BudgetInput => ({
  categoryId: groceriesId,
  fromMonth: "2026-10",
  amountCents: peso("8000"),
  accountId: bpiId,
  ...overrides,
});

const account = (actor: typeof MEMBER, name: string, extra: Record<string, unknown> = {}) =>
  createAccount(actor, { name, type: "bank", startingBalanceCents: peso("0"), ...extra });

async function personalCategory(actor: typeof MEMBER) {
  const group = await createGroup(actor, { name: "Mine", visibility: "personal" });
  return (await createCategory(actor, { name: "Travel", groupId: group.id })).id;
}

const budgetEvents = async () =>
  (await listUnpushed(1000)).filter((event) => event.entityType === "budget");

beforeEach(async () => {
  await resetLocalDatabase();
  bpiId = (await account(MEMBER, "BPI")).id;
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
});

describe("setBudget", () => {
  it("records the month's version under an ID from the category and month", async () => {
    await setBudget(MEMBER, budget());

    const id = await budgetId(groceriesId, "2026-10");
    expect(await getBudget(id)).toMatchObject({
      categoryId: groceriesId,
      fromMonth: "2026-10",
      amountCents: 800000,
      accountId: bpiId,
      visibility: "household",
      ownerUserId: null,
    });
    expect(await budgetEvents()).toMatchObject([
      { eventType: "budget.set", entityId: id, visibility: "household", ownerUserId: null },
    ]);
  });

  it("keeps earlier months when changed from a later one (the issue's demo)", async () => {
    await setBudget(MEMBER, budget());
    await setBudget(MEMBER, budget({ fromMonth: "2026-12", amountCents: peso("9000") }));

    const budgets = await listBudgets();
    expect(budgetInForce(budgets, groceriesId, "2026-11")?.amountCents).toBe(800000);
    expect(budgetInForce(budgets, groceriesId, "2026-12")?.amountCents).toBe(900000);
  });

  it("replaces the same month's budget in place", async () => {
    await setBudget(MEMBER, budget());
    await setBudget(OTHER_MEMBER, budget({ amountCents: peso("8500") }));

    expect(await listBudgets()).toMatchObject([{ amountCents: 850000 }]);
  });

  it("clears it from a month with zero, needing no funding account", async () => {
    await setBudget(MEMBER, budget());
    await setBudget(
      MEMBER,
      budget({ fromMonth: "2027-01", amountCents: peso("0"), accountId: null })
    );

    const budgets = await listBudgets();
    expect(budgetInForce(budgets, groceriesId, "2026-12")?.amountCents).toBe(800000);
    expect(budgetInForce(budgets, groceriesId, "2027-01")).toBeNull();
  });

  it("appends nothing when the month's own version already says so", async () => {
    await setBudget(MEMBER, budget());
    await setBudget(MEMBER, budget());
    await setBudget(MEMBER, budget({ fromMonth: "2026-09", amountCents: null, accountId: null }));

    expect(await budgetEvents()).toHaveLength(1);
  });

  it("pins a later month to the same budget, so changing an earlier month leaves it", async () => {
    await setBudget(MEMBER, budget());
    await setBudget(MEMBER, budget({ fromMonth: "2026-12" }));
    await setBudget(MEMBER, budget({ amountCents: peso("7000") }));

    const budgets = await listBudgets();
    expect(budgetInForce(budgets, groceriesId, "2026-11")?.amountCents).toBe(700000);
    expect(budgetInForce(budgets, groceriesId, "2026-12")?.amountCents).toBe(800000);
  });

  it("sets a budget on a Personal category funded by its member's Personal account", async () => {
    const travelId = await personalCategory(MEMBER);
    const walletId = (await account(MEMBER, "Wallet", { visibility: "personal" })).id;

    await setBudget(MEMBER, budget({ categoryId: travelId, accountId: walletId }));

    expect(await budgetEvents()).toMatchObject([{ visibility: "personal", ownerUserId: "user-a" }]);
  });

  it("refuses a funding account of another visibility", async () => {
    const walletId = (await account(MEMBER, "Wallet", { visibility: "personal" })).id;

    await expect(setBudget(MEMBER, budget({ accountId: walletId }))).rejects.toThrow(
      "Choose a Household account to fund Groceries."
    );
  });

  it("refuses another member's Personal account", async () => {
    const travelId = await personalCategory(MEMBER);
    const theirsId = (await account(OTHER_MEMBER, "Theirs", { visibility: "personal" })).id;

    await expect(
      setBudget(MEMBER, budget({ categoryId: travelId, accountId: theirsId }))
    ).rejects.toThrow("Choose a Personal account to fund Travel.");
  });

  it("refuses a credit card", async () => {
    const cardId = (await account(MEMBER, "Visa", { type: "credit_card", payingAccountId: bpiId }))
      .id;

    await expect(setBudget(MEMBER, budget({ accountId: cardId }))).rejects.toThrow(
      "A credit card can't fund a budget."
    );
  });

  it("refuses a retired account", async () => {
    await retireAccount(MEMBER, bpiId);

    await expect(setBudget(MEMBER, budget())).rejects.toThrow("BPI is retired.");
  });

  it("refuses a retired category", async () => {
    await retireCategory(MEMBER, groceriesId);

    await expect(setBudget(MEMBER, budget())).rejects.toThrow("Groceries is retired.");
  });

  it("refuses a category or account this device doesn't hold", async () => {
    await expect(
      setBudget(MEMBER, budget({ categoryId: "cccccccc-0000-4000-8000-00000000dead" }))
    ).rejects.toThrow("That category no longer exists.");
    await expect(
      setBudget(MEMBER, budget({ accountId: "aaaaaaaa-0000-4000-8000-00000000dead" }))
    ).rejects.toThrow("That account no longer exists.");
  });

  it("refuses an amount without a funding account, or a broken month", async () => {
    await expect(setBudget(MEMBER, budget({ accountId: null }))).rejects.toThrow(
      "Choose the account that funds it."
    );
    await expect(setBudget(MEMBER, budget({ fromMonth: "2026-13" }))).rejects.toThrow(
      "Choose a month."
    );
  });
});
