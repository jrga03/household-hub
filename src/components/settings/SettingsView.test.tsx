import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import type { HouseholdMember } from "@/lib/household-members";
import type { Household } from "@/lib/households";
import type { PendingJoinRequest } from "@/lib/join-requests";
import { SettingsView } from "./SettingsView";

const OWNER_ID = "user-owner";
const HOUSEHOLD: Household = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Acido home",
  code: "7KQ2MX",
  ownerUserId: OWNER_ID,
};
const MEMBERS: HouseholdMember[] = [
  { userId: OWNER_ID, email: "owner@example.com", isOwner: true },
  { userId: "user-member", email: "member@example.com", isOwner: false },
];
const REQUESTS: PendingJoinRequest[] = [{ id: "request-1", requesterEmail: "new@example.com" }];

function stubShellWidth(width: number) {
  class FakeResizeObserver {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      const entry = { target, contentRect: { width } } as ResizeObserverEntry;
      this.callback([entry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
}

const originalResizeObserver = globalThis.ResizeObserver;
afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

function renderSettings(initialEntry: string, { isOwner = true } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  queryClient.setQueryData(["household-members", HOUSEHOLD.id], MEMBERS);
  queryClient.setQueryData(["pending-join-requests", HOUSEHOLD.id], REQUESTS);
  const userId = isOwner ? OWNER_ID : "user-member";

  const rootRoute = createRootRoute();
  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/settings",
    validateSearch: readOpenItem,
    component: () => (
      <PageShell variant="list-detail">
        <SettingsView household={HOUSEHOLD} userId={userId} isOwner={isOwner} />
      </PageShell>
    ),
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({ routeTree: rootRoute.addChildren([settingsRoute]), history });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return history;
}

describe("Settings with two panes", () => {
  it("lists the sections and shows none until one is chosen", async () => {
    stubShellWidth(1100);
    renderSettings("/settings");

    const sections = await screen.findByRole("list", { name: "Settings sections" });
    const names = within(sections)
      .getAllByRole("button")
      .map((row) => row.textContent);
    expect(names).toEqual([
      expect.stringMatching(/^Appearance/),
      expect.stringMatching(/^Household/),
      expect.stringMatching(/^Members/),
      expect.stringMatching(/^Join requests/),
      expect.stringMatching(/^Export/),
    ]);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("shows the chosen section beside the list and keeps it in the URL", async () => {
    stubShellWidth(1100);
    const history = renderSettings("/settings");

    fireEvent.click(await screen.findByRole("button", { name: /^Members/ }));

    const pane = await screen.findByRole("region", { name: "Members" });
    expect(within(pane).getByText("member@example.com")).toBeInTheDocument();
    expect(within(pane).getByText("Owner")).toBeInTheDocument();
    expect(history.location.search).toBe("?open=members");
    expect(screen.getByRole("button", { name: /^Members/ })).toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("opens the section named in the URL on load", async () => {
    stubShellWidth(1100);
    renderSettings("/settings?open=join-requests");

    const pane = await screen.findByRole("region", { name: "Join requests" });
    const request = within(pane).getByRole("listitem");
    expect(within(request).getByText("new@example.com")).toBeInTheDocument();
    expect(within(request).getByText("Pending")).toBeInTheDocument();
    expect(within(request).getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("closes a section a Member can't see", async () => {
    stubShellWidth(1100);
    const history = renderSettings("/settings?open=join-requests", { isOwner: false });

    await screen.findByRole("list", { name: "Settings sections" });
    expect(screen.queryByRole("button", { name: /^Join requests/ })).not.toBeInTheDocument();
    await vi.waitFor(() => expect(history.location.search).toBe(""));
  });
});

describe("Settings with one pane", () => {
  it("is one page of sections with links that jump to them", async () => {
    stubShellWidth(390);
    renderSettings("/settings");

    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(within(nav).getByRole("link", { name: "Members" })).toHaveAttribute("href", "#members");
    for (const name of ["Appearance", "Household", "Members", "Join requests", "Export"]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("region", { name: "Members" })).toHaveAttribute("id", "members");
    expect(screen.getByRole("heading", { level: 2, name: "Members" })).toBeInTheDocument();
  });
});
