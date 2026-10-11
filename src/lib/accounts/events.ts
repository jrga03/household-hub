import { asCents, formatPHP, MAX_AMOUNT_CENTS, ZERO_CENTS, type Cents } from "@/lib/currency";
import type { LoggedEvent } from "@/lib/events/log";
import type { EventVersions } from "@/lib/events/versions";

export const ACCOUNT_TYPES = ["bank", "cash", "e_wallet", "investment", "credit_card"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CREDIT_CARD = "credit_card";

export const ACCOUNT_NAME_MAX_LENGTH = 60;

export const ACCOUNT_ENTITY = "account";
export const ACCOUNT_CREATED = "account.created";
export const ACCOUNT_EDITED = "account.edited";
export const ACCOUNT_RETIRED = "account.retired";
export const ACCOUNT_UNRETIRED = "account.unretired";

export type AccountChangeType =
  typeof ACCOUNT_EDITED | typeof ACCOUNT_RETIRED | typeof ACCOUNT_UNRETIRED;

/** The fields a member can edit after creating the account. */
export interface AccountDetails {
  name: string;
  type: AccountType;
  startingBalanceCents: Cents;
  /** The account a credit card's bill is paid from; null for every other type. */
  payingAccountId: string | null;
}

type DetailsCheck = { details: AccountDetails; problem: null } | { details: null; problem: string };

export const isAccountType = (value: unknown): value is AccountType =>
  ACCOUNT_TYPES.some((type) => type === value);

const rejected = (problem: string): DetailsCheck => ({ details: null, problem });

export const isCreditCard = (account: { type: AccountType }) => account.type === CREDIT_CARD;

/**
 * Validates account details from a form or from another device's event. Whether
 * the Paying Account exists and fits is checked by the commands, against the
 * accounts this device holds.
 */
export function checkAccountDetails(input: Record<string, unknown>): DetailsCheck {
  const { name, type, startingBalanceCents, payingAccountId } = input;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (trimmedName === "") return rejected("An account needs a name.");
  if (trimmedName.length > ACCOUNT_NAME_MAX_LENGTH) {
    return rejected(`An account name can be at most ${ACCOUNT_NAME_MAX_LENGTH} characters.`);
  }
  if (!isAccountType(type)) return rejected("Choose an account type.");
  if (
    typeof startingBalanceCents !== "number" ||
    !Number.isSafeInteger(startingBalanceCents) ||
    startingBalanceCents < 0 ||
    startingBalanceCents > MAX_AMOUNT_CENTS
  ) {
    return rejected(
      `The starting balance must be between ${formatPHP(ZERO_CENTS)} and ${formatPHP(asCents(MAX_AMOUNT_CENTS))}.`
    );
  }
  if (type === CREDIT_CARD) {
    if (typeof payingAccountId !== "string" || payingAccountId === "") {
      return rejected("Choose the account this card is paid from.");
    }
  } else if (payingAccountId != null) {
    return rejected("Only a credit card has a paying account.");
  }
  return {
    details: {
      name: trimmedName,
      type,
      startingBalanceCents: asCents(startingBalanceCents),
      payingAccountId: type === CREDIT_CARD ? String(payingAccountId) : null,
    },
    problem: null,
  };
}

export const ACCOUNT_VERSIONS: EventVersions = {
  [ACCOUNT_CREATED]: {
    current: 2,
    upcasts: { 1: (payload) => ({ ...payload, payingAccountId: null }) },
  },
  [ACCOUNT_EDITED]: {
    current: 2,
    upcasts: { 1: (payload) => ({ ...payload, payingAccountId: null }) },
  },
  [ACCOUNT_RETIRED]: { current: 1, upcasts: {} },
  [ACCOUNT_UNRETIRED]: { current: 1, upcasts: {} },
};

/** The details a create or edit sets (in its current version), or null for any other event. A card can't pay from itself. */
export function decodeAccountDetails(event: LoggedEvent): AccountDetails | null {
  if (event.eventType !== ACCOUNT_CREATED && event.eventType !== ACCOUNT_EDITED) return null;
  const { details } = checkAccountDetails(event.payload);
  return details && details.payingAccountId !== event.entityId ? details : null;
}

/** Whether a retire or unretire event leaves the account retired, or null for any other event. */
export function decodeAccountRetirement(event: LoggedEvent): boolean | null {
  if (event.eventType !== ACCOUNT_RETIRED && event.eventType !== ACCOUNT_UNRETIRED) return null;
  return event.eventType === ACCOUNT_RETIRED;
}

const ACTION_LABELS: Record<string, string> = {
  [ACCOUNT_CREATED]: "Add account",
  [ACCOUNT_EDITED]: "Edit account",
  [ACCOUNT_RETIRED]: "Retire account",
  [ACCOUNT_UNRETIRED]: "Unretire account",
};

/**
 * What a change was, for a member deciding whether to keep it ("Add account:
 * BPI Savings"). A create or edit names the account as it set it; anything
 * else by the account's current name, when this device holds it.
 */
export function describeAccountEvent(event: LoggedEvent, currentName: string | undefined): string {
  const action = ACTION_LABELS[event.eventType] ?? "Change account";
  const name = decodeAccountDetails(event)?.name ?? currentName;
  return name ? `${action}: ${name}` : action;
}
