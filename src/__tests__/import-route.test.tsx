/**
 * /import is the parent of /import/pdf. Without an <Outlet> the child never
 * mounts, so these reparent the real /import Route via `.update()` over a
 * stub child.
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
import { Route as ImportRoute } from "../routes/import";

function renderAt(initialPath: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const importRoute = ImportRoute.update({
    id: "/import",
    path: "/import",
    getParentRoute: () => rootRoute,
  } as unknown as Parameters<typeof ImportRoute.update>[0]);
  const pdfRoute = createRoute({
    getParentRoute: () => importRoute,
    path: "/pdf",
    component: () => <div data-testid="route-import-pdf" />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([importRoute.addChildren([pdfRoute])]),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

describe("/import layout route", () => {
  it("renders the /import/pdf child", async () => {
    renderAt("/import/pdf");
    expect(await screen.findByTestId("route-import-pdf")).toBeInTheDocument();
  });

  it("redirects /import to /import/pdf", async () => {
    const router = renderAt("/import");
    expect(await screen.findByTestId("route-import-pdf")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/import/pdf");
  });
});
