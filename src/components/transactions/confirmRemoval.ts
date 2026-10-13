import { confirm } from "@/lib/confirm";
import { formatPHP, type Cents } from "@/lib/currency";

/** "Remove “Lunch” ₱250.00?", or "Remove ₱250.00?" for a record without a name. */
export const removalQuestion = (name: string, amountCents: Cents) =>
  name === "" ? `Remove ${formatPHP(amountCents)}?` : `Remove “${name}” ${formatPHP(amountCents)}?`;

export const confirmRemoval = (name: string, amountCents: Cents) =>
  confirm({
    title: removalQuestion(name, amountCents),
    description: "You can undo it right after.",
    confirmLabel: "Remove",
    destructive: true,
  });
