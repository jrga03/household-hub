import { db } from "./db";

/** Deletes every local table and reopens an empty database (sign-out). */
export async function resetLocalDatabase(): Promise<void> {
  await db.delete();
  await db.open();
}
