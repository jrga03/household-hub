/**
 * Tests for PreviewStep (mobile UX review R24):
 * the step renders the same parsed rows in one of two presentations — a table
 * (sm+) or a card-stacked label+input list (below sm) — chosen via
 * useMediaQuery so only ONE is mounted at a time (hundreds of parsed rows,
 * no virtualizer). Both presentations must share the row editing logic
 * (store-backed userEdits), so an edit made in either presentation survives
 * a presentation switch, not forked.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreviewStep } from "./PreviewStep";
import { usePDFImportStore } from "@/stores/pdfImportStore";
import type { ParsedTransactionRow } from "@/types/pdf-import";

const ROWS: ParsedTransactionRow[] = [
  {
    date: "2026-07-01",
    description: "Grocery run",
    amount: "1,500.50",
    type: "expense",
    confidence: 0.95,
    rawText: "07/01 GROCERY RUN 1,500.50",
  },
  {
    date: "2026-07-02",
    description: "Salary",
    amount: "50,000.00",
    type: "income",
    confidence: 0.6,
    rawText: "07/02 SALARY 50,000.00",
  },
];

/**
 * PreviewStep picks its presentation with useMediaQuery("(min-width: 640px)").
 * The global setup mock (src/test/setup.ts) always returns matches: false, so
 * the default is the card presentation; call mockViewport(true) BEFORE render
 * to get the table. jsdom isolates per test file, so overriding
 * window.matchMedia here cannot leak into other suites.
 */
function mockViewport(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: wide,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/** Card inputs are labeled via <Label htmlFor> with the bare field name. */
const cardInputs = (label: "Date" | "Description" | "Amount") => screen.getAllByLabelText(label);

/** Table inputs carry aria-labels of the form "Date for row 1". */
const tableInput = (label: string) => screen.getByLabelText(label);

beforeEach(() => {
  mockViewport(false);
  usePDFImportStore.getState().reset();
  usePDFImportStore.setState({ step: "preview", parsedRows: ROWS });
});

describe("PreviewStep", () => {
  it("renders only the card presentation below the sm breakpoint", () => {
    render(<PreviewStep />);

    // Card presentation: label+input pairs per row
    expect(cardInputs("Date")).toHaveLength(2);
    expect(cardInputs("Description")).toHaveLength(2);
    expect(cardInputs("Amount")).toHaveLength(2);
    expect(cardInputs("Description")[0]).toHaveValue("Grocery run");

    // The table is NOT mounted alongside it (double DOM for large imports)
    expect(document.querySelector("table")).toBeNull();
    expect(screen.queryByLabelText("Date for row 1")).not.toBeInTheDocument();
  });

  it("renders only the table presentation at sm and up", () => {
    mockViewport(true);
    render(<PreviewStep />);

    // Table presentation: one aria-labeled input per editable cell
    for (const row of [1, 2]) {
      expect(tableInput(`Date for row ${row}`)).toBeInTheDocument();
      expect(tableInput(`Description for row ${row}`)).toBeInTheDocument();
      expect(tableInput(`Amount for row ${row}`)).toBeInTheDocument();
    }
    expect(tableInput("Description for row 1")).toHaveValue("Grocery run");

    // The card list is NOT mounted alongside it (bare-label inputs absent)
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
  });

  it("propagates a card edit to the store", () => {
    render(<PreviewStep />);

    fireEvent.change(cardInputs("Date")[0], { target: { value: "2026-07-15" } });

    expect(usePDFImportStore.getState().userEdits.get(0)).toEqual({ date: "2026-07-15" });
    expect(cardInputs("Date")[0]).toHaveValue("2026-07-15");
    // Other rows untouched
    expect(cardInputs("Date")[1]).toHaveValue("2026-07-02");
  });

  it("propagates a table edit to the store", () => {
    mockViewport(true);
    render(<PreviewStep />);

    fireEvent.change(tableInput("Amount for row 2"), { target: { value: "49,000.00" } });

    expect(usePDFImportStore.getState().userEdits.get(1)).toEqual({ amount: "49,000.00" });
    expect(tableInput("Amount for row 2")).toHaveValue("49,000.00");
    expect(tableInput("Amount for row 1")).toHaveValue("1,500.50");
  });

  it("shares edits across presentations through the store", () => {
    // Edit in the card presentation…
    const { unmount } = render(<PreviewStep />);
    fireEvent.change(cardInputs("Description")[0], { target: { value: "Grocery (edited)" } });
    unmount();

    // …then remount as the table (viewport crossed the breakpoint)
    mockViewport(true);
    render(<PreviewStep />);
    expect(tableInput("Description for row 1")).toHaveValue("Grocery (edited)");
  });

  it("accumulates edits across fields of the same row", () => {
    render(<PreviewStep />);

    fireEvent.change(cardInputs("Description")[0], { target: { value: "Grocery (edited)" } });
    fireEvent.change(cardInputs("Amount")[0], { target: { value: "1,600.00" } });

    expect(usePDFImportStore.getState().userEdits.get(0)).toEqual({
      description: "Grocery (edited)",
      amount: "1,600.00",
    });
  });
});
