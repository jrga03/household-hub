import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { TransactionList } from "./TransactionList";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

function renderTransactions(initialEntry: string) {
  const rootRoute = createRootRoute();
  const transactionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    validateSearch: readOpenItem,
    component: () => (
      <PageShell variant="list-detail">
        <TransactionList actor={MEMBER} filter={{}} onFilterChange={() => {}} />
      </PageShell>
    ),
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({ routeTree: rootRoute.addChildren([transactionsRoute]), history });
  render(<RouterProvider router={router} />);
  return history;
}

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("TransactionList", () => {
  it("drops a stale open id when no transactions are left", async () => {
    const history = renderTransactions("/transactions?open=gone");

    expect(await screen.findByText(/No transactions yet/)).toBeInTheDocument();
    await waitFor(() => expect(history.location.search).toBe(""));
  });
});
