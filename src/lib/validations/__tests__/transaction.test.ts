import { describe, it, expect } from "vitest";
import { transactionSchema } from "../transaction";

function validData(overrides = {}) {
  return {
    date: new Date("2025-01-15"),
    description: "Grocery Shopping",
    amount_cents: 150050,
    type: "expense" as const,
    account_id: null,
    category_id: null,
    status: "cleared" as const,
    visibility: "household" as const,
    notes: null,
    ...overrides,
  };
}

describe("transactionSchema", () => {
  describe("valid data", () => {
    it("passes with all required fields", () => {
      const result = transactionSchema.safeParse(validData());
      expect(result.success).toBe(true);
    });

    it("passes with optional fields populated", () => {
      const result = transactionSchema.safeParse(
        validData({
          account_id: "acc-1",
          category_id: "cat-1",
          notes: "Some notes",
          debt_id: "debt-1",
        })
      );
      expect(result.success).toBe(true);
    });
  });

  describe("date validation", () => {
    it("fails when date is missing", () => {
      const { date: _, ...data } = validData();
      const result = transactionSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("fails when date is in the future", () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const result = transactionSchema.safeParse(validData({ date: futureDate }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("future");
      }
    });

    it("passes with today's date", () => {
      const result = transactionSchema.safeParse(validData({ date: new Date() }));
      expect(result.success).toBe(true);
    });
  });

  describe("description validation", () => {
    it("fails when shorter than 3 characters", () => {
      const result = transactionSchema.safeParse(validData({ description: "ab" }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("3 characters");
      }
    });

    it("passes with exactly 3 characters", () => {
      const result = transactionSchema.safeParse(validData({ description: "abc" }));
      expect(result.success).toBe(true);
    });

    it("fails when longer than 200 characters", () => {
      const result = transactionSchema.safeParse(validData({ description: "x".repeat(201) }));
      expect(result.success).toBe(false);
    });

    it("passes with exactly 200 characters", () => {
      const result = transactionSchema.safeParse(validData({ description: "x".repeat(200) }));
      expect(result.success).toBe(true);
    });
  });

  describe("amount_cents validation", () => {
    it("fails when negative", () => {
      const result = transactionSchema.safeParse(validData({ amount_cents: -100 }));
      expect(result.success).toBe(false);
    });

    it("fails when zero", () => {
      const result = transactionSchema.safeParse(validData({ amount_cents: 0 }));
      expect(result.success).toBe(false);
    });

    it("fails when not an integer", () => {
      const result = transactionSchema.safeParse(validData({ amount_cents: 100.5 }));
      expect(result.success).toBe(false);
    });

    it("fails when exceeds 999999999", () => {
      const result = transactionSchema.safeParse(validData({ amount_cents: 1000000000 }));
      expect(result.success).toBe(false);
    });

    it("passes at the maximum 999999999", () => {
      const result = transactionSchema.safeParse(validData({ amount_cents: 999999999 }));
      expect(result.success).toBe(true);
    });

    it("passes with 1 cent", () => {
      const result = transactionSchema.safeParse(validData({ amount_cents: 1 }));
      expect(result.success).toBe(true);
    });
  });

  describe("type enum", () => {
    it("accepts income", () => {
      const result = transactionSchema.safeParse(validData({ type: "income" }));
      expect(result.success).toBe(true);
    });

    it("accepts expense", () => {
      const result = transactionSchema.safeParse(validData({ type: "expense" }));
      expect(result.success).toBe(true);
    });

    it("rejects invalid type", () => {
      const result = transactionSchema.safeParse(validData({ type: "transfer" }));
      expect(result.success).toBe(false);
    });
  });

  describe("status enum", () => {
    it("accepts pending", () => {
      const result = transactionSchema.safeParse(validData({ status: "pending" }));
      expect(result.success).toBe(true);
    });

    it("accepts cleared", () => {
      const result = transactionSchema.safeParse(validData({ status: "cleared" }));
      expect(result.success).toBe(true);
    });

    it("rejects invalid status", () => {
      const result = transactionSchema.safeParse(validData({ status: "cancelled" }));
      expect(result.success).toBe(false);
    });
  });

  describe("visibility enum", () => {
    it("accepts household", () => {
      const result = transactionSchema.safeParse(validData({ visibility: "household" }));
      expect(result.success).toBe(true);
    });

    it("accepts personal", () => {
      const result = transactionSchema.safeParse(validData({ visibility: "personal" }));
      expect(result.success).toBe(true);
    });

    it("rejects invalid visibility", () => {
      const result = transactionSchema.safeParse(validData({ visibility: "public" }));
      expect(result.success).toBe(false);
    });
  });

  describe("notes validation", () => {
    it("accepts null notes", () => {
      const result = transactionSchema.safeParse(validData({ notes: null }));
      expect(result.success).toBe(true);
    });

    it("fails when notes exceed 500 characters", () => {
      const result = transactionSchema.safeParse(validData({ notes: "x".repeat(501) }));
      expect(result.success).toBe(false);
    });

    it("passes with exactly 500 characters", () => {
      const result = transactionSchema.safeParse(validData({ notes: "x".repeat(500) }));
      expect(result.success).toBe(true);
    });
  });

  describe("cross-field refinements", () => {
    it("fails when debt_id and transfer_group_id are both set", () => {
      const result = transactionSchema.safeParse(
        validData({
          debt_id: "debt-1",
          transfer_group_id: "transfer-1",
        })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Transfers cannot be linked to debts");
      }
    });

    it("fails when internal_debt_id and transfer_group_id are both set", () => {
      const result = transactionSchema.safeParse(
        validData({
          internal_debt_id: "int-debt-1",
          transfer_group_id: "transfer-1",
        })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Transfers cannot be linked to debts");
      }
    });

    it("fails when both debt_id and internal_debt_id are set", () => {
      const result = transactionSchema.safeParse(
        validData({
          debt_id: "debt-1",
          internal_debt_id: "int-debt-1",
        })
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message);
        expect(messages).toContain("Cannot link to both external and internal debt");
      }
    });

    it("passes with only debt_id set", () => {
      const result = transactionSchema.safeParse(validData({ debt_id: "debt-1" }));
      expect(result.success).toBe(true);
    });

    it("passes with only internal_debt_id set", () => {
      const result = transactionSchema.safeParse(validData({ internal_debt_id: "int-debt-1" }));
      expect(result.success).toBe(true);
    });
  });
});
