/**
 * useKeyboardShortcuts Hook
 *
 * Registers global keyboard shortcuts for navigation and actions.
 * Provides Gmail-style "g then x" navigation shortcuts.
 *
 * Supported Shortcuts:
 * - Cmd/Ctrl + K: Open command palette / quick search
 * - n: Add a transaction
 * - g then h: Go to Home
 * - g then t: Go to Transactions
 * - g then c: Go to Categories
 * - g then s: Go to Settings
 * - ?: Show keyboard shortcuts help
 * - Esc: Close modals/dialogs
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useQuickEntryStore } from "@/stores/quickEntryStore";

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimeRef = useRef<number>(0);
  const openQuickEntry = useQuickEntryStore((state) => state.setOpen);

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

      // ?: Show keyboard shortcuts help
      if (e.key === "?" && !modKey) {
        e.preventDefault();
        showKeyboardShortcutsHelp();
        return;
      }

      // Esc is handled natively by Radix dialogs/sheets; nothing to do here

      // Gmail-style "g then x" navigation
      // Check if last key was 'g' within 1 second
      const now = Date.now();
      const inSequence = lastKeyRef.current === "g" && now - lastKeyTimeRef.current < 1000;

      // n: quick entry, unless another dialog is already open
      if (e.key === "n" && !modKey && !e.altKey && !inSequence) {
        if (!document.querySelector('[role="dialog"]')) {
          e.preventDefault();
          openQuickEntry(true);
        }
        return;
      }

      if (inSequence) {
        e.preventDefault();

        // Navigation itself is the feedback; no success toast per hop (UI-09)
        switch (e.key) {
          case "h":
            void navigate({ to: "/" });
            break;
          case "t":
            void navigate({ to: "/transactions" });
            break;
          case "c":
            void navigate({ to: "/categories" });
            break;
          case "s":
            void navigate({ to: "/settings" });
            break;
          default:
            // Invalid sequence
            break;
        }

        // Reset sequence
        lastKeyRef.current = null;
        lastKeyTimeRef.current = 0;
      } else if (e.key === "g" && !modKey) {
        // Start of a "g then x" sequence (silent; the help screen documents
        // the destinations, no per-keystroke toast, review UI-09)
        lastKeyRef.current = "g";
        lastKeyTimeRef.current = now;
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
  }, [navigate, openQuickEntry]);
}

/**
 * Show keyboard shortcuts help dialog
 */
function showKeyboardShortcutsHelp() {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modKey = isMac ? "⌘" : "Ctrl";

  const shortcuts = [
    { keys: `${modKey} + K`, description: "Open command palette / Quick search" },
    { keys: "n", description: "Add a transaction" },
    { keys: "g then h", description: "Go to Home" },
    { keys: "g then t", description: "Go to Transactions" },
    { keys: "g then c", description: "Go to Categories" },
    { keys: "g then s", description: "Go to Settings" },
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
