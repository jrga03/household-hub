/**
 * Reads the model's tool arguments as untrusted input, the way a form would.
 * A problem is a ToolError, which the tool runner hands back to the model to read.
 */

import { getAccount, type AccountRow } from "@/lib/accounts/projection";
import { getCategory, type CategoryRow } from "@/lib/categories/projection";
import { isLocalDate } from "@/lib/transactions/events";
import { isLocalMonth } from "@/lib/utils/dates";
import { canSee } from "./scope";

export type ToolArguments = Record<string, unknown>;

export class ToolError extends Error {}

export function optionalString(args: ToolArguments, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ToolError(`${key} must be a string.`);
  return value;
}

export function optionalDate(args: ToolArguments, key: string): string | undefined {
  const value = optionalString(args, key);
  if (value !== undefined && !isLocalDate(value)) {
    throw new ToolError(`${key} must be a real date, yyyy-MM-dd.`);
  }
  return value;
}

export function optionalMonth(args: ToolArguments, key: string): string | undefined {
  const value = optionalString(args, key);
  if (value !== undefined && !isLocalMonth(value)) {
    throw new ToolError(`${key} must be a month, yyyy-MM.`);
  }
  return value;
}

export function optionalCount(args: ToolArguments, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ToolError(`${key} must be a whole number above zero.`);
  }
  return value;
}

/** An account the member can see and still uses; another member's Personal one is as good as unknown. */
export async function requireUsableAccount(userId: string, id: string): Promise<AccountRow> {
  const account = await getAccount(id);
  if (!account || !canSee(userId)(account)) {
    throw new ToolError(`No account has the id ${id}. Use an id from the session context.`);
  }
  if (account.retired) throw new ToolError(`${account.name} is retired. Use an account in use.`);
  return account;
}

export async function requireUsableCategory(userId: string, id: string): Promise<CategoryRow> {
  const category = await getCategory(id);
  if (!category || !canSee(userId)(category)) {
    throw new ToolError(`No category has the id ${id}. Use an id from the session context.`);
  }
  if (category.retired) {
    throw new ToolError(`${category.name} is retired. Use a category in use.`);
  }
  return category;
}
