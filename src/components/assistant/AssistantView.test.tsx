import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HeaderSlotProvider, useHeaderSlot } from "@/components/layout/HeaderActions";
import type { ChatItem } from "@/lib/assistant/conversation";
import { loadChat, saveChat } from "@/lib/assistant/savedChat";
import { createAccount } from "@/lib/commands/accounts";
import { confirm } from "@/lib/confirm";
import { asCents } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listTransactions } from "@/lib/transactions/projection";
import { toast } from "sonner";
import { useAssistantStore } from "@/stores/assistantStore";
import { AssistantView } from "./AssistantView";

vi.mock("@/lib/confirm", () => ({ confirm: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const actor = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

const showReply = (text: string) =>
  useAssistantStore.setState({ items: [{ kind: "assistant", text, toolCalls: [] }] });

beforeEach(async () => {
  await resetLocalDatabase();
  vi.mocked(confirm).mockReset();
  useAssistantStore.setState({
    items: [],
    updatedAt: null,
    replyText: "",
    busy: false,
    error: null,
    limitResetsAt: null,
  });
});

describe("AssistantView replies", () => {
  it("renders a markdown table in a reply as a table", () => {
    showReply("| Account | Balance |\n| --- | --- |\n| GCash | 500 |");
    render(<AssistantView actor={actor} />);

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Account" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "GCash" })).toBeInTheDocument();
  });

  it("renders bold and list markup instead of showing the symbols", () => {
    showReply("You have **two** accounts:\n\n- GCash\n- Wallet");
    render(<AssistantView actor={actor} />);

    expect(screen.getByText("two").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toContain("Wallet");
    expect(screen.queryByText(/\*\*/)).not.toBeInTheDocument();
  });

  it("shows a script in a reply as text", () => {
    showReply("Try this <script>window.hacked = true</script> now");
    const { container } = render(<AssistantView actor={actor} />);

    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText(/<script>window.hacked = true<\/script>/)).toBeInTheDocument();
  });

  it("opens links in a new tab and drops an unsafe href", () => {
    showReply("[docs](https://example.com) and [bad](javascript:alert(1))");
    render(<AssistantView actor={actor} />);

    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("keeps the member's own message as plain text", () => {
    useAssistantStore.setState({ items: [{ kind: "user", text: "**not bold**" }] });
    render(<AssistantView actor={actor} />);

    expect(screen.getByText("**not bold**")).toBeInTheDocument();
  });

  it("widens a bubble that holds a table", () => {
    showReply("| A |\n| --- |\n| 1 |");
    render(<AssistantView actor={actor} />);

    expect(screen.getByRole("table").closest("li")).toHaveClass("has-[table]:w-full");
  });
});

describe("AssistantView empty state", () => {
  it("offers example prompts that fill the input without sending", () => {
    render(<AssistantView actor={actor} />);

    fireEvent.click(screen.getByRole("button", { name: "jollibee 250 gcash" }));

    expect(screen.getByRole("textbox", { name: "Message the assistant" })).toHaveValue(
      "jollibee 250 gcash"
    );
    expect(useAssistantStore.getState().items).toEqual([]);
    expect(useAssistantStore.getState().busy).toBe(false);
  });

  it("hides the example prompts once the chat has started", () => {
    showReply("Hello");
    render(<AssistantView actor={actor} />);

    expect(screen.queryByRole("button", { name: "jollibee 250 gcash" })).not.toBeInTheDocument();
  });
});

describe("AssistantView New chat", () => {
  function HeaderSlot() {
    const { setSlot } = useHeaderSlot();
    return <div ref={setSlot} />;
  }

  const renderWithHeader = () =>
    render(
      <HeaderSlotProvider>
        <HeaderSlot />
        <AssistantView actor={actor} />
      </HeaderSlotProvider>
    );

  const chat: ChatItem[] = [
    { kind: "user", text: "hi" },
    { kind: "assistant", text: "Hello!", toolCalls: [] },
  ];

  const waitingCard: ChatItem = {
    kind: "proposal",
    callId: "call-1",
    transactionId: "eeeeeeee-0000-4000-8000-000000000001",
    proposal: {
      date: "2026-10-17",
      type: "expense",
      amountCents: asCents(25_000),
      accountId: "acc-gcash",
      categoryId: "cat-food",
      description: "Jollibee",
      notes: "",
    },
    decision: null,
  };

  it("is hidden while the chat is empty", () => {
    renderWithHeader();

    expect(screen.queryByRole("button", { name: "New chat" })).not.toBeInTheDocument();
  });

  it("starts fresh without asking when no card waits", async () => {
    useAssistantStore.setState({ items: chat });
    renderWithHeader();

    fireEvent.click(await screen.findByRole("button", { name: "New chat" }));

    await waitFor(() => expect(useAssistantStore.getState().items).toEqual([]));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "jollibee 250 gcash" })).toBeInTheDocument();
  });

  it("asks before discarding a waiting card, and keeps it on cancel", async () => {
    vi.mocked(confirm).mockResolvedValue(false);
    useAssistantStore.setState({ items: [...chat, waitingCard] });
    renderWithHeader();

    fireEvent.click(await screen.findByRole("button", { name: "New chat" }));

    await waitFor(() =>
      expect(confirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Discard this proposal?" })
      )
    );
    expect(useAssistantStore.getState().items).toHaveLength(3);
  });

  it("discards a waiting card once confirmed", async () => {
    vi.mocked(confirm).mockResolvedValue(true);
    useAssistantStore.setState({ items: [...chat, waitingCard] });
    renderWithHeader();

    fireEvent.click(await screen.findByRole("button", { name: "New chat" }));

    await waitFor(() => expect(useAssistantStore.getState().items).toEqual([]));
  });
});

describe("AssistantView waiting card after a reload", () => {
  // A member the other tests never opened, so the store holds nothing in memory for them.
  const member = { ...actor, userId: "user-reloaded" };

  it("records once, saves the decision before the toast, and can't be confirmed again", async () => {
    const gcash = await createAccount(member, {
      name: "GCash",
      type: "e_wallet",
      startingBalanceCents: asCents(0),
    });
    const card: ChatItem = {
      kind: "proposal",
      callId: "call-1",
      transactionId: "eeeeeeee-0000-4000-8000-000000000001",
      decision: null,
      proposal: {
        date: "2026-10-17",
        type: "expense",
        amountCents: asCents(25_000),
        accountId: gcash.id,
        categoryId: null,
        description: "Jollibee",
        notes: "",
      },
    };
    await saveChat(member.userId, [card], new Date());
    await useAssistantStore.getState().open(member.userId);

    let savedWhenToasted: Promise<unknown> | undefined;
    vi.mocked(toast.success).mockImplementation(() => {
      savedWhenToasted = loadChat(member.userId);
      return 1;
    });
    render(<AssistantView actor={member} />);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Recorded")).toBeInTheDocument();
    expect(await listTransactions()).toHaveLength(1);
    await waitFor(() => expect(savedWhenToasted).toBeDefined());
    expect(await savedWhenToasted).toMatchObject({
      items: [{ kind: "proposal", decision: { outcome: "recorded" } }],
    });

    const reloaded = await loadChat(member.userId);
    useAssistantStore.setState({ items: reloaded?.items ?? [], updatedAt: reloaded?.updatedAt });
    cleanup();
    render(<AssistantView actor={member} />);

    expect(await screen.findByText("Recorded")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
    expect(await listTransactions()).toHaveLength(1);
  });
});
