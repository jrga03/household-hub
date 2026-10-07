/**
 * Read-only view of the app database for code outside the data layer.
 * Same Dexie instance as `db`; the types drop every write, including
 * Collection.modify/delete, so an entity write can only be expressed in
 * src/lib/{offline,debts,sync,dexie}, where it enqueues its sync item.
 */
import type { Collection, IndexableType, Table, WhereClause } from "dexie";
import { db, type HouseholdHubDB } from "./db";

type CollectionRead =
  | "toArray"
  | "first"
  | "last"
  | "count"
  | "sortBy"
  | "each"
  | "keys"
  | "primaryKeys";

export type ReadCollection<T, TKey> = Pick<Collection<T, TKey>, CollectionRead> & {
  filter(fn: (row: T) => boolean): ReadCollection<T, TKey>;
  and(fn: (row: T) => boolean): ReadCollection<T, TKey>;
  reverse(): ReadCollection<T, TKey>;
  limit(n: number): ReadCollection<T, TKey>;
  offset(n: number): ReadCollection<T, TKey>;
};

type WhereMethod =
  | "equals"
  | "notEqual"
  | "anyOf"
  | "noneOf"
  | "between"
  | "above"
  | "aboveOrEqual"
  | "below"
  | "belowOrEqual"
  | "startsWith"
  | "startsWithAnyOf"
  | "equalsIgnoreCase"
  | "anyOfIgnoreCase"
  | "startsWithIgnoreCase"
  | "inAnyRange";

export type ReadWhereClause<T, TKey> = {
  [M in WhereMethod]: (...args: Parameters<WhereClause<T, TKey>[M]>) => ReadCollection<T, TKey>;
};

export interface ReadTable<T, TKey>
  extends Pick<Table<T, TKey>, "get" | "bulkGet" | "count" | "toArray" | "each"> {
  where(index: string | string[]): ReadWhereClause<T, TKey>;
  filter(fn: (row: T) => boolean): ReadCollection<T, TKey>;
  orderBy(index: string | string[]): ReadCollection<T, TKey>;
  toCollection(): ReadCollection<T, TKey>;
}

type TableName =
  | "transactions"
  | "accounts"
  | "categories"
  | "budgets"
  | "debts"
  | "internalDebts"
  | "debtPayments"
  | "syncQueue"
  | "events"
  | "meta"
  | "logs"
  | "syncIssues"
  | "importDrafts"
  | "importSessions";

export type ReadDb = {
  readonly [K in TableName]: HouseholdHubDB[K] extends Table<infer T, infer TKey>
    ? ReadTable<T, TKey extends IndexableType ? TKey : never>
    : never;
};

export const readDb: ReadDb = db;
