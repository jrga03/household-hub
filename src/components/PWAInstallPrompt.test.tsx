/**
 * Tests for PWAInstallPrompt's coordination with the update toast
 * (mobile UX review R7):
 * - iOS install card still appears after the existing 3s delay
 * - the card is suppressed while a service-worker update is pending
 *   (pwaPromptStore.updatePending)
 * - suppression is render-only: once the update clears, the card appears
 *   without restarting timers (preserving the 3s-delay/7-day behavior)
 * - a dismissal within the last 7 days still blocks the prompt
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { PWAInstallPrompt } from "./PWAInstallPrompt";
import { usePwaPromptStore } from "@/stores/pwaPromptStore";

const IOS_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("PWAInstallPrompt (iOS path + update-pending suppression)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePwaPromptStore.setState({ updatePending: false });
    // Component reads navigator.userAgent at mount to pick the iOS branch
    Object.defineProperty(window.navigator, "userAgent", {
      value: IOS_USER_AGENT,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the iOS install card after the 3s delay", () => {
    render(<PWAInstallPrompt />);

    expect(screen.queryByText("Install Household Hub")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Install Household Hub")).toBeInTheDocument();
  });

  it("is suppressed while a service-worker update is pending", () => {
    usePwaPromptStore.setState({ updatePending: true });
    render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText("Install Household Hub")).not.toBeInTheDocument();
  });

  it("appears once the pending update clears, without restarting timers", () => {
    usePwaPromptStore.setState({ updatePending: true });
    render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText("Install Household Hub")).not.toBeInTheDocument();

    // Update applied or dismissed: suppression lifts with no new delay
    act(() => {
      usePwaPromptStore.setState({ updatePending: false });
    });

    expect(screen.getByText("Install Household Hub")).toBeInTheDocument();
  });

  it("stays hidden when dismissed within the last 7 days", () => {
    localStorage.setItem("pwa-install-dismissed", new Date().toISOString());
    render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText("Install Household Hub")).not.toBeInTheDocument();
  });
});
