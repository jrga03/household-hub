import { sameOwnership } from "@/lib/events/log";
import { requestSync } from "@/lib/sync/triggers";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { sameEnvelope, type Envelope } from "@/lib/allocations/events";
import type { Cents } from "@/lib/currency";
import { isTransactionStatus, type TransactionStatus } from "@/lib/transactions/events";
import {
  checkTransferDetails,
  TRANSFER_CREATED,
  TRANSFER_EDITED,
  TRANSFER_ENTITY,
  TRANSFER_MARKED_CLEARED,
  TRANSFER_MARKED_PENDING,
  TRANSFER_REMOVED,
  TRANSFER_RESTORED,
  TRANSFER_VERSIONS,
  type TransferDetails,
} from "@/lib/transfers/events";
import { getTransfer, type TransferRow } from "@/lib/transfers/projection";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";
import { changeEach } from "./bulk";
import {
  checkMove,
  refusePaidElsewhere,
  refuseRetired,
  requireAccount,
  requireCardFor,
  requireCategoryFor,
} from "./records";

export interface TransferInput {
  date: string;
  amountCents: Cents;
  fromAccountId: string;
  toAccountId: string;
  envelope: Envelope;
  description?: string;
  notes?: string;
}

export interface NewTransferInput extends TransferInput {
  /** Cleared unless the member says it's pending. */
  status?: string;
}

const appendTransferEvent = appenderFor(TRANSFER_ENTITY, TRANSFER_VERSIONS);

function checkedDetails(input: TransferInput): TransferDetails {
  const { details, problem } = checkTransferDetails({ ...input });
  if (problem !== null) throw new Error(problem);
  return details;
}

function refuseOutOfCard(from: AccountRow): void {
  if (isCreditCard(from)) {
    throw new Error(
      "Money can't be transferred out of a credit card. Record a cash advance as a card expense plus income."
    );
  }
}

/**
 * The envelope must fit both accounts: a category in use of their visibility,
 * Unassigned, or a Card Payment going where the card is paid from. Money into
 * a card can only be its own Card Payment: that is paying the card.
 */
async function checkEnvelope(envelope: Envelope, from: AccountRow, to: AccountRow) {
  if (isCreditCard(to)) {
    if (envelope.kind !== "card_payment" || envelope.id !== to.id) {
      throw new Error(`Pay ${to.name} from its Card Payment.`);
    }
    return;
  }
  if (envelope.kind === "unassigned") return;
  if (envelope.kind === "category") {
    refuseRetired(await requireCategoryFor(envelope.id, from));
    return;
  }
  const card = await requireCardFor(envelope.id, from);
  refuseRetired(card);
  await refusePaidElsewhere(card, to);
}

/** Works offline; the transfer is seen by the same people as its two accounts (ADR 0006). */
export async function addTransfer(actor: Actor, input: NewTransferInput): Promise<{ id: string }> {
  const details = checkedDetails(input);
  const status = input.status ?? "cleared";
  if (!isTransactionStatus(status)) throw new Error("Choose Cleared or Pending.");
  const from = await requireAccount(details.fromAccountId);
  const to = await requireAccount(details.toAccountId);
  refuseOutOfCard(from);
  refuseRetired(from);
  refuseRetired(to);
  if (!sameOwnership(from, to)) {
    throw new Error(`Choose an account seen by the same people as ${from.name}.`);
  }
  await checkEnvelope(details.envelope, from, to);

  const id = crypto.randomUUID();
  await appendTransferEvent(actor, { ...from, id }, TRANSFER_CREATED, { ...details, status });
  requestSync();
  return { id };
}

async function requireTransfer(transferId: string): Promise<TransferRow> {
  const transfer = await getTransfer(transferId);
  if (!transfer) throw new Error("That transfer no longer exists.");
  return transfer;
}

const sameDetails = (a: TransferDetails, b: TransferDetails) =>
  a.date === b.date &&
  a.amountCents === b.amountCents &&
  a.fromAccountId === b.fromAccountId &&
  a.toAccountId === b.toAccountId &&
  sameEnvelope(a.envelope, b.envelope) &&
  a.description === b.description &&
  a.notes === b.notes;

/**
 * Any detail, as a whole, within the transfer's visibility (ADR 0002). One on
 * a retired account or category stays editable; only a move onto a retired
 * one is refused.
 */
export async function editTransfer(
  actor: Actor,
  transferId: string,
  input: TransferInput
): Promise<void> {
  const details = checkedDetails(input);
  const transfer = await requireTransfer(transferId);
  // A re-sent unchanged edit would carry a later HLC and undo another device's edit.
  if (sameDetails(details, transfer)) return;
  const fromChanged = details.fromAccountId !== transfer.fromAccountId;
  const toChanged = details.toAccountId !== transfer.toAccountId;
  if (fromChanged || toChanged || !sameEnvelope(details.envelope, transfer.envelope)) {
    const from = await requireAccount(details.fromAccountId);
    const to = await requireAccount(details.toAccountId);
    if (fromChanged) {
      checkMove(from, transfer);
      refuseOutOfCard(from);
    }
    if (toChanged) checkMove(to, transfer);
    await checkEnvelope(details.envelope, from, to);
  }
  await appendTransferEvent(actor, transfer, TRANSFER_EDITED, { ...details });
  requestSync();
}

async function appendChange(
  actor: Actor,
  transferId: string,
  eventType:
    | typeof TRANSFER_MARKED_CLEARED
    | typeof TRANSFER_MARKED_PENDING
    | typeof TRANSFER_REMOVED
    | typeof TRANSFER_RESTORED
): Promise<void> {
  const transfer = await requireTransfer(transferId);
  await appendTransferEvent(actor, transfer, eventType, {});
  requestSync();
}

/** One status for both legs, resolved apart from the details. */
export const setTransferStatus = (actor: Actor, transferId: string, status: TransactionStatus) =>
  appendChange(
    actor,
    transferId,
    status === "cleared" ? TRANSFER_MARKED_CLEARED : TRANSFER_MARKED_PENDING
  );

export const removeTransfer = (actor: Actor, transferId: string) =>
  appendChange(actor, transferId, TRANSFER_REMOVED);

/** Undoes a removal; the transfer comes back with its latest details and status. */
export const restoreTransfer = (actor: Actor, transferId: string) =>
  appendChange(actor, transferId, TRANSFER_RESTORED);

export const setTransfersStatus = (
  actor: Actor,
  transferIds: string[],
  status: TransactionStatus
) =>
  changeEach(
    transferIds,
    requireTransfer,
    (transfer) => transfer.status === status,
    (transfer) => setTransferStatus(actor, transfer.id, status)
  );

export const removeTransfers = (actor: Actor, transferIds: string[]) =>
  changeEach(
    transferIds,
    requireTransfer,
    (transfer) => transfer.removed,
    (transfer) => removeTransfer(actor, transfer.id)
  );

export const restoreTransfers = (actor: Actor, transferIds: string[]) =>
  changeEach(
    transferIds,
    requireTransfer,
    (transfer) => !transfer.removed,
    (transfer) => restoreTransfer(actor, transfer.id)
  );
