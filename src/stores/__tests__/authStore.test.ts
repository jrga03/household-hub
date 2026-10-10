import { describe, it, expect, beforeEach, vi } from "vitest";
import type { User, Session } from "@supabase/supabase-js";

// Mock external dependencies before import
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock("@/lib/dexie/reset", () => ({
  resetLocalDatabase: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/queryClient", () => ({
  queryClient: {
    clear: vi.fn(),
  },
}));

// The store's navigateToLogin lazily imports "@/router"; this mock also
// keeps the real route tree out of the test module graph
vi.mock("@/router", () => ({
  router: {
    navigate: vi.fn().mockResolvedValue(undefined),
    state: { location: { pathname: "/transactions", href: "/transactions" } },
  },
}));

// Now import subjects under test
import { useAuthStore } from "../authStore";
import { supabase } from "@/lib/supabase";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { toast } from "sonner";
import { queryClient } from "@/lib/queryClient";
import { router } from "@/router";

const mockUser = { id: "user-1", email: "test@example.com" } as User;
const mockSession = { user: mockUser, access_token: "token" } as Session;

describe("authStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      session: null,
      loading: false,
      initialized: false,
    });
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.session).toBeNull();
      expect(state.loading).toBe(false);
      expect(state.initialized).toBe(false);
    });
  });

  describe("initialize", () => {
    it("fetches session and sets initialized", async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: mockSession },
        error: null,
      } as never);

      await useAuthStore.getState().initialize();

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.session).toEqual(mockSession);
      expect(state.initialized).toBe(true);
    });

    it("handles null session", async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as never);

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().initialized).toBe(true);
    });

    it("sets initialized=true even on error", async () => {
      vi.mocked(supabase.auth.getSession).mockRejectedValue(new Error("Network error"));

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().initialized).toBe(true);
    });

    it("subscribes to auth state changes", async () => {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as never);

      await useAuthStore.getState().initialize();

      expect(supabase.auth.onAuthStateChange).toHaveBeenCalledOnce();
    });
  });

  describe("signIn", () => {
    it("sets loading during the request", async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockImplementation(async () => {
        // loading should be true while in-flight
        expect(useAuthStore.getState().loading).toBe(true);
        return { data: { user: mockUser, session: mockSession }, error: null } as never;
      });

      await useAuthStore.getState().signIn("test@example.com", "password");
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("sets user and session on success", async () => {
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      } as never);

      await useAuthStore.getState().signIn("test@example.com", "password");

      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().session).toEqual(mockSession);
    });

    it("throws on auth error and resets loading", async () => {
      const authError = new Error("Invalid credentials");
      vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
        data: { user: null, session: null },
        error: authError,
      } as never);

      await expect(useAuthStore.getState().signIn("test@example.com", "wrong")).rejects.toThrow(
        "Invalid credentials"
      );

      expect(useAuthStore.getState().loading).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe("signUp", () => {
    it("sets user and session on success", async () => {
      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { user: mockUser, session: mockSession },
        error: null,
      } as never);

      await useAuthStore.getState().signUp("new@example.com", "password");

      expect(useAuthStore.getState().user).toEqual(mockUser);
      expect(useAuthStore.getState().session).toEqual(mockSession);
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("throws on auth error and resets loading", async () => {
      const authError = new Error("Email already in use");
      vi.mocked(supabase.auth.signUp).mockResolvedValue({
        data: { user: null, session: null },
        error: authError,
      } as never);

      await expect(
        useAuthStore.getState().signUp("existing@example.com", "password")
      ).rejects.toThrow("Email already in use");

      expect(useAuthStore.getState().loading).toBe(false);
    });
  });

  describe("signOut", () => {
    it("clears IndexedDB and signs out", async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValue({
        error: null,
      } as never);

      useAuthStore.setState({ user: mockUser, session: mockSession });

      await useAuthStore.getState().signOut();

      expect(resetLocalDatabase).toHaveBeenCalled();
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().session).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });
  });

  describe("session expiry UX (review C2)", () => {
    /**
     * Runs initialize() and returns the onAuthStateChange callback the store
     * registered, so tests can fire auth events directly.
     */
    async function initializeAndGetAuthCallback() {
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: { session: null },
        error: null,
      } as never);

      await useAuthStore.getState().initialize();

      const calls = vi.mocked(supabase.auth.onAuthStateChange).mock.calls;
      return calls.at(-1)![0];
    }

    it("purges the query cache, toasts, and navigates to /login on a real signed-out transition", async () => {
      const authCallback = await initializeAndGetAuthCallback();
      useAuthStore.setState({ user: mockUser, session: mockSession });

      await authCallback("SIGNED_OUT", null);

      expect(useAuthStore.getState().user).toBeNull();
      expect(queryClient.clear).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith("Session expired. Please sign in again.");
      // Navigation goes through a lazy import; wait for the microtask
      await vi.waitFor(() => {
        expect(router.navigate).toHaveBeenCalledWith(
          expect.objectContaining({
            to: "/login",
            search: { redirect: "/transactions" },
          })
        );
      });
      // Local Dexie data must SURVIVE an unexpected expiry so unsynced
      // changes can sync after re-login (only deliberate sign-out clears it)
      expect(resetLocalDatabase).not.toHaveBeenCalled();
    });

    it("does nothing on a boot-time null session (no prior user)", async () => {
      const authCallback = await initializeAndGetAuthCallback();

      await authCallback("INITIAL_SESSION", null);
      await authCallback("SIGNED_OUT", null);
      // Let any (incorrect) async navigation settle
      await Promise.resolve();

      expect(queryClient.clear).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it("does not purge or navigate on TOKEN_REFRESHED or SIGNED_IN", async () => {
      const authCallback = await initializeAndGetAuthCallback();
      useAuthStore.setState({ user: mockUser, session: mockSession });

      await authCallback("TOKEN_REFRESHED", mockSession);
      await authCallback("SIGNED_IN", mockSession);
      await Promise.resolve();

      expect(queryClient.clear).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it("deliberate sign-out: one 'Signed out' toast, no expiry toast, one purge, one navigation", async () => {
      const authCallback = await initializeAndGetAuthCallback();
      useAuthStore.setState({ user: mockUser, session: mockSession });

      // The real SDK fires SIGNED_OUT DURING the signOut() await, while the
      // store still holds the user — reproduce that ordering so the
      // deliberate-sign-out guard is what prevents double handling
      vi.mocked(supabase.auth.signOut).mockImplementation(async () => {
        await authCallback("SIGNED_OUT", null);
        return { error: null } as never;
      });

      await useAuthStore.getState().signOut();

      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledTimes(1);
      expect(toast.success).toHaveBeenCalledWith("Signed out");
      expect(queryClient.clear).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => {
        expect(router.navigate).toHaveBeenCalledTimes(1);
      });
      expect(router.navigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/login" }));
    });
  });
});
