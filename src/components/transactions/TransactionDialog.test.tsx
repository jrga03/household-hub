import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction } from "@/lib/commands/transactions";
import { parsePHP } from "@/lib/currency";
import { listTransactions, type TransactionRow } from "@/lib/transactions/projection";
import { listTransfers } from "@/lib/transfers/projection";
import { listUnpushed } from "@/lib/events/log";
import { TransactionEditor } from "./TransactionDialog";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/household-members", () => ({
  householdMembersQueryOptions: (householdId: string) =>
    queryOptions({
      queryKey: ["household-members", householdId],
      queryFn: () => Promise.resolve([{ userId: "user-b", email: "ana@example.com" }]),
    }),
}));

function renderEditor(onClose: () => void, transaction?: TransactionRow) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "/transactions",
    component: () => (
      <TransactionEditor actor={MEMBER} transaction={transaction} onClose={onClose} />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/transactions"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
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
    fireEvent.click(account);
    fireEvent.click(await screen.findByRole("option", { name: "GCash" }));
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "abc" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Jollibee" } });
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));

    const amount = screen.getByLabelText(/Amount/);
    await waitFor(() => expect(amount).toHaveAttribute("aria-invalid", "true"));
    expect(amount).toHaveAccessibleDescription(/not a valid number/);
    // The focus moves in an effect, after aria-invalid is committed.
    await waitFor(() => expect(amount).toHaveFocus());
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

  it("starts the next transaction in Unassigned, on the last account", async () => {
    await createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: parsePHP("0") });
    await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("0"),
    });
    const { id: groupId } = await createGroup(MEMBER, { name: "Food" });
    await createCategory(MEMBER, { name: "Groceries", groupId });
    const onClose = vi.fn();
    const first = renderEditor(onClose);

    fireEvent.click(await screen.findByLabelText("Account"));
    fireEvent.click(await screen.findByRole("option", { name: "GCash" }));
    fireEvent.click(screen.getByLabelText("Category (optional)"));
    fireEvent.click(await screen.findByRole("option", { name: "Groceries" }));
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: "125" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Market" } });
    fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(await listTransactions()).toMatchObject([{ categoryId: expect.any(String) }]);
    first.unmount();

    renderEditor(vi.fn());
    expect(await screen.findByLabelText("Category (optional)")).toHaveTextContent("Unassigned");
    expect(screen.getByLabelText("Account")).toHaveTextContent("GCash");
  });

  describe("Add and start another", () => {
    const addAnother = () => screen.queryByRole("button", { name: "Add and start another" });

    it("saves, keeps the sheet open, and clears only the amount, description and notes", async () => {
      await createAccount(MEMBER, {
        name: "BPI",
        type: "bank",
        startingBalanceCents: parsePHP("0"),
      });
      const onClose = vi.fn();
      renderEditor(onClose);

      fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: "125" } });
      fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Market" } });
      fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "Cash" } });
      fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-12" } });
      fireEvent.click(screen.getByRole("radio", { name: "Pending" }));
      fireEvent.click(screen.getByRole("button", { name: "Add and start another" }));

      await waitFor(async () => expect(await listTransactions()).toHaveLength(1));
      await waitFor(() => expect(screen.getByLabelText(/Amount/)).toHaveFocus());
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByLabelText(/Amount/)).toHaveValue("");
      expect(screen.getByLabelText("Description")).toHaveValue("");
      expect(screen.getByLabelText("Notes (optional)")).toHaveValue("");
      expect(screen.getByLabelText("Date")).toHaveValue("2026-10-12");
      expect(screen.getByRole("radio", { name: "Pending" })).toBeChecked();
      expect(await listTransactions()).toMatchObject([
        { amountCents: parsePHP("125"), description: "Market", notes: "Cash", status: "pending" },
      ]);
    });

    it("keeps everything on a validation error", async () => {
      await createAccount(MEMBER, {
        name: "BPI",
        type: "bank",
        startingBalanceCents: parsePHP("0"),
      });
      renderEditor(vi.fn());

      fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: "125" } });
      fireEvent.click(screen.getByRole("button", { name: "Add and start another" }));

      await waitFor(() => expect(screen.getByLabelText("Description")).toHaveFocus());
      expect(screen.getByLabelText(/Amount/)).toHaveValue("125.00");
      expect(await listTransactions()).toHaveLength(0);
    });

    it("is not offered for a transfer or an edit", async () => {
      const bpi = await createAccount(MEMBER, {
        name: "BPI",
        type: "bank",
        startingBalanceCents: parsePHP("0"),
      });
      await createAccount(MEMBER, {
        name: "GCash",
        type: "e_wallet",
        startingBalanceCents: parsePHP("0"),
      });
      const view = renderEditor(vi.fn());
      fireEvent.click(await screen.findByRole("radio", { name: "Transfer" }));
      expect(await screen.findByRole("form", { name: "Add transfer" })).toBeInTheDocument();
      expect(addAnother()).toBeNull();
      view.unmount();

      await addTransaction(MEMBER, {
        date: "2026-10-12",
        type: "expense",
        amountCents: parsePHP("300"),
        accountId: bpi.id,
        categoryId: null,
        description: "Groceries",
      });
      const [transaction] = await listTransactions();
      renderEditor(vi.fn(), transaction);
      expect(await screen.findByRole("button", { name: "Save" })).toBeVisible();
      expect(addAnother()).toBeNull();
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

  it("finds an account by its type's name", async () => {
    await createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: parsePHP("0") });
    await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("0"),
    });
    renderEditor(vi.fn());

    const account = await screen.findByLabelText("Account");
    fireEvent.click(account);
    fireEvent.change(await screen.findByRole("combobox", { name: "Search" }), {
      target: { value: "wallet" },
    });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "GCash E-wallet",
    ]);
    fireEvent.click(screen.getByRole("option"));
    expect(account).toHaveTextContent("GCash");
  });

  it("files a transfer under a category found by search", async () => {
    await createAccount(MEMBER, { name: "BPI", type: "bank", startingBalanceCents: parsePHP("0") });
    await createAccount(MEMBER, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: parsePHP("0"),
    });
    const { id: groupId } = await createGroup(MEMBER, { name: "Food" });
    await createCategory(MEMBER, { name: "Dining out", groupId });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId });
    const onClose = vi.fn();
    renderEditor(onClose);

    fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("radio", { name: "Transfer" }));
    const category = await screen.findByLabelText("Category (optional)");
    expect(category).toHaveTextContent("Unassigned");
    fireEvent.click(category);
    fireEvent.change(await screen.findByRole("combobox", { name: "Search" }), {
      target: { value: "groc" },
    });
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Groceries Food",
    ]);
    fireEvent.click(screen.getByRole("option"));
    expect(category).toHaveTextContent("Groceries");
    fireEvent.click(screen.getByRole("button", { name: "Add transfer" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const [saved] = await listTransfers();
    expect(saved?.envelope).toEqual({ kind: "category", id: groceries.id });
  });

  describe("Out-of-pocket", () => {
    const outOfPocket = () => screen.queryByRole("radio", { name: "Out-of-pocket" });

    async function chooseAccount(name: string) {
      fireEvent.click(await screen.findByLabelText("Account"));
      fireEvent.click(await screen.findByRole("option", { name }));
    }

    it("records an expense on a Household account as pending, paid by the member", async () => {
      await createAccount(MEMBER, {
        name: "BPI",
        type: "bank",
        startingBalanceCents: parsePHP("0"),
      });
      const onClose = vi.fn();
      renderEditor(onClose);

      fireEvent.change(await screen.findByLabelText(/Amount/), { target: { value: "300" } });
      fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Groceries" } });
      fireEvent.click(await screen.findByRole("radio", { name: "Out-of-pocket" }));
      fireEvent.click(screen.getByRole("button", { name: "Add transaction" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(await listTransactions()).toMatchObject([
        { status: "pending", paidByUserId: MEMBER.userId },
      ]);
    });

    it("drops back to Pending on a card, a Personal account or income", async () => {
      const bpi = await createAccount(MEMBER, {
        name: "BPI",
        type: "bank",
        startingBalanceCents: parsePHP("0"),
      });
      await createAccount(MEMBER, {
        name: "Visa",
        type: "credit_card",
        startingBalanceCents: parsePHP("0"),
        payingAccountId: bpi.id,
      });
      await createAccount(MEMBER, {
        name: "Wallet",
        type: "cash",
        startingBalanceCents: parsePHP("0"),
        visibility: "personal",
      });
      renderEditor(vi.fn());

      for (const leaveEligible of [
        () => chooseAccount("Visa"),
        () => chooseAccount("Wallet (Personal)"),
        async () => fireEvent.click(screen.getByRole("radio", { name: "Income" })),
      ]) {
        await chooseAccount("BPI");
        fireEvent.click(screen.getByRole("radio", { name: "Expense" }));
        fireEvent.click(await screen.findByRole("radio", { name: "Out-of-pocket" }));

        await leaveEligible();

        await waitFor(() => expect(outOfPocket()).toBeNull());
        expect(screen.getByRole("radio", { name: "Pending" })).toBeChecked();
      }
    });

    describe("editing", () => {
      async function recorded(paidByUserId: string | null) {
        const bpi = await createAccount(MEMBER, {
          name: "BPI",
          type: "bank",
          startingBalanceCents: parsePHP("0"),
        });
        await createAccount(MEMBER, {
          name: "Visa",
          type: "credit_card",
          startingBalanceCents: parsePHP("0"),
          payingAccountId: bpi.id,
        });
        const actor = paidByUserId === OTHER_MEMBER.userId ? OTHER_MEMBER : MEMBER;
        await addTransaction(actor, {
          date: "2026-10-12",
          type: "expense",
          amountCents: parsePHP("300"),
          accountId: bpi.id,
          categoryId: null,
          description: "Groceries",
          paidByUserId,
        });
        const [transaction] = await listTransactions();
        return transaction;
      }

      it("shows who paid without offering to change it, and keeps it on save", async () => {
        const onClose = vi.fn();
        renderEditor(onClose, await recorded(OTHER_MEMBER.userId));

        expect(await screen.findByText("Out-of-pocket, paid by ana@example.com")).toBeVisible();
        expect(screen.getByRole("radiogroup", { name: "Status" })).toHaveAccessibleDescription(
          "Out-of-pocket, paid by ana@example.com"
        );
        expect(outOfPocket()).toBeNull();
        fireEvent.click(screen.getByRole("radio", { name: "Cleared" }));
        fireEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(await listTransactions()).toMatchObject([
          { status: "cleared", paidByUserId: OTHER_MEMBER.userId },
        ]);
      });

      it("closes a transaction saved unchanged with no toast and no event", async () => {
        const onClose = vi.fn();
        const transaction = await recorded(null);
        if (!transaction) throw new Error("No transaction");
        renderEditor(onClose, transaction);

        fireEvent.click(await screen.findByRole("button", { name: "Save" }));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(toast.success).not.toHaveBeenCalled();
        const events = (await listUnpushed(100)).filter(
          (logged) => logged.entityId === transaction.id
        );
        expect(events.map((logged) => logged.eventType)).toEqual(["transaction.created"]);
      });

      it("offers only Household accounts that aren't cards", async () => {
        renderEditor(vi.fn(), await recorded(MEMBER.userId));

        expect(await screen.findByText("Out-of-pocket, paid by you")).toBeVisible();
        fireEvent.click(screen.getByLabelText("Account"));
        expect(await screen.findByRole("option", { name: "BPI" })).toBeVisible();
        expect(screen.queryByRole("option", { name: "Visa" })).toBeNull();
      });

      it("doesn't offer Out-of-pocket on an expense that wasn't one", async () => {
        renderEditor(vi.fn(), await recorded(null));

        expect(await screen.findByRole("radio", { name: "Pending" })).toBeVisible();
        expect(outOfPocket()).toBeNull();
        expect(screen.queryByText(/^Out-of-pocket/)).toBeNull();
      });
    });
  });

  describe("Paid from, editing a card transaction", () => {
    async function onCard() {
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
      await createAccount(MEMBER, {
        name: "Mastercard",
        type: "credit_card",
        startingBalanceCents: parsePHP("0"),
        payingAccountId: gcash.id,
      });
      const visa = await createAccount(MEMBER, {
        name: "Visa",
        type: "credit_card",
        startingBalanceCents: parsePHP("0"),
        payingAccountId: bpi.id,
      });
      await addTransaction(MEMBER, {
        date: "2026-10-12",
        type: "expense",
        amountCents: parsePHP("300"),
        accountId: visa.id,
        categoryId: null,
        description: "Groceries",
      });
      const [transaction] = await listTransactions();
      return { transaction, bpi, gcash };
    }

    const chooseAccount = async (name: string) => {
      fireEvent.click(screen.getByLabelText("Account"));
      fireEvent.click(await screen.findByRole("option", { name }));
    };

    it("reads the usual account under Account, and Change saves another", async () => {
      const { transaction, gcash } = await onCard();
      const onClose = vi.fn();
      renderEditor(onClose, transaction);

      const line = await screen.findByText(/^Paid from BPI/);
      expect(line).toHaveTextContent("Paid from BPI (usual)");
      fireEvent.click(screen.getByRole("button", { name: "Change" }));
      fireEvent.click(screen.getByLabelText("Paid from"));
      fireEvent.click(await screen.findByRole("option", { name: "GCash" }));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(onClose).toHaveBeenCalled());
      expect(await listTransactions()).toMatchObject([{ payingAccountId: gcash.id }]);
    });

    it("resets to the new card's usual account, and hides off a card", async () => {
      const { transaction } = await onCard();
      renderEditor(vi.fn(), transaction);
      await screen.findByText(/^Paid from BPI/);

      await chooseAccount("Mastercard");
      expect(await screen.findByText(/^Paid from GCash/)).toHaveTextContent(
        "Paid from GCash (usual)"
      );

      await chooseAccount("BPI");
      await waitFor(() => expect(screen.queryByText(/^Paid from/)).toBeNull());
    });
  });
});
