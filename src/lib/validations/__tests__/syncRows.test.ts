import { describe, expect, it } from "vitest";
import { parseSyncRow } from "@/lib/validations/syncRows";

const transactionRow = {
  id: "t1",
  household_id: "h1",
  date: "2026-10-04",
  description: "Groceries",
  amount_cents: 123456,
  type: "expense",
  currency_code: "PHP",
  account_id: null,
  category_id: "c1",
  transfer_group_id: null,
  debt_id: null,
  internal_debt_id: null,
  status: "cleared",
  visibility: "household",
  created_by_user_id: null,
  tagged_user_ids: null,
  notes: null,
  import_key: null,
  device_id: "d1",
  created_at: "2026-10-04T01:00:00Z",
  updated_at: "2026-10-04T01:00:00Z",
};

describe("parseSyncRow", () => {
  it("accepts a server transaction and normalises nulls", () => {
    const result = parseSyncRow("transactions", transactionRow);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toMatchObject({ amount_cents: 123456, tagged_user_ids: [] });
    expect(result.row).not.toHaveProperty("account_id", null);
    expect("account_id" in result.row ? result.row.account_id : undefined).toBeUndefined();
    expect(
      "created_by_user_id" in result.row ? result.row.created_by_user_id : undefined
    ).toBeUndefined();
  });

  it.each([
    ["fractional amount", { amount_cents: 12.5 }],
    ["string amount", { amount_cents: "123456" }],
    ["unknown type", { type: "transfer" }],
    ["missing id", { id: undefined }],
  ])("rejects a transaction with %s", (_label, patch) => {
    const result = parseSyncRow("transactions", { ...transactionRow, ...patch });
    expect(result.ok).toBe(false);
  });

  it("fills account defaults for nullable columns", () => {
    const result = parseSyncRow("accounts", {
      id: "a1",
      household_id: "h1",
      name: "Wallet",
      type: "cash",
      initial_balance_cents: null,
      currency_code: null,
      visibility: null,
      owner_user_id: null,
      color: null,
      icon: null,
      sort_order: null,
      is_active: null,
      created_at: null,
      updated_at: "2026-10-04T01:00:00Z",
    });
    expect(result).toEqual({
      ok: true,
      row: {
        id: "a1",
        household_id: "h1",
        name: "Wallet",
        type: "cash",
        initial_balance_cents: 0,
        currency_code: "PHP",
        visibility: "household",
        owner_user_id: undefined,
        color: "#3B82F6",
        icon: "building-2",
        sort_order: 0,
        is_active: true,
        created_at: "1970-01-01T00:00:00.000Z",
        updated_at: "2026-10-04T01:00:00Z",
      },
    });
  });

  it("accepts a category with a null parent", () => {
    const result = parseSyncRow("categories", {
      id: "c1",
      household_id: "h1",
      parent_id: null,
      name: "Food",
      color: "#22C55E",
      icon: null,
      sort_order: null,
      is_active: null,
      created_at: null,
      updated_at: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toMatchObject({ icon: "folder", updated_at: "1970-01-01T00:00:00.000Z" });
  });
});
