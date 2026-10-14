import { asCents, isAmount, type Cents } from "@/lib/currency";
import { decodeEnvelope, type Envelope } from "@/lib/allocations/events";
import type { LoggedEvent } from "@/lib/events/log";
import type { EventVersions } from "@/lib/events/versions";
import { isLocalDate } from "@/lib/transactions/events";

export const BALANCE_CORRECTION_ENTITY = "balance_correction";
export const BALANCE_CORRECTION_CREATED = "balance_correction.created";
export const BALANCE_CORRECTION_REMOVED = "balance_correction.removed";
export const BALANCE_CORRECTION_RESTORED = "balance_correction.restored";

export const BALANCE_CORRECTION_VERSIONS = {
  [BALANCE_CORRECTION_CREATED]: { current: 1, upcasts: {} },
  [BALANCE_CORRECTION_REMOVED]: { current: 1, upcasts: {} },
  [BALANCE_CORRECTION_RESTORED]: { current: 1, upcasts: {} },
} satisfies EventVersions;

const DIRECTIONS = ["raise", "lower"] as const;
/** Which way the account's balance moves; for a credit card, the amount owed. */
export type CorrectionDirection = (typeof DIRECTIONS)[number];

/** Unassigned or a category: a Card Payment only moves through a card's own records. */
export type CorrectionEnvelope = Exclude<Envelope, { kind: "card_payment" }>;

/** Fixed when recorded: a correction is never edited (ADR 0009). */
export interface CorrectionDetails {
  accountId: string;
  /** The member's local calendar date, "yyyy-MM-dd". */
  date: string;
  /** The difference's size; `direction` gives its sign. */
  amountCents: Cents;
  direction: CorrectionDirection;
  envelope: CorrectionEnvelope;
  /** A credit card's Paying Account when recorded, where its Card Payment moves; null otherwise. */
  payingAccountId: string | null;
}

const isId = (value: unknown): value is string => typeof value === "string" && value !== "";

const isDirection = (value: unknown): value is CorrectionDirection =>
  DIRECTIONS.some((direction) => direction === value);

function decodeCorrectionEnvelope(value: unknown): CorrectionEnvelope | null {
  const envelope = decodeEnvelope(value);
  return envelope && envelope.kind !== "card_payment" ? envelope : null;
}

/** The details a create sets, or null for any other event or a broken payload. */
export function decodeCorrectionDetails(event: LoggedEvent): CorrectionDetails | null {
  if (event.eventType !== BALANCE_CORRECTION_CREATED) return null;
  const { accountId, date, amountCents, direction, payingAccountId } = event.payload;
  const envelope = decodeCorrectionEnvelope(event.payload.envelope);
  if (!isId(accountId) || !isLocalDate(date) || !isAmount(amountCents)) return null;
  if (!isDirection(direction) || !envelope) return null;
  if (payingAccountId !== null && !isId(payingAccountId)) return null;
  return {
    accountId,
    date,
    amountCents: asCents(amountCents),
    direction,
    envelope,
    payingAccountId,
  };
}

/** Whether a remove or restore leaves the correction removed, or null for any other event. */
export function decodeCorrectionRemoval(event: LoggedEvent): boolean | null {
  if (event.eventType === BALANCE_CORRECTION_REMOVED) return true;
  if (event.eventType === BALANCE_CORRECTION_RESTORED) return false;
  return null;
}

const ACTION_LABELS: Record<string, string> = {
  [BALANCE_CORRECTION_CREATED]: "Correct balance",
  [BALANCE_CORRECTION_REMOVED]: "Remove correction",
  [BALANCE_CORRECTION_RESTORED]: "Restore correction",
};

/** What a change was ("Correct balance: BPI"), named by its account when this device holds it. */
export function describeCorrectionEvent(event: LoggedEvent, accountName: string | undefined) {
  const action = ACTION_LABELS[event.eventType] ?? "Change correction";
  return accountName ? `${action}: ${accountName}` : action;
}

/**
 * Whether the correction shows as money into its account. A correction on a
 * credit card is the one that kept a Paying Account; owing more is money out.
 */
export const isMoneyIn = (details: CorrectionDetails) =>
  (details.direction === "raise") === (details.payingAccountId === null);
