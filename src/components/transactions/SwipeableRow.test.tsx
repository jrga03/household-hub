import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwipeableRow } from "./SwipeableRow";

const base = {
  onOpenChange: vi.fn(),
  onClear: vi.fn(),
  onDelete: vi.fn(),
  clearLabel: "Mark cleared",
};

describe("SwipeableRow", () => {
  it("renders children (the card) and the tray buttons", () => {
    render(
      <SwipeableRow isOpen={false} {...base}>
        <div>Card body</div>
      </SwipeableRow>
    );
    expect(screen.getByText("Card body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mark cleared/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("hides tray buttons from a11y tree and tab order while closed", () => {
    render(
      <SwipeableRow isOpen={false} {...base}>
        <div>Card</div>
      </SwipeableRow>
    );
    const del = screen.getByRole("button", { name: /delete/i, hidden: true });
    expect(del).toHaveAttribute("tabindex", "-1");
  });

  it("fires onDelete / onClear when the open tray buttons are tapped", () => {
    const onDelete = vi.fn();
    const onClear = vi.fn();
    render(
      <SwipeableRow isOpen {...base} onDelete={onDelete} onClear={onClear}>
        <div>Card</div>
      </SwipeableRow>
    );
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /mark cleared/i }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
