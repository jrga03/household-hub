import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PageShell } from "./PageShell";

describe("PageShell", () => {
  it("renders main slot for centered variant", () => {
    render(
      <PageShell variant="centered">
        <PageShell.Main>main content</PageShell.Main>
      </PageShell>
    );
    expect(screen.getByText("main content")).toBeInTheDocument();
  });

  it("renders main and right aside for rail variant", () => {
    render(
      <PageShell variant="rail">
        <PageShell.Main>main</PageShell.Main>
        <PageShell.RightAside>rail</PageShell.RightAside>
      </PageShell>
    );
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText("rail")).toBeInTheDocument();
  });

  it("renders all three slots for triple variant", () => {
    render(
      <PageShell variant="triple">
        <PageShell.LeftAside>filters</PageShell.LeftAside>
        <PageShell.Main>list</PageShell.Main>
        <PageShell.RightAside>detail</PageShell.RightAside>
      </PageShell>
    );
    expect(screen.getByText("filters")).toBeInTheDocument();
    expect(screen.getByText("list")).toBeInTheDocument();
    expect(screen.getByText("detail")).toBeInTheDocument();
  });

  it("applies @container class so children can use container query variants", () => {
    const { container } = render(
      <PageShell variant="rail">
        <PageShell.Main>main</PageShell.Main>
      </PageShell>
    );
    expect(container.firstChild).toHaveClass("@container");
  });
});
