/**
 * MobileNav drawer tests. Primary destinations live in the BottomTabBar; the
 * drawer holds the profile, Settings and sign out.
 *
 * Rendered inside a real memory-history RouterProvider because the
 * controlled Sheet wrapper engages the history-back-close hook (review R37).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { MobileNav } from "./MobileNav";
import { signOutWithToast } from "@/lib/sign-out";

// Radix measures via ResizeObserver, which jsdom lacks
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;

// authStore pulls the Supabase client (env-dependent); the drawer only reads
// the user for the profile header
vi.mock("@/stores/authStore", () => ({
  useAuthStore: <T,>(selector: (state: { user: { email: string } }) => T): T =>
    selector({ user: { email: "test@example.com" } }),
}));

// The sign-out flow itself (Supabase, local store reset) is covered in sign-out.test.ts
vi.mock("@/lib/sign-out", () => ({
  signOutWithToast: vi.fn().mockResolvedValue(undefined),
}));

const onOpenChange = vi.fn();

async function renderDrawer() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <MobileNav open onOpenChange={onOpenChange} />
        <Outlet />
      </>
    ),
  });
  const paths = ["/", "/settings"];
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      paths.map((path) =>
        createRoute({
          getParentRoute: () => rootRoute,
          path,
          component: () => <div data-testid={`route-${path}`} />,
        })
      )
    ),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  await screen.findByText("Household Hub");
}

describe("MobileNav drawer", () => {
  beforeEach(() => {
    onOpenChange.mockClear();
  });

  it("shows the signed-in user", async () => {
    await renderDrawer();

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("links only to Settings, and closes on navigation", async () => {
    await renderDrawer();

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/settings");

    fireEvent.click(links[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("signs out and closes the drawer", async () => {
    await renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(signOutWithToast).toHaveBeenCalledOnce();
  });
});
