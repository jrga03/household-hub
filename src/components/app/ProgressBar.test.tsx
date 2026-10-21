import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("is a progressbar with an accessible name and value", () => {
    render(<ProgressBar label="Groceries budget spent" value={40} />);

    const bar = screen.getByRole("progressbar", { name: "Groceries budget spent" });
    expect(bar).toHaveAttribute("aria-valuenow", "40");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("caps an overspent value at full", () => {
    render(<ProgressBar label="Dining budget spent" value={130} tone="shortfall" />);

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("puts the shortfall tone on a shortfall track", () => {
    render(<ProgressBar label="Dining budget spent" value={100} tone="shortfall" />);

    expect(screen.getByRole("progressbar")).toHaveClass("bg-shortfall/20");
  });
});
