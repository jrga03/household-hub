import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useNavStore } from "@/stores/navStore";
import { toast } from "sonner";

/**
 * Keyboard shortcuts for navigation and common actions
 *
 * Global shortcuts:
 * - Cmd/Ctrl + B: Toggle sidebar
 * - Cmd/Ctrl + K: Open command palette (future)
 * - Cmd/Ctrl + Shift + N: Quick add transaction
 *
 * Navigation shortcuts:
 * - Cmd/Ctrl + Shift + D: Dashboard
 * - Cmd/Ctrl + Shift + T: Transactions
 * - Cmd/Ctrl + Shift + A: Accounts
 * - Cmd/Ctrl + Shift + B: Budgets
 * - Cmd/Ctrl + Shift + C: Categories
 * - Cmd/Ctrl + Shift + S: Settings
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const toggleSidebar = useNavStore((state) => state.toggleSidebar);
  const setQuickAddOpen = useNavStore((state) => state.setQuickAddOpen);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Check for modifier keys
      const isMod = event.metaKey || event.ctrlKey; // Cmd on Mac, Ctrl on Windows/Linux

      if (!isMod) return; // All our shortcuts require Cmd/Ctrl

      // Toggle sidebar: Cmd/Ctrl + B
      if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        toggleSidebar();
        return;
      }

      // Command palette (future): Cmd/Ctrl + K
      if (event.key === "k" || event.key === "K") {
        if (!event.shiftKey) {
          event.preventDefault();
          toast.info("Command palette coming soon!");
          return;
        }
      }

      // Quick add transaction: Cmd/Ctrl + Shift + N
      if (event.shiftKey && (event.key === "n" || event.key === "N")) {
        event.preventDefault();
        setQuickAddOpen(true);
        return;
      }

      // Navigation shortcuts (all require Shift)
      if (event.shiftKey) {
        let navigateTo: string | null = null;

        switch (event.key.toLowerCase()) {
          case "d":
            navigateTo = "/";
            break;
          case "t":
            navigateTo = "/transactions";
            break;
          case "a":
            navigateTo = "/accounts";
            break;
          case "b":
            navigateTo = "/budgets";
            break;
          case "c":
            navigateTo = "/categories";
            break;
          case "s":
            navigateTo = "/settings";
            break;
        }

        if (navigateTo) {
          event.preventDefault();
          navigate({ to: navigateTo });
        }
      }
    }

    // Add event listener
    window.addEventListener("keydown", handleKeyDown);

    // Cleanup
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate, toggleSidebar, setQuickAddOpen]);
}

/**
 * Returns a formatted string for displaying keyboard shortcuts
 * Detects the user's platform and shows appropriate modifier key
 */
export function getShortcutKey(key: string, withShift = false): string {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modifier = isMac ? "⌘" : "Ctrl";
  const shift = withShift ? (isMac ? "⇧" : "Shift+") : "";

  return `${modifier}${shift}${key.toUpperCase()}`;
}

/**
 * Hook to get all available shortcuts for display in help menu
 */
export function useShortcutsList() {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const mod = isMac ? "⌘" : "Ctrl";
  const shift = isMac ? "⇧" : "Shift";

  return [
    { keys: `${mod}B`, description: "Toggle sidebar" },
    { keys: `${mod}${shift}N`, description: "Add transaction" },
    { keys: `${mod}${shift}D`, description: "Go to Dashboard" },
    { keys: `${mod}${shift}T`, description: "Go to Transactions" },
    { keys: `${mod}${shift}A`, description: "Go to Accounts" },
    { keys: `${mod}${shift}B`, description: "Go to Budgets" },
    { keys: `${mod}${shift}C`, description: "Go to Categories" },
    { keys: `${mod}${shift}S`, description: "Go to Settings" },
    { keys: `${mod}K`, description: "Command palette (coming soon)" },
  ];
}
