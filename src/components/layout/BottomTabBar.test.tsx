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
  const routes = [
    "/",
    "/transactions",
    "/transactions/$id",
    "/accounts",
    "/accounts/$id",
    "/categories",
    "/categories/$id",
    "/settings",
  ].map((path) =>
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

const TAB_NAMES = ["Home", "Transactions", "Accounts", "Categories"] as const;

function activeTabNames(): string[] {
  return TAB_NAMES.filter(
    (name) => screen.getByRole("link", { name }).getAttribute("aria-current") === "page"
  );
}

describe("BottomTabBar (review R42)", () => {
  it("renders Home, Transactions, Accounts and Categories as links", async () => {
    await renderAt("/");

    expect(
      screen.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])
    ).toEqual([
      ["Home", "/"],
      ["Transactions", "/transactions"],
      ["Accounts", "/accounts"],
      ["Categories", "/categories"],
    ]);
  });

  it("lights only Home at / (exact match; fuzzy '/' would match everything)", async () => {
    await renderAt("/");

    expect(activeTabNames()).toEqual(["Home"]);
  });

  it.each([
    ["Transactions", "/transactions/abc"],
    ["Accounts", "/accounts"],
    ["Accounts", "/accounts/abc"],
    ["Categories", "/categories"],
    ["Categories", "/categories/abc"],
  ])("lights only %s at %s via prefix matching", async (name, path) => {
    await renderAt(path);

    expect(activeTabNames()).toEqual([name]);
  });

  it("lights no tab on a drawer destination", async () => {
    await renderAt("/settings");

    expect(activeTabNames()).toEqual([]);
  });
});
