import { Money } from "@/components/app/Money";
import { absCents, type Cents } from "@/lib/currency";

/** Review's and Home's sentence for Unassigned money. */
export function UnassignedSentence({ unassigned }: { unassigned: Cents }) {
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
