import { describe, expect, it } from "vitest";
import { parseSyncRow } from "./syncRows";

const serverDebt = {
  id: "8b5f8e0e-1111-4e5a-9a4e-000000000001",
  household_id: "h1",
  name: "Loan",
  original_amount_cents: 10000,
  status: "active",
  closed_at: null,
  created_at: "2026-10-06T00:00:00Z",
  updated_at: "2026-10-06T00:00:00Z",
};

const serverReversal = {
  id: "8b5f8e0e-1111-4e5a-9a4e-000000000002",
  household_id: "h1",
  debt_id: serverDebt.id,
  internal_debt_id: null,
  transaction_id: "8b5f8e0e-1111-4e5a-9a4e-000000000003",
  amount_cents: -2500,
  payment_date: "2026-10-06",
  device_id: "other-device",
  is_reversal: true,
  reverses_payment_id: "8b5f8e0e-1111-4e5a-9a4e-000000000004",
  adjustment_reason: null,
  is_overpayment: null,
  overpayment_amount: null,
  created_at: "2026-10-06T01:00:00Z",
};

describe("parseSyncRow for debt tables", () => {
  it("parses a debt and drops a null closed_at", () => {
    const parsed = parseSyncRow("debts", serverDebt);
    expect(parsed.ok && parsed.row).toMatchObject({
      original_amount_cents: 10000,
      closed_at: undefined,
    });
  });

  it("parses an internal debt", () => {
    const parsed = parseSyncRow("internal_debts", {
      ...serverDebt,
      from_type: "account",
      from_id: "a1",
      from_display_name: "Cash",
      to_type: "member",
      to_id: "u1",
      to_display_name: "Ana",
    });
    expect(parsed.ok).toBe(true);
  });

  it("parses a negative reversal row and derives updated_at from created_at", () => {
    const parsed = parseSyncRow("debt_payments", serverReversal);
    expect(parsed.ok && parsed.row).toMatchObject({
      amount_cents: -2500,
      is_overpayment: false,
      updated_at: serverReversal.created_at,
      debt_id: serverDebt.id,
      internal_debt_id: undefined,
    });
  });

  it("rejects an unknown debt status and fractional cents", () => {
    expect(parseSyncRow("debts", { ...serverDebt, status: "closed" }).ok).toBe(false);
    expect(parseSyncRow("debt_payments", { ...serverReversal, amount_cents: 12.5 }).ok).toBe(false);
  });
});
