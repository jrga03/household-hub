import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import markSource from "@/assets/app-mark.svg?raw";
import { AppMark } from "./AppMark";

describe("AppMark", () => {
  it("is hidden from assistive technology next to the app's name", () => {
    const { container } = render(
      <h1>
        <AppMark /> Household Hub
      </h1>
    );

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByRole("heading")).toHaveAccessibleName("Household Hub");
    expect(container.querySelector("[aria-hidden='true'] svg")).toBeInTheDocument();
  });

  it("names the app when it is the only content", () => {
    render(<AppMark label="Household Hub" />);

    expect(screen.getByRole("img", { name: "Household Hub" })).toBeInTheDocument();
  });

  it("draws the committed SVG source's path", () => {
    const { container } = render(<AppMark />);

    const drawn = container.querySelector("path")?.getAttribute("d");
    expect(drawn).toMatch(/^M12 3 L21 10.5/);
    expect(markSource).toContain(`d="${drawn}"`);
  });
});
