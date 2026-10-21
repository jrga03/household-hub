import { describe, expect, expectTypeOf, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Info } from "lucide-react";
import { StatusBadge, type StatusTone } from "./StatusBadge";

describe("StatusBadge", () => {
  it("shows its text", () => {
    render(<StatusBadge tone="neutral">Review</StatusBadge>);

    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("hides a decorative icon from screen readers", () => {
    const { container } = render(
      <StatusBadge tone="outline" icon={Info}>
        Pending
      </StatusBadge>
    );

    expect(screen.getByText("Pending")).toHaveTextContent(/^Pending$/);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("marks an over-budget status in the shortfall color", () => {
    render(<StatusBadge tone="shortfall">Over budget</StatusBadge>);

    expect(screen.getByText("Over budget")).toHaveClass("text-shortfall");
  });

  it("has no destructive tone", () => {
    expectTypeOf<"destructive">().not.toExtend<StatusTone>();
  });
});
