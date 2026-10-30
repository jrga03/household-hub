import { describe, expect, it } from "vitest";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Route as PlanRoute } from "./plan";

async function landingOf(url: string) {
  const rootRoute = createRootRoute();
  const plan = createRoute({
    getParentRoute: () => rootRoute,
    path: "/plan",
    // The file route's context type names the app's root; only its redirect matters here.
    beforeLoad: (context) => PlanRoute.options.beforeLoad?.(context as never),
  });
  const assignMoney = createRoute({ getParentRoute: () => rootRoute, path: "/assign-money" });
  const router = createRouter({
    routeTree: rootRoute.addChildren([plan, assignMoney]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  return router.state.location;
}

describe("/plan", () => {
  it("lands on Assign money for the same month", async () => {
    const location = await landingOf("/plan?month=2026-10");
    expect(location.pathname).toBe("/assign-money");
    expect(location.search).toEqual({ month: "2026-10" });
  });

  it("keeps an open Distribute and its source", async () => {
    const location = await landingOf("/plan?distribute=opening&account=bpi");
    expect(location.pathname).toBe("/assign-money");
    expect(location.search).toEqual({ distribute: "opening", account: "bpi" });
  });
});
