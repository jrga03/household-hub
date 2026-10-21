import { act, fireEvent, render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  type RouterHistory,
} from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DetailPane, readOpenItem, resolveOpenItem, useOpenItem } from "./DetailPane";
import { PageShell } from "./PageShell";

interface Thing {
  id: string;
  name: string;
}

let shellWidth = 393;
const observers = new Set<FakeResizeObserver>();

class FakeResizeObserver {
  private readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.targets.add(target);
    observers.add(this);
    this.notify();
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
  notify() {
    const entries = [...this.targets].map(
      (target) => ({ target, contentRect: { width: shellWidth } }) as ResizeObserverEntry
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

function resizeShell(width: number) {
  shellWidth = width;
  act(() => {
    for (const observer of observers) observer.notify();
  });
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeEach(() => {
  shellWidth = 393;
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  observers.clear();
});

function ThingsPage({ things }: { things: Thing[] }) {
  return (
    <PageShell variant="list-detail">
      <ThingsList things={things} />
    </PageShell>
  );
}

function ThingsList({ things }: { things: Thing[] }) {
  const { openId, open } = useOpenItem();
  const opened = resolveOpenItem(openId, (id) => things.find((thing) => thing.id === id));
  return (
    <>
      <PageShell.List>
        <ul aria-label="Things">
          {things.map((thing) => (
            <li key={thing.id}>
              <button type="button" onClick={() => open(thing.id)}>
                {thing.name}
              </button>
            </li>
          ))}
        </ul>
      </PageShell.List>
      <DetailPane title={opened?.name} description="Saved on this device." item={opened}>
        {(thing) => <p>{thing.name} details</p>}
      </DetailPane>
    </>
  );
}

const market = { id: "market", name: "Market" };
const bakery = { id: "bakery", name: "Bakery" };
const pharmacy = { id: "pharmacy", name: "Pharmacy" };

function renderThings(initialEntry: string, initialThings: Thing[] = [market, bakery, pharmacy]) {
  let things = initialThings;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const rootRoute = createRootRoute({ component: Outlet });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <p>Home page</p>,
  });
  const thingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/things",
    validateSearch: readOpenItem,
    component: function Things() {
      return <ThingsPage things={useSyncExternalStore(subscribe, () => things)} />;
    },
  });
  const history = createMemoryHistory({ initialEntries: ["/", initialEntry], initialIndex: 1 });
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, thingsRoute]),
    history,
  });
  render(<RouterProvider router={router} />);
  return {
    history,
    removeThing: (id: string) => {
      things = things.filter((thing) => thing.id !== id);
      for (const listener of listeners) listener();
    },
  };
}

const search = (history: RouterHistory) => history.location.search;

async function back(history: RouterHistory) {
  await act(async () => {
    history.back();
    await Promise.resolve();
  });
}

describe("DetailPane", () => {
  it("opens an item in a bottom sheet over the list at one pane, kept in the URL", async () => {
    const { history } = renderThings("/things");

    fireEvent.click(await screen.findByRole("button", { name: "Bakery" }));

    const sheet = await screen.findByRole("dialog", { name: "Bakery" });
    expect(within(sheet).getByText("Bakery details")).toBeInTheDocument();
    expect(search(history)).toBe("?open=bakery");
    expect(screen.getByRole("list", { name: "Things", hidden: true })).toBeInTheDocument();
  });

  it("closes the sheet on back, leaving the list on its own entry", async () => {
    const { history } = renderThings("/things");
    fireEvent.click(await screen.findByRole("button", { name: "Bakery" }));
    await screen.findByRole("dialog", { name: "Bakery" });

    await back(history);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(history.location.pathname).toBe("/things");
    expect(search(history)).toBe("");
  });

  it("closes the sheet with Close without leaving an entry that reopens it", async () => {
    const { history } = renderThings("/things");
    fireEvent.click(await screen.findByRole("button", { name: "Bakery" }));
    const sheet = await screen.findByRole("dialog", { name: "Bakery" });

    fireEvent.click(within(sheet).getAllByRole("button", { name: "Close" })[0]!);
    await act(() => Promise.resolve());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(search(history)).toBe("");
    await back(history);
    expect(history.location.pathname).toBe("/");
  });

  it("shows the same item after a reload of its URL", async () => {
    renderThings("/things?open=pharmacy");

    expect(await screen.findByRole("dialog", { name: "Pharmacy" })).toBeInTheDocument();
  });

  it("closing an item opened from its URL keeps the page's history", async () => {
    const { history } = renderThings("/things?open=pharmacy");
    const sheet = await screen.findByRole("dialog", { name: "Pharmacy" });

    fireEvent.click(within(sheet).getAllByRole("button", { name: "Close" })[0]!);
    await act(() => Promise.resolve());

    expect(history.location.pathname).toBe("/things");
    expect(search(history)).toBe("");
    await back(history);
    expect(history.location.pathname).toBe("/");
  });

  it("shows the item in a pane beside the list at two panes, and nothing while closed", async () => {
    shellWidth = 1024;
    const { history } = renderThings("/things");
    await screen.findByRole("button", { name: "Market" });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Market" }));

    const pane = await screen.findByRole("complementary");
    expect(within(pane).getByRole("heading", { name: "Market" })).toBeInTheDocument();
    expect(within(pane).getByText("Market details")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(search(history)).toBe("?open=market");

    fireEvent.click(within(pane).getByRole("button", { name: "Close" }));
    await act(() => Promise.resolve());
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("shows the description in the pane, and a sheet's header is its title alone", async () => {
    renderThings("/things?open=bakery");
    const sheet = await screen.findByRole("dialog", { name: "Bakery" });
    expect(within(sheet).queryByText("Saved on this device.")).not.toBeInTheDocument();
    expect(sheet).not.toHaveAttribute("aria-describedby");

    resizeShell(1024);

    const pane = await screen.findByRole("complementary");
    expect(within(pane).getByText("Saved on this device.")).toBeInTheDocument();
  });

  it("replaces the entry at two panes: back after three opens leaves the page", async () => {
    shellWidth = 1366;
    const { history } = renderThings("/things");

    for (const name of ["Market", "Bakery", "Pharmacy"]) {
      fireEvent.click(await screen.findByRole("button", { name }));
      await screen.findByRole("heading", { name });
    }
    expect(search(history)).toBe("?open=pharmacy");

    await back(history);
    expect(history.location.pathname).toBe("/");
  });

  it("closes when the open item's id is stale", async () => {
    const { history } = renderThings("/things?open=gone");

    await screen.findByRole("button", { name: "Market" });
    await act(() => Promise.resolve());

    expect(search(history)).toBe("");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the open item is removed", async () => {
    shellWidth = 1024;
    const { history, removeThing } = renderThings("/things?open=bakery");
    await screen.findByRole("complementary");

    act(() => removeThing("bakery"));
    await act(() => Promise.resolve());

    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(search(history)).toBe("");
  });

  it("keeps the item open while the shell crosses 840 either way", async () => {
    const { history } = renderThings("/things");
    fireEvent.click(await screen.findByRole("button", { name: "Bakery" }));
    await screen.findByRole("dialog", { name: "Bakery" });

    resizeShell(1024);
    const pane = await screen.findByRole("complementary");
    expect(within(pane).getByText("Bakery details")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    resizeShell(700);
    expect(await screen.findByRole("dialog", { name: "Bakery" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(search(history)).toBe("?open=bakery");

    // Opened at one pane, so back still closes it.
    await back(history);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(history.location.pathname).toBe("/things");
  });

  it("closes on back an item opened at two panes once it shows in a sheet", async () => {
    shellWidth = 1024;
    const { history } = renderThings("/things");
    fireEvent.click(await screen.findByRole("button", { name: "Bakery" }));
    await screen.findByRole("complementary");

    resizeShell(700);
    await screen.findByRole("dialog", { name: "Bakery" });
    await act(() => Promise.resolve());

    await back(history);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(history.location.pathname).toBe("/things");
    expect(search(history)).toBe("");

    await back(history);
    expect(history.location.pathname).toBe("/");
  });

  it("closes a sheet brought back by forward", async () => {
    const { history } = renderThings("/things");
    fireEvent.click(await screen.findByRole("button", { name: "Bakery" }));
    const firstSheet = await screen.findByRole("dialog", { name: "Bakery" });
    fireEvent.click(within(firstSheet).getAllByRole("button", { name: "Close" })[0]!);
    await act(() => Promise.resolve());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => {
      history.forward();
      await Promise.resolve();
    });
    const sheet = await screen.findByRole("dialog", { name: "Bakery" });

    fireEvent.click(within(sheet).getAllByRole("button", { name: "Close" })[0]!);
    await act(() => Promise.resolve());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(search(history)).toBe("");
  });
});
