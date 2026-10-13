import type { FinanceView } from "./overview";

const VIEW_KEY = "household-hub-finances-view";

/** Per device; Household until the member picks Mine. */
export function readFinanceView(): FinanceView {
  try {
    return localStorage.getItem(VIEW_KEY) === "mine" ? "mine" : "household";
  } catch {
    return "household";
  }
}

export function rememberFinanceView(view: FinanceView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}
