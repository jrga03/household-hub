import { useLiveQuery } from "dexie-react-hooks";
import { countWaiting, listStuck } from "@/lib/events/log";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/** Online or not, the waiting count and the stuck changes; live as events are added and pushed. */
export function useSyncStatus() {
  const online = useOnlineStatus();
  const waiting = useLiveQuery(countWaiting, [], 0);
  const stuck = useLiveQuery(listStuck, [], []);
  return { online, waiting, stuck };
}
