import { sameOwnership, VISIBILITY_LABELS } from "@/lib/events/log";
import { requestSync } from "@/lib/sync/triggers";
import { getAccount, type AccountRow } from "@/lib/accounts/projection";
import { canHoldMoneyIn, getCategory } from "@/lib/categories/projection";
import type { Cents } from "@/lib/currency";
import {
  checkTransactionDetails,
  isTransactionStatus,
  TRANSACTION_CREATED,
  TRANSACTION_EDITED,
  TRANSACTION_ENTITY,
  TRANSACTION_MARKED_CLEARED,
  TRANSACTION_MARKED_PENDING,
  TRANSACTION_REMOVED,
  TRANSACTION_RESTORED,
  TRANSACTION_VERSIONS,
  type TransactionDetails,
  type TransactionStatus,
} from "@/lib/transactions/events";
import { getTransaction, type TransactionRow } from "@/lib/transactions/projection";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";

export interface NewTransactionInput extends TransactionInput {
  /** Cleared unless the member says it's pending. */
  status?: string;
}

export interface TransactionInput {
  date: string;
  type: string;
  amountCents: Cents;
  accountId: string;
  /** Null for Unassigned. */
  categoryId: string | null;
  description?: string;
  notes?: string;
}

const appendTransactionEvent = appenderFor(TRANSACTION_ENTITY, TRANSACTION_VERSIONS);

function checkedDetails(input: TransactionInput): TransactionDetails {
  const { details, problem } = checkTransactionDetails({ ...input });
  if (problem !== null) throw new Error(problem);
  return details;
}

function refuseRetired(record: { name: string; retired: boolean }): void {
  if (record.retired) throw new Error(`${record.name} is retired. Choose one in use.`);
}

async function requireAccount(accountId: string): Promise<AccountRow> {
  const account = await getAccount(accountId);
  if (!account) throw new Error("That account no longer exists.");
  return account;
}

async function checkCategory(categoryId: string | null, account: AccountRow): Promise<void> {
  if (categoryId === null) return;
  const category = await getCategory(categoryId);
  if (!category) throw new Error("That category no longer exists.");
  if (!canHoldMoneyIn(category, account)) {
    throw new Error(
      `Choose a ${VISIBILITY_LABELS[account.visibility]} category for ${account.name}.`
    );
  }
  refuseRetired(category);
}

/** Works offline; the transaction is seen by the same people as its account. */
export async function addTransaction(
  actor: Actor,
  input: NewTransactionInput
): Promise<{ id: string }> {
  const details = checkedDetails(input);
  const status = input.status ?? "cleared";
  if (!isTransactionStatus(status)) throw new Error("Choose Cleared or Pending.");
  const account = await requireAccount(details.accountId);
  refuseRetired(account);
  await checkCategory(details.categoryId, account);

  const id = crypto.randomUUID();
  await appendTransactionEvent(actor, { ...account, id }, TRANSACTION_CREATED, {
    ...details,
    status,
  });
  requestSync();
  return { id };
}

async function requireTransaction(transactionId: string): Promise<TransactionRow> {
  const transaction = await getTransaction(transactionId);
  if (!transaction) throw new Error("That transaction no longer exists.");
  return transaction;
}

/**
 * Any detail, including the account, within the same visibility (ADR 0002).
 * A transaction on a retired account or category stays editable; only a move
 * onto a retired one is refused.
 */
export async function editTransaction(
  actor: Actor,
  transactionId: string,
  input: TransactionInput
): Promise<void> {
  const details = checkedDetails(input);
  const transaction = await requireTransaction(transactionId);
  // A re-sent unchanged edit would carry a later HLC and undo another device's edit.
  if (sameDetails(details, transaction)) return;
  const accountChanged = details.accountId !== transaction.accountId;
  if (accountChanged || details.categoryId !== transaction.categoryId) {
    const account = await requireAccount(details.accountId);
    if (accountChanged) checkMove(account, transaction);
    await checkCategory(details.categoryId, account);
  }
  await appendTransactionEvent(actor, transaction, TRANSACTION_EDITED, { ...details });
  requestSync();
}

const sameDetails = (a: TransactionDetails, b: TransactionDetails) =>
  a.date === b.date &&
  a.type === b.type &&
  a.amountCents === b.amountCents &&
  a.accountId === b.accountId &&
  a.categoryId === b.categoryId &&
  a.description === b.description &&
  a.notes === b.notes;

function checkMove(account: AccountRow, transaction: TransactionRow): void {
  if (!sameOwnership(account, transaction)) {
    const visibility = VISIBILITY_LABELS[transaction.visibility];
    throw new Error(
      `Choose a ${visibility} account. To move it to a ${VISIBILITY_LABELS[account.visibility]} one, remove it and add it there.`
    );
  }
  refuseRetired(account);
}

async function appendChange(
  actor: Actor,
  transactionId: string,
  eventType:
    | typeof TRANSACTION_MARKED_CLEARED
    | typeof TRANSACTION_MARKED_PENDING
    | typeof TRANSACTION_REMOVED
    | typeof TRANSACTION_RESTORED
): Promise<void> {
  const transaction = await requireTransaction(transactionId);
  await appendTransactionEvent(actor, transaction, eventType, {});
  requestSync();
}

/** Resolved apart from the details, so it survives an edit made on another device. */
export const setTransactionStatus = (
  actor: Actor,
  transactionId: string,
  status: TransactionStatus
) =>
  appendChange(
    actor,
    transactionId,
    status === "cleared" ? TRANSACTION_MARKED_CLEARED : TRANSACTION_MARKED_PENDING
  );

export const removeTransaction = (actor: Actor, transactionId: string) =>
  appendChange(actor, transactionId, TRANSACTION_REMOVED);

/** Undoes a removal; the transaction comes back with its latest details and status. */
export const restoreTransaction = (actor: Actor, transactionId: string) =>
  appendChange(actor, transactionId, TRANSACTION_RESTORED);
