import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@/lib/commands/accounts";
import { useAssistantStore } from "@/stores/assistantStore";
import { AssistantView } from "./AssistantView";

const actor = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

const showReply = (text: string) =>
  useAssistantStore.setState({ items: [{ kind: "assistant", text, toolCalls: [] }] });

beforeEach(() => {
  useAssistantStore.setState({
    items: [],
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
