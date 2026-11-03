import { describe, expect, it } from "vitest";
import { asCents, type Cents } from "@/lib/currency";
import { namedAmountsLargestFirst, namedAmounts } from "./envelopes";

describe("namedAmounts", () => {
  it("keeps same-name cards in one order whatever the input order", () => {
    const names = new Map([
      ["card-b", "Visa"],
      ["card-a", "Visa"],
    ]);
    const entries: [string, Cents][] = [
      ["card-b", asCents(100)],
      ["card-a", asCents(200)],
      ["card-c", asCents(300)],
      ["card-d", asCents(400)],
    ];

    for (const input of [entries, [...entries].reverse()]) {
      expect(namedAmounts(new Map(input), names).map((row) => row.id)).toEqual([
        "card-c",
        "card-d",
        "card-a",
        "card-b",
      ]);
    }
  });

  it("leaves out zero amounts", () => {
    const rows = namedAmounts(new Map([["card-a", asCents(0)]]), new Map());
    expect(rows).toEqual([]);
  });
});

describe("namedAmountsLargestFirst", () => {
  it("orders non-zero amounts largest first, negatives last, and names unknown IDs", () => {
    const amounts = new Map<string, Cents>([
      ["rent", asCents(-500)],
      ["food", asCents(2000)],
      ["gone", asCents(300)],
      ["fuel", asCents(0)],
    ]);
    const names = new Map([
      ["rent", "Rent"],
      ["food", "Food"],
    ]);

    expect(namedAmountsLargestFirst(amounts, names, "A category")).toEqual([
      { id: "food", cents: 2000, name: "Food" },
      { id: "gone", cents: 300, name: "A category" },
      { id: "rent", cents: -500, name: "Rent" },
    ]);
  });
});
