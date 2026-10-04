import { describe, it, expect } from "vitest";
import { isTransactionType, isTransactionStatus, isTransactionVisibility } from "../transactions";

describe("transaction type guards", () => {
  describe("isTransactionType", () => {
    it("accepts valid transaction types", () => {
      expect(isTransactionType("income")).toBe(true);
      expect(isTransactionType("expense")).toBe(true);
    });

    it("rejects invalid transaction types", () => {
      expect(isTransactionType("unknown")).toBe(false);
      expect(isTransactionType("transfer")).toBe(false);
      expect(isTransactionType("")).toBe(false);
      expect(isTransactionType("Income")).toBe(false); // Case sensitive
    });
  });

  describe("isTransactionStatus", () => {
    it("accepts valid transaction statuses", () => {
      expect(isTransactionStatus("pending")).toBe(true);
      expect(isTransactionStatus("cleared")).toBe(true);
    });

    it("rejects invalid transaction statuses", () => {
      expect(isTransactionStatus("unknown")).toBe(false);
      expect(isTransactionStatus("reconciled")).toBe(false);
      expect(isTransactionStatus("")).toBe(false);
      expect(isTransactionStatus("Pending")).toBe(false); // Case sensitive
    });
  });

  describe("isTransactionVisibility", () => {
    it("accepts valid visibility values", () => {
      expect(isTransactionVisibility("household")).toBe(true);
      expect(isTransactionVisibility("personal")).toBe(true);
    });

    it("rejects invalid visibility values", () => {
      expect(isTransactionVisibility("unknown")).toBe(false);
      expect(isTransactionVisibility("public")).toBe(false);
      expect(isTransactionVisibility("private")).toBe(false);
      expect(isTransactionVisibility("")).toBe(false);
      expect(isTransactionVisibility("Household")).toBe(false); // Case sensitive
    });
  });
});
