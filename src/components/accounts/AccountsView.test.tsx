import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { format } from "date-fns";
import { readOpenItem } from "@/components/layout/DetailPane";
import { PageShell } from "@/components/layout/PageShell";
import { createAccount } from "@/lib/commands/accounts";
import { addTransaction } from "@/lib/commands/transactions";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listTransfers } from "@/lib/transfers/projection";
import { AccountsView } from "./AccountsView";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

let shellWidth = 393;

class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const entry = { target, contentRect: { width: shellWidth } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalResizeObserver = globalThis.ResizeObserver;
beforeEach(async () => {
  shellWidth = 393;
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
  await resetLocalDatabase();
});
afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

function renderAccounts(initialEntry = "/accounts") {
  const rootRoute = createRootRoute();
  const accountsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/accounts",
    validateSearch: readOpenItem,
    component: () => (
      <PageShell variant="list-detail">
        <AccountsView actor={MEMBER} />
      </PageShell>
    ),
  });
  const linkedRoutes = ["/transactions", "/assign-money"].map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path, component: () => null })
  );
  const history = createMemoryHistory({ initialEntries: [initialEntry] });
  const router = createRouter({
    routeTree: rootRoute.addChildren([accountsRoute, ...linkedRoutes]),
    history,
  });
  render(<RouterProvider router={router} />);
  return history;
}

const today = () => format(new Date(), "yyyy-MM-dd");

async function record(accountId: string, amount: string, type: "income" | "expense" = "expense") {
  await addTransaction(MEMBER, {
    date: today(),
    type,
    amountCents: parsePHP(amount),
    accountId,
    categoryId: null,
    description: "Recorded",
  });
}

async function bankAndCard() {
  const bank = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("1000"),
  });
  const card = await createAccount(MEMBER, {
    name: "Visa",
    type: "credit_card",
    startingBalanceCents: parsePHP("0"),
    payingAccountId: bank.id,
  });
  return { bank, card };
}

describe("AccountsView", () => {
  it("groups accounts by type, with a short bank in shortfall and a card's credit uncolored", async () => {
    const { bank, card } = await bankAndCard();
    await record(bank.id, "1500");
    await record(card.id, "300", "income");
    renderAccounts();

    const section = (title: string) => {
      const item = screen.getByRole("heading", { name: title }).closest("li");
      if (!item) throw new Error(`No ${title} section`);
      return item;
    };
    await screen.findByRole("heading", { name: "Credit cards" });
    const banks = section("Bank accounts");
    const cards = section("Credit cards");

    const short = await within(banks).findByText("minus ₱500.00");
    expect(short.parentElement).toHaveClass("text-shortfall");
    const owed = await within(cards).findByText("minus ₱300.00");
    expect(owed.parentElement).not.toHaveClass("text-shortfall");
    expect(within(cards).getByRole("button", { name: /^Visa/ })).toHaveAccessibleName(
      /Paid from BPI/
    );
  });

  it("keeps a negative section total in shortfall", async () => {
    const { bank } = await bankAndCard();
    await createAccount(MEMBER, {
      name: "Metrobank",
      type: "bank",
      startingBalanceCents: parsePHP("200"),
    });
    await record(bank.id, "1500");
    renderAccounts();

    const header = (await screen.findByRole("heading", { name: "Bank accounts" })).parentElement;
    if (!header) throw new Error("No Bank accounts header");
    const total = await within(header).findByText("minus ₱300.00");
    expect(total.parentElement).toHaveClass("text-shortfall");
  });

  it("shows a row's Unassigned only when it isn't zero", async () => {
    const short = await createAccount(MEMBER, {
      name: "Short",
      type: "bank",
      startingBalanceCents: parsePHP("0"),
    });
    await record(short.id, "100");
    await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("500"),
    });
    await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });
    renderAccounts();

    expect(await screen.findByRole("button", { name: /^BPI/ })).toHaveAccessibleName(
      /Unassigned ₱500\.00$/
    );
    expect(screen.getByRole("button", { name: /^Short/ })).toHaveAccessibleName(
      /Unassigned minus ₱100\.00$/
    );
    expect(screen.getByRole("button", { name: /^Wallet/ })).toHaveAccessibleName(
      /^Wallet\s*₱0\.00$/
    );
  });

  it("assigns an open account's Unassigned on Assign money, from that account", async () => {
    const { bank } = await bankAndCard();
    const history = renderAccounts();

    fireEvent.click(await screen.findByRole("button", { name: /^BPI/ }));
    const details = await screen.findByRole("dialog", { name: "BPI" });
    fireEvent.click(await within(details).findByRole("link", { name: "Assign money" }));

    await waitFor(() => expect(history.location.pathname).toBe("/assign-money"));
    expect(history.location.search).toBe(`?account=${bank.id}`);
  });

  it("offers no Assign money on an account with nothing Unassigned", async () => {
    await createAccount(MEMBER, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });
    renderAccounts();

    fireEvent.click(await screen.findByRole("button", { name: /^Wallet/ }));
    const details = await screen.findByRole("dialog", { name: "Wallet" });
    await within(details).findByText("Unassigned");
    expect(within(details).queryByRole("link", { name: "Assign money" })).toBeNull();
  });

  it("opens an account's details and pays its card from there", async () => {
    const { card } = await bankAndCard();
    await record(card.id, "800");
    const history = renderAccounts();

    fireEvent.click(await screen.findByRole("button", { name: /^Visa/ }));
    await waitFor(() => expect(history.location.search).toContain("open="));
    const details = await screen.findByRole("dialog", { name: "Visa" });
    expect(within(details).getByText("BPI")).toBeInTheDocument();
    expect(within(details).queryByRole("link", { name: "Assign money" })).toBeNull();

    fireEvent.click(within(details).getByRole("button", { name: "Pay Visa" }));
    const form = await screen.findByRole("form", { name: "Pay Visa" });
    expect(within(form).getByLabelText("Amount (₱)")).toHaveValue("800.00");
    fireEvent.submit(form);

    await waitFor(async () => expect(await listTransfers()).toHaveLength(1));
  });

  it("puts an invalid correction's error under the field", async () => {
    await bankAndCard();
    renderAccounts();

    fireEvent.click(await screen.findByRole("button", { name: /^BPI/ }));
    const details = await screen.findByRole("dialog", { name: "BPI" });
    fireEvent.click(within(details).getByRole("button", { name: "Correct balance" }));
    const form = await screen.findByRole("form", { name: "Correct BPI" });
    const actual = within(form).getByLabelText("Actual balance (₱)");
    fireEvent.change(actual, { target: { value: "abc" } });
    fireEvent.submit(form);

    await waitFor(() => expect(actual).toHaveAttribute("aria-invalid", "true"));
    expect(actual).toHaveAccessibleDescription(/not a valid number/);
  });
});
