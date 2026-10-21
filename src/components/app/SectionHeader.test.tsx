import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("is a level 2 heading by default", () => {
    render(<SectionHeader title="Accounts" />);

    expect(screen.getByRole("heading", { level: 2, name: "Accounts" })).toBeInTheDocument();
  });

  it("takes its heading level from a prop", () => {
    render(<SectionHeader title="Groceries" level={3} />);

    expect(screen.getByRole("heading", { level: 3, name: "Groceries" })).toBeInTheDocument();
  });

  it("keeps a trailing link out of the heading's name", () => {
    render(<SectionHeader title="Recent" action={<a href="/transactions">See all</a>} />);

    expect(screen.getByRole("heading", { name: "Recent" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/transactions");
  });

  it("sticks under the app header by the --app-header offset", () => {
    const { container } = render(<SectionHeader title="Today" sticky />);

    expect(container.firstElementChild).toHaveClass("sticky", "top-[var(--app-header)]");
  });

  it("does not stick by default", () => {
    const { container } = render(<SectionHeader title="Today" />);

    expect(container.firstElementChild).not.toHaveClass("sticky");
  });
});
