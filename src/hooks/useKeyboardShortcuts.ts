/**
 * useKeyboardShortcuts Hook
 *
 * Registers global keyboard shortcuts for navigation and actions.
 * Provides Gmail-style "g then x" navigation shortcuts.
 *
 * Supported Shortcuts:
 * - Cmd/Ctrl + K: Open command palette / quick search
 * - Cmd/Ctrl + N: New transaction
 * - g then d: Go to Dashboard
 * - g then t: Go to Transactions
 * - g then a: Go to Analytics
 * - g then s: Go to Settings
 * - ?: Show keyboard shortcuts help
 * - Esc: Close modals/dialogs
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

/**
 * Get keyboard shortcut key string for display
 * @param key - The key (e.g., "N", "K")
 * @param withModifier - Whether to include Cmd/Ctrl modifier
 * @returns Formatted shortcut string (e.g., "⌘N" on Mac, "Ctrl+N" on Windows)
 */
export function getShortcutKey(key: string, withModifier = false): string {
  const isMac =
    typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modKey = isMac ? "⌘" : "Ctrl+";

  if (withModifier) {
    return `${modKey}${key}`;
  }

  return key;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs, textareas, or contenteditable
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        // Allow Esc even in inputs (to close modals)
        if (e.key !== "Escape") {
          return;
        }
      }

      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Cmd/Ctrl + K: Command palette / Quick search
      if (modKey && e.key === "k") {
        e.preventDefault();
        toast.info("Command palette coming soon!", {
          description: "Quick search and actions will be available here",
        });
        return;
      }

      // Cmd/Ctrl + N: New transaction
      if (modKey && e.key === "n") {
        e.preventDefault();
        navigate({ to: "/transactions" });
        // Dispatch custom event to open transaction form
        window.dispatchEvent(new CustomEvent("open-transaction-form"));
        toast.success("Opening transaction form");
        return;
      }

      // ?: Show keyboard shortcuts help
      if (e.key === "?" && !modKey) {
        e.preventDefault();
        showKeyboardShortcutsHelp();
        return;
      }

      // Esc: Close modals/dialogs
      if (e.key === "Escape") {
        // Dispatch custom event for components to listen to
        window.dispatchEvent(new CustomEvent("close-modal"));
        return;
      }

      // Gmail-style "g then x" navigation
      // Check if last key was 'g' within 1 second
      const now = Date.now();
      if (lastKeyRef.current === "g" && now - lastKeyTimeRef.current < 1000) {
        e.preventDefault();

        switch (e.key) {
          case "d": // g then d: Dashboard
            navigate({ to: "/dashboard" });
            toast.success("Navigated to Dashboard");
            break;
          case "t": // g then t: Transactions
            navigate({ to: "/transactions" });
            toast.success("Navigated to Transactions");
            break;
          case "a": // g then a: Analytics
            navigate({ to: "/analytics" });
            toast.success("Navigated to Analytics");
            break;
          case "s": // g then s: Settings
            navigate({ to: "/settings" });
            toast.success("Navigated to Settings");
            break;
          case "i": // g then i: Import
            navigate({ to: "/import" });
            toast.success("Navigated to Import");
            break;
          default:
            // Invalid sequence
            break;
        }

        // Reset sequence
        lastKeyRef.current = null;
        lastKeyTimeRef.current = 0;
      } else if (e.key === "g" && !modKey) {
        // Start of sequence
        lastKeyRef.current = "g";
        lastKeyTimeRef.current = now;

        // Show toast hint
        toast.info("Navigation mode active", {
          description: "Press: d (Dashboard), t (Transactions), a (Analytics), s (Settings)",
          duration: 1000,
        });
      } else {
        // Reset sequence on any other key
        lastKeyRef.current = null;
        lastKeyTimeRef.current = 0;
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [navigate]);
}

/**
 * Show keyboard shortcuts help dialog
 */
function showKeyboardShortcutsHelp() {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modKey = isMac ? "⌘" : "Ctrl";

  const shortcuts = [
    { keys: `${modKey} + K`, description: "Open command palette / Quick search" },
    { keys: `${modKey} + N`, description: "New transaction" },
    { keys: "g then d", description: "Go to Dashboard" },
    { keys: "g then t", description: "Go to Transactions" },
    { keys: "g then a", description: "Go to Analytics" },
    { keys: "g then s", description: "Go to Settings" },
    { keys: "g then i", description: "Go to Import" },
    { keys: "?", description: "Show keyboard shortcuts" },
    { keys: "Esc", description: "Close modals/dialogs" },
  ];

  // Create and show help toast
  const helpContent = shortcuts.map((s) => `${s.keys}: ${s.description}`).join("\n");

  toast.info("Keyboard Shortcuts", {
    description: helpContent,
    duration: 10000, // 10 seconds
  });
}

/** Hook to listen for "open transaction form" event */
export function useOpenTransactionFormShortcut(callback: () => void) {
  useEffect(() => {
    const handleOpen = () => callback();
    window.addEventListener("open-transaction-form", handleOpen);
    return () => window.removeEventListener("open-transaction-form", handleOpen);
  }, [callback]);
}

/** Hook to listen for "close modal" event (Esc key) */
export function useCloseModalShortcut(callback: () => void) {
  useEffect(() => {
    const handleClose = () => callback();
    window.addEventListener("close-modal", handleClose);
    return () => window.removeEventListener("close-modal", handleClose);
  }, [callback]);
}
