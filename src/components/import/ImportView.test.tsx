import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { createAccount } from "@/lib/commands/accounts";
import { saveDrafts } from "@/lib/commands/drafts";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createImport } from "@/lib/import/drafts";
import { readImportReview } from "@/lib/import/review";
import { ImportView } from "./ImportView";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const entry = { target, contentRect: { width: 1100 } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeEach(async () => {
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  await resetLocalDatabase();
});
afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

function renderImport(initialEntry: string) {
  const rootRoute = createRootRoute();
  const importRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/import",
    validateSearch: readOpenItem,
    component: () => (
      <PageShell variant="list-detail">
        <ImportView actor={MEMBER} />
      </PageShell>
    ),
  });
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({ routeTree: rootRoute.addChildren([importRoute]), history });
  render(<RouterProvider router={router} />);
  return history;
}

async function importStatement(accountId: string) {
  return createImport({
    formatId: "bdo-credit-card-pdf",
    fileName: "september.pdf",
    accountId,
    lines: [
      {
        purchaseDate: "2026-09-03",
        postingDate: "2026-09-05",
        description: "MERALCO",
        amount: parsePHP("3200"),
        type: "expense",
        isCardPayment: false,
      },
    ],
  });
}

async function addCard() {
  const bank = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("1000"),
  });
  return createAccount(MEMBER, {
    name: "BDO Visa",
    type: "credit_card",
    startingBalanceCents: parsePHP("0"),
    payingAccountId: bank.id,
  });
}

describe("ImportView", () => {
  it("opens a draft into the URL, and that URL shows the same draft", async () => {
    const card = await addCard();
    await importStatement(card.id);
    const history = renderImport("/import");

    const drafts = await screen.findByRole("list", { name: "Drafts" });
    fireEvent.click(within(drafts).getByRole("button", { name: /^MERALCO/ }));

    const pane = await screen.findByRole("region", { name: "MERALCO" });
    expect(within(pane).getByText("BDO Visa")).toBeInTheDocument();
    const [draft] = (await readImportReview())[0]?.drafts ?? [];
    expect(history.location.search).toBe(`?open=${draft?.id ?? ""}`);

    const url = history.location.href;
    cleanup();
    renderImport(url);
    expect(await screen.findByRole("region", { name: "MERALCO" })).toBeInTheDocument();
  });

  it("marks a draft already imported with a warning badge, never destructive", async () => {
    const card = await addCard();
    await importStatement(card.id);
    const [first] = await readImportReview();
    await saveDrafts(MEMBER, first?.drafts.map((draft) => draft.id) ?? []);
    await importStatement(card.id);
    renderImport("/import");

    const drafts = await screen.findByRole("list", { name: "Drafts" });
    const badge = await within(drafts).findByText("Already imported");
    expect(badge).toHaveClass("bg-warning-surface");
    expect(badge).not.toHaveClass("bg-destructive");
  });

  it("says when no imports are open", async () => {
    renderImport("/import");

    await waitFor(() => expect(screen.getByText("No open imports.")).toBeInTheDocument());
  });
});
