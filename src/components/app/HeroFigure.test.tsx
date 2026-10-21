import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeroFigure } from "./HeroFigure";

describe("HeroFigure", () => {
  it("is a region named by its label, holding the value and caption", () => {
    render(<HeroFigure label="Left this month" value="₱12,000.00" caption="of ₱20,000.00" />);

    const region = screen.getByRole("region", { name: "Left this month" });
    expect(region).toHaveTextContent("Left this month₱12,000.00of ₱20,000.00");
  });

  it("renders without a caption", () => {
    render(<HeroFigure label="Cash on hand" value="₱500.00" />);

    expect(screen.getByRole("region", { name: "Cash on hand" })).toHaveTextContent(
      "Cash on hand₱500.00"
    );
  });
});
