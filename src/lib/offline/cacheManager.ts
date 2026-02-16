import { db } from "@/lib/dexie/db";
import type { LocalTransaction, LocalAccount, LocalCategory } from "@/lib/dexie/db";

export class CacheManager {
  /**
   * Cache transactions from Supabase into IndexedDB
   */
  async cacheTransactions(transactions: LocalTransaction[]): Promise<void> {
    await db.transactions.bulkPut(transactions);
    await this.updateLastSync();
  }

  /**
   * Cache accounts from Supabase into IndexedDB
   */
  async cacheAccounts(accounts: LocalAccount[]): Promise<void> {
    await db.accounts.bulkPut(accounts);
    await this.updateLastSync();
  }

  /**
   * Cache categories from Supabase into IndexedDB
   */
  async cacheCategories(categories: LocalCategory[]): Promise<void> {
    await db.categories.bulkPut(categories);
    await this.updateLastSync();
  }

  /**
   * Get all transactions from IndexedDB
   */
  async getTransactions(): Promise<LocalTransaction[]> {
    return await db.transactions.toArray();
  }

  /**
   * Get all accounts from IndexedDB
   */
  async getAccounts(): Promise<LocalAccount[]> {
    return await db.accounts.toArray();
  }

  /**
   * Get all categories from IndexedDB
   */
  async getCategories(): Promise<LocalCategory[]> {
    return await db.categories.toArray();
  }

  /**
   * Get last sync timestamp
   */
  async getLastSync(): Promise<Date | null> {
    const meta = await db.meta.get("lastSync");
    return meta?.value ? new Date(meta.value as string | number) : null;
  }

  /**
   * Update last sync timestamp to now
   */
  private async updateLastSync(): Promise<void> {
    await db.meta.put({
      key: "lastSync",
      value: new Date().toISOString(),
    });
  }

  /**
   * Clear all cached data (e.g., on sign out)
   */
  async clearAll(): Promise<void> {
    await Promise.all([
      db.transactions.clear(),
      db.accounts.clear(),
      db.categories.clear(),
      db.meta.delete("lastSync"),
    ]);
  }

  /**
   * Get count of pending sync queue items
   */
  async getPendingCount(): Promise<number> {
    return await db.syncQueue.where("status").anyOf(["queued", "syncing"]).count();
  }
}

// Export singleton instance
export const cacheManager = new CacheManager();
