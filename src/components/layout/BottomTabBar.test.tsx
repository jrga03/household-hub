/**
 * BottomTabBar tests (mobile UX review R42):
 *
 * - renders the four primary destinations as links with accessible names
 * - active state is PREFIX-matched (TanStack fuzzy matching): a memory
 *   router at /transactions/abc keeps the Transactions tab lit
 * - "/" is exact-matched, so Dashboard lights ONLY at "/" (fuzzy "/" would
 *   match every route)
 * - TanStack Link marks the active tab with aria-current="page"
 *
 * Uses a REAL router over memory history (not mocks) because the assertions
 * are about the router's own active-link semantics.
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
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <div data-testid="route-dashboard" />,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/transactions",
      component: () => <div data-testid="route-transactions" />,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/transactions/$transactionId",
      component: () => <div data-testid="route-transaction-detail" />,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/budgets",
      component: () => <div data-testid="route-budgets" />,
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/accounts",
      component: () => <div data-testid="route-accounts" />,
    }),
  ];
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router} />);
  // Wait for the initial route to mount before asserting active states
  await screen.findByRole("navigation", { name: "Primary navigation" });
  return router;
}

const TAB_NAMES = ["Dashboard", "Transactions", "Budgets", "Accounts"] as const;

function activeTabNames(): string[] {
  return TAB_NAMES.filter(
    (name) => screen.getByRole("link", { name }).getAttribute("aria-current") === "page"
  );
}

describe("BottomTabBar (review R42)", () => {
  it("renders all four primary destinations as links", async () => {
    await renderAt("/");

    for (const name of TAB_NAMES) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      "/transactions"
    );
    expect(screen.getByRole("link", { name: "Budgets" })).toHaveAttribute("href", "/budgets");
    expect(screen.getByRole("link", { name: "Accounts" })).toHaveAttribute("href", "/accounts");
  });

  it("lights ONLY Dashboard at / (exact match — fuzzy '/' would match everything)", async () => {
    await renderAt("/");

    expect(activeTabNames()).toEqual(["Dashboard"]);
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps Transactions lit on a child route via prefix matching (/transactions/abc)", async () => {
    await renderAt("/transactions/abc");

    expect(screen.getByTestId("route-transaction-detail")).toBeInTheDocument();
    expect(activeTabNames()).toEqual(["Transactions"]);
  });

  it("lights Transactions at /transactions itself", async () => {
    await renderAt("/transactions");

    expect(activeTabNames()).toEqual(["Transactions"]);
  });

  it("lights Budgets and Accounts on their own routes, never Dashboard", async () => {
    await renderAt("/budgets");
    expect(activeTabNames()).toEqual(["Budgets"]);
  });

  it("lights Accounts at /accounts", async () => {
    await renderAt("/accounts");
    expect(activeTabNames()).toEqual(["Accounts"]);
  });
});
