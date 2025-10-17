# Instructions: Offline Reads

Follow these steps in order. Estimated time: 2 hours.

---

## Step 1: Create Online Status Hook (15 min)

Create `src/hooks/useOnlineStatus.ts`:

```typescript
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Listen to browser online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Periodic health check (every 30 seconds)
    const interval = setInterval(async () => {
      try {
        // Simple query to check Supabase connectivity
        const { error } = await supabase.from("profiles").select("id").limit(1).maybeSingle();

        setIsOnline(!error);
      } catch {
        setIsOnline(false);
      }
    }, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return isOnline;
}
```

**Verify**: `console.log(useOnlineStatus())` should return true/false

---

## Step 2: Create Cache Manager (20 min)

Create `src/lib/offline/cacheManager.ts`:

```typescript
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
    return meta?.value ? new Date(meta.value) : null;
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
```

---

## Step 3: Create Offline Transactions Hook (20 min)

Create `src/hooks/useOfflineTransactions.ts`:

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cacheManager } from "@/lib/offline/cacheManager";
import { useOnlineStatus } from "./useOnlineStatus";
import type { LocalTransaction } from "@/lib/dexie/db";

/**
 * Read-from-IndexedDB-first hook for transactions
 *
 * Pattern:
 * 1. Return IndexedDB data immediately (instant)
 * 2. Fetch from Supabase in background (if online)
 * 3. Update IndexedDB cache with fresh data
 */
export function useOfflineTransactions() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  // Query 1: Offline-first read (instant)
  const offlineQuery = useQuery({
    queryKey: ["transactions", "offline"],
    queryFn: async () => {
      // Read from IndexedDB
      const transactions = await cacheManager.getTransactions();
      return transactions;
    },
    staleTime: Infinity, // IndexedDB is truth when offline
    refetchOnMount: false,
  });

  // Query 2: Background sync (only when online)
  const syncQuery = useQuery({
    queryKey: ["transactions", "sync"],
    queryFn: async () => {
      // Fetch from Supabase
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .order("date", { ascending: false });

      if (error) throw error;

      // Map Supabase data to LocalTransaction format
      const transactions: LocalTransaction[] = data.map((tx) => ({
        id: tx.id,
        household_id: tx.household_id,
        date: tx.date,
        description: tx.description,
        amount_cents: tx.amount_cents,
        type: tx.type,
        account_id: tx.account_id,
        category_id: tx.category_id,
        status: tx.status,
        visibility: tx.visibility,
        created_by_user_id: tx.created_by_user_id,
        tagged_user_ids: tx.tagged_user_ids || [],
        transfer_group_id: tx.transfer_group_id,
        notes: tx.notes,
        device_id: tx.device_id,
        created_at: tx.created_at,
        updated_at: tx.updated_at,
      }));

      // Cache in IndexedDB
      await cacheManager.cacheTransactions(transactions);

      // Invalidate offline query to trigger re-render with fresh data
      await queryClient.invalidateQueries({ queryKey: ["transactions", "offline"] });

      return transactions;
    },
    enabled: isOnline, // Only run when online
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  return {
    data: offlineQuery.data || [],
    isLoading: offlineQuery.isLoading,
    isSyncing: syncQuery.isFetching,
    error: offlineQuery.error || syncQuery.error,
    isOnline,
  };
}
```

---

## Step 4: Create Offline Accounts Hook (15 min)

Create `src/hooks/useOfflineAccounts.ts`:

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cacheManager } from "@/lib/offline/cacheManager";
import { useOnlineStatus } from "./useOnlineStatus";
import type { LocalAccount } from "@/lib/dexie/db";

export function useOfflineAccounts() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const offlineQuery = useQuery({
    queryKey: ["accounts", "offline"],
    queryFn: () => cacheManager.getAccounts(),
    staleTime: Infinity,
    refetchOnMount: false,
  });

  const syncQuery = useQuery({
    queryKey: ["accounts", "sync"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      const accounts: LocalAccount[] = data.map((acc) => ({
        id: acc.id,
        household_id: acc.household_id,
        name: acc.name,
        type: acc.type,
        initial_balance_cents: acc.initial_balance_cents,
        currency_code: acc.currency_code,
        visibility: acc.visibility,
        owner_user_id: acc.owner_user_id,
        color: acc.color,
        icon: acc.icon,
        is_active: acc.is_active,
        created_at: acc.created_at,
        updated_at: acc.updated_at,
      }));

      await cacheManager.cacheAccounts(accounts);
      await queryClient.invalidateQueries({ queryKey: ["accounts", "offline"] });
      return accounts;
    },
    enabled: isOnline,
    staleTime: 10 * 60 * 1000, // 10 minutes (less frequent than transactions)
    refetchOnReconnect: true,
  });

  return {
    data: offlineQuery.data || [],
    isLoading: offlineQuery.isLoading,
    isSyncing: syncQuery.isFetching,
    error: offlineQuery.error || syncQuery.error,
    isOnline,
  };
}
```

---

## Step 5: Create Offline Categories Hook (15 min)

Create `src/hooks/useOfflineCategories.ts`:

```typescript
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { cacheManager } from "@/lib/offline/cacheManager";
import { useOnlineStatus } from "./useOnlineStatus";
import type { LocalCategory } from "@/lib/dexie/db";

export function useOfflineCategories() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const offlineQuery = useQuery({
    queryKey: ["categories", "offline"],
    queryFn: () => cacheManager.getCategories(),
    staleTime: Infinity,
    refetchOnMount: false,
  });

  const syncQuery = useQuery({
    queryKey: ["categories", "sync"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;

      const categories: LocalCategory[] = data.map((cat) => ({
        id: cat.id,
        household_id: cat.household_id,
        parent_id: cat.parent_id,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        is_active: cat.is_active,
        created_at: cat.created_at,
        updated_at: cat.updated_at,
      }));

      await cacheManager.cacheCategories(categories);
      await queryClient.invalidateQueries({ queryKey: ["categories", "offline"] });
      return categories;
    },
    enabled: isOnline,
    staleTime: 15 * 60 * 1000, // 15 minutes (rarely change)
    refetchOnReconnect: true,
  });

  return {
    data: offlineQuery.data || [],
    isLoading: offlineQuery.isLoading,
    isSyncing: syncQuery.isFetching,
    error: offlineQuery.error || syncQuery.error,
    isOnline,
  };
}
```

---

## Step 6: Create Offline Banner Component (20 min)

Create `src/components/OfflineBanner.tsx`:

```typescript
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useQueryClient } from '@tanstack/react-query';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  // Handle manual retry - trigger background sync instead of full reload
  const handleRetry = async () => {
    await queryClient.invalidateQueries({ queryKey: ['transactions', 'sync'] });
    await queryClient.invalidateQueries({ queryKey: ['accounts', 'sync'] });
    await queryClient.invalidateQueries({ queryKey: ['categories', 'sync'] });
  };

  // Don't show banner when online
  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-yellow-950 px-4 py-2 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2">
        <WifiOff className="h-5 w-5" />
        <span className="font-medium">
          You're offline. Changes will sync when connection is restored.
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRetry}
        className="text-yellow-950 hover:bg-yellow-600"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Retry
      </Button>
    </div>
  );
}
```

---

## Step 7: Create Sync Status Component (20 min)

Create `src/components/SyncStatus.tsx`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { cacheManager } from '@/lib/offline/cacheManager';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export function SyncStatus() {
  const isOnline = useOnlineStatus();

  // Query last sync time
  const { data: lastSync } = useQuery({
    queryKey: ['lastSync'],
    queryFn: () => cacheManager.getLastSync(),
    refetchInterval: 60000, // Update every minute
  });

  // Query pending count
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['pendingCount'],
    queryFn: () => cacheManager.getPendingCount(),
    refetchInterval: 5000, // Update every 5 seconds
  });

  const getStatusIcon = () => {
    if (!isOnline) {
      return <AlertCircle className="h-4 w-4 text-yellow-600" />;
    }
    if (pendingCount > 0) {
      return <RefreshCw className="h-4 w-4 text-blue-600 animate-spin" />;
    }
    return <Check className="h-4 w-4 text-green-600" />;
  };

  const getStatusText = () => {
    if (!isOnline) {
      return 'Offline';
    }
    if (pendingCount > 0) {
      return `Syncing ${pendingCount} change${pendingCount === 1 ? '' : 's'}...`;
    }
    if (lastSync) {
      return `Synced ${formatDistanceToNow(lastSync, { addSuffix: true })}`;
    }
    return 'Never synced';
  };

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      {getStatusIcon()}
      <span>{getStatusText()}</span>
    </div>
  );
}
```

---

## Step 8: Add to App Layout (10 min)

Update `src/App.tsx` to include offline banner:

```typescript
import { OfflineBanner } from '@/components/OfflineBanner';
import { SyncStatus } from '@/components/SyncStatus';

export function App() {
  return (
    <>
      <OfflineBanner />

      <div className="min-h-screen">
        {/* Header with sync status */}
        <header className="border-b">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <h1>Household Hub</h1>
            <SyncStatus />
          </div>
        </header>

        {/* Main content */}
        <main>
          <Outlet />
        </main>
      </div>
    </>
  );
}
```

---

## Step 9: Test Offline Reads (10 min)

Test in browser DevTools:

```javascript
// 1. Open Network tab, set to "Offline"
// 2. Navigate to transactions page
// 3. Should see data from IndexedDB instantly
// 4. Check console for "Reading from IndexedDB"

// 5. Set back to "Online"
// 6. Should see sync query running in background
// 7. Check console for "Syncing from Supabase"

// 8. Verify last sync time updates
// 9. Verify offline banner appears/disappears correctly
```

---

## Done!

When tests pass, you're ready for the checkpoint.

**Next**: Run through `CHECKPOINT.md` to verify offline reads work correctly.
