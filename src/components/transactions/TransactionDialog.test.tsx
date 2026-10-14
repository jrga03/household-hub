import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { listTransactions } from "@/lib/transactions/projection";
import { TransactionEditor } from "./TransactionDialog";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

function renderEditor(onClose: () => void) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: () => <TransactionEditor actor={MEMBER} onClose={onClose} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/transactions"] }),
  });
  return render(<RouterProvider router={router} />);
}

// Radix measures via ResizeObserver, which jsdom lacks
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;

// Radix Select calls these, and jsdom leaves them out.
const radixStubs = ["scrollIntoView", "hasPointerCapture", "releasePointerCapture"] as const;

beforeAll(() => {
  for (const name of radixStubs) Element.prototype[name] = () => false;
});

afterAll(() => {
  for (const name of radixStubs) delete (Element.prototype as Partial<Element>)[name];
});

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("TransactionEditor", () => {
  it("keeps the chosen account and the typed amount after an invalid amount", async () => {
    await createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: parsePHP("0") });
    const gcash = await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("0"),
    });
    const onClose = vi.fn();
    renderEditor(onClose);

    const account = await screen.findByLabelText("Account");
    fireEvent.keyDown(account, { key: "Enter" });
    fireEvent.keyDown(await screen.findByRole("option", { name: "GCash" }), { key: "Enter" });
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Jollibee" } });
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Account")).toHaveTextContent("GCash");
    expect(screen.getByLabelText(/Amount/)).toHaveValue("abc");
    expect(screen.getByLabelText("Description")).toHaveValue("Jollibee");

    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "125" } });
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [saved] = await listTransactions();
    expect(saved).toMatchObject({
      accountId: gcash.id,
      amountCents: parsePHP("125"),
      description: "Jollibee",
    });
  });
});
