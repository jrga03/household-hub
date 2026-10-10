import { useEffect } from "react";
import { useHousehold } from "@/hooks/useHousehold";
import { startEventSync } from "@/lib/sync";

/** Syncs the event log while a member of a household is signed in. */
export function useEventSync() {
  const householdId = useHousehold().household?.id;

  useEffect(() => {
    if (!householdId) return;
    return startEventSync();
  }, [householdId]);
}
