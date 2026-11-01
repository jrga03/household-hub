import { db } from "./db";

/** Deletes every local table and reopens an empty database (sign-out). */
export async function resetLocalDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}

let claiming: Promise<void> = Promise.resolve();

/**
 * Records which member the local data belongs to. When a different member
 * signs in, it wipes the data with no export, so they never see the last
 * member's records or inherit their unsent changes. Calls run one at a time.
 */
export function claimLocalData(userId: string): Promise<void> {
  const claim = claiming.then(async () => {
    const owner = (await db.meta.get("userId"))?.value;
    if (owner === userId) return;
    if (owner !== undefined) await resetLocalDatabase();
    await db.meta.put({ key: "userId", value: userId });
  });
  claiming = claim.catch(() => undefined);
  return claim;
}
