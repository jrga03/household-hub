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

vi.mock("@/lib/dexie/db", () => ({
  db: {
    syncQueue: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          count: vi.fn().mockResolvedValue(0),
        })),
      })),
    },
    delete: vi.fn().mockResolvedValue(undefined),
    open: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/csv-exporter", () => ({
  csvExporter: {
    exportTransactions: vi.fn().mockResolvedValue("csv-data"),
    downloadCsv: vi.fn(),
  },
}));

// Now import subjects under test
import { useAuthStore } from "../authStore";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/dexie/db";
import { csvExporter } from "@/lib/csv-exporter";

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
    // Default: no unsynced data
    vi.mocked(db.syncQueue.where).mockReturnValue({
      anyOf: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(0),
      }),
    } as never);
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
    it("clears IndexedDB and signs out when no unsynced data", async () => {
      vi.mocked(supabase.auth.signOut).mockResolvedValue({
        error: null,
      } as never);

      useAuthStore.setState({ user: mockUser, session: mockSession });

      await useAuthStore.getState().signOut();

      expect(db.delete).toHaveBeenCalled();
      expect(db.open).toHaveBeenCalled();
      expect(supabase.auth.signOut).toHaveBeenCalled();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().session).toBeNull();
      expect(useAuthStore.getState().loading).toBe(false);
    });

    it("prompts to export when unsynced data exists", async () => {
      // Setup: has unsynced data
      vi.mocked(db.syncQueue.where).mockReturnValue({
        anyOf: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(3),
        }),
      } as never);

      // User declines export
      vi.spyOn(window, "confirm").mockReturnValue(false);
      vi.mocked(supabase.auth.signOut).mockResolvedValue({
        error: null,
      } as never);

      await useAuthStore.getState().signOut();

      expect(window.confirm).toHaveBeenCalled();
      // Should still sign out even if user declines export
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });

    it("exports and signs out when user accepts export", async () => {
      // Setup: has unsynced data
      vi.mocked(db.syncQueue.where).mockReturnValue({
        anyOf: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(3),
        }),
      } as never);

      // User accepts export
      vi.spyOn(window, "confirm").mockReturnValue(true);
      vi.mocked(csvExporter.exportTransactions).mockResolvedValue("csv-data");
      vi.mocked(supabase.auth.signOut).mockResolvedValue({
        error: null,
      } as never);

      await useAuthStore.getState().signOut();

      expect(csvExporter.exportTransactions).toHaveBeenCalled();
      expect(csvExporter.downloadCsv).toHaveBeenCalledWith(
        "csv-data",
        expect.stringContaining("household-hub-backup-")
      );
      expect(supabase.auth.signOut).toHaveBeenCalled();
    });

    it("aborts logout if export fails", async () => {
      // Setup: has unsynced data
      vi.mocked(db.syncQueue.where).mockReturnValue({
        anyOf: vi.fn().mockReturnValue({
          count: vi.fn().mockResolvedValue(3),
        }),
      } as never);

      // User accepts export but it fails
      vi.spyOn(window, "confirm").mockReturnValue(true);
      vi.spyOn(window, "alert").mockImplementation(() => {});
      vi.mocked(csvExporter.exportTransactions).mockRejectedValue(new Error("Export failed"));
      vi.mocked(supabase.auth.signOut).mockResolvedValue({
        error: null,
      } as never);

      await useAuthStore.getState().signOut();

      // Should NOT sign out — logout aborted
      expect(supabase.auth.signOut).not.toHaveBeenCalled();
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Export failed"));
      expect(useAuthStore.getState().loading).toBe(false);
    });
  });
});
