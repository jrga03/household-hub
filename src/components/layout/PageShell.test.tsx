import { render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { PageShell } from "./PageShell";
import { useTwoPanes } from "./pane";

function PaneCount() {
  return <p>{useTwoPanes() ? "two panes" : "one pane"}</p>;
}

function stubShellWidth(width: number) {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        const entry = { target, contentRect: { width } } as ResizeObserverEntry;
        this.callback([entry], this as unknown as ResizeObserver);
      }
      disconnect() {}
    }
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("tells a supporting-pane page whether its side column sits beside the main one", () => {
    stubShellWidth(900);
    const { unmount } = render(
      <PageShell variant="supporting-pane">
        <PaneCount />
      </PageShell>
    );
    expect(screen.getByText("two panes")).toBeInTheDocument();
    unmount();

    stubShellWidth(500);
    render(
      <PageShell variant="supporting-pane">
        <PaneCount />
      </PageShell>
    );
    expect(screen.getByText("one pane")).toBeInTheDocument();
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
