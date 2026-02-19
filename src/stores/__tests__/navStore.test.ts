import { describe, it, expect, beforeEach } from "vitest";
import { useNavStore } from "../navStore";

describe("navStore", () => {
  beforeEach(() => {
    // Reset all state including persisted fields
    useNavStore.setState({
      sidebarCollapsed: false,
      mobileNavOpen: false,
      quickAddOpen: false,
      activeRoute: "/",
    });
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = useNavStore.getState();
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.mobileNavOpen).toBe(false);
      expect(state.quickAddOpen).toBe(false);
      expect(state.activeRoute).toBe("/");
    });
  });

  describe("sidebar", () => {
    it("setSidebarCollapsed sets the value directly", () => {
      useNavStore.getState().setSidebarCollapsed(true);
      expect(useNavStore.getState().sidebarCollapsed).toBe(true);
    });

    it("toggleSidebar flips the collapsed state", () => {
      expect(useNavStore.getState().sidebarCollapsed).toBe(false);

      useNavStore.getState().toggleSidebar();
      expect(useNavStore.getState().sidebarCollapsed).toBe(true);

      useNavStore.getState().toggleSidebar();
      expect(useNavStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe("mobileNavOpen", () => {
    it("opens mobile nav", () => {
      useNavStore.getState().setMobileNavOpen(true);
      expect(useNavStore.getState().mobileNavOpen).toBe(true);
    });

    it("closes mobile nav", () => {
      useNavStore.getState().setMobileNavOpen(true);
      useNavStore.getState().setMobileNavOpen(false);
      expect(useNavStore.getState().mobileNavOpen).toBe(false);
    });
  });

  describe("quickAddOpen", () => {
    it("opens quick add dialog", () => {
      useNavStore.getState().setQuickAddOpen(true);
      expect(useNavStore.getState().quickAddOpen).toBe(true);
    });

    it("closes quick add dialog", () => {
      useNavStore.getState().setQuickAddOpen(true);
      useNavStore.getState().setQuickAddOpen(false);
      expect(useNavStore.getState().quickAddOpen).toBe(false);
    });
  });

  describe("activeRoute", () => {
    it("updates the active route", () => {
      useNavStore.getState().setActiveRoute("/transactions");
      expect(useNavStore.getState().activeRoute).toBe("/transactions");
    });

    it("can change routes multiple times", () => {
      useNavStore.getState().setActiveRoute("/budgets");
      useNavStore.getState().setActiveRoute("/analytics");
      expect(useNavStore.getState().activeRoute).toBe("/analytics");
    });
  });

  describe("localStorage persistence", () => {
    it("persists sidebarCollapsed to localStorage", () => {
      useNavStore.getState().setSidebarCollapsed(true);

      // The persist middleware writes to localStorage under the key "nav-preferences"
      const stored = localStorage.getItem("nav-preferences");
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.state.sidebarCollapsed).toBe(true);
    });

    it("only persists sidebarCollapsed (partialize)", () => {
      useNavStore.getState().setMobileNavOpen(true);
      useNavStore.getState().setQuickAddOpen(true);
      useNavStore.getState().setActiveRoute("/budgets");

      const stored = localStorage.getItem("nav-preferences");
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      // Only sidebarCollapsed should be in the persisted state
      expect(parsed.state).toHaveProperty("sidebarCollapsed");
      expect(parsed.state).not.toHaveProperty("mobileNavOpen");
      expect(parsed.state).not.toHaveProperty("quickAddOpen");
      expect(parsed.state).not.toHaveProperty("activeRoute");
    });
  });
});
