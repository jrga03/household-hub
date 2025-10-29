/**
 * Unit Tests for CSV Importer
 *
 * Tests column detection, fingerprinting, and validation logic.
 *
 * @module csv-importer.test
 */

import { describe, it, expect } from "vitest";
import { detectColumnMappings, validateTransaction } from "./csv-importer";
import { generateFingerprint } from "./duplicate-detector";

describe("detectColumnMappings", () => {
  it("should detect standard column names", () => {
    const headers = ["Description", "Amount", "Date", "Account"];
    const mapping = detectColumnMappings(headers);

    expect(mapping.description).toBe(0);
    expect(mapping.amount).toBe(1);
    expect(mapping.date).toBe(2);
    expect(mapping.account).toBe(3);
  });

  it("should handle case-insensitive matching", () => {
    const headers = ["DESCRIPTION", "amount", "DaTe"];
    const mapping = detectColumnMappings(headers);

    expect(mapping.description).toBe(0);
    expect(mapping.amount).toBe(1);
    expect(mapping.date).toBe(2);
  });

  it("should handle alternative column names", () => {
    const headers = ["Name", "Value", "When", "Bank"];
    const mapping = detectColumnMappings(headers);

    expect(mapping.description).toBe(0);
    expect(mapping.amount).toBe(1);
    expect(mapping.date).toBe(2);
    expect(mapping.account).toBe(3);
  });

  it("should detect created_at and created_by for round-trip guarantee", () => {
    const headers = ["Description", "Amount", "Date", "created_at", "created_by"];
    const mapping = detectColumnMappings(headers);

    expect(mapping.description).toBe(0);
    expect(mapping.amount).toBe(1);
    expect(mapping.date).toBe(2);
    expect(mapping.created_at).toBe(3);
    expect(mapping.created_by).toBe(4);
  });
});

describe("generateFingerprint", () => {
  it("should generate consistent fingerprints", () => {
    const txn = {
      description: "Groceries",
      amount_cents: 150050,
      date: "2025-01-15",
      account_id: "acc_123",
    };

    const fp1 = generateFingerprint(txn);
    const fp2 = generateFingerprint(txn);

    expect(fp1).toBe(fp2);
  });

  it("should generate different fingerprints for different data", () => {
    const txn1 = {
      description: "Groceries",
      amount_cents: 150050,
      date: "2025-01-15",
      account_id: "acc_123",
    };

    const txn2 = {
      description: "Restaurant",
      amount_cents: 150050,
      date: "2025-01-15",
      account_id: "acc_123",
    };

    expect(generateFingerprint(txn1)).not.toBe(generateFingerprint(txn2));
  });

  it("should be case-insensitive for descriptions", () => {
    const txn1 = {
      description: "Groceries",
      amount_cents: 150050,
      date: "2025-01-15",
      account_id: "acc_123",
    };

    const txn2 = {
      description: "GROCERIES",
      amount_cents: 150050,
      date: "2025-01-15",
      account_id: "acc_123",
    };

    expect(generateFingerprint(txn1)).toBe(generateFingerprint(txn2));
  });

  it("should include account_id in fingerprint per Decision #81", () => {
    const txn1 = {
      description: "Groceries",
      amount_cents: 50000,
      date: "2025-01-15",
      account_id: "cash",
    };

    const txn2 = {
      description: "Groceries",
      amount_cents: 50000,
      date: "2025-01-15",
      account_id: "credit_card",
    };

    // Same transaction in different accounts should have different fingerprints
    expect(generateFingerprint(txn1)).not.toBe(generateFingerprint(txn2));
  });
});

describe("validateTransaction", () => {
  const accounts = [
    { id: "acc1", name: "Checking" },
    { id: "acc2", name: "Savings" },
  ];

  const categories = [
    { id: "cat1", name: "Groceries" },
    { id: "cat2", name: "Transport" },
  ];

  it("should pass validation for valid transaction", () => {
    const txn = {
      description: "Test",
      amount_cents: 10000,
      date: "2025-01-15",
      account_id: "acc1",
      category_id: "cat1",
      type: "expense" as const,
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors).toHaveLength(0);
  });

  it("should fail for missing description", () => {
    const txn = {
      description: "",
      amount_cents: 10000,
      date: "2025-01-15",
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "description")).toBe(true);
  });

  it("should fail for invalid amount", () => {
    const txn = {
      description: "Test",
      amount_cents: -100,
      date: "2025-01-15",
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "amount")).toBe(true);
  });

  it("should fail for invalid date", () => {
    const txn = {
      description: "Test",
      amount_cents: 10000,
      date: "invalid-date",
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "date")).toBe(true);
  });

  it("should match accounts by ID", () => {
    const txn = {
      description: "Test",
      amount_cents: 10000,
      date: "2025-01-15",
      account_id: "acc1",
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "account")).toBe(false);
  });

  it("should match accounts by name", () => {
    const txn = {
      description: "Test",
      amount_cents: 10000,
      date: "2025-01-15",
      account_id: "Checking", // Name instead of ID
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "account")).toBe(false);
  });

  it("should match categories by name", () => {
    const txn = {
      description: "Test",
      amount_cents: 10000,
      date: "2025-01-15",
      category_id: "Groceries", // Name instead of ID
    };

    const errors = validateTransaction(txn, 0, accounts, categories);
    expect(errors.some((e) => e.field === "category")).toBe(false);
  });
});
