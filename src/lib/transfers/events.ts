import { AMOUNT_PROBLEM, asCents, formatPHP, isAmount, type Cents } from "@/lib/currency";
import { decodeEnvelope, type Envelope } from "@/lib/allocations/events";
import type { LoggedEvent } from "@/lib/events/log";
import type { EventVersions } from "@/lib/events/versions";
import {
  DESCRIPTION_MAX_LENGTH,
  isLocalDate,
  isTransactionStatus,
  NOTES_MAX_LENGTH,
  optionalText,
  type TransactionStatus,
} from "@/lib/transactions/events";

export const TRANSFER_ENTITY = "transfer";
export const TRANSFER_CREATED = "transfer.created";
export const TRANSFER_EDITED = "transfer.edited";
export const TRANSFER_MARKED_CLEARED = "transfer.marked_cleared";
export const TRANSFER_MARKED_PENDING = "transfer.marked_pending";
export const TRANSFER_REMOVED = "transfer.removed";
export const TRANSFER_RESTORED = "transfer.restored";

export const TRANSFER_VERSIONS = {
  [TRANSFER_CREATED]: { current: 1, upcasts: {} },
  [TRANSFER_EDITED]: { current: 1, upcasts: {} },
  [TRANSFER_MARKED_CLEARED]: { current: 1, upcasts: {} },
  [TRANSFER_MARKED_PENDING]: { current: 1, upcasts: {} },
  [TRANSFER_REMOVED]: { current: 1, upcasts: {} },
  [TRANSFER_RESTORED]: { current: 1, upcasts: {} },
} satisfies EventVersions;

/** What a member can edit; status and removal resolve apart from these (ADR 0006). */
export interface TransferDetails {
  /** The member's local calendar date, "yyyy-MM-dd". */
  date: string;
  amountCents: Cents;
  fromAccountId: string;
  toAccountId: string;
  /** The same on both sides: the money keeps what it is for. */
  envelope: Envelope;
  description: string;
  notes: string;
}

type DetailsCheck =
  { details: TransferDetails; problem: null } | { details: null; problem: string };

const rejected = (problem: string): DetailsCheck => ({ details: null, problem });

const isId = (value: unknown): value is string => typeof value === "string" && value !== "";

/**
 * Validates transfer details from a form or from another device's event.
 * Whether the accounts and envelope exist, are in use and fit is checked by
 * the commands, against what this device holds.
 */
export function checkTransferDetails(input: Record<string, unknown>): DetailsCheck {
  const { date, amountCents, fromAccountId, toAccountId } = input;
  if (!isLocalDate(date)) return rejected("Choose a date.");
  if (!isAmount(amountCents)) return rejected(AMOUNT_PROBLEM);
  if (!isId(fromAccountId)) return rejected("Choose the account the money leaves.");
  if (!isId(toAccountId)) return rejected("Choose the account the money goes to.");
  if (fromAccountId === toAccountId) return rejected("Choose two different accounts.");
  const envelope = decodeEnvelope(input.envelope);
  if (!envelope) return rejected("Choose a category or Unassigned.");
  const description = optionalText(input.description);
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    return rejected(`A description can be at most ${DESCRIPTION_MAX_LENGTH} characters.`);
  }
  const notes = optionalText(input.notes);
  if (notes.length > NOTES_MAX_LENGTH) {
    return rejected(`Notes can be at most ${NOTES_MAX_LENGTH} characters.`);
  }
  return {
    details: {
      date,
      amountCents: asCents(amountCents),
      fromAccountId,
      toAccountId,
      envelope,
      description,
      notes,
    },
    problem: null,
  };
}

/** The details a create or edit sets, or null for any other event or a broken payload. */
export function decodeTransferDetails(event: LoggedEvent): TransferDetails | null {
  if (event.eventType !== TRANSFER_CREATED && event.eventType !== TRANSFER_EDITED) return null;
  return checkTransferDetails(event.payload).details;
}

/** The status a create or status change sets, or null for any other event. */
export function decodeTransferStatus(event: LoggedEvent): TransactionStatus | null {
  switch (event.eventType) {
    case TRANSFER_CREATED: {
      const { status } = event.payload;
      return isTransactionStatus(status) ? status : null;
    }
    case TRANSFER_MARKED_CLEARED:
      return "cleared";
    case TRANSFER_MARKED_PENDING:
      return "pending";
    default:
      return null;
  }
}

/** Whether a remove or restore leaves the transfer removed, or null for any other event. */
export function decodeTransferRemoval(event: LoggedEvent): boolean | null {
  if (event.eventType === TRANSFER_REMOVED) return true;
  if (event.eventType === TRANSFER_RESTORED) return false;
  return null;
}

const ACTION_LABELS: Record<string, string> = {
  [TRANSFER_CREATED]: "Add transfer",
  [TRANSFER_EDITED]: "Edit transfer",
  [TRANSFER_MARKED_CLEARED]: "Mark cleared",
  [TRANSFER_MARKED_PENDING]: "Mark pending",
  [TRANSFER_REMOVED]: "Remove transfer",
  [TRANSFER_RESTORED]: "Restore transfer",
};

/** A transfer named by its description, or by its amount when it has none. */
export const transferLabel = (details: TransferDetails) =>
  details.description || formatPHP(details.amountCents);

/**
 * What a change was ("Edit transfer: Top up"). A create or edit names the
 * transfer as it set it; anything else as this device holds it.
 */
export function describeTransferEvent(
  event: LoggedEvent,
  current: TransferDetails | undefined
): string {
  const action = ACTION_LABELS[event.eventType] ?? "Change transfer";
  const details = decodeTransferDetails(event) ?? current;
  return details ? `${action}: ${transferLabel(details)}` : action;
}
