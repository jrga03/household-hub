/**
 * BottomTabBar tests (mobile UX review R42). Uses a real router over memory
 * history because the assertions are about the router's own active-link
 * semantics: prefix matching for nested routes, exact matching for "/".
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { BottomTabBar } from "./BottomTabBar";

async function renderAt(initialPath: string) {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <BottomTabBar />
        <Outlet />
      </>
    ),
  });
  const routes = ["/", "/settings", "/settings/$section"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <div data-testid={`route-${path}`} />,
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByRole("navigation", { name: "Primary navigation" });
}

const TAB_NAMES = ["Home", "Settings"] as const;

function activeTabNames(): string[] {
  return TAB_NAMES.filter(
    (name) => screen.getByRole("link", { name }).getAttribute("aria-current") === "page"
  );
}

describe("BottomTabBar (review R42)", () => {
  it("renders the primary destinations as links", async () => {
    await renderAt("/");

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("lights only Home at / (exact match; fuzzy '/' would match everything)", async () => {
    await renderAt("/");

    expect(activeTabNames()).toEqual(["Home"]);
  });

  it("keeps Settings lit on a child route via prefix matching", async () => {
    await renderAt("/settings/appearance");

    expect(activeTabNames()).toEqual(["Settings"]);
  });
});
