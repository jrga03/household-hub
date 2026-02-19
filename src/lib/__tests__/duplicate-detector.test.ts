import { describe, it, expect } from "vitest";
import { generateFingerprint, detectDuplicates } from "../duplicate-detector";
import type { Transaction } from "@/types/transactions";

function makeTxn(overrides: Partial<Transaction> = {}): Partial<Transaction> {
  return {
    description: "Grocery Shopping",
    amount_cents: 150050,
    date: "2025-01-15",
    account_id: "acc-cash",
    ...overrides,
  };
}

describe("generateFingerprint", () => {
  it("produces consistent hash for same input", () => {
    const txn = makeTxn();
    const fp1 = generateFingerprint(txn);
    const fp2 = generateFingerprint(txn);
    expect(fp1).toBe(fp2);
  });

  it("includes account_id in fingerprint (Decision #81)", () => {
    const txnCash = makeTxn({ account_id: "acc-cash" });
    const txnCredit = makeTxn({ account_id: "acc-credit" });
    // Same description, amount, date but different accounts → different fingerprint
    expect(generateFingerprint(txnCash)).not.toBe(generateFingerprint(txnCredit));
  });

  it("is case-insensitive for description", () => {
    const upper = makeTxn({ description: "GROCERY SHOPPING" });
    const lower = makeTxn({ description: "grocery shopping" });
    const mixed = makeTxn({ description: "Grocery Shopping" });
    const fp1 = generateFingerprint(upper);
    const fp2 = generateFingerprint(lower);
    const fp3 = generateFingerprint(mixed);
    expect(fp1).toBe(fp2);
    expect(fp2).toBe(fp3);
  });

  it("trims whitespace from description", () => {
    const padded = makeTxn({ description: "  Grocery Shopping  " });
    const clean = makeTxn({ description: "Grocery Shopping" });
    expect(generateFingerprint(padded)).toBe(generateFingerprint(clean));
  });

  it("handles missing description", () => {
    const txn = makeTxn({ description: undefined });
    // Should not throw
    const fp = generateFingerprint(txn);
    expect(fp).toBeDefined();
    expect(typeof fp).toBe("string");
  });

  it("handles missing amount_cents", () => {
    const txn = makeTxn({ amount_cents: undefined });
    const fp = generateFingerprint(txn);
    expect(fp).toBeDefined();
  });

  it("handles missing date", () => {
    const txn = makeTxn({ date: undefined });
    const fp = generateFingerprint(txn);
    expect(fp).toBeDefined();
  });

  it("handles missing account_id", () => {
    const txn = makeTxn({ account_id: undefined });
    const fp = generateFingerprint(txn);
    expect(fp).toBeDefined();
  });

  it("handles completely empty transaction", () => {
    const fp = generateFingerprint({});
    expect(fp).toBeDefined();
    expect(typeof fp).toBe("string");
  });

  it("produces different fingerprints for different amounts", () => {
    const a = makeTxn({ amount_cents: 100 });
    const b = makeTxn({ amount_cents: 200 });
    expect(generateFingerprint(a)).not.toBe(generateFingerprint(b));
  });

  it("produces different fingerprints for different dates", () => {
    const a = makeTxn({ date: "2025-01-15" });
    const b = makeTxn({ date: "2025-01-16" });
    expect(generateFingerprint(a)).not.toBe(generateFingerprint(b));
  });
});

describe("detectDuplicates", () => {
  it("finds exact matches (confidence=1.0)", async () => {
    const existing = [makeTxn()];
    const importData = [makeTxn()];

    const dupes = await detectDuplicates(importData, existing);

    expect(dupes).toHaveLength(1);
    expect(dupes[0].confidence).toBe(1.0);
    expect(dupes[0].importIndex).toBe(0);
    expect(dupes[0].importRow).toBe(importData[0]);
    expect(dupes[0].existingTransaction).toBe(existing[0]);
  });

  it("returns empty for no matches", async () => {
    const existing = [makeTxn({ description: "Electricity Bill" })];
    const importData = [makeTxn({ description: "Grocery Shopping" })];

    const dupes = await detectDuplicates(importData, existing);
    expect(dupes).toHaveLength(0);
  });

  it("returns empty when existing is empty", async () => {
    const importData = [makeTxn()];
    const dupes = await detectDuplicates(importData, []);
    expect(dupes).toHaveLength(0);
  });

  it("returns empty when import data is empty", async () => {
    const existing = [makeTxn()];
    const dupes = await detectDuplicates([], existing);
    expect(dupes).toHaveLength(0);
  });

  it("handles multiple duplicates with correct importIndex", async () => {
    const existing = [
      makeTxn({ description: "Groceries", amount_cents: 100 }),
      makeTxn({ description: "Salary", amount_cents: 5000000 }),
    ];
    const importData = [
      makeTxn({ description: "Unrelated", amount_cents: 999 }),
      makeTxn({ description: "Groceries", amount_cents: 100 }),
      makeTxn({ description: "Salary", amount_cents: 5000000 }),
    ];

    const dupes = await detectDuplicates(importData, existing);

    expect(dupes).toHaveLength(2);
    expect(dupes[0].importIndex).toBe(1); // "Groceries" is at index 1
    expect(dupes[1].importIndex).toBe(2); // "Salary" is at index 2
  });

  it("does not match when account differs (Decision #81)", async () => {
    const existing = [makeTxn({ account_id: "acc-cash" })];
    const importData = [makeTxn({ account_id: "acc-credit" })];

    const dupes = await detectDuplicates(importData, existing);
    expect(dupes).toHaveLength(0);
  });

  it("matches case-insensitively", async () => {
    const existing = [makeTxn({ description: "GROCERY SHOPPING" })];
    const importData = [makeTxn({ description: "grocery shopping" })];

    const dupes = await detectDuplicates(importData, existing);
    expect(dupes).toHaveLength(1);
  });
});
