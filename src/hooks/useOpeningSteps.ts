import { useLiveQuery } from "dexie-react-hooks";
import { readOpeningSteps } from "@/lib/opening/steps";

/** Which opening steps the data shows done; undefined while loading. */
export function useOpeningSteps() {
  return useLiveQuery(readOpeningSteps, []);
}
