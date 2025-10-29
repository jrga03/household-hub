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

interface AuthActions {
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
async function checkUnsyncedData(): Promise<boolean> {
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

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  session: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      set({
        user: data.session?.user ?? null,
        session: data.session,
        initialized: true,
      });

      // Listen for auth changes
      supabase.auth.onAuthStateChange((_event, session) => {
        set({
          user: session?.user ?? null,
          session,
        });
      });
    } catch (error) {
      console.error("Auth initialization error:", error);
      set({ initialized: true });
    }
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

  signOut: async () => {
    set({ loading: true });
    try {
      // Check for unsynced offline data (Decision #84)
      const hasOfflineData = await checkUnsyncedData();

      if (hasOfflineData) {
        const shouldExport = window.confirm(
          "⚠️ You have unsynced offline data.\n\n" +
            "This data will be lost if you log out now.\n\n" +
            "Would you like to export it first?"
        );

        if (shouldExport) {
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
            window.alert("Export failed. Please try manual export from Settings.");
            set({ loading: false });
            return; // Abort logout if export fails
          }
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
