/**
 * MobileNav drawer tests (mobile UX review R42):
 *
 * With the BottomTabBar owning the four highest-frequency destinations
 * (Dashboard, Transactions, Budgets, Accounts), the drawer must NOT list
 * them anymore — it keeps only the long tail (Categories, Analytics,
 * Transfers, PDF Import, Drafts, Settings), the quick-add CTA, the sync
 * row, and sign out.
 *
 * Rendered inside a real memory-history RouterProvider because MobileNav
 * uses useRouterState and the controlled Sheet wrapper engages the
 * history-back-close hook (review R37).
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
import { useNavStore } from "@/stores/navStore";

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

// Sign-out flow (supabase + dexie + confirm dialog) is out of scope here
vi.mock("@/lib/sign-out", () => ({
  signOutWithConfirm: vi.fn().mockResolvedValue(undefined),
}));

// Live sync status reads the Dexie outbox; irrelevant to nav contents
vi.mock("@/components/sync/GlobalSyncStatus", () => ({
  GlobalSyncStatus: () => <div data-testid="sync-status-row" />,
}));

// Drafts badge count (Dexie liveQuery) pinned to zero
vi.mock("dexie-react-hooks", () => ({
  useLiveQuery: () => 0,
}));
vi.mock("@/lib/import-drafts", () => ({
  getPendingDraftCount: vi.fn().mockResolvedValue(0),
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
  const paths = [
    "/",
    "/categories",
    "/analytics",
    "/transfers",
    "/import/pdf",
    "/drafts",
    "/settings",
  ];
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

// Owned by the BottomTabBar (R42) — must NOT appear in the drawer
const TAB_BAR_DESTINATIONS = ["Dashboard", "Transactions", "Budgets", "Accounts"] as const;

// The drawer's long tail
const DRAWER_LINKS = [
  { name: "Categories", href: "/categories" },
  { name: "Analytics", href: "/analytics" },
  { name: "Transfers", href: "/transfers" },
  { name: "PDF Import", href: "/import/pdf" },
  { name: "Drafts", href: "/drafts" },
  { name: "Settings", href: "/settings" },
] as const;

describe("MobileNav drawer contents (review R42)", () => {
  beforeEach(() => {
    useNavStore.setState({ quickAddOpen: false });
  });

  it("no longer lists the four tab-bar destinations", async () => {
    await renderDrawer();

    for (const name of TAB_BAR_DESTINATIONS) {
      expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
    }
  });

  it("keeps the long-tail destinations", async () => {
    await renderDrawer();

    for (const { name, href } of DRAWER_LINKS) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
    }
  });

  it("keeps the quick-add CTA wired to navStore and closes the drawer", async () => {
    await renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Add Transaction" }));

    expect(useNavStore.getState().quickAddOpen).toBe(true);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the sync row and sign out", async () => {
    await renderDrawer();

    expect(screen.getByTestId("sync-status-row")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign Out" })).toBeInTheDocument();
  });
});
