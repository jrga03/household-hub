import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { SegmentedControl } from "./SegmentedControl";

type Period = "week" | "month" | "year";

const periods: { value: Period; label: string }[] = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

function PeriodPicker({ onChange = () => {} }: { onChange?: (period: Period) => void }) {
  const [period, setPeriod] = useState<Period>("month");
  return (
    <SegmentedControl
      label="Period"
      options={periods}
      value={period}
      onChange={(next) => {
        setPeriod(next);
        onChange(next);
      }}
    />
  );
}

describe("SegmentedControl", () => {
  it("is a named radio group with the selected option checked", () => {
    render(<PeriodPicker />);
    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Month" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Week" })).not.toBeChecked();
  });

  it("takes one tab stop, on the selected option", () => {
    render(<PeriodPicker />);
    expect(screen.getByRole("radio", { name: "Month" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Week" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: "Year" })).toHaveAttribute("tabindex", "-1");
  });

  it("moves the selection with arrow keys, wrapping at the ends, and reports each change", () => {
    const onChange = vi.fn();
    render(<PeriodPicker onChange={onChange} />);

    fireEvent.keyDown(screen.getByRole("radio", { name: "Month" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("year");
    expect(screen.getByRole("radio", { name: "Year" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Year" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("radio", { name: "Year" }), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("week");
    expect(screen.getByRole("radio", { name: "Week" })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole("radio", { name: "Week" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("year");

    fireEvent.keyDown(screen.getByRole("radio", { name: "Year" }), { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("month");
    expect(screen.getByRole("radio", { name: "Month" })).toBeChecked();
  });

  it("jumps to the first and last options with Home and End", () => {
    const onChange = vi.fn();
    render(<PeriodPicker onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Month" }), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("year");
    fireEvent.keyDown(screen.getByRole("radio", { name: "Year" }), { key: "Home" });
    expect(onChange).toHaveBeenLastCalledWith("week");
  });

  it("selects an option on click", () => {
    const onChange = vi.fn();
    render(<PeriodPicker onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Week" }));
    expect(onChange).toHaveBeenCalledWith("week");
    expect(screen.getByRole("radio", { name: "Week" })).toBeChecked();
  });

  it("ignores other keys", () => {
    const onChange = vi.fn();
    render(<PeriodPicker onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Month" }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks each option for the coarse-pointer touch-target floor", () => {
    render(<PeriodPicker />);
    for (const option of screen.getAllByRole("radio")) {
      expect(option).toHaveAttribute("data-slot", "segmented-control-option");
    }
  });
});
