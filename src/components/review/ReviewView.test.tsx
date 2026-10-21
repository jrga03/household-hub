import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { createImport } from "@/lib/import/drafts";
import type { PendingJoinRequest } from "@/lib/join-requests";
import { HOUSEHOLD, loggedEvent } from "@/test/events";
import { ReviewView } from "./ReviewView";

const BANK = "aaaaaaaa-0000-4000-8000-000000000001";

const membership = vi.hoisted(() => ({ isOwner: true }));
const server = vi.hoisted(() => ({ requests: [] as PendingJoinRequest[], reachable: true }));

vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({
    household: { id: HOUSEHOLD, name: "The Santos Home" },
    isOwner: membership.isOwner,
    isKnown: true,
  }),
}));

vi.mock("@/lib/join-requests", () => ({
  pendingJoinRequestsQueryOptions: (householdId: string) =>
    queryOptions({
      queryKey: ["pending-join-requests", householdId],
      queryFn: () =>
        server.reachable ? Promise.resolve(server.requests) : Promise.reject(new Error("offline")),
    }),
  acceptJoinRequest: vi.fn(),
  declineJoinRequest: vi.fn(),
}));

let eventCount = 0;

function uncategorizedExpense(entityId: string) {
  eventCount += 1;
  return loggedEvent({
    id: `e-${eventCount}`,
    entityType: "transaction",
    entityId,
    eventType: "transaction.created",
    millis: 1000 + eventCount,
    payload: {
      date: "2026-10-12",
      type: "expense",
      amountCents: 25000,
      accountId: BANK,
      categoryId: null,
      description: "Lunch",
      notes: "",
      status: "cleared",
    },
  });
}

const importLines = (descriptions: string[]) =>
  createImport({
    formatId: "bdo-credit-card-pdf",
    fileName: "september.pdf",
    accountId: BANK,
    lines: descriptions.map((description) => ({
      purchaseDate: "2026-09-03",
      postingDate: "2026-09-05",
      description,
      amount: parsePHP("3200"),
      type: "expense" as const,
      isCardPayment: false,
    })),
  });

function renderReview() {
  const rootRoute = createRootRoute({ component: ReviewView });
  const router = createRouter({
    routeTree: rootRoute.addChildren(
      ["/transactions", "/import"].map((path) =>
        createRoute({ getParentRoute: () => rootRoute, path, component: () => null })
      )
    ),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  await resetLocalDatabase();
  membership.isOwner = true;
  server.requests = [];
  server.reachable = true;
});

describe("ReviewView", () => {
  it("is all clear with nothing to review", async () => {
    renderReview();

    expect(await screen.findByRole("heading", { name: "All clear" })).toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("links expenses without a category to Transactions, filtered to them", async () => {
    await receiveEvents([uncategorizedExpense("t-1"), uncategorizedExpense("t-2")], 0);

    renderReview();

    const section = await screen.findByRole("region", { name: "Expenses without a category" });
    expect(within(section).getByText("2 expenses have no category yet.")).toBeInTheDocument();
    expect(within(section).getByText("2 to review")).toHaveClass("bg-secondary");
    expect(within(section).getByRole("link", { name: /^Categorize/ })).toHaveAttribute(
      "href",
      "/transactions?needsCategory=true"
    );
    expect(screen.queryByRole("heading", { name: "All clear" })).not.toBeInTheDocument();
  });

  it("links open drafts to Import", async () => {
    await importLines(["MERALCO", "GRAB", "JOLLIBEE"]);

    renderReview();

    const section = await screen.findByRole("region", { name: "Imported drafts" });
    expect(within(section).getByText("3 drafts wait on this device.")).toBeInTheDocument();
    expect(within(section).getByText("3 to review")).toHaveClass("bg-secondary");
    expect(within(section).getByRole("link", { name: /^Review drafts/ })).toHaveAttribute(
      "href",
      "/import"
    );
  });

  it("lists join requests for the Owner to answer", async () => {
    server.requests = [{ id: "r-1", requesterEmail: "ana@example.com" }];

    renderReview();

    const section = await screen.findByRole("region", { name: "Join requests" });
    const request = within(section).getByRole("listitem");
    expect(request).toHaveTextContent("ana@example.com");
    expect(within(request).getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(within(request).getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("shows other Members no join requests", async () => {
    membership.isOwner = false;
    server.requests = [{ id: "r-1", requesterEmail: "ana@example.com" }];

    renderReview();

    expect(await screen.findByRole("heading", { name: "All clear" })).toBeInTheDocument();
    expect(screen.queryByText("ana@example.com")).not.toBeInTheDocument();
  });

  it("uses the singular for one item", async () => {
    await receiveEvents([uncategorizedExpense("t-1")], 0);
    await importLines(["MERALCO"]);

    renderReview();

    expect(await screen.findByText("1 expense has no category yet.")).toBeInTheDocument();
    expect(await screen.findByText("1 draft waits on this device.")).toBeInTheDocument();
  });

  it("tells the Owner join requests need a connection when they can't be read", async () => {
    server.reachable = false;

    renderReview();

    expect(await screen.findByText("Join requests show when you're online.")).toBeInTheDocument();
  });
});
