import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup, retireCategory } from "@/lib/commands/categories";
import { setBudget } from "@/lib/commands/budgets";
import { addTransaction, removeTransaction } from "@/lib/commands/transactions";
import { addTransfer } from "@/lib/commands/transfers";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listTransactions as readTransactions } from "@/lib/transactions/projection";
import { ASSISTANT_TOOLS } from "./definitions";
import { runAssistantTool } from "./tools";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };
const UNKNOWN_ID = "99999999-9999-4999-8999-999999999999";

const NOW = new Date(2026, 9, 15, 9, 0);
const scope = { userId: MEMBER.userId, now: NOW };

const run = async (name: string, args: Record<string, unknown> = {}) => {
  const outcome = await runAssistantTool(name, JSON.stringify(args), scope);
  return { ...outcome, result: JSON.parse(outcome.content) as Record<string, unknown> };
};

let gcashId: string;
let groceriesId: string;

beforeEach(async () => {
  await resetLocalDatabase();
  gcashId = (
    await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("1000"),
    })
  ).id;
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
});

describe("ASSISTANT_TOOLS", () => {
  it("defines the five tools in the OpenAI tools shape", () => {
    expect(ASSISTANT_TOOLS.map((tool) => tool.function.name)).toEqual([
      "get_account_balances",
      "list_transactions",
      "list_categories",
      "get_budget_status",
      "add_transaction",
    ]);
    for (const tool of ASSISTANT_TOOLS) {
      expect(tool).toMatchObject({
        type: "function",
        function: { description: expect.any(String), parameters: { type: "object" } },
      });
    }
  });

  it.each(ASSISTANT_TOOLS.map((tool) => [tool.function.name, tool] as const))(
    "runs %s",
    async (name) => {
      const { result } = await run(name, {});

      expect(result.error).not.toBe(`There is no tool named ${name}.`);
    }
  );

  it("requires on add_transaction only what a one-line entry always has", () => {
    const addTransaction = ASSISTANT_TOOLS.find((tool) => tool.function.name === "add_transaction");

    expect(addTransaction?.function.parameters.required).toEqual(["amount", "description"]);
  });
});

describe("runAssistantTool", () => {
  it.each(["{not json", "null", "[]", '"text"'])(
    "answers arguments that aren't a JSON object (%s) with an error",
    async (raw) => {
      const outcome = await runAssistantTool("get_account_balances", raw, scope);

      expect(JSON.parse(outcome.content)).toEqual({
        error: "The arguments must be a JSON object.",
      });
    }
  );

  it.each(["delete_everything", "toString", "constructor"])(
    "answers an unknown tool (%s) with an error",
    async (name) => {
      const { result } = await run(name);

      expect(result).toEqual({ error: `There is no tool named ${name}.` });
    }
  );

  it("takes empty arguments as none", async () => {
    const outcome = await runAssistantTool("get_account_balances", "", scope);

    expect(JSON.parse(outcome.content)).toHaveProperty("accounts");
  });
});

describe("get_account_balances", () => {
  it("gives each account in use the member can see, with its balance in PHP", async () => {
    await addTransaction(MEMBER, {
      date: "2026-10-14",
      type: "expense",
      amountCents: parsePHP("250.50"),
      accountId: gcashId,
      categoryId: groceriesId,
      description: "Jollibee",
    });
    const old = await createAccount(MEMBER, {
      name: "Old bank",
      type: "bank",
      startingBalanceCents: parsePHP("5"),
    });
    await retireAccount(MEMBER, old.id);
    await createAccount(OTHER_MEMBER, {
      name: "Their savings",
      type: "bank",
      startingBalanceCents: parsePHP("5"),
      visibility: "personal",
    });

    const { result, proposal } = await run("get_account_balances");

    expect(result).toEqual({
      accounts: [{ id: gcashId, name: "GCash", type: "e_wallet", balance: "₱749.50" }],
    });
    expect(proposal).toBeNull();
  });
});

describe("list_categories", () => {
  it("gives each category in use the member can see, with its group", async () => {
    const food = await createGroup(MEMBER, { name: "Dining out" });
    const dining = await createCategory(MEMBER, { name: "Restaurants", groupId: food.id });
    await retireCategory(MEMBER, dining.id);
    const theirs = await createGroup(OTHER_MEMBER, { name: "Theirs", visibility: "personal" });
    await createCategory(OTHER_MEMBER, { name: "Hobbies", groupId: theirs.id });

    const { result } = await run("list_categories");

    expect(result).toEqual({ categories: [{ id: groceriesId, name: "Groceries", group: "Food" }] });
  });
});

describe("list_transactions", () => {
  const spend = (overrides: Partial<Parameters<typeof addTransaction>[1]> = {}) =>
    addTransaction(MEMBER, {
      date: "2026-10-14",
      type: "expense",
      amountCents: parsePHP("250"),
      accountId: gcashId,
      categoryId: groceriesId,
      description: "Jollibee",
      ...overrides,
    });

  it("gives the newest transactions first, leaving out removed ones", async () => {
    await spend({ date: "2026-10-01", description: "Market" });
    await spend({ date: "2026-10-14", type: "income", categoryId: null, description: "Refund" });
    const removed = await spend({ description: "Mistake" });
    await removeTransaction(MEMBER, removed.id);

    const { result } = await run("list_transactions");

    expect(result).toEqual({
      transactions: [
        {
          date: "2026-10-14",
          type: "income",
          amount: "₱250.00",
          account: "GCash",
          category: "Unassigned",
          description: "Refund",
        },
        {
          date: "2026-10-01",
          type: "expense",
          amount: "₱250.00",
          account: "GCash",
          category: "Groceries",
          description: "Market",
        },
      ],
      more: false,
    });
  });
  it("filters by account, category and date range", async () => {
    const wallet = await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });
    await spend({ date: "2026-10-05", description: "In range" });
    await spend({ date: "2026-10-05", accountId: wallet.id, description: "Other account" });
    await spend({ date: "2026-10-05", categoryId: null, description: "Other category" });
    await spend({ date: "2026-09-30", description: "Too early" });
    await spend({ date: "2026-10-11", description: "Too late" });

    const { result } = await run("list_transactions", {
      account_id: gcashId,
      category_id: groceriesId,
      from: "2026-10-01",
      to: "2026-10-10",
    });

    expect(result.transactions).toMatchObject([{ description: "In range" }]);
  });

  it("returns at most the rows asked for, and says when there are more", async () => {
    await spend({ date: "2026-10-01", description: "Oldest" });
    await spend({ date: "2026-10-02", description: "Middle" });
    await spend({ date: "2026-10-03", description: "Newest" });

    const { result } = await run("list_transactions", { limit: 2 });

    expect(result).toMatchObject({
      transactions: [{ description: "Newest" }, { description: "Middle" }],
      more: true,
    });
  });

  it("never returns more than 50 rows", async () => {
    for (let day = 1; day <= 51; day += 1) {
      await spend({ date: `2026-08-${String((day % 28) + 1).padStart(2, "0")}` });
    }

    const { result } = await run("list_transactions", { limit: 500 });

    expect(result.transactions).toHaveLength(50);
    expect(result.more).toBe(true);
  });

  it("answers an unknown account or category id with an error", async () => {
    expect((await run("list_transactions", { account_id: UNKNOWN_ID })).result).toEqual({
      error: `No account has the id ${UNKNOWN_ID}. Use an id from the session context.`,
    });
    expect((await run("list_transactions", { category_id: UNKNOWN_ID })).result).toEqual({
      error: `No category has the id ${UNKNOWN_ID}. Use an id from the session context.`,
    });
  });

  it("treats another member's Personal account as unknown", async () => {
    const theirs = await createAccount(OTHER_MEMBER, {
      name: "Their savings",
      type: "bank",
      startingBalanceCents: parsePHP("0"),
      visibility: "personal",
    });

    const { result } = await run("list_transactions", { account_id: theirs.id });

    expect(result.error).toMatch(/^No account has the id/);
  });

  it("answers a retired account or category with an error", async () => {
    await retireCategory(MEMBER, groceriesId);
    await retireAccount(MEMBER, gcashId);

    expect((await run("list_transactions", { account_id: gcashId })).result).toEqual({
      error: "GCash is retired. Use an account in use.",
    });
    expect((await run("list_transactions", { category_id: groceriesId })).result).toEqual({
      error: "Groceries is retired. Use a category in use.",
    });
  });

  it.each([
    [{ from: "2026-02-30" }, "from must be a real date, yyyy-MM-dd."],
    [{ to: "15/10/2026" }, "to must be a real date, yyyy-MM-dd."],
    [{ limit: 0 }, "limit must be a whole number above zero."],
    [{ limit: "5" }, "limit must be a whole number above zero."],
    [{ account_id: 42 }, "account_id must be a string."],
  ])("answers %j with an error", async (args, error) => {
    expect((await run("list_transactions", args)).result).toEqual({ error });
  });
});

describe("get_budget_status", () => {
  const spend = (date: string, amount: string) =>
    addTransaction(MEMBER, {
      date,
      type: "expense",
      amountCents: parsePHP(amount),
      accountId: gcashId,
      categoryId: groceriesId,
      description: "Market",
    });

  beforeEach(async () => {
    await setBudget(MEMBER, {
      categoryId: groceriesId,
      fromMonth: "2026-10",
      amountCents: parsePHP("1000"),
      accountId: gcashId,
    });
  });

  it("compares this month's spending with its budget, leaving transfers out", async () => {
    await spend("2026-10-03", "850");
    await spend("2026-09-28", "100");
    const wallet = await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });
    await addTransfer(MEMBER, {
      date: "2026-10-04",
      amountCents: parsePHP("300"),
      fromAccountId: gcashId,
      toAccountId: wallet.id,
      envelope: { kind: "category", id: groceriesId },
    });

    const { result } = await run("get_budget_status");

    expect(result).toEqual({
      month: "2026-10",
      categories: [
        {
          category: "Groceries",
          budget: "₱1,000.00",
          spent: "₱850.00",
          left: "₱150.00",
          status: "close",
        },
      ],
    });
  });

  it("gives another month's spending, with no budget where none was in force", async () => {
    await spend("2026-09-28", "100");

    const { result } = await run("get_budget_status", { month: "2026-09" });

    expect(result).toEqual({
      month: "2026-09",
      categories: [
        { category: "Groceries", budget: null, spent: "₱100.00", left: null, status: "no budget" },
      ],
    });
  });

  it("leaves out another member's Personal categories", async () => {
    const theirs = await createGroup(OTHER_MEMBER, { name: "Theirs", visibility: "personal" });
    const hobbies = await createCategory(OTHER_MEMBER, { name: "Hobbies", groupId: theirs.id });
    const savings = await createAccount(OTHER_MEMBER, {
      name: "Their savings",
      type: "bank",
      startingBalanceCents: parsePHP("500"),
      visibility: "personal",
    });
    await setBudget(OTHER_MEMBER, {
      categoryId: hobbies.id,
      fromMonth: "2026-10",
      amountCents: parsePHP("200"),
      accountId: savings.id,
    });

    const { result } = await run("get_budget_status");

    expect(result.categories).toMatchObject([{ category: "Groceries" }]);
  });

  it.each([
    ["2026-13", "month must be a month, yyyy-MM."],
    ["October", "month must be a month, yyyy-MM."],
    [202610, "month must be a string."],
  ])("answers the month %j with an error", async (month, error) => {
    expect((await run("get_budget_status", { month })).result).toEqual({ error });
  });
});

describe("add_transaction", () => {
  const line = { amount: "250", account_id: "", category_id: "", description: "Jollibee" };

  it("proposes the transaction for the member to confirm, without recording it", async () => {
    const { result, proposal } = await run("add_transaction", {
      ...line,
      amount: "1,250.50",
      type: "income",
      date: "2026-10-14",
      account_id: gcashId,
      category_id: groceriesId,
      notes: "Split with Ana",
    });

    expect(proposal).toEqual({
      date: "2026-10-14",
      type: "income",
      amountCents: 125050,
      accountId: gcashId,
      categoryId: groceriesId,
      description: "Jollibee",
      notes: "Split with Ana",
    });
    expect(result).toEqual({
      proposed: {
        date: "2026-10-14",
        type: "income",
        amount: "₱1,250.50",
        account: "GCash",
        category: "Groceries",
        description: "Jollibee",
        notes: "Split with Ana",
      },
      status: "Shown to the member to confirm. Not recorded yet.",
    });
    expect(await readTransactions()).toEqual([]);
  });

  it("records exactly the proposal once the member confirms it", async () => {
    const { proposal } = await run("add_transaction", {
      amount: "250",
      account_id: gcashId,
      category_id: groceriesId,
      description: "Jollibee",
    });
    if (!proposal) throw new Error("Expected a proposal.");

    await addTransaction(MEMBER, proposal);

    expect(await readTransactions()).toMatchObject([
      { amountCents: 25000, accountId: gcashId, categoryId: groceriesId, description: "Jollibee" },
    ]);
  });

  it("takes no date as today and no type as expense", async () => {
    const { proposal } = await run("add_transaction", {
      amount: "250",
      category_id: groceriesId,
      description: "Jollibee",
    });

    expect(proposal).toMatchObject({ date: "2026-10-15", type: "expense" });
  });

  it("answers an expense with no category with an error telling the model to ask", async () => {
    const { result, proposal } = await run("add_transaction", {
      amount: "250",
      account_id: gcashId,
      description: "Jollibee",
    });

    expect(result).toEqual({
      error: "No category given. Ask the member which category; never guess.",
    });
    expect(proposal).toBeNull();
  });

  it("proposes income with no category as Unassigned", async () => {
    const { result, proposal } = await run("add_transaction", {
      amount: "5000",
      type: "income",
      description: "Salary",
    });

    expect(proposal).toMatchObject({ categoryId: null });
    expect(result.proposed).toMatchObject({ category: "Unassigned" });
  });

  it("uses the only account when none is given", async () => {
    const { proposal } = await run("add_transaction", {
      amount: "250",
      category_id: groceriesId,
      description: "Jollibee",
    });

    expect(proposal).toMatchObject({ accountId: gcashId });
  });

  it("answers no account with an error telling the model to ask, once there are several", async () => {
    await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });

    const { result } = await run("add_transaction", {
      amount: "250",
      category_id: groceriesId,
      description: "Jollibee",
    });

    expect(result).toEqual({ error: "No account given. Ask the member which account." });
  });

  it.each(["250", "₱1,250.50", "1250.5", "  250  "])(
    "reads the amount %j as a decimal PHP string",
    async (amount) => {
      const { proposal } = await run("add_transaction", {
        amount,
        category_id: groceriesId,
        description: "Jollibee",
      });

      expect(proposal).not.toBeNull();
    }
  );

  it.each([
    ["abc", /^amount must be a decimal PHP string/],
    ["250abc", /^amount must be a decimal PHP string/],
    ["1e3", /^amount must be a decimal PHP string/],
    ["250.555", /^amount must be a decimal PHP string/],
    ["-250", /^amount must be a decimal PHP string/],
    ["0", /^The amount must be more than zero/],
    ["99999999", /^amount: Amount exceeds maximum/],
  ])("answers the amount %j with an error", async (amount, error) => {
    const { result, proposal } = await run("add_transaction", {
      amount,
      category_id: groceriesId,
      description: "Jollibee",
    });

    expect(result.error).toMatch(error);
    expect(proposal).toBeNull();
  });

  it.each([
    [{ amount: 250 }, "amount must be a string."],
    [{ amount: undefined }, "amount is required, a decimal PHP string."],
    [{ type: "transfer" }, "type must be expense or income."],
    [{ date: "2026-02-30" }, "Choose a date."],
    [{ description: "" }, "description is required: what or where, in the member's words."],
    [{ description: "x".repeat(121) }, "A description can be at most 120 characters."],
    [
      { account_id: UNKNOWN_ID },
      `No account has the id ${UNKNOWN_ID}. Use an id from the session context.`,
    ],
    [
      { category_id: UNKNOWN_ID },
      `No category has the id ${UNKNOWN_ID}. Use an id from the session context.`,
    ],
  ])("answers %j with an error", async (overrides, error) => {
    const { result, proposal } = await run("add_transaction", {
      amount: "250",
      category_id: groceriesId,
      description: "Jollibee",
      ...overrides,
    });

    expect(result).toEqual({ error });
    expect(proposal).toBeNull();
  });

  it("answers a retired account or category with an error", async () => {
    const food = await createGroup(MEMBER, { name: "More food" });
    const snacks = await createCategory(MEMBER, { name: "Snacks", groupId: food.id });
    await retireCategory(MEMBER, snacks.id);
    const old = await createAccount(MEMBER, {
      name: "Old bank",
      type: "bank",
      startingBalanceCents: parsePHP("0"),
    });
    await retireAccount(MEMBER, old.id);
    const base = { amount: "250", description: "Jollibee" };

    expect(
      (await run("add_transaction", { ...base, account_id: old.id, category_id: groceriesId }))
        .result
    ).toEqual({ error: "Old bank is retired. Use an account in use." });
    expect((await run("add_transaction", { ...base, category_id: snacks.id })).result).toEqual({
      error: "Snacks is retired. Use a category in use.",
    });
  });

  it("answers a category that can't hold money in the account with an error", async () => {
    const mine = await createGroup(MEMBER, { name: "Mine", visibility: "personal" });
    const travel = await createCategory(MEMBER, { name: "Travel", groupId: mine.id });

    const { result } = await run("add_transaction", {
      amount: "250",
      account_id: gcashId,
      category_id: travel.id,
      description: "Flight",
    });

    expect(result).toEqual({
      error: "Travel can't hold money in GCash. Choose a Household category.",
    });
  });
});
