import { db, type LocalAccount, type LocalCategory, type LocalTransaction } from "@/lib/dexie/db";
import { supabase } from "@/lib/supabase";

interface LocalRowByTable {
  transactions: LocalTransaction;
  accounts: LocalAccount;
  categories: LocalCategory;
}

/**
 * IndexedDB is not a full mirror (catch-up starts 24h back on a fresh device),
 * so an outbox update/delete may target a row that exists only on the server.
 * Offline, the UI shows only local rows, so a miss implies we are online.
 */
export async function ensureLocalRow<T extends keyof LocalRowByTable>(
  table: T,
  id: string
): Promise<LocalRowByTable[T] | null> {
  const local = (await db.table(table).get(id)) as LocalRowByTable[T] | undefined;
  if (local) return local;

  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;

  const row = data as unknown as LocalRowByTable[T];
  await db.table(table).put(row);
  return row;
}
