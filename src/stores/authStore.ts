import { create } from "zustand";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/dexie/db";
import { csvExporter } from "@/lib/csv-exporter";

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
}

export interface SignOutOptions {
  /**
   * Export a CSV backup before local data is cleared. The "you have unsynced
   * changes — export first?" confirmation lives in the component layer (see
   * `signOutWithConfirm` in `@/lib/sign-out`), NOT in this store (review R39).
   */
  exportFirst?: boolean;
}

interface AuthActions {
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: (options?: SignOutOptions) => Promise<void>;
  initialize: () => Promise<void>;
}

/**
 * Check if there are unsynced changes in the sync queue
 *
 * Per SyncQueueItem schema (db.ts line 103), valid statuses are:
 * "queued" | "syncing" | "completed" | "failed"
 *
 * Queries the sync queue for non-completed items (unsynced data).
 *
 * @returns true if unsynced data exists, false otherwise (or on error)
 */
export async function checkUnsyncedData(): Promise<boolean> {
  try {
    const queueCount = await db.syncQueue
      .where("status")
      .anyOf(["queued", "syncing", "failed"]) // ✓ Matches SyncQueueItem schema
      .count();
    return queueCount > 0;
  } catch (error) {
    console.error("Failed to check unsynced data:", error);
    return false; // Fail gracefully - don't block logout
  }
}

/**
 * Clear all IndexedDB data (logout cleanup)
 *
 * Deletes the entire database and recreates it as empty.
 * This ensures a clean slate for the next user login.
 *
 * Note: Continues even if cleanup fails to ensure network logout succeeds
 */
async function clearIndexedDB(): Promise<void> {
  try {
    await db.delete();
    await db.open(); // Recreate empty database
  } catch (error) {
    console.error("Failed to clear IndexedDB:", error);
    // Continue with logout even if clear fails
  }
}

// Idempotency for initialize(): AuthProvider and route guards may all call
// it; they share one in-flight run instead of stacking duplicate
// onAuthStateChange listeners (review UI-12).
let initPromise: Promise<void> | null = null;
let authSubscription: { unsubscribe: () => void } | null = null;

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    // Share the in-flight/settled run while the store says we're initialized;
    // re-run after an explicit state reset (tests, future account switching)
    if (initPromise && useAuthStore.getState().initialized) return initPromise;

    initPromise = (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        set({
          user: data.session?.user ?? null,
          session: data.session,
          initialized: true,
        });

        // Listen for auth changes (exactly one listener, replaced if
        // initialize somehow runs again after a reset)
        authSubscription?.unsubscribe();
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          set({
            user: session?.user ?? null,
            session,
          });
        });
        authSubscription = subscription;
      } catch (error) {
        console.error("Auth initialization error:", error);
        set({ initialized: true });
      }
    })();

    return initPromise;
  },

  signUp: async (email: string, password: string) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      set({
        user: data.user,
        session: data.session,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signIn: async (email: string, password: string) => {
    set({ loading: true });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      set({
        user: data.user,
        session: data.session,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  signOut: async (options?: SignOutOptions) => {
    set({ loading: true });
    try {
      // Unsynced-data export before logout (Decision #84). Whether to export
      // is decided by the CALLER (component-layer AlertDialog confirm); this
      // store never prompts (review R39).
      if (options?.exportFirst) {
        try {
          // Export all transactions
          const csv = await csvExporter.exportTransactions();
          const date = new Date().toISOString().split("T")[0];
          const filename = `household-hub-backup-${date}.csv`;

          csvExporter.downloadCsv(csv, filename);

          // Give user time to see the download
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error("Export failed:", error);
          // Abort logout if export fails; the caller surfaces the message
          throw new Error("Export failed. Please try manual export from Settings.");
        }
      }

      // Clear local data and sign out
      await clearIndexedDB();
      await supabase.auth.signOut();
      set({
        user: null,
        session: null,
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },
}));
