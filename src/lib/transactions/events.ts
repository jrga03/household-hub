import { asCents, formatPHP, MAX_AMOUNT_CENTS, type Cents } from "@/lib/currency";
import type { LoggedEvent } from "@/lib/events/log";
import type { EventVersions } from "@/lib/events/versions";
import { parseLocalDate } from "@/lib/utils/dates";

export const TRANSACTION_TYPES = ["expense", "income"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["cleared", "pending"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const DESCRIPTION_MAX_LENGTH = 120;
export const NOTES_MAX_LENGTH = 1000;

export const TRANSACTION_ENTITY = "transaction";
export const TRANSACTION_CREATED = "transaction.created";
export const TRANSACTION_EDITED = "transaction.edited";
export const TRANSACTION_MARKED_CLEARED = "transaction.marked_cleared";
export const TRANSACTION_MARKED_PENDING = "transaction.marked_pending";
export const TRANSACTION_REMOVED = "transaction.removed";
export const TRANSACTION_RESTORED = "transaction.restored";

export const TRANSACTION_VERSIONS = {
  [TRANSACTION_CREATED]: { current: 1, upcasts: {} },
  [TRANSACTION_EDITED]: { current: 1, upcasts: {} },
  [TRANSACTION_MARKED_CLEARED]: { current: 1, upcasts: {} },
  [TRANSACTION_MARKED_PENDING]: { current: 1, upcasts: {} },
  [TRANSACTION_REMOVED]: { current: 1, upcasts: {} },
  [TRANSACTION_RESTORED]: { current: 1, upcasts: {} },
} satisfies EventVersions;

/** What a member can edit; status and removal resolve apart from these. */
export interface TransactionDetails {
  /** The member's local calendar date, "yyyy-MM-dd". */
  date: string;
  type: TransactionType;
  amountCents: Cents;
  accountId: string;
  /** Null for Unassigned. */
  categoryId: string | null;
  description: string;
  notes: string;
}

type DetailsCheck =
  { details: TransactionDetails; problem: null } | { details: null; problem: string };

const rejected = (problem: string): DetailsCheck => ({ details: null, problem });

export const isTransactionType = (value: unknown): value is TransactionType =>
  TRANSACTION_TYPES.some((type) => type === value);

export const isTransactionStatus = (value: unknown): value is TransactionStatus =>
  TRANSACTION_STATUSES.some((status) => status === value);

/** Whether the string names a real calendar day, "yyyy-MM-dd". */
export function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = parseLocalDate(value);
  const [year, month, day] = value.split("-").map(Number);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

const optionalText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * Validates transaction details from a form or from another device's event.
 * Whether the account and category exist, are in use and fit is checked by the
 * commands, against what this device holds.
 */
export function checkTransactionDetails(input: Record<string, unknown>): DetailsCheck {
  const { date, type, amountCents, accountId, categoryId } = input;
  if (!isLocalDate(date)) return rejected("Choose a date.");
  if (!isTransactionType(type)) return rejected("Choose Expense or Income.");
  if (
    typeof amountCents !== "number" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents <= 0 ||
    amountCents > MAX_AMOUNT_CENTS
  ) {
    return rejected(
      `The amount must be more than zero and at most ${formatPHP(asCents(MAX_AMOUNT_CENTS))}.`
    );
  }
  if (typeof accountId !== "string" || accountId === "") return rejected("Choose an account.");
  if (categoryId != null && (typeof categoryId !== "string" || categoryId === "")) {
    return rejected("Choose a category or Unassigned.");
  }
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
      type,
      amountCents: asCents(amountCents),
      accountId,
      categoryId: categoryId ?? null,
      description,
      notes,
    },
    problem: null,
  };
}

/** The details a create or edit sets, or null for any other event or a broken payload. */
export function decodeTransactionDetails(event: LoggedEvent): TransactionDetails | null {
  if (event.eventType !== TRANSACTION_CREATED && event.eventType !== TRANSACTION_EDITED) {
    return null;
  }
  return checkTransactionDetails(event.payload).details;
}

/** The status a create or status change sets, or null for any other event. */
export function decodeTransactionStatus(event: LoggedEvent): TransactionStatus | null {
  switch (event.eventType) {
    case TRANSACTION_CREATED: {
      const { status } = event.payload;
      return isTransactionStatus(status) ? status : null;
    }
    case TRANSACTION_MARKED_CLEARED:
      return "cleared";
    case TRANSACTION_MARKED_PENDING:
      return "pending";
    default:
      return null;
  }
}

/** Whether a remove or restore leaves the transaction removed, or null for any other event. */
export function decodeRemoval(event: LoggedEvent): boolean | null {
  if (event.eventType === TRANSACTION_REMOVED) return true;
  if (event.eventType === TRANSACTION_RESTORED) return false;
  return null;
}

const ACTION_LABELS: Record<string, string> = {
  [TRANSACTION_CREATED]: "Add transaction",
  [TRANSACTION_EDITED]: "Edit transaction",
  [TRANSACTION_MARKED_CLEARED]: "Mark cleared",
  [TRANSACTION_MARKED_PENDING]: "Mark pending",
  [TRANSACTION_REMOVED]: "Remove transaction",
  [TRANSACTION_RESTORED]: "Restore transaction",
};

/** A transaction named by its description, or by its amount when it has none. */
export const transactionLabel = (details: TransactionDetails) =>
  details.description || formatPHP(details.amountCents);

/**
 * What a change was ("Edit transaction: Lunch"). A create or edit names the
 * transaction as it set it; anything else as this device holds it.
 */
export function describeTransactionEvent(
  event: LoggedEvent,
  current: TransactionDetails | undefined
): string {
  const action = ACTION_LABELS[event.eventType] ?? "Change transaction";
  const details = decodeTransactionDetails(event) ?? current;
  return details ? `${action}: ${transactionLabel(details)}` : action;
}
