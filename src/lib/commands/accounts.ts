import { appendEvent, isVisibility } from "@/lib/events/log";
import { requestSync } from "@/lib/sync/triggers";
import {
  ACCOUNT_CREATED,
  ACCOUNT_EDITED,
  ACCOUNT_ENTITY,
  ACCOUNT_RETIRED,
  ACCOUNT_UNRETIRED,
  checkAccountDetails,
  currentVersion,
  type AccountChangeType,
} from "@/lib/accounts/events";
import { getAccount } from "@/lib/accounts/projection";
import type { Cents } from "@/lib/currency";

export interface Actor {
  householdId: string;
  userId: string;
}

export interface AccountDetailsInput {
  name: string;
  type: string;
  startingBalanceCents: Cents;
}

export interface NewAccountInput extends AccountDetailsInput {
  /** Household unless the member deliberately chooses Personal; fixed once created. */
  visibility?: string;
}

/** Works offline: the account shows at once and syncs when the device can reach the server. */
export async function createAccount(actor: Actor, input: NewAccountInput): Promise<{ id: string }> {
  const { details, problem } = checkAccountDetails({ ...input });
  if (problem !== null) throw new Error(problem);
  const visibility = input.visibility ?? "household";
  if (!isVisibility(visibility)) throw new Error("Choose Household or Personal.");

  const id = crypto.randomUUID();
  await appendEvent({
    householdId: actor.householdId,
    visibility,
    ownerUserId: visibility === "personal" ? actor.userId : null,
    entityType: ACCOUNT_ENTITY,
    entityId: id,
    eventType: ACCOUNT_CREATED,
    eventVersion: currentVersion(ACCOUNT_CREATED),
    actorUserId: actor.userId,
    payload: { ...details, payingAccountId: null },
  });
  requestSync();
  return { id };
}

/**
 * Appends a change to an existing account. The event carries the account's own
 * visibility and owner, so RLS shows it to the same people as the account.
 */
async function appendAccountChange(
  actor: Actor,
  accountId: string,
  eventType: AccountChangeType,
  payload: Record<string, unknown>
): Promise<void> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("That account no longer exists.");
  await appendEvent({
    householdId: actor.householdId,
    visibility: account.visibility,
    ownerUserId: account.ownerUserId,
    entityType: ACCOUNT_ENTITY,
    entityId: accountId,
    eventType,
    eventVersion: currentVersion(eventType),
    actorUserId: actor.userId,
    payload,
  });
  requestSync();
}

/** Name, type and starting balance; visibility is fixed at creation. The later edit wins across devices. */
export async function editAccount(
  actor: Actor,
  accountId: string,
  input: AccountDetailsInput
): Promise<void> {
  const { details, problem } = checkAccountDetails({ ...input });
  if (problem !== null) throw new Error(problem);
  await appendAccountChange(actor, accountId, ACCOUNT_EDITED, { ...details });
}

/** Hides the account from the main list; it stays under Retired. */
export const retireAccount = (actor: Actor, accountId: string) =>
  appendAccountChange(actor, accountId, ACCOUNT_RETIRED, {});

export const unretireAccount = (actor: Actor, accountId: string) =>
  appendAccountChange(actor, accountId, ACCOUNT_UNRETIRED, {});
