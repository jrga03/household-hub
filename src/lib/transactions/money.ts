/**
 * Account money summed at read time from the account, transaction,
 * allocation, transfer and balance correction projections, never stored, so
 * it is order-independent by construction.
 */

import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import type { AllocationRow } from "@/lib/allocations/projection";
import { negateCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import type { BalanceCorrectionRow } from "@/lib/corrections/projection";
import { db } from "@/lib/dexie/db";
import type { TransferRow } from "@/lib/transfers/projection";
import type { TransactionStatus } from "./events";
import type { TransactionRow } from "./projection";

export interface Envelopes {
  /**
   * Money not yet in any category: the starting balance plus uncategorized
   * transactions, less uncategorized card purchases reserved here.
   */
  unassigned: Cents;
  /** Each category's money in this account, by category ID. */
  categories: Map<string, Cents>;
  /** Money reserved for each card paid from this account, by card ID. */
  cardPayments: Map<string, Cents>;
}

/** What the envelope holds in this account; nothing when the account holds no envelopes. */
export function moneyIn(envelopes: Envelopes | null | undefined, envelope: Envelope): Cents {
  if (!envelopes) return ZERO_CENTS;
  if (envelope.kind === "unassigned") return envelopes.unassigned;
  const held = envelope.kind === "category" ? envelopes.categories : envelopes.cardPayments;
  return held.get(envelope.id) ?? ZERO_CENTS;
}

/**
 * How much of the Paying Account's reservation a payment from another account
 * frees: what it holds, up to the payment, so its Card Payment isn't drawn
 * below zero by this device.
 */
export function reservationFreed(held: Cents, payment: Cents): Cents {
  if (held <= 0) return ZERO_CENTS;
  return held < payment ? held : payment;
}

export interface AccountMoney {
  /** For a credit card, the amount owed. */
  balance: Cents;
  /** The starting balance plus cleared transactions, transfers and balance corrections. */
  cleared: Cents;
  pending: Cents;
  /** Null for a credit card: its purchases reserve money in its Paying Account. */
  envelopes: Envelopes | null;
}

const addToTotal = (held: Map<string, Cents>, key: string, amount: Cents) =>
  held.set(key, sumCents([held.get(key) ?? ZERO_CENTS, amount]));

/** A positive amount adds money to the envelope; a negative one draws it. */
function addToAllocated(envelopes: Envelopes, envelope: Envelope, amount: Cents) {
  if (envelope.kind === "unassigned")
    envelopes.unassigned = sumCents([envelopes.unassigned, amount]);
  else if (envelope.kind === "category") addToTotal(envelopes.categories, envelope.id, amount);
  else addToTotal(envelopes.cardPayments, envelope.id, amount);
}

export interface MoneyRecords {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  allocations: AllocationRow[];
  transfers: TransferRow[];
  corrections: BalanceCorrectionRow[];
}

interface AccountTotals {
  cleared: Cents;
  pending: Cents;
  envelopes: Envelopes;
}

/**
 * A record on one account. A positive amount raises its balance (on a card,
 * what it owes). Off a card, the envelope moves with the balance. On a card,
 * what it owes more moves from the envelope into its Card Payment in the
 * Paying Account the record kept, so that account's balance doesn't change.
 */
function addRecorded(
  totals: Map<string, AccountTotals>,
  cards: Set<string>,
  record: {
    accountId: string;
    status: TransactionStatus;
    envelope: Envelope;
    payingAccountId: string | null;
  },
  amount: Cents
) {
  const account = totals.get(record.accountId);
  if (!account) return;
  account[record.status] = sumCents([account[record.status], amount]);
  if (!cards.has(record.accountId)) {
    addToAllocated(account.envelopes, record.envelope, amount);
    return;
  }
  const { payingAccountId } = record;
  const paying =
    payingAccountId && !cards.has(payingAccountId) ? totals.get(payingAccountId) : undefined;
  if (!paying) return;
  addToAllocated(paying.envelopes, record.envelope, negateCents(amount));
  addToTotal(paying.envelopes.cardPayments, record.accountId, amount);
}

const envelopeOfCategory = (categoryId: string | null): Envelope =>
  categoryId === null ? UNASSIGNED_ENVELOPE : { kind: "category", id: categoryId };

/** Balance = Unassigned + category money + Card Payments holds for every account with envelopes. */
export function sumAccountMoney({
  accounts,
  transactions,
  allocations,
  transfers,
  corrections,
}: MoneyRecords): Map<string, AccountMoney> {
  const totals = new Map<string, AccountTotals>();
  const cards = new Set<string>();
  for (const account of accounts) {
    if (isCreditCard(account)) cards.add(account.id);
    totals.set(account.id, {
      cleared: account.startingBalanceCents,
      pending: ZERO_CENTS,
      envelopes: {
        unassigned: account.startingBalanceCents,
        categories: new Map(),
        cardPayments: new Map(),
      },
    });
  }

  for (const transaction of transactions) {
    if (transaction.removed) continue;
    // A card's balance is what it owes: a purchase raises it, a refund lowers it.
    const raises = (transaction.type === "income") !== cards.has(transaction.accountId);
    const amount = raises ? transaction.amountCents : negateCents(transaction.amountCents);
    addRecorded(
      totals,
      cards,
      { ...transaction, envelope: envelopeOfCategory(transaction.categoryId) },
      amount
    );
  }

  // A correction counts as cleared and moves its envelope as a transaction would (ADR 0009).
  for (const correction of corrections) {
    if (correction.removed) continue;
    const amount =
      correction.direction === "raise"
        ? correction.amountCents
        : negateCents(correction.amountCents);
    addRecorded(totals, cards, { ...correction, status: "cleared" }, amount);
  }

  // An allocation moves money between two envelopes of one account; its balance doesn't change.
  for (const allocation of allocations) {
    const account = totals.get(allocation.accountId);
    if (!account || allocation.removed || cards.has(allocation.accountId)) continue;
    addToAllocated(account.envelopes, allocation.from, negateCents(allocation.amountCents));
    addToAllocated(account.envelopes, allocation.to, allocation.amountCents);
  }

  // A transfer moves its envelope's money out of one account and into the other.
  // A card holds no envelopes: money in lowers what it owes, money out raises it.
  for (const transfer of transfers) {
    if (transfer.removed) continue;
    const legs = [
      { accountId: transfer.fromAccountId, amount: negateCents(transfer.amountCents) },
      { accountId: transfer.toAccountId, amount: transfer.amountCents },
    ];
    for (const { accountId, amount } of legs) {
      const account = totals.get(accountId);
      if (!account) continue;
      const isCard = cards.has(accountId);
      const change = isCard ? negateCents(amount) : amount;
      account[transfer.status] = sumCents([account[transfer.status], change]);
      if (!isCard) addToAllocated(account.envelopes, transfer.envelope, amount);
    }
  }

  const money = new Map<string, AccountMoney>();
  for (const [accountId, { cleared, pending, envelopes }] of totals) {
    money.set(accountId, {
      balance: sumCents([cleared, pending]),
      cleared,
      pending,
      envelopes: cards.has(accountId) ? null : envelopes,
    });
  }
  return money;
}

/** Every account's money on this device, retired ones included, by account ID. */
export const readAccountMoney = async (): Promise<Map<string, AccountMoney>> =>
  sumAccountMoney(await readMoneyRecords());

/** Every record account money is summed from, retired and removed ones included. */
export async function readMoneyRecords(): Promise<MoneyRecords> {
  const [accounts, transactions, allocations, transfers, corrections] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.allocations.toArray(),
    db.transfers.toArray(),
    db.balanceCorrections.toArray(),
  ]);
  return { accounts, transactions, allocations, transfers, corrections };
}

/**
 * The account's cleared balance at the end of `date`: its starting balance and
 * every cleared record dated on or before it. What a correction is measured against.
 */
export async function readClearedBalanceAt(accountId: string, date: string): Promise<Cents> {
  const { accounts, transactions, transfers, corrections } = await readMoneyRecords();
  const byDate = (record: { date: string }) => record.date <= date;
  const money = sumAccountMoney({
    accounts,
    transactions: transactions.filter(byDate),
    allocations: [],
    transfers: transfers.filter(byDate),
    corrections: corrections.filter(byDate),
  });
  return money.get(accountId)?.cleared ?? ZERO_CENTS;
}

export interface CategoryMoney {
  total: Cents;
  /** The category's money in each account holding some, by account ID. */
  byAccount: Map<string, Cents>;
}

/** Each category's money summed across accounts, by category ID. */
export function sumCategoryMoney(money: Map<string, AccountMoney>): Map<string, CategoryMoney> {
  const byCategory = new Map<string, CategoryMoney>();
  for (const [accountId, { envelopes }] of money) {
    if (!envelopes) continue;
    for (const [categoryId, cents] of envelopes.categories) {
      const category = byCategory.get(categoryId) ?? { total: ZERO_CENTS, byAccount: new Map() };
      category.total = sumCents([category.total, cents]);
      category.byAccount.set(accountId, cents);
      byCategory.set(categoryId, category);
    }
  }
  return byCategory;
}
