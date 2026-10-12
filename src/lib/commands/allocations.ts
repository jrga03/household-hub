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

/**
 * Money can move out of a retired category or card, never into one. Moving
 * more than an envelope holds is allowed: two offline devices can't be stopped
 * from both spending it, so a negative envelope is shown instead.
 */
async function checkEnvelopes(details: AllocationDetails, account: AccountRow): Promise<void> {
  await requireEnvelopeFor(details.from, account);
  const destination = await requireEnvelopeFor(details.to, account);
  if (destination) refuseRetired(destination);
}

/** Works offline; the allocation is seen by the same people as its account. */
export async function addAllocation(actor: Actor, input: AllocationInput): Promise<{ id: string }> {
  const details = checkedDetails(input);
  const account = await requireAccount(details.accountId);
  refuseRetired(account);
  refuseCard(account);
  await checkEnvelopes(details, account);

  const id = crypto.randomUUID();
  await appendAllocationEvent(actor, { ...account, id }, ALLOCATION_CREATED, { ...details });
  requestSync();
  return { id };
}

async function requireAllocation(allocationId: string): Promise<AllocationRow> {
  const allocation = await getAllocation(allocationId);
  if (!allocation) throw new Error("That move no longer exists.");
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
 * editable; only a move onto a retired one is refused.
 */
export async function editAllocation(
  actor: Actor,
  allocationId: string,
  input: AllocationInput
): Promise<void> {
  const details = checkedDetails(input);
  const allocation = await requireAllocation(allocationId);
  // A re-sent unchanged edit would carry a later HLC and undo another device's edit.
  if (sameDetails(details, allocation)) return;
  const account = await requireAccount(details.accountId);
  const accountChanged = details.accountId !== allocation.accountId;
  if (accountChanged) {
    checkMove(account, allocation);
    refuseCard(account);
  }
  await requireEnvelopeFor(details.from, account);
  const destination = await requireEnvelopeFor(details.to, account);
  if (destination && (accountChanged || !sameEnvelope(details.to, allocation.to))) {
    refuseRetired(destination);
  }

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
