// Per device, keyed by household, so joining another household shows its checklist.
const dismissedKey = (householdId: string) =>
  `household-hub-opening-checklist-dismissed:${householdId}`;

export function isOpeningChecklistDismissed(householdId: string): boolean {
  try {
    return localStorage.getItem(dismissedKey(householdId)) === "true";
  } catch {
    return false;
  }
}

export function dismissOpeningChecklist(householdId: string): void {
  try {
    localStorage.setItem(dismissedKey(householdId), "true");
  } catch {
    // Storage blocked: it stays dismissed until the page reloads.
  }
}
