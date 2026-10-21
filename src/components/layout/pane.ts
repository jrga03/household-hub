import { createContext, use } from "react";

export const BELOW_HEADER = "top-(--app-header)";
export const PANE_MAX_HEIGHT = "max-h-[calc(100dvh-var(--app-header)-2rem)]";

/** The shell width from which `list-detail` and `supporting-pane` show two columns. */
export const TWO_PANES_FROM = 840;

export const TwoPanesContext = createContext(false);

/** Whether the `list-detail` or `supporting-pane` shell around this component shows two columns. */
export const useTwoPanes = () => use(TwoPanesContext);
