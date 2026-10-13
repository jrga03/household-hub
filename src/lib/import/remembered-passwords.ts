/**
 * Statement passwords a member chose to remember, per card, on this device
 * only. They live in the local database, so sign-out's reset deletes them,
 * and a household switch forgets them all. Never synced.
 */
import { db } from "@/lib/dexie/db";

const PREFIX = "statementPassword:";
const keyFor = (accountId: string) => `${PREFIX}${accountId}` as const;

export async function rememberStatementPassword(accountId: string, password: string) {
  await db.meta.put({ key: keyFor(accountId), value: password });
}

export async function readRememberedPassword(accountId: string): Promise<string | undefined> {
  const stored = (await db.meta.get(keyFor(accountId)))?.value;
  return typeof stored === "string" ? stored : undefined;
}

export async function forgetStatementPassword(accountId: string) {
  await db.meta.delete(keyFor(accountId));
}

export async function forgetAllStatementPasswords() {
  await db.meta.where("key").startsWith(PREFIX).delete();
}
