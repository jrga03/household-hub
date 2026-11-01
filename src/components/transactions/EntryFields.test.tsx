import { describe, expect, it } from "vitest";
import { readEntryBasics } from "./EntryFields";

const entry = (amount: string) => {
  const formData = new FormData();
  formData.set("amount", amount);
  formData.set("date", "2026-11-01");
  return formData;
};

describe("readEntryBasics", () => {
  it("refuses typed text the amount field committed only a prefix of", () => {
    expect(readEntryBasics(entry("12abc")).fields.amount).toContain("Invalid amount");
  });

  it("reads a real amount", () => {
    expect(readEntryBasics(entry("₱1,000.50"))).toMatchObject({ amountCents: 100050, fields: {} });
  });
});
