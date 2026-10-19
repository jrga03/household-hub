import { describe, expect, it } from "vitest";
import { byName } from "./sort";

describe("byName", () => {
  it("sorts by name, then by id so equal names keep one order on every device", () => {
    const rows = [
      { id: "b", name: "Food" },
      { id: "c", name: "Bills" },
      { id: "a", name: "Food" },
    ];

    expect(rows.sort(byName).map((row) => row.id)).toEqual(["c", "a", "b"]);
  });
});
