import { listAccounts } from "@/lib/accounts/projection";
import { db } from "@/lib/dexie/db";
import type { Ownership } from "@/lib/events/log";

/** Who is asking, and when: what they can see and what "today" means. */
export interface AssistantScope {
  userId: string;
  now: Date;
}

/** Household records, and the member's own Personal ones. */
export const canSee = (userId: string) => (owned: Ownership) =>
  owned.visibility === "household" || owned.ownerUserId === userId;

/** Accounts in use the member can see, by name. */
export const listUsableAccounts = async (userId: string) =>
  (await listAccounts()).filter(canSee(userId));

/** Categories in use the member can see, by name. */
export async function listUsableCategories(userId: string) {
  const isSeen = canSee(userId);
  const categories = await db.categories
    .filter((category) => !category.retired && isSeen(category))
    .toArray();
  return categories.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
