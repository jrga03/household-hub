/**
 * Dexie v9 → v10 upgrade test (review R11): an existing v9 database with
 * real user data must open at version 10 losslessly, gaining the empty
 * budgets store with its month/category indexes.
 *
 * Approach: seed a raw Dexie instance named "HouseholdHubDB" with the exact
 * v9 store set (fake-indexeddb), close it, THEN dynamically import
 * "@/lib/dexie/db" so the app singleton runs the real v10 migration against
 * that pre-existing database. No static import of db.ts in this file - that
 * would create the database at v10 before the seed runs.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Dexie from "dexie";

// Effective schema at version 9 (v8 stores with `conflicts` dropped),
// copied from db.ts's version chain
const V9_STORES = {
  transactions:
    "id, date, account_id, category_id, status, type, household_id, created_at, transfer_group_id, debt_id, internal_debt_id, " +
    "[account_id+date], [category_id+date], [household_id+date], *tagged_user_ids",
  accounts: "id, name, visibility, household_id",
  categories: "id, parent_id, name, household_id",
  syncQueue:
    "id, status, entity_type, entity_id, device_id, created_at, " +
    "[status+device_id], [device_id+created_at]",
  events: "id, entity_id, lamport_clock, timestamp, device_id, idempotency_key",
  meta: "key",
  logs: "id, timestamp, level, device_id",
  syncIssues: "id, entityId, issueType, timestamp",
  debts: "id, household_id, status, created_at, [household_id+status+updated_at]",
  internalDebts:
    "id, household_id, from_type, from_id, to_type, to_id, status, created_at, " +
    "[household_id+status+updated_at]",
  debtPayments:
    "id, debt_id, internal_debt_id, transaction_id, payment_date, is_reversal, reverses_payment_id, " +
    "[debt_id+payment_date+created_at], [internal_debt_id+payment_date+created_at]",
  importDrafts:
    "id, importSessionId, draft_status, account_id, import_key, created_at, " +
    "[importSessionId+draft_status]",
  importSessions: "id, source_bank, created_at",
};

const SEED_TRANSACTION = {
  id: "tx-1",
  household_id: "hh-1",
  date: "2026-07-05",
  description: "Pre-upgrade transaction",
  amount_cents: 12345,
  type: "expense",
  currency_code: "PHP",
  status: "cleared",
  visibility: "household",
  created_by_user_id: "user-1",
  tagged_user_ids: [],
  device_id: "dev-1",
  created_at: "2026-07-05T10:00:00.000Z",
  updated_at: "2026-07-05T10:00:00.000Z",
};

const SEED_ACCOUNT = {
  id: "acc-1",
  household_id: "hh-1",
  name: "Checking",
  type: "bank",
  initial_balance_cents: 100000,
  currency_code: "PHP",
  visibility: "household",
  color: "#0000ff",
  icon: "bank",
  sort_order: 0,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

beforeAll(async () => {
  // Start from a clean slate, then install a REAL v9 database with data
  await Dexie.delete("HouseholdHubDB");

  const v9 = new Dexie("HouseholdHubDB");
  v9.version(9).stores(V9_STORES);
  await v9.open();

  await v9.table("transactions").add(SEED_TRANSACTION);
  await v9.table("accounts").add(SEED_ACCOUNT);
  await v9.table("meta").put({ key: "lamport_clock", value: 7 });

  v9.close();
});

describe("Dexie v9 → v10 upgrade", () => {
  it("opens at version 10, preserves existing data, and adds a usable budgets store", async () => {
    // Importing the module runs the real singleton + auto-open + migration
    const { db } = await import("./db");
    await db.open();

    expect(db.verno).toBe(10);

    // Existing data preserved across the upgrade
    expect(await db.transactions.get("tx-1")).toMatchObject({
      description: "Pre-upgrade transaction",
      amount_cents: 12345,
    });
    expect(await db.accounts.get("acc-1")).toMatchObject({
      name: "Checking",
      initial_balance_cents: 100000,
    });
    expect((await db.meta.get("lamport_clock"))?.value).toBe(7);

    // New budgets store exists, is empty, and its month index works
    expect(db.tables.map((t) => t.name)).toContain("budgets");
    expect(await db.budgets.count()).toBe(0);

    await db.budgets.add({
      id: "b-1",
      household_id: "hh-1",
      category_id: "cat-1",
      month: "2026-07-01",
      amount_cents: 50000,
      currency_code: "PHP",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    });

    expect(await db.budgets.where("month").equals("2026-07-01").count()).toBe(1);
    expect(
      await db.budgets.where("[month+category_id]").equals(["2026-07-01", "cat-1"]).count()
    ).toBe(1);
  });
});
