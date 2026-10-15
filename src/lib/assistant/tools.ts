import { readMonthView } from "@/lib/budgets/month";
import { budgetStatus } from "@/lib/budgets/progress";
import { diffCents, formatPHP, ZERO_CENTS } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { localMonth } from "@/lib/utils/dates";
import { readAccountNames } from "@/lib/accounts/projection";
import { readCategoryNames } from "@/lib/categories/projection";
import { readAccountMoney } from "@/lib/transactions/money";
import { listTransactions as readTransactions } from "@/lib/transactions/projection";
import {
  optionalCount,
  optionalDate,
  optionalMonth,
  optionalString,
  requireUsableAccount,
  requireUsableCategory,
  ToolError,
  type ToolArguments,
} from "./arguments";
import { proposeTransaction, type TransactionProposal } from "./proposal";
import { canSee, listUsableAccounts, listUsableCategories, type AssistantSession } from "./session";

/** A tool's reply to the model, as JSON, and the transaction the member is asked to confirm, if any. */
export interface ToolOutcome {
  content: string;
  proposal: TransactionProposal | null;
}

type ToolRun = (args: ToolArguments, session: AssistantSession) => Promise<ToolOutcome>;

const reply = (result: unknown): ToolOutcome => ({
  content: JSON.stringify(result),
  proposal: null,
});

async function getAccountBalances(_args: ToolArguments, { userId }: AssistantSession) {
  const [accounts, money] = await Promise.all([listUsableAccounts(userId), readAccountMoney()]);
  return reply({
    accounts: accounts.map(({ id, name, type }) => ({
      id,
      name,
      type,
      balance: formatPHP(money.get(id)?.balance ?? ZERO_CENTS),
    })),
  });
}

async function listCategories(_args: ToolArguments, { userId }: AssistantSession) {
  const [categories, groups] = await Promise.all([
    listUsableCategories(userId),
    db.categoryGroups.toArray(),
  ]);
  const groupNames = new Map(groups.map((group) => [group.id, group.name]));
  return reply({
    categories: categories.map(({ id, name, groupId }) => ({
      id,
      name,
      group: groupNames.get(groupId) ?? null,
    })),
  });
}

const DEFAULT_ROWS = 20;
const MAX_ROWS = 50;

async function listTransactions(args: ToolArguments, { userId }: AssistantSession) {
  const accountId = optionalString(args, "account_id");
  const categoryId = optionalString(args, "category_id");
  const from = optionalDate(args, "from");
  const to = optionalDate(args, "to");
  const rows = Math.min(optionalCount(args, "limit") ?? DEFAULT_ROWS, MAX_ROWS);
  if (accountId !== undefined) await requireUsableAccount(userId, accountId);
  if (categoryId !== undefined) await requireUsableCategory(userId, categoryId);

  const [transactions, accountNames, categoryNames] = await Promise.all([
    readTransactions(),
    readAccountNames(),
    readCategoryNames(),
  ]);
  const isSeen = canSee(userId);
  const matching = transactions.filter(
    (transaction) =>
      isSeen(transaction) &&
      (accountId === undefined || transaction.accountId === accountId) &&
      (categoryId === undefined || transaction.categoryId === categoryId) &&
      (from === undefined || transaction.date >= from) &&
      (to === undefined || transaction.date <= to)
  );
  return reply({
    transactions: matching.slice(0, rows).map((transaction) => ({
      date: transaction.date,
      type: transaction.type,
      amount: formatPHP(transaction.amountCents),
      account: accountNames.get(transaction.accountId),
      category:
        transaction.categoryId === null ? "Unassigned" : categoryNames.get(transaction.categoryId),
      description: transaction.description,
    })),
    more: matching.length > rows,
  });
}

async function getBudgetStatus(args: ToolArguments, { userId, now }: AssistantSession) {
  const currentMonth = localMonth(now);
  const month = optionalMonth(args, "month") ?? currentMonth;
  const [view, categories] = await Promise.all([
    readMonthView(month, currentMonth),
    db.categories.toArray(),
  ]);
  const isSeen = canSee(userId);
  const rows = categories
    .filter(isSeen)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .flatMap((category) => {
      const figures = view.get(category.id);
      // Only what had a budget or spending; transfers and corrections never count as spent.
      if (!figures || (figures.budget === null && figures.spent === 0)) return [];
      const { budget, spent } = figures;
      return {
        category: category.name,
        budget: budget && formatPHP(budget.amountCents),
        spent: formatPHP(spent),
        left: budget && formatPHP(diffCents(budget.amountCents, spent)),
        status: budget ? budgetStatus(budget.amountCents, spent) : "no budget",
      };
    });
  return reply({ month, categories: rows });
}

async function addTransaction(
  args: ToolArguments,
  session: AssistantSession
): Promise<ToolOutcome> {
  const { proposal, summary } = await proposeTransaction(args, session);
  return {
    content: JSON.stringify({
      proposed: summary,
      status: "Shown to the member to confirm. Not recorded yet.",
    }),
    proposal,
  };
}

// A Map, so a name such as "toString" from the model finds nothing.
const RUNS = new Map<string, ToolRun>([
  ["get_account_balances", getAccountBalances],
  ["list_categories", listCategories],
  ["list_transactions", listTransactions],
  ["get_budget_status", getBudgetStatus],
  ["add_transaction", addTransaction],
]);

const isArguments = (value: unknown): value is ToolArguments =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The model's arguments as an object; it may send none at all for a tool without parameters. */
function parseArguments(raw: string): ToolArguments | null {
  if (raw.trim() === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return isArguments(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Runs one tool call from the model. Bad arguments come back as an error the model can read. */
export async function runAssistantTool(
  name: string,
  rawArguments: string,
  session: AssistantSession
): Promise<ToolOutcome> {
  const run = RUNS.get(name);
  if (!run) return reply({ error: `There is no tool named ${name}.` });
  const args = parseArguments(rawArguments);
  if (!args) return reply({ error: "The arguments must be a JSON object." });
  try {
    return await run(args, session);
  } catch (error) {
    if (error instanceof ToolError) return reply({ error: error.message });
    throw error;
  }
}
