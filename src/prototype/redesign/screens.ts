// PROTOTYPE (#194): the screens and their variants.
import type { ReactNode } from "react";
import { HOME_VARIANTS } from "./home";
import { TRANSACTIONS_VARIANTS } from "./transactions";
import { BUDGET_VARIANTS } from "./budget";

export type ScreenKey = "home" | "transactions" | "budget";

export interface Variant {
  key: string;
  /** What makes it different, shown in the switcher. */
  name: string;
  /** Header actions beside the title. */
  actions?: () => ReactNode;
  Body: () => ReactNode;
}

export const SCREENS: Record<ScreenKey, { title: string; variants: Variant[] }> = {
  home: { title: "Home", variants: HOME_VARIANTS },
  transactions: { title: "Transactions", variants: TRANSACTIONS_VARIANTS },
  budget: { title: "Budget", variants: BUDGET_VARIANTS },
};

export const SCREEN_KEYS = Object.keys(SCREENS) as ScreenKey[];
