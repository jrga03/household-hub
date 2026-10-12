/**
 * Account money summed at read time from the account, transaction and
 * allocation projections, never stored, so it is order-independent by construction.
 */

import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import type { Envelope } from "@/lib/allocations/events";
import type { AllocationRow } from "@/lib/allocations/projection";
import { negateCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
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

export interface AccountMoney {
  /** For a credit card, the amount owed. */
  balance: Cents;
  /** The starting balance plus cleared transactions. */
  cleared: Cents;
  pending: Cents;
  /** Null for a credit card: its purchases reserve money in its Paying Account. */
  envelopes: Envelopes | null;
}

const addToTotal = (held: Map<string, Cents>, key: string, amount: Cents) =>
  held.set(key, sumCents([held.get(key) ?? ZERO_CENTS, amount]));

/**
 * Moves a transaction's amount into its category, or Unassigned when it has none.
 * A positive amount adds money; a negative one draws it.
 */
function addToEnvelope(envelopes: Envelopes, categoryId: string | null, amount: Cents) {
  if (categoryId === null) envelopes.unassigned = sumCents([envelopes.unassigned, amount]);
  else addToTotal(envelopes.categories, categoryId, amount);
}

function addToAllocated(envelopes: Envelopes, envelope: Envelope, amount: Cents) {
  if (envelope.kind === "card_payment") addToTotal(envelopes.cardPayments, envelope.id, amount);
  else addToEnvelope(envelopes, envelope.kind === "category" ? envelope.id : null, amount);
}

/** Balance = Unassigned + category money + Card Payments holds for every account with envelopes. */
export function sumAccountMoney(
  accounts: AccountRow[],
  transactions: TransactionRow[],
  allocations: AllocationRow[]
): Map<string, AccountMoney> {
  const totals = new Map<string, { cleared: Cents; pending: Cents; envelopes: Envelopes }>();
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
    const account = totals.get(transaction.accountId);
    if (!account || transaction.removed) continue;
    // A card's balance is what it owes: a purchase raises it, a refund lowers it.
    const raises = (transaction.type === "income") !== cards.has(transaction.accountId);
    const amount = raises ? transaction.amountCents : negateCents(transaction.amountCents);
    account[transaction.status] = sumCents([account[transaction.status], amount]);
    if (!cards.has(transaction.accountId)) {
      addToEnvelope(account.envelopes, transaction.categoryId, amount);
      continue;
    }
    // What the card owes more moves from its envelope into its Card Payment in the
    // Paying Account the transaction recorded, so that account's balance doesn't change.
    const { payingAccountId } = transaction;
    const paying =
      payingAccountId && !cards.has(payingAccountId) ? totals.get(payingAccountId) : undefined;
    if (!paying) continue;
    addToEnvelope(paying.envelopes, transaction.categoryId, negateCents(amount));
    addToTotal(paying.envelopes.cardPayments, transaction.accountId, amount);
  }

  // An allocation moves money between two envelopes of one account; its balance doesn't change.
  for (const allocation of allocations) {
    const account = totals.get(allocation.accountId);
    if (!account || allocation.removed || cards.has(allocation.accountId)) continue;
    addToAllocated(account.envelopes, allocation.from, negateCents(allocation.amountCents));
    addToAllocated(account.envelopes, allocation.to, allocation.amountCents);
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
export async function readAccountMoney(): Promise<Map<string, AccountMoney>> {
  const [accounts, transactions, allocations] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
    db.allocations.toArray(),
  ]);
  return sumAccountMoney(accounts, transactions, allocations);
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
