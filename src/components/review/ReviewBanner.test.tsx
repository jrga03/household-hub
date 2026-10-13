import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createImport } from "@/lib/import/drafts";
import { ReviewBanner } from "./ReviewBanner";

vi.mock("@/hooks/useHousehold", () => ({
  useHousehold: () => ({ household: null, isOwner: false, isKnown: true }),
}));

const importLines = (count: number) =>
  createImport({
    formatId: "bdo-credit-card-pdf",
    fileName: "september.pdf",
    accountId: "aaaaaaaa-0000-4000-8000-000000000001",
    lines: Array.from({ length: count }, (_, index) => ({
      purchaseDate: "2026-09-03",
      postingDate: "2026-09-05",
      description: `LINE ${index}`,
      amount: parsePHP("3200"),
      type: "expense" as const,
      isCardPayment: false,
    })),
  });

async function renderBanner() {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <ReviewBanner />
        <p>Home</p>
      </>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: "/review", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  await screen.findByText("Home");
}

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("ReviewBanner", () => {
  it("links to Review with the number of items waiting", async () => {
    await importLines(2);

    await renderBanner();

    expect(await screen.findByRole("link", { name: /2 items to review/ })).toHaveAttribute(
      "href",
      "/review"
    );
  });

  it("uses the singular for one item", async () => {
    await importLines(1);

    await renderBanner();

    expect(await screen.findByRole("link", { name: /1 item to review/ })).toBeInTheDocument();
  });

  it("is hidden when nothing needs review", async () => {
    await renderBanner();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
