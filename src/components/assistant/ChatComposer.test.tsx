import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatComposer } from "./ChatComposer";

const input = () => screen.getByRole("textbox", { name: "Message the assistant" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 16, 21, 30));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatComposer", () => {
  it("sends the typed message and clears the input", () => {
    const onSend = vi.fn();
    render(<ChatComposer online limitResetsAt={null} busy={false} onSend={onSend} />);

    fireEvent.change(input(), { target: { value: "jollibee 250 gcash" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(onSend).toHaveBeenCalledWith("jollibee 250 gcash");
    expect(input()).toHaveValue("");
  });

  it("is disabled offline with a short explanation", () => {
    render(<ChatComposer online={false} limitResetsAt={null} busy={false} onSend={vi.fn()} />);

    expect(input()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByText(/needs a connection/)).toBeInTheDocument();
  });

  it("is disabled at the daily limit and says when it resets in local time", () => {
    const resetsAt = new Date(2026, 9, 17, 8, 0);
    render(<ChatComposer online limitResetsAt={resetsAt} busy={false} onSend={vi.fn()} />);

    expect(input()).toBeDisabled();
    expect(screen.getByText(/reached today's limit/)).toHaveTextContent("back tomorrow at 8:00 AM");
  });

  it("names no day when the limit resets later today", () => {
    vi.setSystemTime(new Date(2026, 9, 16, 6, 0));
    render(
      <ChatComposer
        online
        limitResetsAt={new Date(2026, 9, 16, 8, 0)}
        busy={false}
        onSend={vi.fn()}
      />
    );

    expect(screen.getByText(/reached today's limit/)).toHaveTextContent("back at 8:00 AM");
  });

  it("can't send while a reply is coming", () => {
    render(<ChatComposer online limitResetsAt={null} busy onSend={vi.fn()} />);

    fireEvent.change(input(), { target: { value: "hello" } });
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});
