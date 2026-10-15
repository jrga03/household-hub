/**
 * add_transaction never records: it checks the model's line the way the form
 * would and returns a Proposal. Only the member's Confirm calls addTransaction
 * (ADR 0010).
 */

import { format } from "date-fns";
import type { AccountRow } from "@/lib/accounts/projection";
import { canHoldMoneyIn, type CategoryRow } from "@/lib/categories/projection";
import type { TransactionInput } from "@/lib/commands/transactions";
import { formatPHP, parsePHPSafe } from "@/lib/currency";
import { VISIBILITY_LABELS } from "@/lib/events/log";
import {
  checkTransactionDetails,
  isTransactionType,
  type TransactionType,
} from "@/lib/transactions/events";
import {
  optionalString,
  requireUsableAccount,
  requireUsableCategory,
  ToolError,
  type ToolArguments,
} from "./arguments";
import { listUsableAccounts, type AssistantScope } from "./scope";

export type TransactionProposal = Required<TransactionInput>;

// parsePHP would read "1e3" as 1,000 and round "250.555"; nobody sees the model's string before the card does.
const DECIMAL_PHP = /^₱?(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/;

function readAmount(args: ToolArguments) {
  const amount = optionalString(args, "amount")?.trim();
  if (amount === undefined) throw new ToolError("amount is required, a decimal PHP string.");
  if (!DECIMAL_PHP.test(amount)) {
    throw new ToolError(`amount must be a decimal PHP string such as "1,250.50", not "${amount}".`);
  }
  const parsed = parsePHPSafe(amount);
  if (!parsed.success) throw new ToolError(`amount: ${parsed.error.message}`);
  return parsed.value;
}

async function readAccount(args: ToolArguments, userId: string): Promise<AccountRow> {
  const accountId = optionalString(args, "account_id");
  if (accountId !== undefined) return requireUsableAccount(userId, accountId);
  const accounts = await listUsableAccounts(userId);
  const [onlyAccount] = accounts;
  if (accounts.length === 1 && onlyAccount) return onlyAccount;
  throw new ToolError("No account given. Ask the member which account.");
}

async function readCategory(
  args: ToolArguments,
  userId: string,
  account: AccountRow,
  type: TransactionType
): Promise<CategoryRow | null> {
  const categoryId = optionalString(args, "category_id");
  if (categoryId === undefined) {
    // Spending filed silently in the wrong envelope is worse than one more question (ADR 0010).
    if (type === "expense") {
      throw new ToolError("No category given. Ask the member which category; never guess.");
    }
    return null;
  }
  const category = await requireUsableCategory(userId, categoryId);
  if (!canHoldMoneyIn(category, account)) {
    throw new ToolError(
      `${category.name} can't hold money in ${account.name}. Choose a ${VISIBILITY_LABELS[account.visibility]} category.`
    );
  }
  return category;
}

export async function proposeTransaction(args: ToolArguments, { userId, now }: AssistantScope) {
  const type = optionalString(args, "type") ?? "expense";
  if (!isTransactionType(type)) throw new ToolError("type must be expense or income.");
  const amountCents = readAmount(args);
  const account = await readAccount(args, userId);
  const category = await readCategory(args, userId, account, type);
  const { details, problem } = checkTransactionDetails({
    date: optionalString(args, "date") ?? format(now, "yyyy-MM-dd"),
    type,
    amountCents,
    accountId: account.id,
    categoryId: category?.id ?? null,
    description: optionalString(args, "description"),
    notes: optionalString(args, "notes"),
  });
  if (problem !== null) throw new ToolError(problem);
  if (details.description === "") {
    throw new ToolError("description is required: what or where, in the member's words.");
  }

  const proposal: TransactionProposal = {
    date: details.date,
    type: details.type,
    amountCents: details.amountCents,
    accountId: details.accountId,
    categoryId: details.categoryId,
    description: details.description,
    notes: details.notes,
  };
  return {
    proposal,
    proposed: {
      date: proposal.date,
      type: proposal.type,
      amount: formatPHP(proposal.amountCents),
      account: account.name,
      category: category?.name ?? "Unassigned",
      description: proposal.description,
      notes: proposal.notes,
    },
  };
}
