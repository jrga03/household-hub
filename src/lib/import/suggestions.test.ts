import { describe, expect, it } from "vitest";
import { cents } from "@/test/cents";
import type { CategoryRow } from "@/lib/categories/projection";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { DraftRow } from "./drafts";
import { historySuggester, normalizeDescription, type SuggestionContext } from "./suggestions";

function draft(id: string, description: string, isCardPayment = false): DraftRow {
  return {
    id,
    importId: "i1",
    position: 0,
    line: {
      purchaseDate: "2026-09-10",
      postingDate: "2026-09-11",
      description,
      amount: cents(15000),
      type: "expense",
      isCardPayment,
    },
    importKey: `key-${id}`,
    description,
    descriptionSource: "statement",
    categoryId: null,
    categorySource: null,
    type: "expense",
  };
}

let nextId = 0;
function transaction(
  description: string,
  categoryId: string | null,
  overrides: Partial<TransactionRow> = {}
): TransactionRow {
  nextId += 1;
  return {
    id: `t${nextId}`,
    householdId: "h",
    visibility: "household",
    ownerUserId: null,
    date: "2026-08-10",
    type: "expense",
    amountCents: cents(15000),
    accountId: "card",
    categoryId,
    payingAccountId: null,
    description,
    notes: "",
    status: "cleared",
    removed: false,
    recordedHlc: `hlc-${String(nextId).padStart(4, "0")}`,
    importKey: null,
    ...overrides,
  };
}

const category = (id: string) => ({ id }) as CategoryRow;

const context = (
  transactions: TransactionRow[],
  usable = ["utilities", "groceries", "dining"]
): SuggestionContext => ({ transactions, categories: usable.map(category) });

describe("normalizeDescription", () => {
  it("uppercases, strips digits and squeezes spaces", () => {
    expect(normalizeDescription("  Meralco  0123456 manila ")).toBe("MERALCO MANILA");
  });
});

describe("historySuggester", () => {
  it("suggests the category of the most recent transaction with the same normalized description", async () => {
    const suggestions = await historySuggester(
      [draft("d1", "MERALCO 0987 MANILA")],
      context([
        transaction("meralco 0123 manila", "groceries", { date: "2026-07-10" }),
        transaction("Meralco  Manila", "utilities", { date: "2026-08-10" }),
      ])
    );

    expect(suggestions).toEqual([{ draftId: "d1", categoryId: "utilities", source: "history" }]);
  });

  it("breaks a same-day tie by the later recorded", async () => {
    const suggestions = await historySuggester(
      [draft("d1", "GRAB")],
      context([transaction("GRAB", "dining"), transaction("GRAB", "groceries")])
    );

    expect(suggestions).toMatchObject([{ categoryId: "groceries" }]);
  });

  it.each([
    ["removed", { removed: true }],
    ["Unassigned", { categoryId: null }],
    ["in a category the account can't use", { categoryId: "someone-elses" }],
  ])("passes over a newer transaction that's %s", async (_name, overrides) => {
    const suggestions = await historySuggester(
      [draft("d1", "GRAB")],
      context([
        transaction("GRAB", "dining", { date: "2026-07-01" }),
        transaction("GRAB", "groceries", { date: "2026-08-01", ...overrides }),
      ])
    );

    expect(suggestions).toMatchObject([{ categoryId: "dining" }]);
  });

  it("suggests nothing for a new merchant, a card payment, or a line of only digits", async () => {
    const suggestions = await historySuggester(
      [draft("d1", "NEW SHOP"), draft("d2", "PAYMENT RECEIVED", true), draft("d3", "123 456")],
      context([
        transaction("OLD SHOP", "dining"),
        transaction("PAYMENT RECEIVED", "dining"),
        transaction("789", "dining"),
      ])
    );

    expect(suggestions).toEqual([]);
  });
});
