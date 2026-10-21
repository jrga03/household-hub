import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("says what is missing", () => {
    render(<EmptyState>No transactions this month.</EmptyState>);

    expect(screen.getByText("No transactions this month.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("offers the next step", () => {
    const onAdd = vi.fn();
    render(
      <EmptyState
        action={
          <button type="button" onClick={onAdd}>
            Add account
          </button>
        }
      >
        No accounts yet.
      </EmptyState>
    );

    fireEvent.click(screen.getByRole("button", { name: "Add account" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
