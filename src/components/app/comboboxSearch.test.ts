import { describe, expect, it } from "vitest";
import type { ComboboxGroup } from "./Combobox";
import { searchOptions } from "./comboboxSearch";

const flat = (...labels: string[]): ComboboxGroup[] => [
  { options: labels.map((label) => ({ value: label, label })) },
];
const found = (groups: ComboboxGroup[], query: string) =>
  searchOptions(groups, query).map((result) => result.option.label);

describe("searchOptions", () => {
  it("finds a prefix and bolds its letters", () => {
    expect(searchOptions(flat("Groceries", "Electricity"), "groc")).toMatchObject([
      { option: { label: "Groceries" }, labelBold: [0, 1, 2, 3] },
    ]);
  });

  it("finds a substring", () => {
    expect(searchOptions(flat("Groceries"), "ceri")).toMatchObject([{ labelBold: [3, 4, 5, 6] }]);
  });

  it("finds letters in order with gaps and bolds each one", () => {
    expect(searchOptions(flat("Grocery", "Rent"), "grcy")).toMatchObject([
      { option: { label: "Grocery" }, labelBold: [0, 1, 3, 6] },
    ]);
  });

  // A missing letter ("groceris") is already letters in order.
  it("finds one typo: a wrong or extra letter, or a swap, without bold", () => {
    for (const query of ["grocerias", "grocceries", "gorceries", "gorc"]) {
      expect(searchOptions(flat("Groceries"), query)).toMatchObject([{ labelBold: [] }]);
    }
  });

  it("stops at one typo, and needs three letters for one", () => {
    expect(found(flat("Groceries"), "grxxeries")).toEqual([]);
    expect(found(flat("Gas"), "gx")).toEqual([]);
  });

  it("ranks prefix, then substring, then in order, then typo", () => {
    expect(found(flat("Rack", "Rustic", "Price", "Rice"), "ric")).toEqual([
      "Rice",
      "Price",
      "Rustic",
      "Rack",
    ]);
  });

  it("ranks a shorter label first inside a tier, then keeps the original order", () => {
    expect(found(flat("Groceries extra", "Groceries", "Grocer B", "Grocer A"), "groc")).toEqual([
      "Grocer B",
      "Grocer A",
      "Groceries",
      "Groceries extra",
    ]);
  });

  it("lists a whole group its label matches, bolding the group label", () => {
    const groups: ComboboxGroup[] = [
      {
        label: "Food",
        options: [
          { value: "groceries", label: "Groceries" },
          { value: "dining", label: "Dining out" },
        ],
      },
      { label: "Bills", options: [{ value: "power", label: "Electricity" }] },
    ];
    expect(searchOptions(groups, "food")).toMatchObject([
      { option: { label: "Groceries" }, group: "Food", labelBold: [], groupBold: [0, 1, 2, 3] },
      { option: { label: "Dining out" }, group: "Food", labelBold: [], groupBold: [0, 1, 2, 3] },
    ]);
  });

  it("matches a group label by prefix or substring only", () => {
    const groups: ComboboxGroup[] = [
      { label: "Food", options: [{ value: "dining", label: "Dining out" }] },
    ];
    expect(searchOptions(groups, "oo")).toHaveLength(1);
    expect(searchOptions(groups, "fd")).toEqual([]);
    expect(searchOptions(groups, "fod")).toEqual([]);
  });

  it("ignores case and accents", () => {
    expect(found(flat("Niño fund"), "  NINO ")).toEqual(["Niño fund"]);
  });
});
