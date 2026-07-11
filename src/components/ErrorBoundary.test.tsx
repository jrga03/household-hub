/**
 * ErrorBoundary tests (mobile UX review C4):
 *
 * Pull-to-refresh is disabled app-wide (overscroll-behavior: none) and a
 * standalone PWA has no browser chrome, so the error fallback must offer a
 * hard "Reload app" escape hatch alongside the soft "Try Again" reset —
 * otherwise a wedged screen requires force-killing the app.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";

function Boom(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs caught render errors loudly; keep test output readable
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <p>all good</p>
      </ErrorBoundary>
    );

    expect(screen.getByText("all good")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reload app" })).not.toBeInTheDocument();
  });

  it("shows both Try Again and Reload app buttons in the fallback", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload app" })).toBeInTheDocument();
  });

  it("Reload app triggers window.location.reload", () => {
    const reload = vi.fn();
    // jsdom's real Location.reload is unforgeable; replace the whole object
    vi.stubGlobal("location", { ...window.location, reload });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    fireEvent.click(screen.getByRole("button", { name: "Reload app" }));

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
