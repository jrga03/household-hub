import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, it, expect } from "vitest";
import { PageShell } from "./PageShell";

describe("PageShell", () => {
  it("defaults to the single variant: one column and no side landmark", () => {
    const { container } = render(
      <PageShell>
        <PageShell.Main>main content</PageShell.Main>
      </PageShell>
    );

    expect(screen.getByText("main content")).toBeInTheDocument();
    expect(container.firstChild).toHaveAttribute("data-variant", "single");
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("puts the supporting-pane side column in a complementary landmark after the main column", () => {
    render(
      <PageShell variant="supporting-pane">
        <PageShell.Main>overview</PageShell.Main>
        <PageShell.Side>upcoming</PageShell.Side>
      </PageShell>
    );

    const side = screen.getByRole("complementary");
    expect(side).toHaveTextContent("upcoming");
    expect(
      screen.getByText("overview").compareDocumentPosition(side) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("puts the list-detail detail slot in a complementary landmark the pane code can measure", () => {
    const detailRef = createRef<HTMLElement>();
    render(
      <PageShell variant="list-detail">
        <PageShell.List>rows</PageShell.List>
        <PageShell.Detail ref={detailRef}>open item</PageShell.Detail>
      </PageShell>
    );

    expect(screen.getByText("rows")).toBeInTheDocument();
    const detail = screen.getByRole("complementary");
    expect(detail).toHaveTextContent("open item");
    expect(detailRef.current).toBe(detail);
  });

  it("renders a list-detail shell with nothing in the detail slot as the list alone", () => {
    render(
      <PageShell variant="list-detail">
        <PageShell.List>rows</PageShell.List>
      </PageShell>
    );

    expect(screen.getByText("rows")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("applies @container so children can use container query variants", () => {
    const { container } = render(
      <PageShell variant="list-detail">
        <PageShell.List>rows</PageShell.List>
      </PageShell>
    );
    expect(container.firstChild).toHaveClass("@container");
  });
});
