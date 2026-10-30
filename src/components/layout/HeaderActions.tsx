import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** A temporary mode, such as selecting, that takes over the header and the bottom bar. */
export interface ShellMode {
  title: string;
  exitLabel: string;
  exit: () => void;
}

interface HeaderSlot {
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
  mode: ShellMode | null;
  setMode: (mode: ShellMode | null) => void;
  /** Where a mode's actions go on phones, in place of the tab bar; null on wide screens. */
  bottomSlot: HTMLElement | null;
  setBottomSlot: (element: HTMLElement | null) => void;
}

const HeaderSlotContext = createContext<HeaderSlot>({
  slot: null,
  setSlot: () => {},
  mode: null,
  setMode: () => {},
  bottomSlot: null,
  setBottomSlot: () => {},
});

/** Holds the header's actions slot and mode, so a route can fill them from inside the outlet. */
export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<ShellMode | null>(null);
  const [bottomSlot, setBottomSlot] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot, mode, setMode, bottomSlot, setBottomSlot }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

export const useHeaderSlot = () => useContext(HeaderSlotContext);

/** Renders a route's actions (month picker, Set budgets, Select) on the right of the header. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const { slot } = useHeaderSlot();
  return slot ? createPortal(children, slot) : null;
}
