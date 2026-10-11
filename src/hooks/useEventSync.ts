import { useEffect } from "react";
import { useHousehold } from "@/hooks/useHousehold";
import { startEventSync } from "@/lib/sync";

/**
 * Syncs the event log while someone is signed in, including on create-or-join:
 * a sync is how a device notices it left or was removed, and wipes the household.
 */
export function useEventSync() {
  const { household, isKnown } = useHousehold();
  const householdId = household?.id ?? null;

  useEffect(() => {
    if (!isKnown) return;
    return startEventSync();
  }, [isKnown, householdId]);
}
