import { appendTogether } from "@/lib/events/log";
import { requestSync } from "@/lib/sync/triggers";
import { canBeOutOfPocket, isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
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
import { normalizeStatementText } from "@/lib/import/statement";
import { getTransaction, type TransactionRow } from "@/lib/transactions/projection";
import type { Actor } from "./accounts";
import { appenderFor } from "./append";
import { changeEach } from "./bulk";
import {
  checkMove,
  checkPayingAccount,
  refuseRetired,
  requireAccount,
  requireCategoryFor,
} from "./records";

export interface NewTransactionInput extends PaidFromInput {
  /**
   * Chosen by the caller so a retry records nothing new: a transaction already
   * recorded under it, even one since removed or edited, is left as it is.
   */
  id?: string;
  /** Cleared unless the member says it's pending. */
  status?: string;
  /** The statement line a saved draft came from (ADR 0008). */
  importKey?: string;
  /** The member recording an Out-of-pocket expense (ADR 0012); it is always pending. */
  paidByUserId?: string | null;
  /** A saved draft's statement line; only its normalized Statement Text is recorded. */
  statementLine?: string;
  /** Whether a saved draft is a Pin (GLOSSARY). */
  pinned?: boolean;
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

export interface PaidFromInput extends TransactionInput {
  /** Paid from: for a card transaction, an account other than the card's usual one pays the line. */
  payingAccountId?: string;
}

const appendTransactionEvent = appenderFor(TRANSACTION_ENTITY, TRANSACTION_VERSIONS);

/** The details as the member entered them; the command records the Paying Account itself. */
function checkedDetails(input: TransactionInput): TransactionDetails {
  const { details, problem } = checkTransactionDetails({ ...input, payingAccountId: null });
  if (problem !== null) throw new Error(problem);
  return details;
}

/** The card's Paying Account right now, which the transaction keeps from then on. */
const payingAccountOf = (account: AccountRow) =>
  isCreditCard(account) ? account.payingAccountId : null;

/** `usual` unless the member chose another account that can pay the card; none off a card. */
async function payingAccountFor(
  account: AccountRow,
  chosen: string | undefined,
  usual: string | null
): Promise<string | null> {
  if (!isCreditCard(account)) return null;
  if (chosen === undefined || chosen === usual) return usual;
  await checkPayingAccount(chosen, account);
  return chosen;
}

/** Every transaction is named, an imported statement line included; old ones without a name still decode. */
function requireDescription(details: TransactionDetails): void {
  if (details.description === "") throw new Error("Add a description.");
}

async function checkCategory(categoryId: string | null, account: AccountRow): Promise<void> {
  if (categoryId === null) return;
  refuseRetired(await requireCategoryFor(categoryId, account));
}

/** Works offline; the transaction is seen by the same people as its account. */
export async function addTransaction(
  actor: Actor,
  input: NewTransactionInput
): Promise<{ id: string }> {
  const id = input.id ?? crypto.randomUUID();
  // Checked in the same Dexie transaction as the append, so two Confirms can't both record.
  const recorded = await appendTogether(async () => {
    if (await getTransaction(id)) return false;
    await appendCreated(actor, id, input);
    return true;
  });
  if (recorded) requestSync();
  return { id };
}

async function appendCreated(actor: Actor, id: string, input: NewTransactionInput) {
  const details = checkedDetails(input);
  requireDescription(details);
  const paidByUserId = input.paidByUserId ?? null;
  const status = paidByUserId ? "pending" : (input.status ?? "cleared");
  if (!isTransactionStatus(status)) throw new Error("Choose Cleared or Pending.");
  const account = await requireAccount(details.accountId);
  refuseRetired(account);
  if (paidByUserId) checkOutOfPocket(actor, paidByUserId, details, account);
  await checkCategory(details.categoryId, account);

  await appendTransactionEvent(actor, { ...account, id }, TRANSACTION_CREATED, {
    ...details,
    payingAccountId: await payingAccountFor(
      account,
      input.payingAccountId,
      payingAccountOf(account)
    ),
    status,
    importKey: input.importKey ?? null,
    paidByUserId,
    statementText: normalizeStatementText(input.statementLine ?? "") || null,
    pinned: input.pinned ?? false,
  });
}

function checkOutOfPocket(
  actor: Actor,
  paidByUserId: string,
  details: TransactionDetails,
  account: AccountRow
): void {
  if (paidByUserId !== actor.userId) {
    throw new Error("You can only record your own out-of-pocket expense.");
  }
  checkOutOfPocketType(details);
  checkOutOfPocketAccount(account);
}

function checkOutOfPocketType(details: TransactionDetails): void {
  if (details.type !== "expense") throw new Error("Only an expense can be out-of-pocket.");
}

function checkOutOfPocketAccount(account: AccountRow): void {
  if (!canBeOutOfPocket(account)) {
    throw new Error("Choose a Household account that isn't a credit card.");
  }
}

async function requireTransaction(transactionId: string): Promise<TransactionRow> {
  const transaction = await getTransaction(transactionId);
  if (!transaction) throw new Error("That transaction no longer exists.");
  return transaction;
}

/**
 * Any detail, including the account, within the same visibility (ADR 0002).
 * A transaction on a retired account or category stays editable; only a move
 * onto a retired one is refused. An out-of-pocket expense keeps its payer and
 * stays an expense on a Household account that isn't a card (ADR 0012).
 */
export async function editTransaction(
  actor: Actor,
  transactionId: string,
  input: PaidFromInput
): Promise<void> {
  const entered = checkedDetails(input);
  requireDescription(entered);
  await appendEdit(actor, await requireTransaction(transactionId), entered, input.payingAccountId);
}

async function appendEdit(
  actor: Actor,
  transaction: TransactionRow,
  entered: TransactionDetails,
  chosenPayingId?: string
): Promise<void> {
  const accountChanged = entered.accountId !== transaction.accountId;
  const choosesPaying =
    chosenPayingId !== undefined && chosenPayingId !== transaction.payingAccountId;
  // The reservation stays where it was recorded unless the member moves it or the transaction changes account.
  const details = { ...entered, payingAccountId: transaction.payingAccountId };
  // A re-sent unchanged edit would carry a later HLC and undo another device's edit.
  if (!choosesPaying && sameDetails(details, transaction)) return;
  const outOfPocket = transaction.paidByUserId !== null;
  if (outOfPocket) checkOutOfPocketType(details);
  if (accountChanged || choosesPaying || details.categoryId !== transaction.categoryId) {
    const account = await requireAccount(details.accountId);
    if (accountChanged) {
      if (outOfPocket) checkOutOfPocketAccount(account);
      checkMove(account, transaction);
    }
    if (accountChanged || choosesPaying) {
      // A different card resets it to that card's usual account.
      const usual = accountChanged ? payingAccountOf(account) : transaction.payingAccountId;
      details.payingAccountId = await payingAccountFor(account, chosenPayingId, usual);
    }
    await checkCategory(details.categoryId, account);
  }
  if (sameDetails(details, transaction)) return;
  await appendTransactionEvent(actor, transaction, TRANSACTION_EDITED, { ...details });
  requestSync();
}

const sameDetails = (a: TransactionDetails, b: TransactionDetails) =>
  a.date === b.date &&
  a.type === b.type &&
  a.amountCents === b.amountCents &&
  a.accountId === b.accountId &&
  a.categoryId === b.categoryId &&
  a.payingAccountId === b.payingAccountId &&
  a.description === b.description &&
  a.notes === b.notes;

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

/** Runs the single-transaction command on each, skipping those already as asked. */
const changeEachTransaction = (
  transactionIds: string[],
  isAlready: (transaction: TransactionRow) => boolean,
  change: (transaction: TransactionRow) => Promise<void>
) => changeEach(transactionIds, requireTransaction, isAlready, change);

/** Null moves them to Unassigned. */
export const changeTransactionsCategory = (
  actor: Actor,
  transactionIds: string[],
  categoryId: string | null
) =>
  changeEachTransaction(
    transactionIds,
    (transaction) => transaction.categoryId === categoryId,
    // Not an edit of the description, so an old transaction without one can still move.
    (transaction) => appendEdit(actor, transaction, checkedDetails({ ...transaction, categoryId }))
  );

export const removeTransactions = (actor: Actor, transactionIds: string[]) =>
  changeEachTransaction(
    transactionIds,
    (transaction) => transaction.removed,
    (transaction) => removeTransaction(actor, transaction.id)
  );

export const restoreTransactions = (actor: Actor, transactionIds: string[]) =>
  changeEachTransaction(
    transactionIds,
    (transaction) => !transaction.removed,
    (transaction) => restoreTransaction(actor, transaction.id)
  );

/** Paying back an Out-of-pocket expense is marking it cleared (ADR 0012). */
export const markPaidBack = (actor: Actor, transactionIds: string[]) =>
  changeEachTransaction(
    transactionIds,
    (transaction) => transaction.status === "cleared",
    async (transaction) => {
      if (transaction.paidByUserId === null) {
        throw new Error("Only an out-of-pocket expense can be paid back.");
      }
      await setTransactionStatus(actor, transaction.id, "cleared");
    }
  );

/** Undoes Mark paid back: the expenses are owed again. */
export const markOwedAgain = (actor: Actor, transactionIds: string[]) =>
  changeEachTransaction(
    transactionIds,
    (transaction) => transaction.status === "pending",
    (transaction) => setTransactionStatus(actor, transaction.id, "pending")
  );
