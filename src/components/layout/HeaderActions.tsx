import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface HeaderSlot {
  slot: HTMLElement | null;
  setSlot: (element: HTMLElement | null) => void;
}

const HeaderSlotContext = createContext<HeaderSlot>({ slot: null, setSlot: () => {} });

/** Holds the header's actions slot, so a route can fill it from inside the outlet. */
export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot }}>{children}</HeaderSlotContext.Provider>
  );
}

export const useHeaderSlot = () => useContext(HeaderSlotContext);

/** Renders a route's actions (month picker, Edit plan, Select) on the right of the header. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const { slot } = useHeaderSlot();
  return slot ? createPortal(children, slot) : null;
}
