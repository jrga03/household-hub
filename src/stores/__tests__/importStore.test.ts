import { describe, it, expect, beforeEach } from "vitest";
import { useImportStore } from "../importStore";
import type { Transaction } from "@/types/transactions";

describe("importStore", () => {
  beforeEach(() => {
    useImportStore.getState().reset();
  });

  describe("initial state", () => {
    it("has correct defaults", () => {
      const state = useImportStore.getState();
      expect(state.step).toBe("upload");
      expect(state.file).toBeNull();
      expect(state.headers).toEqual([]);
      expect(state.rows).toEqual([]);
      expect(state.mapping).toBeNull();
      expect(state.duplicates).toEqual([]);
      expect(state.resolutions).toEqual([]);
      expect(state.validTransactions).toEqual([]);
      expect(state.validationErrors).toEqual([]);
      expect(state.progress).toBe(0);
      expect(state.currentRow).toBe(0);
      expect(state.transactionsToImport).toEqual([]);
      expect(state.transactionsToReplace).toEqual([]);
      expect(state.imported).toBe(0);
      expect(state.skipped).toBe(0);
      expect(state.failed).toBe(0);
    });
  });

  describe("step progression", () => {
    it("progresses through all import steps", () => {
      const steps = [
        "upload",
        "mapping",
        "duplicates",
        "validation",
        "importing",
        "complete",
      ] as const;

      for (const step of steps) {
        useImportStore.getState().setStep(step);
        expect(useImportStore.getState().step).toBe(step);
      }
    });
  });

  describe("file handling", () => {
    it("stores a File object", () => {
      const file = new File(["test"], "test.csv", { type: "text/csv" });
      useImportStore.getState().setFile(file);
      expect(useImportStore.getState().file).toBe(file);
    });

    it("clears file with null", () => {
      const file = new File(["test"], "test.csv", { type: "text/csv" });
      useImportStore.getState().setFile(file);
      useImportStore.getState().setFile(null);
      expect(useImportStore.getState().file).toBeNull();
    });
  });

  describe("setParsedData", () => {
    it("stores headers and rows", () => {
      const headers = ["Date", "Description", "Amount"];
      const rows = [
        ["2025-01-15", "Groceries", "1500"],
        ["2025-01-16", "Salary", "50000"],
      ];
      useImportStore.getState().setParsedData(headers, rows);
      expect(useImportStore.getState().headers).toEqual(headers);
      expect(useImportStore.getState().rows).toEqual(rows);
    });
  });

  describe("setMapping", () => {
    it("stores column mapping configuration", () => {
      const mapping = {
        date: 0,
        description: 1,
        amount: 2,
      };
      useImportStore.getState().setMapping(mapping as never);
      expect(useImportStore.getState().mapping).toEqual(mapping);
    });
  });

  describe("duplicates and resolutions", () => {
    it("stores duplicate matches", () => {
      const dupes = [
        {
          importIndex: 0,
          importRow: { description: "Groceries" },
          existingTransaction: { description: "Groceries" },
          fingerprint: "abc123",
          confidence: 1.0,
        },
      ];
      useImportStore.getState().setDuplicates(dupes as never);
      expect(useImportStore.getState().duplicates).toEqual(dupes);
    });

    it("stores duplicate resolutions", () => {
      const resolutions = [
        {
          match: {
            importIndex: 0,
            importRow: {},
            existingTransaction: {},
            fingerprint: "abc",
            confidence: 1.0,
          },
          action: "skip" as const,
        },
      ];
      useImportStore.getState().setResolutions(resolutions as never);
      expect(useImportStore.getState().resolutions).toEqual(resolutions);
    });
  });

  describe("setValidationResults", () => {
    it("stores valid transactions and errors", () => {
      const valid = [{ description: "Groceries", amount_cents: 150050 }];
      const errors = [{ row: 2, message: "Invalid amount" }];
      useImportStore.getState().setValidationResults(valid, errors);
      expect(useImportStore.getState().validTransactions).toEqual(valid);
      expect(useImportStore.getState().validationErrors).toEqual(errors);
    });
  });

  describe("progress tracking", () => {
    it("updates progress percentage", () => {
      useImportStore.getState().setProgress(50);
      expect(useImportStore.getState().progress).toBe(50);
    });

    it("updates current row counter", () => {
      useImportStore.getState().setCurrentRow(42);
      expect(useImportStore.getState().currentRow).toBe(42);
    });
  });

  describe("transactions to process", () => {
    it("stores transactions to import", () => {
      const txns = [{ description: "Groceries", amount_cents: 150050 }] as Partial<Transaction>[];
      useImportStore.getState().setTransactionsToImport(txns);
      expect(useImportStore.getState().transactionsToImport).toEqual(txns);
    });

    it("stores transactions to replace", () => {
      const replacements = [
        {
          existing: { id: "tx-1", description: "Old" } as Transaction,
          update: { description: "New" } as Partial<Transaction>,
        },
      ];
      useImportStore.getState().setTransactionsToReplace(replacements);
      expect(useImportStore.getState().transactionsToReplace).toEqual(replacements);
    });
  });

  describe("setResults", () => {
    it("stores final import result counts", () => {
      useImportStore.getState().setResults(10, 3, 1);
      const state = useImportStore.getState();
      expect(state.imported).toBe(10);
      expect(state.skipped).toBe(3);
      expect(state.failed).toBe(1);
    });
  });

  describe("reset", () => {
    it("returns everything to initial state", () => {
      // Modify everything first
      useImportStore.getState().setStep("complete");
      useImportStore.getState().setFile(new File(["test"], "test.csv"));
      useImportStore.getState().setParsedData(["H1"], [["R1"]]);
      useImportStore.getState().setProgress(100);
      useImportStore.getState().setCurrentRow(50);
      useImportStore.getState().setResults(10, 3, 1);

      // Reset
      useImportStore.getState().reset();

      // Verify everything is back to initial
      const state = useImportStore.getState();
      expect(state.step).toBe("upload");
      expect(state.file).toBeNull();
      expect(state.headers).toEqual([]);
      expect(state.rows).toEqual([]);
      expect(state.mapping).toBeNull();
      expect(state.duplicates).toEqual([]);
      expect(state.resolutions).toEqual([]);
      expect(state.validTransactions).toEqual([]);
      expect(state.validationErrors).toEqual([]);
      expect(state.progress).toBe(0);
      expect(state.currentRow).toBe(0);
      expect(state.transactionsToImport).toEqual([]);
      expect(state.transactionsToReplace).toEqual([]);
      expect(state.imported).toBe(0);
      expect(state.skipped).toBe(0);
      expect(state.failed).toBe(0);
    });
  });
});
