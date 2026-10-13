/**
 * The shell header reads its title and back target from the active route's
 * staticData, and routes fill its actions slot with <HeaderActions>.
 */

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { ContextMode, PhoneBottomChrome } from "./ContextMode";
import { HeaderActions, HeaderSlotProvider } from "./HeaderActions";
import { PageHeader } from "./PageHeader";

vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({ household: { name: "The Santos Home" } }),
}));

// Sync status reads the local event log; it isn't what these tests are about
vi.mock("@/components/sync/SyncStatusIndicator", () => ({
  SyncStatusIndicator: () => null,
}));

function Selecting() {
  const [selecting, setSelecting] = useState(false);
  if (!selecting) {
    return (
      <button type="button" onClick={() => setSelecting(true)}>
        Select
      </button>
    );
  }
  return (
    <ContextMode title="2 selected" exitLabel="Cancel selection" onExit={() => setSelecting(false)}>
      <button type="button">Remove</button>
    </ContextMode>
  );
}

async function renderAt(initialEntries: string[], { phone = false } = {}) {
  const rootRoute = createRootRoute({
    component: () => (
      <HeaderSlotProvider>
        <PageHeader menuButton={<button type="button">Open navigation menu</button>} />
        <Outlet />
        {phone && (
          <PhoneBottomChrome>
            <nav aria-label="Primary navigation" />
          </PhoneBottomChrome>
        )}
      </HeaderSlotProvider>
    ),
  });
  const selectable = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    staticData: { title: "Transactions" },
    component: () => (
      <main>
        <Selecting />
      </main>
    ),
  });
  const home = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <Link to="/plan">Go plan</Link>,
  });
  const budget = createRoute({
    getParentRoute: () => rootRoute,
    path: "/budget",
    staticData: { title: "Budget" },
    component: () => (
      <HeaderActions>
        <button type="button">Edit plan</button>
      </HeaderActions>
    ),
  });
  const plan = createRoute({
    getParentRoute: () => rootRoute,
    path: "/plan",
    staticData: { title: "Plan", parent: "/budget" },
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([home, budget, plan, selectable]),
    history: createMemoryHistory({ initialEntries }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("banner");
  return router;
}

const title = () => screen.getByRole("heading", { level: 1 });

describe("PageHeader", () => {
  it("titles Home with the household's name", async () => {
    await renderAt(["/"]);

    expect(title()).toHaveTextContent("The Santos Home");
  });

  it("titles other routes with their page name and shows the menu button", async () => {
    await renderAt(["/budget"]);

    expect(title()).toHaveTextContent("Budget");
    expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("puts a route's actions in the header", async () => {
    await renderAt(["/budget"]);

    const header = screen.getByRole("banner");
    expect(await screen.findByRole("button", { name: "Edit plan" })).toBeInTheDocument();
    expect(header).toContainElement(screen.getByRole("button", { name: "Edit plan" }));
  });

  it("replaces the menu button with a back arrow on a pushed screen", async () => {
    await renderAt(["/plan"]);

    expect(title()).toHaveTextContent("Plan");
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open navigation menu" })).not.toBeInTheDocument();
  });

  it("goes back to where the person came from", async () => {
    const router = await renderAt(["/"]);
    fireEvent.click(screen.getByRole("link", { name: "Go plan" }));
    await screen.findByRole("button", { name: "Back" });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("goes to the parent screen when opened directly", async () => {
    const router = await renderAt(["/plan"]);

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/budget"));
  });

  describe("a mode such as selecting", () => {
    it("takes over the title and swaps the menu button for an exit", async () => {
      await renderAt(["/transactions"]);
      fireEvent.click(screen.getByRole("button", { name: "Select" }));

      expect(title()).toHaveTextContent("2 selected");
      expect(screen.queryByRole("button", { name: "Open navigation menu" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Cancel selection" }));

      expect(title()).toHaveTextContent("Transactions");
      expect(screen.getByRole("button", { name: "Open navigation menu" })).toBeInTheDocument();
    });

    it("shows its actions where it is placed on wide screens", async () => {
      await renderAt(["/transactions"]);
      fireEvent.click(screen.getByRole("button", { name: "Select" }));

      expect(screen.getByRole("main")).toContainElement(
        screen.getByRole("button", { name: "Remove" })
      );
    });

    it("puts its actions in place of the tab bar on phones", async () => {
      await renderAt(["/transactions"], { phone: true });
      expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Select" }));

      expect(screen.queryByRole("navigation", { name: "Primary navigation" })).toBeNull();
      expect(screen.getByRole("main")).not.toContainElement(
        screen.getByRole("button", { name: "Remove" })
      );

      fireEvent.click(screen.getByRole("button", { name: "Cancel selection" }));

      expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    });
  });
});
