import { useLiveQuery } from "dexie-react-hooks";
import { Money } from "@/components/app/Money";
import { absCents } from "@/lib/currency";
import { readUnassigned } from "@/lib/review/count";

/** Review's and Home's sentence for Unassigned money; nothing while it loads. */
export function UnassignedSentence() {
  const unassigned = useLiveQuery(readUnassigned, []);
  if (unassigned === undefined) return null;
  if (unassigned >= 0) {
    return (
      <>
        <Money kind="balance" cents={unassigned} /> waits to be assigned
      </>
    );
  }
  return (
    <span className="text-shortfall">
      <Money kind="balance" cents={absCents(unassigned)} /> more assigned than you have
    </span>
  );
}
