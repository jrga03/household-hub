import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { FilterChip, FilterChips } from "./FilterChips";

function StatusFilters({
  onPendingChange = () => {},
}: {
  onPendingChange?: (on: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <FilterChips label="Filters">
      <FilterChip
        pressed={pending}
        onPressedChange={(next) => {
          setPending(next);
          onPendingChange(next);
        }}
      >
        Pending
      </FilterChip>
      <FilterChip pressed onPressedChange={() => {}}>
        This month
      </FilterChip>
    </FilterChips>
  );
}

describe("FilterChips", () => {
  it("groups the chips under a name", () => {
    render(<StatusFilters />);
    const group = screen.getByRole("group", { name: "Filters" });
    expect(group).toContainElement(screen.getByRole("button", { name: "Pending" }));
  });

  it("exposes each chip's pressed state", () => {
    render(<StatusFilters />);
    expect(screen.getByRole("button", { name: "Pending" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("toggles a chip on click and reports the new state", () => {
    const onPendingChange = vi.fn();
    render(<StatusFilters onPendingChange={onPendingChange} />);
    const chip = screen.getByRole("button", { name: "Pending" });

    fireEvent.click(chip);
    expect(onPendingChange).toHaveBeenLastCalledWith(true);
    expect(chip).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(chip);
    expect(onPendingChange).toHaveBeenLastCalledWith(false);
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("marks each chip for the coarse-pointer touch-target floor", () => {
    render(<StatusFilters />);
    expect(screen.getByRole("button", { name: "Pending" })).toHaveAttribute(
      "data-slot",
      "filter-chip"
    );
  });
});
