import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { createAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { receiveEvents } from "@/lib/events/log";
import { createImport } from "@/lib/import/drafts";
import type { PendingJoinRequest } from "@/lib/join-requests";
import { HOUSEHOLD, loggedEvent } from "@/test/events";
import { ReviewView } from "./ReviewView";

const BANK = "aaaaaaaa-0000-4000-8000-000000000001";

const membership = vi.hoisted(() => ({ isOwner: true }));
const members = vi.hoisted(() => ({ emails: new Map<string, string>(), me: "user-me" }));
const server = vi.hoisted(() => ({ requests: [] as PendingJoinRequest[], reachable: true }));

vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({
    household: { id: HOUSEHOLD, name: "The Santos Home" },
    isOwner: membership.isOwner,
    isKnown: true,
  }),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: <T,>(select: (state: { user: { id: string } }) => T) =>
    select({ user: { id: members.me } }),
}));

vi.mock("@/lib/household-members", () => ({
  householdMembersQueryOptions: (householdId: string) =>
    queryOptions({
      queryKey: ["household-members", householdId],
      queryFn: () =>
        Promise.resolve([...members.emails].map(([userId, email]) => ({ userId, email }))),
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

function outOfPocketExpense(entityId: string, paidByUserId: string, amountCents: number) {
  eventCount += 1;
  return loggedEvent({
    id: `e-${eventCount}`,
    entityType: "transaction",
    entityId,
    eventType: "transaction.created",
    eventVersion: 4,
    millis: 1000 + eventCount,
    payload: {
      date: "2026-10-12",
      type: "expense",
      amountCents,
      accountId: BANK,
      categoryId: "groceries",
      payingAccountId: null,
      description: "Groceries",
      notes: "",
      status: "pending",
      importKey: null,
      paidByUserId,
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
      ["/transactions", "/import", "/assign-money"].map((path) =>
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
  members.emails = new Map();
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

  it("lists Unassigned money as one item, linking to Assign money", async () => {
    const owner = { householdId: HOUSEHOLD, userId: members.me };
    await createAccount(owner, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("3000"),
    });
    await createAccount(owner, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("2000"),
    });

    renderReview();

    const section = await screen.findByRole("region", { name: "Unassigned money" });
    expect(within(section).getByText("1 to review")).toBeInTheDocument();
    const row = within(section).getByRole("link", { name: /^Assign money/ });
    expect(row).toHaveAttribute("href", "/assign-money");
    await waitFor(() => expect(row).toHaveTextContent("₱5,000.00 waits to be assigned"));
  });

  it("says how much more is assigned than the accounts hold", async () => {
    const owner = { householdId: HOUSEHOLD, userId: members.me };
    const bpi = await createAccount(owner, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("0"),
    });
    const food = await createGroup(owner, { name: "Food" });
    const groceries = await createCategory(owner, { name: "Groceries", groupId: food.id });
    await addAllocation(owner, {
      date: "2026-10-05",
      accountId: bpi.id,
      from: { kind: "unassigned" },
      to: { kind: "category", id: groceries.id },
      amountCents: parsePHP("200"),
    });

    renderReview();

    const section = await screen.findByRole("region", { name: "Unassigned money" });
    const sentence = await within(section).findByText(/more assigned than you have/);
    expect(sentence).toHaveTextContent("₱200.00 more assigned than you have");
    expect(sentence).toHaveClass("text-shortfall");
  });

  it("lists one item per member the household owes, linking to their expenses", async () => {
    members.emails = new Map([
      ["user-ana", "ana@example.com"],
      ["user-ben", "ben@example.com"],
    ]);
    await receiveEvents(
      [
        outOfPocketExpense("t-1", "user-ana", 100000),
        outOfPocketExpense("t-2", "user-ana", 200000),
        outOfPocketExpense("t-3", "user-ben", 50000),
      ],
      0
    );

    renderReview();

    const section = await screen.findByRole("region", { name: "Out-of-pocket expenses" });
    expect(within(section).getByText("2 to review")).toBeInTheDocument();
    const ana = within(section).getByRole("link", { name: /^Pay back ana@example.com/ });
    expect(ana).toHaveAttribute("href", "/transactions?owedTo=user-ana");
    expect(ana).toHaveTextContent("₱3,000.00");
    expect(ana).toHaveTextContent("2 expenses");
    const ben = within(section).getByRole("link", { name: /^Pay back ben@example.com/ });
    expect(ben).toHaveAttribute("href", "/transactions?owedTo=user-ben");
    expect(ben).toHaveTextContent("₱500.00");
    expect(ben).toHaveTextContent("1 expense");
  });

  it("names a payer it doesn't know as a member", async () => {
    await receiveEvents([outOfPocketExpense("t-1", "user-gone", 100000)], 0);

    renderReview();

    expect(await screen.findByRole("link", { name: /^Pay back a member/ })).toHaveAttribute(
      "href",
      "/transactions?owedTo=user-gone"
    );
  });

  it("names the current member's own row as you", async () => {
    members.emails = new Map([["user-me", "me@example.com"]]);
    await receiveEvents([outOfPocketExpense("t-1", "user-me", 100000)], 0);

    renderReview();

    expect(await screen.findByRole("link", { name: /^Owed to you/ })).toHaveAttribute(
      "href",
      "/transactions?owedTo=user-me"
    );
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
