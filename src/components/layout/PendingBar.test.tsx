import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { pendingOptions } from "./PendingBar";

function renderWithSlowPage() {
  let finishLoading = () => {};
  const chunk = new Promise<{ default: () => React.JSX.Element }>((resolve) => {
    finishLoading = () => resolve({ default: () => <p>Slow page</p> });
  });

  const rootRoute = createRootRoute({ component: Outlet });
  const router = createRouter({
    ...pendingOptions,
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <p>Home</p> }),
      createRoute({
        getParentRoute: () => rootRoute,
        path: "/reports",
        component: lazyRouteComponent(() => chunk),
      }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return { router, finishLoading };
}

describe("PendingBar", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows only while a slow page's code loads", async () => {
    const { router, finishLoading } = renderWithSlowPage();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Home")).toBeInTheDocument();

    void act(() => router.navigate({ to: "/reports" }));
    await act(() => vi.advanceTimersByTimeAsync(pendingOptions.defaultPendingMs - 50));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(screen.getByRole("status")).toHaveTextContent("Loading page");

    finishLoading();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Slow page")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
