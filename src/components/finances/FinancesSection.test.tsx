import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount } from "@/lib/commands/accounts";
import { parsePHP } from "@/lib/currency";
import { FinancesSection } from "./FinancesSection";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

function renderHome() {
  const rootRoute = createRootRoute();
  const routes = ["/", "/transactions", "/categories", "/accounts"].map((path) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path,
      component: () => <FinancesSection userId={MEMBER.userId} />,
    })
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(<RouterProvider router={router} />);
}

const shownAccounts = async () =>
  within(await screen.findByRole("list", { name: "Balances" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

const blockStorage = () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
};

let bpiId: string;

beforeEach(async () => {
  await resetLocalDatabase();
  localStorage.clear();
  bpiId = (
    await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("40000"),
    })
  ).id;
  await createAccount(MEMBER, {
    name: "Wallet",
    type: "cash",
    startingBalanceCents: parsePHP("500"),
    visibility: "personal",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FinancesSection", () => {
  it("links each block to its full screen", async () => {
    renderHome();

    expect(await screen.findByRole("link", { name: /BPI/ })).toHaveAttribute(
      "href",
      `/accounts#account-${bpiId}`
    );
    expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute("href", "/categories");
    expect(screen.getByRole("link", { name: "Transactions" })).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/transactions\?month=\d{4}-\d{2}$/)
    );
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/transactions");
  });

  it("switches to Mine and remembers it on this device", async () => {
    const { unmount } = renderHome();
    expect(await shownAccounts()).toEqual([expect.stringContaining("BPI")]);

    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(await screen.findByRole("link", { name: /Wallet/ })).toBeInTheDocument();
    unmount();

    renderHome();
    expect(await screen.findByRole("button", { name: "Mine" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(await shownAccounts()).toEqual([expect.stringContaining("Wallet")]);
  });

  it("still shows Household and switches when storage is blocked", async () => {
    blockStorage();
    renderHome();
    expect(await shownAccounts()).toEqual([expect.stringContaining("BPI")]);

    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    expect(await screen.findByRole("link", { name: /Wallet/ })).toBeInTheDocument();
  });
});
