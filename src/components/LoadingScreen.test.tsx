/**
 * Tests for LoadingSpinner's built-in accessibility (review R41): the
 * role="status" + sr-only text live INSIDE the component so every usage is
 * announced without call sites doing anything.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { LoadingScreen, LoadingSpinner } from "./LoadingScreen";

describe("LoadingSpinner", () => {
  it("exposes role=status with default sr-only text", () => {
    render(<LoadingSpinner />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Loading");
  });

  it("announces a custom label", () => {
    render(<LoadingSpinner label="Loading budgets" />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading budgets");
  });
});

describe("LoadingScreen", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("announces the boot state exactly once and shows no text beside the tile", () => {
    const { container } = render(<LoadingScreen />);

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent("Loading Household Hub");
    expect(container).toHaveTextContent(/^Loading Household Hub$/);
  });

  it("shows a spinner only after about 1 s", () => {
    const { container } = render(<LoadingScreen />);

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(container.querySelector(".animate-spin")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
