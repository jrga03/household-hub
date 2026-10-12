import { sameOwnership, VISIBILITY_LABELS } from "@/lib/events/log";
import { requestSync } from "@/lib/sync/triggers";
import { isCreditCard } from "@/lib/accounts/events";
import { getAccount, type AccountRow } from "@/lib/accounts/projection";
import {
  ALLOCATION_CREATED,
  ALLOCATION_EDITED,
  ALLOCATION_ENTITY,
  ALLOCATION_REMOVED,
  ALLOCATION_RESTORED,
  ALLOCATION_VERSIONS,
  checkAllocationDetails,
  sameEnvelope,
  type AllocationDetails,
  type Envelope,
} from "@/lib/allocations/events";
import { getAllocation, type AllocationRow } from "@/lib/allocations/projection";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";
import { checkMove, refuseRetired, requireAccount, requireCategoryFor } from "./records";

export type AllocationInput = AllocationDetails;

const appendAllocationEvent = appenderFor(ALLOCATION_ENTITY, ALLOCATION_VERSIONS);

function checkedDetails(input: AllocationInput): AllocationDetails {
  const { details, problem } = checkAllocationDetails({ ...input });
  if (problem !== null) throw new Error(problem);
  return details;
}

function refuseCard(account: AccountRow): void {
  if (isCreditCard(account)) {
    throw new Error("A credit card holds no category money. Move money in its Paying Account.");
  }
}

async function requireCardFor(cardId: string, account: AccountRow): Promise<AccountRow> {
  const card = await getAccount(cardId);
  if (!card || !isCreditCard(card)) throw new Error("That card no longer exists.");
  if (!sameOwnership(card, account)) {
    throw new Error(`Choose a ${VISIBILITY_LABELS[account.visibility]} card for ${account.name}.`);
  }
  return card;
}

/** The envelope's category or card, once it fits the account; null for Unassigned. */
function requireEnvelopeFor(envelope: Envelope, account: AccountRow) {
  if (envelope.kind === "unassigned") return null;
  return envelope.kind === "category"
    ? requireCategoryFor(envelope.id, account)
    : requireCardFor(envelope.id, account);
}

/** Money goes into a Card Payment only where the card's bill is paid from. */
async function refusePaidElsewhere(card: AccountRow, account: AccountRow): Promise<void> {
  if (card.payingAccountId === account.id) return;
  const paying = card.payingAccountId === null ? undefined : await getAccount(card.payingAccountId);
  throw new Error(
    `${card.name} is paid from ${paying?.name ?? "another account"}. Choose a card paid from ${account.name}.`
  );
}

/**
 * Money can move out of a retired category or card, or out of a Card Payment
 * left behind when the card's Paying Account changed, but never into one.
 * Moving more than an envelope holds is allowed: two offline devices can't be
 * stopped from both spending it, so a negative envelope is shown instead.
 */
async function checkEnvelopes(
  details: AllocationDetails,
  account: AccountRow,
  addsToDestination: boolean
): Promise<void> {
  await requireEnvelopeFor(details.from, account);
  const destination = await requireEnvelopeFor(details.to, account);
  if (!destination || !addsToDestination) return;
  refuseRetired(destination);
  if (details.to.kind === "card_payment" && "payingAccountId" in destination) {
    await refusePaidElsewhere(destination, account);
  }
}

/** Works offline; the allocation is seen by the same people as its account. */
export async function addAllocation(actor: Actor, input: AllocationInput): Promise<{ id: string }> {
  const details = checkedDetails(input);
  const account = await requireAccount(details.accountId);
  refuseRetired(account);
  refuseCard(account);
  await checkEnvelopes(details, account, true);

  const id = crypto.randomUUID();
  await appendAllocationEvent(actor, { ...account, id }, ALLOCATION_CREATED, { ...details });
  requestSync();
  return { id };
}

async function requireAllocation(allocationId: string): Promise<AllocationRow> {
  const allocation = await getAllocation(allocationId);
  if (!allocation) throw new Error("That allocation no longer exists.");
  return allocation;
}

const sameDetails = (a: AllocationDetails, b: AllocationDetails) =>
  a.date === b.date &&
  a.accountId === b.accountId &&
  sameEnvelope(a.from, b.from) &&
  sameEnvelope(a.to, b.to) &&
  a.amountCents === b.amountCents;

/**
 * Any detail, including the account, within the same visibility (ADR 0002).
 * An allocation on a retired account or into a retired category stays
 * editable, but can't move onto a retired one or put more money into it.
 */
export async function editAllocation(
  actor: Actor,
  allocationId: string,
  input: AllocationInput
): Promise<void> {
  const details = checkedDetails(input);
  const allocation = await requireAllocation(allocationId);
  if (allocation.removed) throw new Error("That allocation was removed.");
  // A re-sent unchanged edit would carry a later HLC and undo another device's edit.
  if (sameDetails(details, allocation)) return;
  const account = await requireAccount(details.accountId);
  const accountChanged = details.accountId !== allocation.accountId;
  if (accountChanged) {
    checkMove(account, allocation);
    refuseCard(account);
  }
  const addsToDestination =
    accountChanged ||
    !sameEnvelope(details.to, allocation.to) ||
    details.amountCents > allocation.amountCents;
  await checkEnvelopes(details, account, addsToDestination);

  await appendAllocationEvent(actor, allocation, ALLOCATION_EDITED, { ...details });
  requestSync();
}

async function appendChange(
  actor: Actor,
  allocationId: string,
  eventType: typeof ALLOCATION_REMOVED | typeof ALLOCATION_RESTORED
): Promise<void> {
  const allocation = await requireAllocation(allocationId);
  await appendAllocationEvent(actor, allocation, eventType, {});
  requestSync();
}

export const removeAllocation = (actor: Actor, allocationId: string) =>
  appendChange(actor, allocationId, ALLOCATION_REMOVED);

/** Undoes a removal; the allocation comes back with its latest details. */
export const restoreAllocation = (actor: Actor, allocationId: string) =>
  appendChange(actor, allocationId, ALLOCATION_RESTORED);
