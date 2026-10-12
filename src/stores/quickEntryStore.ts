import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LastUsed {
  accountId: string | null;
  categoryId: string | null;
}

interface QuickEntryStore {
  /** The shell's Add transaction dialog; not persisted. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Prefills the next new transaction (persisted). */
  lastUsed: LastUsed;
  setLastUsed: (lastUsed: LastUsed) => void;
}

export const useQuickEntryStore = create<QuickEntryStore>()(
  persist(
    (set) => ({
      open: false,
      setOpen: (open) => set({ open }),
      lastUsed: { accountId: null, categoryId: null },
      setLastUsed: (lastUsed) => set({ lastUsed }),
    }),
    {
      name: "quick-entry",
      partialize: (state) => ({ lastUsed: state.lastUsed }),
    }
  )
);
