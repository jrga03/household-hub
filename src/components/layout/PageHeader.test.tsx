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
import { HeaderActions, HeaderSlotProvider } from "./HeaderActions";
import { PageHeader } from "./PageHeader";

vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({ household: { name: "The Santos Home" } }),
}));

// Sync status reads the local event log; it isn't what these tests are about
vi.mock("@/components/sync/SyncStatusIndicator", () => ({
  SyncStatusIndicator: () => null,
}));

async function renderAt(initialEntries: string[]) {
  const rootRoute = createRootRoute({
    component: () => (
      <HeaderSlotProvider>
        <PageHeader menuButton={<button type="button">Open navigation menu</button>} />
        <Outlet />
      </HeaderSlotProvider>
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
    routeTree: rootRoute.addChildren([home, budget, plan]),
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
});
