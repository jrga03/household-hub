import { listAccounts, type AccountRow } from "@/lib/accounts/projection";
import { db } from "@/lib/dexie/db";
import type { Ownership } from "@/lib/events/ownership";
import { byName } from "@/lib/utils/sort";

/** Who is asking, and when: what they can see and what "today" means. */
export interface AssistantSession {
  userId: string;
  now: Date;
}

/** Household accounts and categories, and the member's own Personal ones. */
export const canSee = (userId: string) => (owned: Ownership) =>
  owned.visibility === "household" || owned.ownerUserId === userId;

/** Accounts in use the member can see, by name. */
export const listUsableAccounts = async (userId: string) =>
  (await listAccounts()).filter(canSee(userId));

/** The account a line without one goes to: the member's only account, if they have just one. */
export function onlyAccount(accounts: AccountRow[]): AccountRow | null {
  const [first] = accounts;
  return accounts.length === 1 && first ? first : null;
}

/** Categories in use the member can see, by name. */
export async function listUsableCategories(userId: string) {
  const isSeen = canSee(userId);
  const categories = await db.categories
    .filter((category) => !category.retired && isSeen(category))
    .toArray();
  return categories.sort(byName);
}
