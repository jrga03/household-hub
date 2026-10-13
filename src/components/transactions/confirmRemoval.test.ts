import { describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import { removalQuestion } from "./confirmRemoval";

describe("removalQuestion", () => {
  it("names the record and its amount", () => {
    expect(removalQuestion("Lunch", parsePHP("250"))).toBe("Remove “Lunch” ₱250.00?");
  });

  it("names an old record without a description by its amount alone", () => {
    expect(removalQuestion("", parsePHP("250"))).toBe("Remove ₱250.00?");
  });
});
