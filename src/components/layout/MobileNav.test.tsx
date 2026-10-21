/**
 * MobileNav drawer tests. Home and Transactions live in the BottomTabBar; the
 * drawer holds every other destination, with the profile and sign out at the
 * bottom. The menu button carries a dot while anything waits for review.
 *
 * Rendered inside a real memory-history RouterProvider because the
 * controlled Sheet wrapper engages the history-back-close hook (review R37).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { MobileNav, NavMenuButton } from "./MobileNav";
import { signOutWithToast } from "@/lib/sign-out";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { loggedEvent } from "@/test/events";

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

// A Member: join requests (Owner only, from the server) are left out here
vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({ household: null, isOwner: false, isKnown: true }),
}));

const onOpenChange = vi.fn();

function withQueryClient(children: React.ReactNode) {
  return (
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {children}
    </QueryClientProvider>
  );
}

const uncategorizedExpense = loggedEvent({
  id: "e-1",
  entityType: "transaction",
  entityId: "t-1",
  eventType: "transaction.created",
  millis: 1000,
  payload: {
    date: "2026-10-12",
    type: "expense",
    amountCents: 25000,
    accountId: "aaaaaaaa-0000-4000-8000-000000000001",
    categoryId: null,
    description: "Lunch",
    notes: "",
    status: "cleared",
  },
});

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
    "/transactions",
    "/budget",
    "/review",
    "/accounts",
    "/import",
    "/categories",
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
  render(withQueryClient(<RouterProvider router={router} />));
  await screen.findByText("Household Hub");
}

describe("MobileNav drawer", () => {
  beforeEach(async () => {
    onOpenChange.mockClear();
    await resetLocalDatabase();
  });

  it("shows the signed-in user", async () => {
    await renderDrawer();

    expect(screen.getByText("test@example.com")).toBeInTheDocument();
  });

  it("links to the destinations off the tab bar, and closes on navigation", async () => {
    await renderDrawer();

    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/budget",
      "/review",
      "/accounts",
      "/import",
      "/categories",
      "/settings",
    ]);

    fireEvent.click(links[0]!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows the review count on the Review entry", async () => {
    await receiveEvents([uncategorizedExpense], 0);
    await renderDrawer();

    const review = screen.getByRole("link", { name: /Review/ });
    expect(await within(review).findByText("1")).toBeInTheDocument();
    expect(review).toHaveAccessibleName("Review, 1 to review");
  });

  it("shows no count on the Review entry when nothing needs review", async () => {
    await renderDrawer();

    expect(screen.getByRole("link", { name: "Review" })).toBeInTheDocument();
  });

  it("puts the profile and sign out after the links", async () => {
    await renderDrawer();

    const lastLink = screen.getAllByRole("link").at(-1);
    const email = screen.getByText("test@example.com");
    const signOut = screen.getByRole("button", { name: "Sign Out" });
    expect(lastLink?.compareDocumentPosition(email)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(email.compareDocumentPosition(signOut)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("signs out and closes the drawer", async () => {
    await renderDrawer();

    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(signOutWithToast).toHaveBeenCalledOnce();
  });
});

describe("NavMenuButton", () => {
  beforeEach(async () => {
    await resetLocalDatabase();
  });

  it("has no review dot when nothing needs review", async () => {
    render(withQueryClient(<NavMenuButton onClick={() => {}} />));

    await screen.findByRole("button", { name: "Open navigation menu" });
    expect(screen.queryByTestId("review-dot")).not.toBeInTheDocument();
  });

  it("shows a review dot while an expense has no category", async () => {
    await receiveEvents([uncategorizedExpense], 0);

    render(withQueryClient(<NavMenuButton onClick={() => {}} />));

    expect(
      await screen.findByRole("button", { name: "Open navigation menu, 1 to review" })
    ).toBeInTheDocument();
    expect(screen.getByTestId("review-dot")).toBeInTheDocument();
  });
});
