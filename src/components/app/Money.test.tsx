import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { asCents } from "@/lib/currency";
import { Money, type MoneyProps } from "./Money";

const COLORS = ["text-income", "text-shortfall", "text-muted-foreground"];

function rendered(props: MoneyProps) {
  const { container } = render(<Money {...props} />);
  const root = container.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error("Money rendered nothing");
  return {
    shown: root.querySelector("[aria-hidden=true]")?.textContent,
    spoken: root.querySelector(".sr-only")?.textContent,
    color: COLORS.find((color) => root.classList.contains(color)) ?? null,
  };
}

describe("Money", () => {
  it.each<[string, MoneyProps, string, string, string | null]>([
    [
      "income",
      { kind: "income", cents: asCents(100000) },
      "+₱1,000.00",
      "plus ₱1,000.00",
      "text-income",
    ],
    ["expense", { kind: "expense", cents: asCents(25000) }, "−₱250.00", "minus ₱250.00", null],
    [
      "transfer",
      { kind: "transfer", cents: asCents(50000) },
      "₱500.00",
      "₱500.00",
      "text-muted-foreground",
    ],
    [
      "transfer out leg",
      { kind: "transfer", leg: "out", cents: asCents(50000) },
      "−₱500.00",
      "minus ₱500.00",
      null,
    ],
    [
      "transfer in leg",
      { kind: "transfer", leg: "in", cents: asCents(50000) },
      "+₱500.00",
      "plus ₱500.00",
      null,
    ],
    ["positive balance", { kind: "balance", cents: asCents(150) }, "₱1.50", "₱1.50", null],
    ["zero balance", { kind: "balance", cents: asCents(0) }, "₱0.00", "₱0.00", null],
    [
      "negative balance",
      { kind: "balance", cents: asCents(-150) },
      "−₱1.50",
      "minus ₱1.50",
      "text-shortfall",
    ],
    [
      "negative owed balance",
      { kind: "balance", owed: true, cents: asCents(-150) },
      "−₱1.50",
      "minus ₱1.50",
      null,
    ],
    [
      "positive owed balance",
      { kind: "balance", owed: true, cents: asCents(150) },
      "₱1.50",
      "₱1.50",
      null,
    ],
    [
      "positive net",
      { kind: "net", cents: asCents(2000) },
      "+₱20.00",
      "plus ₱20.00",
      "text-income",
    ],
    ["negative net", { kind: "net", cents: asCents(-2000) }, "−₱20.00", "minus ₱20.00", null],
    ["zero net", { kind: "net", cents: asCents(0) }, "₱0.00", "₱0.00", null],
  ])("shows a %s", (_name, props, shown, spoken, color) => {
    expect(rendered(props)).toEqual({ shown, spoken, color });
  });

  it("signs income and expenses by kind, whichever sign the cents are stored with", () => {
    expect(rendered({ kind: "expense", cents: asCents(-25000) }).shown).toBe("−₱250.00");
    expect(rendered({ kind: "income", cents: asCents(-25000) }).shown).toBe("+₱250.00");
  });

  it("lets a pending row mute an amount that would carry the income color", () => {
    expect(
      rendered({ kind: "income", cents: asCents(100), className: "text-muted-foreground" }).color
    ).toBe("text-muted-foreground");
  });
});
