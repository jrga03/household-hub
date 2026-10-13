import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { parsePHP } from "@/lib/currency";
import { TransactionAmount } from "./TransactionAmount";

const shown = (container: HTMLElement) =>
  container.querySelector("[aria-hidden=true]")?.textContent;
const spoken = (container: HTMLElement) => container.querySelector(".sr-only")?.textContent;

describe("TransactionAmount", () => {
  it("shows an expense with a minus sign unless asked for parentheses", () => {
    const { container } = render(<TransactionAmount direction="out" cents={parsePHP("250")} />);

    expect(shown(container)).toBe("−₱250.00");
    expect(spoken(container)).toBe("minus ₱250.00");
  });

  it("shows an expense in parentheses where asked, still announced as minus", () => {
    const { container } = render(
      <TransactionAmount direction="out" cents={parsePHP("250")} expenseInParentheses />
    );

    expect(shown(container)).toBe("(₱250.00)");
    expect(spoken(container)).toBe("minus ₱250.00");
  });

  it("signs income with a plus, and leaves a transfer between accounts unsigned", () => {
    const income = render(
      <TransactionAmount direction="in" cents={parsePHP("1000")} expenseInParentheses />
    );
    expect(shown(income.container)).toBe("+₱1,000.00");
    expect(spoken(income.container)).toBe("plus ₱1,000.00");

    const moved = render(<TransactionAmount direction="moved" cents={parsePHP("500")} />);
    expect(shown(moved.container)).toBe("₱500.00");
  });
});
