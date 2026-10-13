import { describe, expect, it } from "vitest";
import { transferName } from "./transferName";

const names = new Map([
  ["bdo", "BDO"],
  ["bpi", "BPI"],
]);
const nameOf = (id: string) => names.get(id) ?? "?";
const transfer = { description: "", fromAccountId: "bdo", toAccountId: "bpi" };

describe("transferName", () => {
  it("keeps the member's description", () => {
    expect(transferName({ ...transfer, description: "Rent fund" }, nameOf, null)).toBe("Rent fund");
  });

  it("names the destination when there is none", () => {
    expect(transferName(transfer, nameOf, null)).toBe("Transfer to BPI");
    expect(transferName(transfer, nameOf, "out")).toBe("Transfer to BPI");
  });

  it("names the source when the list is filtered to the destination", () => {
    expect(transferName(transfer, nameOf, "in")).toBe("Transfer from BDO");
  });
});
