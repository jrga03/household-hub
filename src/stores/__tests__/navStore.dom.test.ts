import { describe, it, expect, beforeEach } from "vitest";
import { useNavStore } from "../navStore";

describe("navStore", () => {
  beforeEach(() => {
    // Reset all state including persisted fields
    useNavStore.setState({
      sidebarCollapsed: false,
      mobileNavOpen: false,
    });
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = useNavStore.getState();
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.mobileNavOpen).toBe(false);
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

      const stored = localStorage.getItem("nav-preferences");
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      // Only sidebarCollapsed should be in the persisted state
      expect(parsed.state).toHaveProperty("sidebarCollapsed");
      expect(parsed.state).not.toHaveProperty("mobileNavOpen");
    });
  });
});
