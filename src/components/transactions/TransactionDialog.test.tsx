import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { listTransfers } from "@/lib/transfers/projection";
import { TransactionEditor } from "./TransactionDialog";
import { HOUSEHOLD } from "@/test/events";

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

    const amount = screen.getByLabelText(/Amount/);
    await waitFor(() => expect(amount).toHaveAttribute("aria-invalid", "true"));
    expect(amount).toHaveAccessibleDescription(/not a valid number/);
    expect(amount).toHaveFocus();
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

  it("ties a missing description to its field and moves focus there", async () => {
    await createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: parsePHP("0") });
    renderEditor(vi.fn());

    fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: "125" } });
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));

    const description = screen.getByLabelText("Description");
    await waitFor(() => expect(description).toHaveFocus());
    expect(description).toHaveAttribute("aria-invalid", "true");
    expect(description).toHaveAccessibleDescription("Add a description.");
    expect(screen.getByLabelText(/Amount/)).not.toHaveAttribute("aria-invalid");
    expect(await listTransactions()).toHaveLength(0);
  });

  it("carries the amount into a transfer and records it as pending", async () => {
    const bpi = await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("0"),
    });
    const gcash = await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("0"),
    });
    const onClose = vi.fn();
    renderEditor(onClose);

    fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("radio", { name: "Transfer" }));

    expect(await screen.findByRole("form", { name: "Add transfer" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/Amount/)).toHaveValue("2000.00"));
    fireEvent.click(screen.getByRole("radio", { name: "Pending" }));
    fireEvent.click(screen.getByRole("button", { name: "Add transfer" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [saved] = await listTransfers();
    expect(saved).toMatchObject({
      fromAccountId: bpi.id,
      toAccountId: gcash.id,
      amountCents: parsePHP("2000"),
      status: "pending",
    });
  });
});
