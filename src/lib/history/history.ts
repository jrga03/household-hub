/**
 * What references an account, group or category, read from the projections.
 * A deleted record is hidden only while this is empty, so history recorded on
 * another device brings it back as retired, in whatever order events arrive.
 */

import { db } from "@/lib/dexie/db";
import type { AccountRow } from "@/lib/accounts/projection";
import type { Envelope } from "@/lib/allocations/events";
import type { CategoryRow, GroupRow } from "@/lib/categories/projection";

interface HistoryRecords {
  accounts: AccountRow[];
  categories: CategoryRow[];
  references: { accountIds: string[]; categoryIds: string[]; noun: string }[];
}

const categoryIdOf = (envelope: Envelope) => (envelope.kind === "category" ? [envelope.id] : []);

const ids = (...candidates: (string | null)[]) =>
  candidates.filter((candidate) => candidate !== null);

/** Removed records count: their events still reference the record. */
async function readHistoryRecords(): Promise<HistoryRecords> {
  const [accounts, categories, transactions, transfers, allocations, budgets, corrections] =
    await Promise.all([
      db.accounts.toArray(),
      db.categories.toArray(),
      db.transactions.toArray(),
      db.transfers.toArray(),
      db.allocations.toArray(),
      db.budgets.toArray(),
      db.balanceCorrections.toArray(),
    ]);
  return {
    accounts,
    categories,
    references: [
      ...transactions.map((transaction) => ({
        noun: "transaction",
        accountIds: ids(transaction.accountId, transaction.payingAccountId),
        categoryIds: ids(transaction.categoryId),
      })),
      ...transfers.map((transfer) => ({
        noun: "transfer",
        accountIds: [transfer.fromAccountId, transfer.toAccountId],
        categoryIds: categoryIdOf(transfer.envelope),
      })),
      ...allocations.map((allocation) => ({
        noun: "allocation",
        accountIds: [allocation.accountId],
        categoryIds: [...categoryIdOf(allocation.from), ...categoryIdOf(allocation.to)],
      })),
      ...budgets.map((budget) => ({
        noun: "budget",
        accountIds: ids(budget.accountId),
        categoryIds: [budget.categoryId],
      })),
      ...corrections.map((correction) => ({
        noun: "balance correction",
        accountIds: ids(correction.accountId, correction.payingAccountId),
        categoryIds: categoryIdOf(correction.envelope),
      })),
    ],
  };
}

const counted = (count: number, singular: string, plural = `${singular}s`) =>
  count === 0 ? [] : [`${count} ${count === 1 ? singular : plural}`];

function countByNoun(nouns: string[]): string[] {
  const counts = new Map<string, number>();
  for (const noun of nouns) counts.set(noun, (counts.get(noun) ?? 0) + 1);
  return [...counts].flatMap(([noun, count]) => counted(count, noun));
}

/** Everything but the cards paid from it; a card is never paid from a card. */
function ownAccountHistory(account: AccountRow, records: HistoryRecords): string[] {
  return [
    ...(account.startingBalanceCents === 0 ? [] : ["a starting balance"]),
    ...countByNoun(
      records.references
        .filter((reference) => reference.accountIds.includes(account.id))
        .map((reference) => reference.noun)
    ),
  ];
}

/** "12 transactions", "a starting balance": empty when nothing ever used the account. */
function accountHistory(account: AccountRow, records: HistoryRecords): string[] {
  const cards = records.accounts.filter(
    (card) =>
      card.payingAccountId === account.id &&
      !(card.deleted && ownAccountHistory(card, records).length === 0)
  );
  return [
    ...ownAccountHistory(account, records),
    ...counted(cards.length, "card paid from it", "cards paid from it"),
  ];
}

function categoryHistory(category: CategoryRow, records: HistoryRecords): string[] {
  return countByNoun(
    records.references
      .filter((reference) => reference.categoryIds.includes(category.id))
      .map((reference) => reference.noun)
  );
}

function groupHistory(group: GroupRow, records: HistoryRecords): string[] {
  const held = records.categories.filter(
    (category) =>
      category.groupId === group.id &&
      !(category.deleted && categoryHistory(category, records).length === 0)
  );
  return counted(held.length, "category", "categories");
}

export const readAccountHistory = async (account: AccountRow) =>
  accountHistory(account, await readHistoryRecords());

export const readCategoryHistory = async (category: CategoryRow) =>
  categoryHistory(category, await readHistoryRecords());

export const readGroupHistory = async (group: GroupRow) =>
  groupHistory(group, await readHistoryRecords());

/**
 * Leaves out deleted records nothing references. Reads the history only when
 * one is deleted, so lists without any pay nothing for it.
 */
async function withoutDeleted<Row extends { deleted?: boolean }>(
  rows: Row[],
  historyOf: (row: Row, records: HistoryRecords) => string[]
): Promise<Row[]> {
  if (!rows.some((row) => row.deleted)) return rows;
  const records = await readHistoryRecords();
  return rows.filter((row) => !row.deleted || historyOf(row, records).length > 0);
}

export const withoutDeletedAccounts = <Row extends AccountRow>(accounts: Row[]) =>
  withoutDeleted(accounts, accountHistory);

export const withoutDeletedCategories = <Row extends CategoryRow>(categories: Row[]) =>
  withoutDeleted(categories, categoryHistory);

export const withoutDeletedGroups = <Row extends GroupRow>(groups: Row[]) =>
  withoutDeleted(groups, groupHistory);
