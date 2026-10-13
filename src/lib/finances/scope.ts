import type { FinanceScope } from "./overview";

const SCOPE_KEY = "household-hub-finances-scope";

/** Per device; Household until the member picks Mine. */
export function readFinanceScope(): FinanceScope {
  try {
    return localStorage.getItem(SCOPE_KEY) === "mine" ? "mine" : "household";
  } catch {
    return "household";
  }
}

export function rememberFinanceScope(scope: FinanceScope): void {
  try {
    localStorage.setItem(SCOPE_KEY, scope);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}
