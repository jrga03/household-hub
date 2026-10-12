import { AMOUNT_PROBLEM, asCents, formatPHP, isAmount, type Cents } from "@/lib/currency";
import type { LoggedEvent } from "@/lib/events/log";
import type { EventVersions } from "@/lib/events/versions";
import { isLocalDate } from "@/lib/transactions/events";

export const ALLOCATION_ENTITY = "allocation";
export const ALLOCATION_CREATED = "allocation.created";
export const ALLOCATION_EDITED = "allocation.edited";
export const ALLOCATION_REMOVED = "allocation.removed";
export const ALLOCATION_RESTORED = "allocation.restored";

export const ALLOCATION_VERSIONS = {
  [ALLOCATION_CREATED]: { current: 1, upcasts: {} },
  [ALLOCATION_EDITED]: { current: 1, upcasts: {} },
  [ALLOCATION_REMOVED]: { current: 1, upcasts: {} },
  [ALLOCATION_RESTORED]: { current: 1, upcasts: {} },
} satisfies EventVersions;

/** Where money sits inside one account: a category, a card's Card Payment, or Unassigned. */
export type Envelope =
  { kind: "unassigned" } | { kind: "category"; id: string } | { kind: "card_payment"; id: string };

export const UNASSIGNED_ENVELOPE: Envelope = { kind: "unassigned" };

export const cardPaymentEnvelope = (cardId: string): Envelope => ({
  kind: "card_payment",
  id: cardId,
});

export function envelopeLabel(
  envelope: Envelope,
  categories: Map<string, string>,
  accounts: Map<string, string>
): string {
  if (envelope.kind === "unassigned") return "Unassigned";
  if (envelope.kind === "category") return categories.get(envelope.id) ?? "A category";
  return `Card Payment · ${accounts.get(envelope.id) ?? "A card"}`;
}

export const sameEnvelope = (a: Envelope, b: Envelope) =>
  a.kind === b.kind && (a.kind === "unassigned" || (b.kind !== "unassigned" && a.id === b.id));

/** What a member can edit; removal resolves apart from these. */
export interface AllocationDetails {
  /** The member's local calendar date, "yyyy-MM-dd". */
  date: string;
  accountId: string;
  from: Envelope;
  to: Envelope;
  amountCents: Cents;
}

type DetailsCheck =
  { details: AllocationDetails; problem: null } | { details: null; problem: string };

const rejected = (problem: string): DetailsCheck => ({ details: null, problem });

export function decodeEnvelope(value: unknown): Envelope | null {
  if (typeof value !== "object" || value === null || !("kind" in value)) return null;
  if (value.kind === "unassigned") return UNASSIGNED_ENVELOPE;
  if (value.kind !== "category" && value.kind !== "card_payment") return null;
  const id = "id" in value ? value.id : null;
  return typeof id === "string" && id !== "" ? { kind: value.kind, id } : null;
}

/**
 * Validates allocation details from a form or from another device's event.
 * Whether the account and envelopes exist, are in use and fit is checked by
 * the commands, against what this device holds.
 */
export function checkAllocationDetails(input: Record<string, unknown>): DetailsCheck {
  const { date, accountId, amountCents } = input;
  if (!isLocalDate(date)) return rejected("Choose a date.");
  if (typeof accountId !== "string" || accountId === "") return rejected("Choose an account.");
  const from = decodeEnvelope(input.from);
  if (!from) return rejected("Choose where the money comes from.");
  const to = decodeEnvelope(input.to);
  if (!to) return rejected("Choose where the money goes.");
  if (sameEnvelope(from, to)) return rejected("Choose two different places to move money between.");
  if (!isAmount(amountCents)) return rejected(AMOUNT_PROBLEM);
  return {
    details: { date, accountId, from, to, amountCents: asCents(amountCents) },
    problem: null,
  };
}

/** The details a create or edit sets, or null for any other event or a broken payload. */
export function decodeAllocationDetails(event: LoggedEvent): AllocationDetails | null {
  if (event.eventType !== ALLOCATION_CREATED && event.eventType !== ALLOCATION_EDITED) {
    return null;
  }
  return checkAllocationDetails(event.payload).details;
}

/** Whether a remove or restore leaves the allocation removed, or null for any other event. */
export function decodeAllocationRemoval(event: LoggedEvent): boolean | null {
  if (event.eventType === ALLOCATION_REMOVED) return true;
  if (event.eventType === ALLOCATION_RESTORED) return false;
  return null;
}

const ACTION_LABELS: Record<string, string> = {
  [ALLOCATION_CREATED]: "Move money",
  [ALLOCATION_EDITED]: "Edit allocation",
  [ALLOCATION_REMOVED]: "Remove allocation",
  [ALLOCATION_RESTORED]: "Restore allocation",
};

/**
 * What a change was ("Move money: ₱8,000.00"). A create or edit names the
 * amount it set; anything else the amount this device holds.
 */
export function describeAllocationEvent(
  event: LoggedEvent,
  current: AllocationDetails | undefined
): string {
  const action = ACTION_LABELS[event.eventType] ?? "Change allocation";
  const details = decodeAllocationDetails(event) ?? current;
  return details ? `${action}: ${formatPHP(details.amountCents)}` : action;
}
