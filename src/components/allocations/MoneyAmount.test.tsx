import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { asCents } from "@/lib/currency";
import { MoneyAmount, shortfallClass } from "./MoneyAmount";

describe("MoneyAmount", () => {
  it("marks a negative amount as short", () => {
    render(<MoneyAmount cents={asCents(-150)} />);
    expect(screen.getByText("−₱1.50")).toHaveClass("text-shortfall");
  });

  it("leaves a positive amount uncolored", () => {
    render(<MoneyAmount cents={asCents(150)} />);
    expect(screen.getByText("₱1.50")).not.toHaveClass("text-shortfall");
  });
});

describe("shortfallClass", () => {
  it("is the shortfall role only for a negative amount that is not owed", () => {
    expect(shortfallClass(asCents(-1))).toBe("text-shortfall");
    expect(shortfallClass(asCents(0))).toBeUndefined();
    expect(shortfallClass(asCents(-1), { owed: true })).toBeUndefined();
  });
});
