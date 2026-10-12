/**
 * Account money summed at read time from the account and transaction
 * projections, never stored, so it is order-independent by construction.
 */

import { isCreditCard } from "@/lib/accounts/events";
import type { AccountRow } from "@/lib/accounts/projection";
import { negateCents, sumCents, ZERO_CENTS, type Cents } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import type { TransactionRow } from "./projection";

export interface Envelopes {
  /** Money not yet in any category: the starting balance plus uncategorized transactions. */
  unassigned: Cents;
  /** Each category's money in this account, by category ID. */
  categories: Map<string, Cents>;
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

/** Balance = Unassigned + category money holds for every account with envelopes. */
export function sumAccountMoney(
  accounts: AccountRow[],
  transactions: TransactionRow[]
): Map<string, AccountMoney> {
  const totals = new Map<string, { cleared: Cents; pending: Cents; envelopes: Envelopes }>();
  const cards = new Set<string>();
  for (const account of accounts) {
    if (isCreditCard(account)) cards.add(account.id);
    totals.set(account.id, {
      cleared: account.startingBalanceCents,
      pending: ZERO_CENTS,
      envelopes: { unassigned: account.startingBalanceCents, categories: new Map() },
    });
  }

  for (const transaction of transactions) {
    const account = totals.get(transaction.accountId);
    if (!account || transaction.removed) continue;
    // A card's balance is what it owes: a purchase raises it, a refund lowers it.
    const raises = (transaction.type === "income") !== cards.has(transaction.accountId);
    const amount = raises ? transaction.amountCents : negateCents(transaction.amountCents);
    account[transaction.status] = sumCents([account[transaction.status], amount]);
    const { envelopes } = account;
    if (transaction.categoryId === null) {
      envelopes.unassigned = sumCents([envelopes.unassigned, amount]);
    } else {
      const held = envelopes.categories.get(transaction.categoryId) ?? ZERO_CENTS;
      envelopes.categories.set(transaction.categoryId, sumCents([held, amount]));
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
export async function readAccountMoney(): Promise<Map<string, AccountMoney>> {
  const [accounts, transactions] = await Promise.all([
    db.accounts.toArray(),
    db.transactions.toArray(),
  ]);
  return sumAccountMoney(accounts, transactions);
}
