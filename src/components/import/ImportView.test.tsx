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
import { listAccounts } from "@/lib/accounts/projection";
import { createAccount } from "@/lib/commands/accounts";
import { saveDrafts } from "@/lib/commands/drafts";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createImport } from "@/lib/import/drafts";
import { readImportReview } from "@/lib/import/review";
import type { StatementLine } from "@/lib/import/statement";
import { listTransactions } from "@/lib/transactions/projection";
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

const purchase = (description: string, amount: string): StatementLine => ({
  purchaseDate: "2026-09-03",
  postingDate: "2026-09-05",
  description,
  amount: parsePHP(amount),
  type: "expense",
  isCardPayment: false,
});

async function importStatement(accountId: string, lines = [purchase("MERALCO", "3200")]) {
  return createImport({
    formatId: "bdo-credit-card-pdf",
    fileName: "september.pdf",
    accountId,
    lines,
  });
}

async function chooseOption(trigger: HTMLElement, option: string) {
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.keyDown(await screen.findByRole("option", { name: option }), { key: "Enter" });
}

const paidFromIds = async () =>
  ((await readImportReview())[0]?.drafts ?? []).map((draft) => draft.paidFromId);

async function addCard() {
  const bank = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("1000"),
  });
  await createAccount(MEMBER, {
    name: "GCash",
    type: "e_wallet",
    startingBalanceCents: parsePHP("0"),
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

  it("brings a discarded line back as Discarded before, unselected and among the already recorded", async () => {
    const card = await addCard();
    await importStatement(card.id);
    renderImport("/import");
    fireEvent.click(await screen.findByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard 1 draft" }));
    await screen.findByText("No open imports.");

    await importStatement(card.id);

    const drafts = await screen.findByRole("list", { name: "Drafts" });
    expect(await within(drafts).findByText("Discarded before")).toBeInTheDocument();
    expect(within(drafts).getByRole("checkbox", { name: "Select MERALCO" })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      await screen.findByRole("button", { name: "Discard 1 already recorded" })
    ).toBeInTheDocument();
  });

  it("saves the draft as a pin when the member ticks Use these details next time", async () => {
    const card = await addCard();
    await importStatement(card.id);
    renderImport("/import");

    const drafts = await screen.findByRole("list", { name: "Drafts" });
    fireEvent.click(within(drafts).getByRole("button", { name: /^MERALCO/ }));
    const pane = await screen.findByRole("region", { name: "MERALCO" });

    expect(
      within(pane).getByText(
        "The next “MERALCO” gets this description and category, until newer saves differ."
      )
    ).toBeInTheDocument();
    fireEvent.click(within(pane).getByRole("checkbox", { name: "Use these details next time" }));
    fireEvent.click(within(pane).getByRole("button", { name: "Save as transaction" }));

    await waitFor(async () =>
      expect(await listTransactions()).toMatchObject([{ statementText: "MERALCO", pinned: true }])
    );
  });

  it("says when no imports are open", async () => {
    renderImport("/import");

    await waitFor(() => expect(screen.getByText("No open imports.")).toBeInTheDocument());
  });
});

describe("ImportView, Paid from", () => {
  it("shows the draft's Paid from under Amount, and Change sets it at once", async () => {
    const card = await addCard();
    await importStatement(card.id);
    renderImport("/import");
    const drafts = await screen.findByRole("list", { name: "Drafts" });
    fireEvent.click(within(drafts).getByRole("button", { name: /^MERALCO/ }));
    const pane = await screen.findByRole("region", { name: "MERALCO" });

    const fact = within(pane).getByText("Paid from").nextElementSibling as HTMLElement;
    await waitFor(() => expect(fact).toHaveTextContent("BPI (usual)"));
    fireEvent.click(within(fact).getByRole("button", { name: "Change" }));
    await chooseOption(within(pane).getByRole("combobox", { name: "Paid from" }), "GCash");

    await waitFor(() => expect(fact).toHaveTextContent(/^GCashChange$/));
    const gcash = (await listAccounts()).find((account) => account.name === "GCash");
    expect(await paidFromIds()).toEqual([gcash?.id]);
  });

  it("sets Paid from on the selected drafts from the More actions menu, and the rows say so", async () => {
    const card = await addCard();
    await importStatement(card.id, [purchase("MERALCO", "3200"), purchase("SHELL", "1500")]);
    renderImport("/import");
    const drafts = await screen.findByRole("list", { name: "Drafts" });
    expect(drafts).not.toHaveTextContent("Paid from");

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    expect(await screen.findByRole("button", { name: "Discard 2 drafts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Paid from…" }));
    const sheet = await screen.findByRole("dialog", { name: "Paid from" });
    await chooseOption(within(sheet).getByRole("combobox", { name: "Paid from" }), "GCash");
    fireEvent.click(within(sheet).getByRole("button", { name: "Set on 2 drafts" }));

    await waitFor(() => expect(within(drafts).getAllByText("· Paid from GCash")).toHaveLength(2));
  });

  it("marks the usual Paying Account among the choices", async () => {
    const card = await addCard();
    await importStatement(card.id);
    renderImport("/import");
    await screen.findByRole("list", { name: "Drafts" });

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    fireEvent.click(await screen.findByRole("button", { name: "Paid from…" }));
    const sheet = await screen.findByRole("dialog", { name: "Paid from" });
    fireEvent.keyDown(within(sheet).getByRole("combobox", { name: "Paid from" }), { key: "Enter" });

    expect(await screen.findByRole("option", { name: "BPI (usual)" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "GCash" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /BDO Visa/ })).not.toBeInTheDocument();
  });
});

describe("ImportView, Break apart", () => {
  async function openBreakApart(lines = [purchase("MERALCO", "3200")]) {
    const card = await addCard();
    await importStatement(card.id, lines);
    renderImport("/import");
    const drafts = await screen.findByRole("list", { name: "Drafts" });
    fireEvent.click(within(drafts).getByRole("button", { name: /^MERALCO/ }));
    const pane = await screen.findByRole("region", { name: "MERALCO" });
    fireEvent.click(within(pane).getByRole("button", { name: "Break apart" }));
    return screen.findByRole("dialog", { name: /^Break apart/ });
  }

  const amountOf = (sheet: HTMLElement, part: number) =>
    within(within(sheet).getByRole("group", { name: new RegExp(`^Part ${part}`) })).getByRole(
      "textbox",
      { name: "Amount" }
    );

  const setAmount = (input: HTMLElement, amount: string) => {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: amount } });
    fireEvent.blur(input);
  };

  it("opens with one part at the full amount, and asks for a second part", async () => {
    const sheet = await openBreakApart();

    expect(within(sheet).getByText("MERALCO")).toBeInTheDocument();
    expect((amountOf(sheet, 1) as HTMLInputElement).value).toMatch(/^3,?200\.00$/);
    expect(within(sheet).getByText(/^Add a second part/)).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Save 1 part" })).toBeDisabled();
  });

  it("shows Remaining, adds a part at Remaining, and saves the parts", async () => {
    const sheet = await openBreakApart();

    setAmount(amountOf(sheet, 1), "2000");
    expect(within(sheet).getByRole("status")).toHaveTextContent("Remaining₱1,200.00");
    expect(within(sheet).getByRole("status").firstElementChild).toHaveClass("text-warning");
    fireEvent.click(within(sheet).getByRole("button", { name: "Add part" }));
    expect((amountOf(sheet, 2) as HTMLInputElement).value).toMatch(/^1,?200\.00$/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Save 2 parts" }));

    await waitFor(async () =>
      expect((await listTransactions()).map((row) => row.amountCents).sort()).toEqual([
        120000, 200000,
      ])
    );
    expect(await readImportReview()).toEqual([]);
  });

  it("says Over by when the parts pass the line, and why Save is off", async () => {
    const sheet = await openBreakApart();
    fireEvent.click(within(sheet).getByRole("button", { name: "Add part" }));
    expect(within(sheet).getByText("Every part needs an amount above ₱0.00.")).toBeInTheDocument();

    setAmount(amountOf(sheet, 2), "500");

    expect(within(sheet).getByRole("status")).toHaveTextContent("Over by₱500.00");
    expect(within(sheet).getByText("The parts must total the line.")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Save 2 parts" })).toBeDisabled();
  });

  it("leaves the draft unchanged on Cancel", async () => {
    const sheet = await openBreakApart();
    setAmount(amountOf(sheet, 1), "2000");
    fireEvent.click(within(sheet).getByRole("button", { name: "Add part" }));

    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /^Break apart/ })).not.toBeInTheDocument()
    );
    expect(await listTransactions()).toEqual([]);
    const [draft] = (await readImportReview())[0]?.drafts ?? [];
    expect(draft).toMatchObject({ description: "MERALCO", line: { amount: 320000 } });
  });

  it("offers no Break apart on a card-payment line", async () => {
    const card = await addCard();
    await importStatement(card.id, [
      { ...purchase("PAYMENT RECEIVED", "5000"), type: "income", isCardPayment: true },
    ]);
    renderImport("/import");
    const drafts = await screen.findByRole("list", { name: "Drafts" });
    fireEvent.click(within(drafts).getByRole("button", { name: /^PAYMENT RECEIVED/ }));
    const pane = await screen.findByRole("region", { name: "PAYMENT RECEIVED" });

    expect(within(pane).queryByRole("button", { name: "Break apart" })).not.toBeInTheDocument();
  });
});
