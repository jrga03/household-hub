/**
 * Tests for LoadingSpinner's built-in accessibility (review R41): the
 * role="status" + sr-only text live INSIDE the component so every usage is
 * announced without call sites doing anything.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
  it("announces the boot state exactly once", () => {
    render(<LoadingScreen />);

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent("Loading Household Hub");
  });
});
