import { sameOwnership } from "@/lib/events/ownership";
import { requestSync } from "@/lib/sync/triggers";
import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { cardPaymentEnvelope, sameEnvelope, type Envelope } from "@/lib/allocations/events";
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
  fromEnvelope: Envelope;
  toEnvelope: Envelope;
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
 * Money into a card can only leave and arrive as its own Card Payment: that is
 * paying it. Otherwise each envelope must fit its own account: a category in
 * use of its visibility, Unassigned, or a Card Payment. Card Payment money
 * arrives only as the same Card Payment, where the card is paid from (ADR 0013).
 */
async function checkEnvelopes(details: TransferDetails, from: AccountRow, to: AccountRow) {
  if (isCreditCard(to)) {
    const cardPayment = cardPaymentEnvelope(to.id);
    if (
      !sameEnvelope(details.fromEnvelope, cardPayment) ||
      !sameEnvelope(details.toEnvelope, cardPayment)
    ) {
      throw new Error(`Pay ${to.name} from its Card Payment.`);
    }
    return;
  }
  const leavingCard = await requireEnvelopeIn(details.fromEnvelope, from);
  // Freeing bill money is a deliberate allocation, never a side effect of a transfer.
  if (leavingCard && !sameEnvelope(details.fromEnvelope, details.toEnvelope)) {
    throw new Error(
      `Money from ${leavingCard.name}'s Card Payment must arrive in ${leavingCard.name}'s Card Payment. To use it for something else, move it to Unassigned first.`
    );
  }
  const card = await requireEnvelopeIn(details.toEnvelope, to);
  if (card) await refusePaidElsewhere(card, to);
}

/** The envelope's card, once the envelope fits the account; null for a category or Unassigned. */
async function requireEnvelopeIn(envelope: Envelope, account: AccountRow) {
  if (envelope.kind === "unassigned") return null;
  if (envelope.kind === "category") {
    refuseRetired(await requireCategoryFor(envelope.id, account));
    return null;
  }
  const card = await requireCardFor(envelope.id, account);
  refuseRetired(card);
  return card;
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
  await checkEnvelopes(details, from, to);

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
  sameEnvelope(a.fromEnvelope, b.fromEnvelope) &&
  sameEnvelope(a.toEnvelope, b.toEnvelope) &&
  a.description === b.description &&
  a.notes === b.notes;

/**
 * Any detail, as a whole, within the transfer's visibility (ADR 0002). One on
 * a retired account or category stays editable; only a move onto a retired
 * one is refused. False when nothing changed, so nothing was saved.
 */
export async function editTransfer(
  actor: Actor,
  transferId: string,
  input: TransferInput
): Promise<boolean> {
  const details = checkedDetails(input);
  const transfer = await requireTransfer(transferId);
  // A re-sent unchanged edit would carry a later HLC and undo another device's edit.
  if (sameDetails(details, transfer)) return false;
  const fromChanged = details.fromAccountId !== transfer.fromAccountId;
  const toChanged = details.toAccountId !== transfer.toAccountId;
  const envelopesChanged =
    !sameEnvelope(details.fromEnvelope, transfer.fromEnvelope) ||
    !sameEnvelope(details.toEnvelope, transfer.toEnvelope);
  if (fromChanged || toChanged || envelopesChanged) {
    const from = await requireAccount(details.fromAccountId);
    const to = await requireAccount(details.toAccountId);
    if (fromChanged) {
      checkMove(from, transfer);
      refuseOutOfCard(from);
    }
    if (toChanged) checkMove(to, transfer);
    await checkEnvelopes(details, from, to);
  }
  await appendTransferEvent(actor, transfer, TRANSFER_EDITED, { ...details });
  requestSync();
  return true;
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
