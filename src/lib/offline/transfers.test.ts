/**
 * Tests for transfer pairing + the local Dexie fallback (review R11):
 * groupTransferLegs is the single pairing implementation shared by the
 * Supabase path (hooks/useTransfers) and the offline path, so these tests
 * cover both sides' grouping semantics.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { db, type LocalAccount, type LocalTransaction } from "@/lib/dexie/db";
import { getLocalTransfers, groupTransferLegs, type TransferLeg } from "./transfers";

// ─── Fixture helpers ─────────────────────────────

function makeLeg(overrides: Partial<TransferLeg> = {}): TransferLeg {
  return {
    id: crypto.randomUUID(),
    date: "2026-07-05",
    amount_cents: 10000,
    description: "Transfer",
    transfer_group_id: "tg-1",
    type: "expense",
    account: { id: "acc-1", name: "Checking" },
    ...overrides,
  };
}

function makeTransaction(overrides: Partial<LocalTransaction> = {}): LocalTransaction {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    date: "2026-07-05",
    description: "Transfer",
    amount_cents: 10000,
    type: "expense",
    currency_code: "PHP",
    status: "cleared",
    visibility: "household",
    created_by_user_id: "user-1",
    tagged_user_ids: [],
    device_id: "dev-1",
    created_at: "2026-07-05T10:00:00.000Z",
    updated_at: "2026-07-05T10:00:00.000Z",
    ...overrides,
  };
}

function makeAccount(overrides: Partial<LocalAccount> = {}): LocalAccount {
  return {
    id: crypto.randomUUID(),
    household_id: "hh-1",
    name: "Test Account",
    type: "bank",
    initial_balance_cents: 0,
    currency_code: "PHP",
    visibility: "household",
    color: "#0000ff",
    icon: "bank",
    sort_order: 0,
    is_active: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ─── groupTransferLegs (pure) ────────────────────

describe("groupTransferLegs", () => {
  it("pairs expense+income legs; the expense leg is canonical", () => {
    const grouped = groupTransferLegs([
      makeLeg({
        id: "leg-out",
        type: "expense",
        description: "Transfer to Savings",
        account: { id: "acc-1", name: "Checking" },
      }),
      makeLeg({
        id: "leg-in",
        type: "income",
        description: "Transfer from Checking",
        account: { id: "acc-2", name: "Savings" },
      }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toEqual({
      id: "leg-out",
      date: "2026-07-05",
      amount_cents: 10000,
      transfer_group_id: "tg-1",
      description: "Transfer to Savings",
      from_account: { id: "acc-1", name: "Checking" },
      to_account: { id: "acc-2", name: "Savings" },
      from_account_name: "Checking",
      to_account_name: "Savings",
    });
  });

  it("drops incomplete pairs (a leg whose partner has not synced)", () => {
    const grouped = groupTransferLegs([
      makeLeg({ transfer_group_id: "tg-complete", type: "expense" }),
      makeLeg({ transfer_group_id: "tg-complete", type: "income" }),
      makeLeg({ transfer_group_id: "tg-orphan", type: "expense" }),
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].transfer_group_id).toBe("tg-complete");
  });

  it("sorts transfers by date descending", () => {
    const grouped = groupTransferLegs([
      makeLeg({ transfer_group_id: "tg-old", type: "expense", date: "2026-07-01" }),
      makeLeg({ transfer_group_id: "tg-old", type: "income", date: "2026-07-01" }),
      makeLeg({ transfer_group_id: "tg-new", type: "expense", date: "2026-07-09" }),
      makeLeg({ transfer_group_id: "tg-new", type: "income", date: "2026-07-09" }),
    ]);

    expect(grouped.map((g) => g.transfer_group_id)).toEqual(["tg-new", "tg-old"]);
  });

  it("falls back to 'Unknown' when an account is missing", () => {
    const grouped = groupTransferLegs([
      makeLeg({ type: "expense", account: null }),
      makeLeg({ type: "income", account: { id: "acc-2", name: "Savings" } }),
    ]);

    expect(grouped[0].from_account_name).toBe("Unknown");
    expect(grouped[0].to_account_name).toBe("Savings");
  });
});

// ─── getLocalTransfers (Dexie) ───────────────────

describe("getLocalTransfers", () => {
  beforeEach(async () => {
    await db.transactions.clear();
    await db.accounts.clear();
  });

  it("reads transfer-paired rows from Dexie, joined and grouped like the server", async () => {
    await db.accounts.bulkAdd([
      makeAccount({ id: "acc-1", name: "Checking" }),
      makeAccount({ id: "acc-2", name: "Savings" }),
    ]);
    await db.transactions.bulkAdd([
      // Complete pair
      makeTransaction({
        id: "leg-out",
        account_id: "acc-1",
        transfer_group_id: "tg-1",
        type: "expense",
      }),
      makeTransaction({
        id: "leg-in",
        account_id: "acc-2",
        transfer_group_id: "tg-1",
        type: "income",
      }),
      // Orphan leg: partner not mirrored yet, must be dropped
      makeTransaction({ id: "leg-orphan", account_id: "acc-1", transfer_group_id: "tg-2" }),
      // Plain transaction: not a transfer, must not appear
      makeTransaction({ id: "plain", account_id: "acc-1", description: "Groceries" }),
      // Another household's pair: must not leak in
      makeTransaction({
        id: "other-out",
        household_id: "hh-2",
        transfer_group_id: "tg-3",
        type: "expense",
      }),
      makeTransaction({
        id: "other-in",
        household_id: "hh-2",
        transfer_group_id: "tg-3",
        type: "income",
      }),
    ]);

    const transfers = await getLocalTransfers("hh-1");

    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      id: "leg-out",
      transfer_group_id: "tg-1",
      amount_cents: 10000,
      from_account_name: "Checking",
      to_account_name: "Savings",
    });
  });

  it("returns [] when the device has no mirrored transfers", async () => {
    expect(await getLocalTransfers("hh-1")).toEqual([]);
  });
});
