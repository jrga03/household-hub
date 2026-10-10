import { asCents, formatPHP, MAX_AMOUNT_CENTS, ZERO_CENTS, type Cents } from "@/lib/currency";
import type { LoggedEvent } from "@/lib/events/log";

/** Credit cards arrive with Paying Accounts (#19). */
export const ACCOUNT_TYPES = ["bank", "cash", "e_wallet", "investment"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_NAME_MAX_LENGTH = 60;

export const ACCOUNT_ENTITY = "account";
export const ACCOUNT_CREATED = "account.created";

export interface NewAccount {
  name: string;
  type: AccountType;
  startingBalanceCents: Cents;
}

type AccountCheck = { account: NewAccount; problem: null } | { account: null; problem: string };

const isAccountType = (value: unknown): value is AccountType =>
  ACCOUNT_TYPES.some((type) => type === value);

const rejected = (problem: string): AccountCheck => ({ account: null, problem });

/** Validates a new account from the form or from another device's event. */
export function checkNewAccount(input: Record<string, unknown>): AccountCheck {
  const { name, type, startingBalanceCents } = input;
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
  return {
    account: { name: trimmedName, type, startingBalanceCents: asCents(startingBalanceCents) },
    problem: null,
  };
}

/** An account.created payload this version can read, or null. */
export function decodeAccountCreated(event: LoggedEvent): NewAccount | null {
  if (event.eventType !== ACCOUNT_CREATED || event.eventVersion !== 1) return null;
  return checkNewAccount(event.payload).account;
}
