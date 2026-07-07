/**
 * Tests for DatePicker (mobile UX review R20):
 * - renders a native <input type="date"> directly (no Button -> Popover stack)
 * - parses the picked "yyyy-MM-dd" as a LOCAL date, not UTC midnight
 *   (new Date("yyyy-MM-dd") is the previous calendar day for UTC+ users)
 * - preserves the future-date guard and Date|undefined contract
 */

import { addDays, format } from "date-fns";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DatePicker } from "./date-picker";

beforeAll(() => {
  // Fix a non-UTC timezone so a UTC-midnight parse regression is detectable
  // (in UTC the local and UTC calendar days coincide). Node re-reads TZ on
  // assignment since v13, so this affects Date for the rest of this file.
  vi.stubEnv("TZ", "Asia/Manila");
});

afterAll(() => {
  vi.unstubAllEnvs();
});

function getInput(): HTMLInputElement {
  return screen.getByLabelText("Select transaction date");
}

describe("DatePicker", () => {
  it("renders a native date input directly, capped at today", () => {
    render(<DatePicker value={undefined} onChange={() => {}} />);

    const input = getInput();
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("max", format(new Date(), "yyyy-MM-dd"));
    // No popover trigger button remains
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("emits a LOCAL-midnight Date for the picked day, not UTC midnight", () => {
    const onChange = vi.fn();
    render(<DatePicker value={undefined} onChange={onChange} />);

    fireEvent.change(getInput(), { target: { value: "2026-07-05" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const date = onChange.mock.calls[0][0] as Date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(5);
    // Local midnight; new Date("2026-07-05") would be 08:00 in Asia/Manila
    expect(date.getHours()).toBe(0);
  });

  it("clamps future dates to today", () => {
    const onChange = vi.fn();
    render(<DatePicker value={undefined} onChange={onChange} />);

    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    fireEvent.change(getInput(), { target: { value: tomorrow } });

    const date = onChange.mock.calls[0][0] as Date;
    expect(date.getTime()).toBeLessThanOrEqual(Date.now());
    expect(format(date, "yyyy-MM-dd")).toBe(format(new Date(), "yyyy-MM-dd"));
  });

  it("emits undefined when cleared and displays the current value", () => {
    const onChange = vi.fn();
    render(<DatePicker value={new Date(2026, 6, 5)} onChange={onChange} />);

    const input = getInput();
    expect(input.value).toBe("2026-07-05");

    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
