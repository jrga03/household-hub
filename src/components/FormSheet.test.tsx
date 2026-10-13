import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { advanceOnEnter, FormFooter, FormSheet } from "./FormSheet";

function setPhone(isPhone: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: isPhone && query === "(max-width: 767px)",
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

function NoteForm({ onClose = () => {} }: { onClose?: () => void }) {
  return (
    <FormSheet title="Add note" description="Saved on this device." onClose={onClose}>
      <form aria-label="Add note">
        <input aria-label="Note" />
        <FormFooter>
          <button type="submit">Save</button>
        </FormFooter>
      </form>
    </FormSheet>
  );
}

/** An iOS-style keyboard: the visual viewport shrinks while the layout viewport stays put. */
function fakeVisualViewport() {
  const viewport = Object.assign(new EventTarget(), { height: 800, offsetTop: 0 });
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("visualViewport", viewport);
  return {
    openKeyboard(height: number) {
      viewport.height = 800 - height;
      viewport.dispatchEvent(new Event("resize"));
    },
    /** Android with interactive-widget=resizes-content: the whole page shrinks. */
    resizePage(height: number) {
      vi.stubGlobal("innerHeight", height);
      viewport.height = height;
      viewport.dispatchEvent(new Event("resize"));
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FormSheet", () => {
  it("opens as a bottom sheet on phones", () => {
    setPhone(true);
    render(<NoteForm />);

    const sheet = screen.getByRole("dialog", { name: "Add note" });
    expect(sheet).toHaveAttribute("data-slot", "drawer-content");
    expect(sheet).toHaveAccessibleDescription("Saved on this device.");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("opens as a centered dialog on wider screens", () => {
    setPhone(false);
    render(<NoteForm />);

    const dialog = screen.getByRole("dialog", { name: "Add note" });
    expect(dialog).toHaveAttribute("data-slot", "dialog-content");
    expect(dialog).toHaveAccessibleDescription("Saved on this device.");
  });

  it("closes through onClose on Escape", () => {
    setPhone(true);
    const onClose = vi.fn();
    render(<NoteForm onClose={onClose} />);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalled();
  });

  it("sits above a keyboard that covers the page, and keeps the focused field in view", () => {
    setPhone(true);
    const keyboard = fakeVisualViewport();
    render(<NoteForm />);
    const field = screen.getByRole("textbox", { name: "Note" });
    const scrollIntoView = vi.fn();
    field.scrollIntoView = scrollIntoView;
    field.focus();

    act(() => keyboard.openKeyboard(300));

    const sheet = screen.getByRole("dialog", { name: "Add note" });
    expect(sheet.style.bottom).toBe("300px");
    expect(sheet.style.maxHeight).toBe("calc(500px - 1rem)");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });

    act(() => keyboard.openKeyboard(0));

    expect(sheet.style.bottom).toBe("");
  });

  it("keeps the focused field in view when the keyboard resizes the page", () => {
    setPhone(true);
    const keyboard = fakeVisualViewport();
    render(<NoteForm />);
    const field = screen.getByRole("textbox", { name: "Note" });
    const scrollIntoView = vi.fn();
    field.scrollIntoView = scrollIntoView;
    field.focus();

    act(() => keyboard.resizePage(500));

    expect(screen.getByRole("dialog", { name: "Add note" }).style.bottom).toBe("");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });
});

describe("advanceOnEnter", () => {
  function ExpenseForm({ onSubmit }: { onSubmit: () => void }) {
    return (
      <form
        aria-label="Expense"
        ref={advanceOnEnter}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <input aria-label="Amount" inputMode="decimal" enterKeyHint="next" />
        <input aria-label="Date" type="date" />
        <input aria-label="Description" enterKeyHint="next" />
        <textarea aria-label="Notes" />
        <input aria-label="Payee" enterKeyHint="done" />
        <button type="submit">Save</button>
      </form>
    );
  }

  const pressEnter = (element: HTMLElement) =>
    fireEvent.keyDown(element, { key: "Enter", code: "Enter" });

  it("moves Enter to the next text field, skipping pickers", () => {
    render(<ExpenseForm onSubmit={vi.fn()} />);
    const amount = screen.getByRole("textbox", { name: "Amount" });
    amount.focus();

    pressEnter(amount);

    expect(screen.getByRole("textbox", { name: "Description" })).toHaveFocus();
  });

  it("leaves Enter in a text area as a new line", () => {
    render(<ExpenseForm onSubmit={vi.fn()} />);
    const notes = screen.getByRole("textbox", { name: "Notes" });
    notes.focus();

    const handled = !pressEnter(notes);

    expect(handled).toBe(false);
    expect(notes).toHaveFocus();
  });

  it("submits from the last field", () => {
    const onSubmit = vi.fn();
    render(<ExpenseForm onSubmit={onSubmit} />);
    const payee = screen.getByRole("textbox", { name: "Payee" });
    payee.focus();

    pressEnter(payee);

    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
