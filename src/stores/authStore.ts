import { create } from "zustand";
import { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/dexie/db";
import { csvExporter } from "@/lib/csv-exporter";
import { queryClient } from "@/lib/queryClient";

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

/**
 * Navigate to /login from this non-React module (session-expiry UX, review
 * C2). The router is imported LAZILY: a static edge would create the module
 * cycle authStore → router → routeTree → routes → authStore and pull the
 * whole route tree into every unit test that imports this store. At runtime
 * the router module is already loaded (App.tsx imports it), so the dynamic
 * import resolves instantly from the module cache.
 */
async function navigateToLogin(options?: { preserveRedirect?: boolean }): Promise<void> {
  try {
    const { router } = await import("@/router");
    if (router.state.location.pathname === "/login") return;
    await router.navigate({
      to: "/login",
      // On session expiry, send the user back where they were after re-login
      // (same shape as the beforeLoad guard in routes/__root.tsx)
      search: options?.preserveRedirect ? { redirect: router.state.location.href } : {},
    });
  } catch (error) {
    console.error("Failed to navigate to login:", error);
  }
}

// Set by the deliberate signOut() action so the onAuthStateChange SIGNED_OUT
// handler doesn't ALSO purge/toast/navigate for the same transition (the
// action owns that UX). Reset in the action's finally.
let deliberateSignOut = false;

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
        } = supabase.auth.onAuthStateChange((event, session) => {
          const hadUser = useAuthStore.getState().user !== null;

          set({
            user: session?.user ?? null,
            session,
          });

          // Session-expiry UX (review C2): a resident PWA can sit signed-in
          // for days; when the session dies (refresh-token expiry, remote
          // sign-out) the old behavior kept showing cached financial data and
          // accepted doomed edits. Purge server-state cache, tell the user,
          // and route to /login.
          //
          // Guards — act ONLY on a real authenticated → signed-out
          // transition:
          // - `event === "SIGNED_OUT"` skips TOKEN_REFRESHED / SIGNED_IN /
          //   INITIAL_SESSION (incl. the null session during boot).
          // - `hadUser` skips a SIGNED_OUT fired when we never had a user.
          // - `deliberateSignOut` skips the event echo of the explicit
          //   signOut() action below, which owns its own purge/toast/navigate
          //   (no double toast, no double navigation).
          //
          // Local Dexie data is intentionally NOT cleared here: unsynced
          // offline changes must survive an unexpected expiry so they can
          // sync after re-login. Deliberate sign-out clears it (below).
          if (event === "SIGNED_OUT" && hadUser && !deliberateSignOut) {
            queryClient.clear();
            toast.error("Session expired. Please sign in again.");
            void navigateToLogin({ preserveRedirect: true });
          }
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
    // The supabase SIGNED_OUT event fires DURING the signOut() await below;
    // flag it as deliberate so the onAuthStateChange handler stays quiet and
    // this action's own purge/toast/navigate runs exactly once.
    deliberateSignOut = true;
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

      // Purge cached server state (shared-phone privacy: IndexedDB is
      // cleared above, but TanStack Query still held decoded financial data
      // in memory), confirm, and leave the now-unauthenticated page.
      queryClient.clear();
      toast.success("Signed out");
      void navigateToLogin();
    } catch (error) {
      set({ loading: false });
      throw error;
    } finally {
      deliberateSignOut = false;
    }
  },
}));
