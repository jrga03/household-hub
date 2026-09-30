import { describe, expect, it } from "vitest";
import { parseAmountInput } from "./validation";

describe("parseAmountInput", () => {
  it("parses formatted peso input to cents", () => {
    expect(parseAmountInput("₱1,500.50")).toBe(150050);
    expect(parseAmountInput("1")).toBe(100);
  });

  it("rejects amounts below the ₱1.00 debt minimum", () => {
    expect(parseAmountInput("0.99")).toBeNull();
    expect(parseAmountInput("0")).toBeNull();
    expect(parseAmountInput("")).toBeNull();
  });

  it("rejects negative, non-numeric, and over-max input", () => {
    expect(parseAmountInput("-5")).toBeNull();
    expect(parseAmountInput("abc")).toBeNull();
    expect(parseAmountInput("10000000")).toBeNull();
  });
});
