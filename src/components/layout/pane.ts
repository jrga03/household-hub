import { createContext, use } from "react";

// The shell header is sticky and h-14.
export const BELOW_HEADER = "top-[calc(3.5rem+var(--safe-area-top))]";
export const PANE_MAX_HEIGHT = "max-h-[calc(100dvh-3.5rem-2rem-var(--safe-area-top))]";

/** The `list-detail` shell width from which the detail sits beside the list. */
export const TWO_PANES_FROM = 840;

export const TwoPanesContext = createContext(false);

/** Whether the `list-detail` shell around this component shows two panes. */
export const useTwoPanes = () => use(TwoPanesContext);
