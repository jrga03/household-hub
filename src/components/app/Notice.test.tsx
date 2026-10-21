import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Notice } from "./Notice";

describe("Notice", () => {
  it("is a note named by its title", () => {
    render(
      <Notice tone="warning" title="Some rows were skipped">
        Three rows had no date.
      </Notice>
    );

    const note = screen.getByRole("note", { name: "Some rows were skipped" });
    expect(note).toHaveTextContent("Three rows had no date.");
  });

  it("works without a title", () => {
    render(<Notice>Changes sync when you are back online.</Notice>);

    expect(screen.getByRole("note")).toHaveTextContent("Changes sync when you are back online.");
  });

  it("does not interrupt a screen reader", () => {
    render(<Notice tone="warning">Check this.</Notice>);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("boxes a warning on the warning surface with normal text", () => {
    render(<Notice tone="warning">Check this.</Notice>);

    const note = screen.getByRole("note");
    expect(note).toHaveClass("bg-warning-surface");
    expect(note).not.toHaveClass("text-warning");
  });
});
