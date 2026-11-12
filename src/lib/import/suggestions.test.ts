import { describe, expect, it } from "vitest";
import { cents } from "@/test/cents";
import type { CategoryRow } from "@/lib/categories/projection";
import type { TransactionRow } from "@/lib/transactions/projection";
import type { DraftRow } from "./drafts";
import { historySuggester, learnedSuggester, type SuggestionContext } from "./suggestions";

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
    paidByUserId: null,
    statementText: null,
    pinned: false,
    ...overrides,
  };
}

const category = (id: string) => ({ id }) as CategoryRow;

const context = (
  transactions: TransactionRow[],
  usable = ["utilities", "groceries", "dining"]
): SuggestionContext => ({ transactions, categories: usable.map(category) });

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

const save = (
  description: string,
  categoryId: string | null,
  overrides: Partial<TransactionRow> = {}
) => transaction(description, categoryId, { statementText: "JOLLIBEE QC", ...overrides });

const learn = async (transactions: TransactionRow[], line = "JOLLIBEE QC 1234") =>
  learnedSuggester([draft("d1", line)], context(transactions));

describe("learnedSuggester", () => {
  it("learns a description and a category from two saves of the same Statement Text", async () => {
    const suggestions = await learn([save("Jollibee", "dining"), save("Jollibee", "dining")]);

    expect(suggestions).toEqual([
      { draftId: "d1", description: "Jollibee", categoryId: "dining", source: "learned" },
    ]);
  });

  it("matches only the exact Statement Text", async () => {
    const suggestions = await learn([
      save("Jollibee Makati", "dining", { statementText: "JOLLIBEE MAKATI" }),
      save("Jollibee Makati", "dining", { statementText: "JOLLIBEE MAKATI" }),
    ]);

    expect(suggestions).toEqual([]);
  });

  it("lets only the newest 5 saves, by date then recorded, vote", async () => {
    const suggestions = await learn([
      save("Old", "groceries", { date: "2026-01-01" }),
      save("Old", "groceries", { date: "2026-01-02" }),
      save("Old", "groceries", { date: "2026-01-03" }),
      save("New", "dining", { date: "2026-03-01" }),
      save("New", "dining", { date: "2026-03-01" }),
      save("New", "dining", { date: "2026-03-01" }),
      save("Old", "groceries", { date: "2026-03-01" }),
      save("Old", "groceries", { date: "2026-03-01" }),
    ]);

    expect(suggestions).toEqual([
      { draftId: "d1", description: "New", categoryId: "dining", source: "learned" },
    ]);
  });

  it("applies nothing on a tie or with a single plain save", async () => {
    expect(await learn([save("Jollibee", "dining")])).toEqual([]);
    expect(
      await learn([
        save("A", "dining"),
        save("A", "dining"),
        save("B", "groceries"),
        save("B", "groceries"),
      ])
    ).toEqual([]);
  });

  it("needs more than half the window's weight", async () => {
    const suggestions = await learn([
      save("A", "dining"),
      save("A", "dining"),
      save("B", "groceries"),
      save("C", "utilities"),
      save("D", "groceries"),
    ]);

    expect(suggestions).toEqual([]);
  });

  it("weighs a pinned save 3, so one pin teaches at once", async () => {
    const suggestions = await learn([
      save("Plain", "groceries"),
      save("Plain", "groceries"),
      save("Pinned", "dining", { pinned: true }),
    ]);

    expect(suggestions).toEqual([
      { draftId: "d1", description: "Pinned", categoryId: "dining", source: "learned" },
    ]);
  });

  it("counts only the newest pin as 3; older pins count 1", async () => {
    const suggestions = await learn([
      save("Old pin", "groceries", { pinned: true, date: "2026-01-01" }),
      save("Old pin", "groceries", { pinned: true, date: "2026-01-02" }),
      save("New pin", "dining", { pinned: true, date: "2026-02-01" }),
    ]);

    expect(suggestions).toEqual([
      { draftId: "d1", description: "New pin", categoryId: "dining", source: "learned" },
    ]);
  });

  it("lets four newer plain saves outvote a pin", async () => {
    const suggestions = await learn([
      save("Pinned", "dining", { pinned: true, date: "2026-01-01" }),
      ...[1, 2, 3, 4].map((day) => save("Plain", "groceries", { date: `2026-02-0${day}` })),
    ]);

    expect(suggestions).toEqual([
      { draftId: "d1", description: "Plain", categoryId: "groceries", source: "learned" },
    ]);
  });

  it("votes description and category separately", async () => {
    const suggestions = await learn([
      save("Jollibee", "dining"),
      save("Jollibee", "groceries"),
      save("Jollibee", "utilities"),
    ]);

    expect(suggestions).toEqual([{ draftId: "d1", description: "Jollibee", source: "learned" }]);
  });

  it("drops saves in a retired, unusable or no category before taking the category window", async () => {
    const suggestions = await learn([
      save("Jollibee", "dining", { date: "2026-01-01" }),
      save("Jollibee", "dining", { date: "2026-01-02" }),
      save("Jollibee", "retired", { date: "2026-02-01" }),
      save("Jollibee", "someone-elses", { date: "2026-02-02" }),
      save("Jollibee", null, { date: "2026-02-03" }),
      save("Jollibee", null, { date: "2026-02-04" }),
      save("Jollibee", null, { date: "2026-02-05" }),
    ]);

    expect(suggestions).toEqual([
      { draftId: "d1", description: "Jollibee", categoryId: "dining", source: "learned" },
    ]);
  });

  it("suggests nothing for a card payment", async () => {
    const suggestions = await learnedSuggester(
      [draft("d1", "PAYMENT RECEIVED", true)],
      context([
        save("Paid", "dining", { statementText: "PAYMENT RECEIVED" }),
        save("Paid", "dining", { statementText: "PAYMENT RECEIVED" }),
      ])
    );

    expect(suggestions).toEqual([]);
  });

  it("reads each save's current state: a removed save doesn't vote, an edited one votes its new values", async () => {
    const suggestions = await learn([
      save("Jollibee", "dining", { removed: true }),
      save("Jollibee", "dining", { removed: true }),
      save("Jollibee Edited", "groceries"),
      save("Jollibee Edited", "groceries"),
    ]);

    expect(suggestions).toEqual([
      { draftId: "d1", description: "Jollibee Edited", categoryId: "groceries", source: "learned" },
    ]);
  });

  it("learns nothing from transactions saved before Statement Text was recorded", async () => {
    const legacy = (description: string) => {
      const row: Partial<TransactionRow> = save(description, "dining");
      delete row.statementText;
      delete row.pinned;
      return row as TransactionRow;
    };

    expect(await learn([legacy("Jollibee"), legacy("Jollibee")])).toEqual([]);
  });

  it("gives the same suggestions for every order of the saves and with duplicates", async () => {
    const saves = [
      save("Pinned", "dining", { pinned: true, date: "2026-01-01" }),
      save("Plain", "groceries", { date: "2026-02-01" }),
      save("Plain", "groceries", { date: "2026-02-01" }),
      save("Pinned", "dining", { date: "2026-03-01" }),
    ];
    const expected = [
      { draftId: "d1", description: "Pinned", categoryId: "dining", source: "learned" },
    ];
    const permutations = (rows: TransactionRow[]): TransactionRow[][] =>
      rows.length <= 1
        ? [rows]
        : rows.flatMap((row, index) =>
            permutations(rows.filter((_, other) => other !== index)).map((rest) => [row, ...rest])
          );

    for (const order of permutations(saves)) {
      expect(await learn(order)).toEqual(expected);
      expect(await learn([...order, ...order.map((row) => ({ ...row }))])).toEqual(expected);
    }
  });
});
