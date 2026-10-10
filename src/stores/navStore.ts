import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Navigation State Management Store
 *
 * Manages sidebar and mobile navigation states with persistence.
 * Stores user preferences for sidebar collapsed state in localStorage.
 *
 * Features:
 * - Persistent sidebar collapsed state
 * - Responsive behavior states
 *
 * @see src/components/layout/AppLayout.tsx
 */

interface NavStore {
  // Sidebar state (persisted)
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Mobile navigation state (not persisted)
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
}

export const useNavStore = create<NavStore>()(
  persist(
    (set) => ({
      // Sidebar state - default expanded on desktop
      sidebarCollapsed: false,
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleSidebar: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),

      // Mobile nav - always starts closed
      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
    }),
    {
      name: "nav-preferences", // localStorage key
      partialize: (state) => ({
        // Only persist sidebar collapsed state
        // Don't persist temporary UI states
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);
