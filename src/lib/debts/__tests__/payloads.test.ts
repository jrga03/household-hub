import { describe, expect, it } from "vitest";
import { toDebtInsert, toDebtPaymentInsert, toInternalDebtInsert } from "../payloads";
import { createTestDebt, createTestInternalDebt, createTestPayment } from "./test-utils";

const keys = (row: object) => Object.keys(row).sort();

describe("debt queue payloads", () => {
  it("debt insert carries exactly the server columns", () => {
    expect(keys(toDebtInsert(createTestDebt()))).toEqual([
      "closed_at",
      "created_at",
      "household_id",
      "id",
      "name",
      "original_amount_cents",
      "status",
      "updated_at",
    ]);
  });

  it("internal debt insert carries exactly the server columns", () => {
    expect(keys(toInternalDebtInsert(createTestInternalDebt()))).toEqual([
      "closed_at",
      "created_at",
      "from_display_name",
      "from_id",
      "from_type",
      "household_id",
      "id",
      "name",
      "original_amount_cents",
      "status",
      "to_display_name",
      "to_id",
      "to_type",
      "updated_at",
    ]);
  });

  it("payment insert drops local-only fields and nulls absent links", () => {
    const insert = toDebtPaymentInsert(createTestPayment({ internal_debt_id: undefined }));
    expect(keys(insert)).toEqual([
      "adjustment_reason",
      "amount_cents",
      "created_at",
      "debt_id",
      "device_id",
      "household_id",
      "id",
      "internal_debt_id",
      "is_overpayment",
      "is_reversal",
      "overpayment_amount",
      "payment_date",
      "reverses_payment_id",
      "transaction_id",
    ]);
    expect(insert.internal_debt_id).toBeNull();
  });
});
