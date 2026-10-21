import { createContext, use } from "react";

export const BELOW_HEADER = "top-(--app-header)";
export const PANE_MAX_HEIGHT = "max-h-[calc(100dvh-var(--app-header)-2rem)]";

/** The `list-detail` shell width from which the detail sits beside the list. */
export const TWO_PANES_FROM = 840;

export const TwoPanesContext = createContext(false);

/** Whether the `list-detail` shell around this component shows two panes. */
export const useTwoPanes = () => use(TwoPanesContext);
