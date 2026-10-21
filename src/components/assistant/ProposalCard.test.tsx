import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { parsePHP } from "@/lib/currency";
import { db } from "@/lib/dexie/db";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listTransactions } from "@/lib/transactions/projection";
import type { ProposalItem } from "@/lib/assistant/conversation";
import { loadChat } from "@/lib/assistant/savedChat";
import { ProposalCard } from "./ProposalCard";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const TRANSACTION_ID = "eeeeeeee-0000-4000-8000-000000000001";

async function chooseOption(label: string, option: string) {
  fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter" });
  fireEvent.keyDown(await screen.findByRole("option", { name: option }), { key: "Enter" });
}

async function setUp() {
  const zero = parsePHP("0");
  const gcash = await createAccount(MEMBER, {
    name: "GCash",
    type: "e_wallet",
    startingBalanceCents: zero,
  });
  const bpi = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: zero,
  });
  const wallet = await createAccount(MEMBER, {
    name: "My wallet",
    type: "cash",
    startingBalanceCents: zero,
    visibility: "personal",
  });
  const food = await createGroup(MEMBER, { name: "Food" });
  const dining = await createCategory(MEMBER, { name: "Dining", groupId: food.id });
  const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
  return { gcash, bpi, wallet, dining, groceries };
}

function proposalOn(accountId: string, categoryId: string): ProposalItem {
  return {
    kind: "proposal",
    callId: "call-1",
    transactionId: TRANSACTION_ID,
    decision: null,
    proposal: {
      date: "2026-10-16",
      type: "expense",
      amountCents: parsePHP("250"),
      accountId,
      categoryId,
      description: "Jollibee",
      notes: "",
    },
  };
}

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("ProposalCard", () => {
  it("shows what will be recorded", async () => {
    const { gcash, dining } = await setUp();
    render(
      <ProposalCard item={proposalOn(gcash.id, dining.id)} actor={MEMBER} onDecide={vi.fn()} />
    );

    const card = await screen.findByRole("form", { name: "Confirm transaction" });
    expect(card).toHaveTextContent("₱250.00");
    expect(card).toHaveTextContent("Expense");
    expect(card).toHaveTextContent("Jollibee");
    expect(await within(card).findByLabelText("Account")).toHaveTextContent("GCash");
    expect(within(card).getByLabelText("Category")).toHaveTextContent("Dining");
    expect(within(card).getByLabelText("Date")).toHaveValue("2026-10-16");
    expect(await listTransactions()).toEqual([]);
  });

  it("records the account, category and date as changed on the card", async () => {
    const { gcash, bpi, dining, groceries } = await setUp();
    const onDecide = vi.fn();
    render(
      <ProposalCard item={proposalOn(gcash.id, dining.id)} actor={MEMBER} onDecide={onDecide} />
    );

    await screen.findByLabelText("Account");
    await chooseOption("Account", "BPI");
    await chooseOption("Category", "Groceries");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(onDecide).toHaveBeenCalled());
    expect(await listTransactions()).toMatchObject([
      {
        accountId: bpi.id,
        categoryId: groceries.id,
        date: "2026-10-15",
        amountCents: parsePHP("250"),
        type: "expense",
        description: "Jollibee",
        status: "cleared",
      },
    ]);
    const [callId, decision] = onDecide.mock.calls[0] as [
      string,
      { outcome: string; content: string },
    ];
    expect(callId).toBe("call-1");
    expect(decision.outcome).toBe("recorded");
    expect(JSON.parse(decision.content)).toMatchObject({
      recorded: { account: "BPI", category: "Groceries", date: "2026-10-15", amount: "₱250.00" },
    });
  });

  it("records once when confirmed again after a reload lost the decision", async () => {
    const { gcash, dining } = await setUp();
    const item = proposalOn(gcash.id, dining.id);
    // The page is evicted before the decision is saved, so the card comes back waiting.
    const lostDecision = vi.fn();
    const first = render(<ProposalCard item={item} actor={MEMBER} onDecide={lostDecision} />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(lostDecision).toHaveBeenCalled());
    first.unmount();

    const onDecide = vi.fn();
    render(<ProposalCard item={item} actor={MEMBER} onDecide={onDecide} />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(onDecide).toHaveBeenCalledWith(
        "call-1",
        expect.objectContaining({ outcome: "recorded" })
      )
    );
    expect(await listTransactions()).toMatchObject([{ id: TRANSACTION_ID }]);
  });

  it("records a chat saved before cards had an id once, across a reload", async () => {
    const { gcash, dining } = await setUp();
    const { transactionId: _none, ...legacy } = proposalOn(gcash.id, dining.id);
    await db.assistantChats.put({
      userId: MEMBER.userId,
      items: [legacy],
      updatedAt: "2026-10-17T01:00:00.000Z",
    });
    const savedCard = async () => {
      const [card] = (await loadChat(MEMBER.userId))?.items ?? [];
      if (card?.kind !== "proposal") throw new Error("The saved card is missing.");
      return card;
    };

    const lostDecision = vi.fn();
    const first = render(
      <ProposalCard item={await savedCard()} actor={MEMBER} onDecide={lostDecision} />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(lostDecision).toHaveBeenCalled());
    first.unmount();

    const onDecide = vi.fn();
    render(<ProposalCard item={await savedCard()} actor={MEMBER} onDecide={onDecide} />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(onDecide).toHaveBeenCalled());
    expect(await listTransactions()).toHaveLength(1);
  });

  it("drops a category that can't hold money in the newly chosen account", async () => {
    const { gcash, dining } = await setUp();
    render(
      <ProposalCard item={proposalOn(gcash.id, dining.id)} actor={MEMBER} onDecide={vi.fn()} />
    );

    await screen.findByLabelText("Account");
    await chooseOption("Account", "My wallet (Personal)");
    expect(screen.getByLabelText("Category")).toHaveTextContent("Unassigned");
  });

  it("records nothing when dismissed", async () => {
    const { gcash, dining } = await setUp();
    const onDecide = vi.fn();
    render(
      <ProposalCard item={proposalOn(gcash.id, dining.id)} actor={MEMBER} onDecide={onDecide} />
    );

    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    expect(onDecide).toHaveBeenCalledWith(
      "call-1",
      expect.objectContaining({ outcome: "dismissed" })
    );
    expect(await listTransactions()).toEqual([]);
  });

  it("shows what was recorded once decided, without the buttons", async () => {
    const { gcash, bpi, dining } = await setUp();
    const proposed = proposalOn(gcash.id, dining.id);
    const recorded = { ...proposed.proposal, accountId: bpi.id, date: "2026-10-15" };
    const item = {
      ...proposed,
      decision: { outcome: "recorded" as const, recorded, content: "{}" },
    };
    render(<ProposalCard item={item} actor={MEMBER} onDecide={vi.fn()} />);

    expect(await screen.findByText("Recorded")).toBeInTheDocument();
    expect(screen.getByLabelText("Account")).toHaveTextContent("BPI");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-15");
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });
});
