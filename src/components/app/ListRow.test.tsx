import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ListRow } from "./ListRow";

async function renderInRouter(ui: ReactNode) {
  const rootRoute = createRootRoute({ component: () => ui });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/transactions"] }),
  });
  render(<RouterProvider router={router} />);
  await router.load();
  return router;
}

describe("ListRow", () => {
  it("renders a button when it has no URL, and clicking the row runs it", () => {
    const onOpen = vi.fn();
    render(<ListRow label="Groceries" detail="Food · Cash" amount="₱250.00" onClick={onOpen} />);

    const target = screen.getByRole("button", { name: /Groceries/ });
    expect(target).toHaveTextContent("Food · Cash");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Food · Cash"));
    fireEvent.click(screen.getByText("₱250.00"));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it("ends the label line with a status after the amount", () => {
    render(
      <ListRow
        label="Groceries"
        amount="₱250.00"
        trailing={<span>Over budget</span>}
        onClick={vi.fn()}
      />
    );

    expect(screen.getByRole("button")).toHaveTextContent(/^Groceries₱250\.00Over budget$/);
  });

  it("shows its content with nothing to open when it has no target", () => {
    render(<ListRow label="ana@example.com" amount="Owner" actions={<button>Remove</button>} />);

    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders a link to its URL", async () => {
    await renderInRouter(
      <ListRow label="Groceries" link={{ to: "/transactions", search: { account: "t1" } }} />
    );

    const link = await screen.findByRole("link", { name: /Groceries/ });
    expect(link).toHaveAttribute("href", "/transactions?account=t1");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("navigates when the row's link is clicked", async () => {
    const router = await renderInRouter(
      <ListRow label="Groceries" link={{ to: "/transactions", search: { account: "t1" } }} />
    );

    fireEvent.click(await screen.findByText("Groceries"));
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ account: "t1" }));
  });

  it("marks the open row with aria-current=true, also when its link is the current URL", async () => {
    await renderInRouter(
      <>
        <ListRow label="Open one" open link={{ to: "/transactions" }} />
        <ListRow label="Other one" link={{ to: "/transactions", search: { account: "t2" } }} />
      </>
    );

    expect(await screen.findByRole("link", { name: /Open one/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("link", { name: /Other one/ })).not.toHaveAttribute("aria-current");
  });

  it("marks an open button row with aria-current=true", () => {
    render(<ListRow label="Groceries" open onClick={() => {}} />);
    expect(screen.getByRole("button", { name: /Groceries/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("keeps quick actions reachable and does not trigger the row from them", () => {
    const onOpen = vi.fn();
    const onRemove = vi.fn();
    render(
      <ListRow
        label="Groceries"
        onClick={onOpen}
        actions={
          <button type="button" onClick={onRemove}>
            Remove Groceries
          </button>
        }
      />
    );

    const remove = screen.getByRole("button", { name: "Remove Groceries" });
    remove.focus();
    expect(remove).toHaveFocus();

    fireEvent.click(remove);
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("is its own size container, so quick actions follow the row's width, not the page's", () => {
    render(
      <ListRow label="Groceries" onClick={() => {}} actions={<button type="button">Edit</button>} />
    );
    expect(screen.getByRole("button", { name: /Groceries/ }).parentElement).toHaveClass(
      "@container"
    );
  });
});
