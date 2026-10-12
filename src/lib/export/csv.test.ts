import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins plain values with commas and rows with CRLF", () => {
    expect(
      toCsv([
        ["Date", "Amount"],
        ["2026-10-12", "1500.50"],
      ])
    ).toBe("Date,Amount\r\n2026-10-12,1500.50\r\n");
  });

  it("quotes values holding a comma, quote or line break", () => {
    expect(toCsv([["Rice, 5kg", 'The "good" one', "line one\nline two"]])).toBe(
      '"Rice, 5kg","The ""good"" one","line one\nline two"\r\n'
    );
  });

  it("keeps a value that looks like a formula from running as one", () => {
    expect(toCsv([["=SUM(A1)", "+1", "-1", "@cmd", "\tx"]])).toBe(
      "'=SUM(A1),'+1,'-1,'@cmd,'\tx\r\n"
    );
  });
});
