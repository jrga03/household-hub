/**
 * Tests for PWAInstallPrompt.
 *
 * Update-toast coordination (mobile UX review R7):
 * - iOS install card still appears after the existing 3s delay
 * - the card is suppressed while a service-worker update is pending
 *   (pwaPromptStore.updatePending)
 * - suppression is render-only: once the update clears, the card appears
 *   without restarting timers (preserving the 3s-delay/7-day behavior)
 * - a dismissal within the last 7 days still blocks the prompt
 *
 * PWA polish (mobile UX remediation item 8.3):
 * - iPadOS reports "Macintosh" in the UA; Macintosh + multi-touch is iPad
 * - Firefox-iOS (FxiOS) gets "open in Safari" copy; Safari/Chrome-iOS keep
 *   the direct share-sheet instructions
 * - both show-prompt timers are cleared on unmount
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { PWAInstallPrompt } from "./PWAInstallPrompt";
import { usePwaPromptStore } from "@/stores/pwaPromptStore";

const IOS_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// iPadOS 13+ with desktop-class browsing: indistinguishable from a Mac by UA
const MACINTOSH_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const FXIOS_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/120.0 Mobile/15E148 Safari/605.1.15";

const CRIOS_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";

const ANDROID_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, "userAgent", { value, configurable: true });
}

function setMaxTouchPoints(value: number) {
  Object.defineProperty(window.navigator, "maxTouchPoints", { value, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  usePwaPromptStore.setState({ updatePending: false });
  // defineProperty persists across tests in this file; reset to a
  // non-touch default so each test opts in explicitly
  setMaxTouchPoints(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PWAInstallPrompt (iOS path + update-pending suppression)", () => {
  beforeEach(() => {
    // Component reads navigator.userAgent at mount to pick the iOS branch
    setUserAgent(IOS_USER_AGENT);
  });

  it("shows the iOS install card after the 3s delay", () => {
    render(<PWAInstallPrompt />);

    expect(screen.queryByText("Install Household Hub")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Install Household Hub")).toBeInTheDocument();
  });

  it("anchors the install card above the bottom tab bar via --bottom-chrome (R42)", () => {
    const { container } = render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // The card is z-50 and would cover the z-40 tab bar if it were still
    // offset by the safe area alone.
    const card = container.querySelector(".fixed");
    expect(card).not.toBeNull();
    expect(card!.className).toContain("bottom-[calc(1rem+var(--bottom-chrome))]");
    expect(card!.className).not.toContain("bottom-[calc(1rem+var(--safe-area-bottom))]");
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

describe("PWAInstallPrompt (iPad detection, item 8.3a)", () => {
  it("treats Macintosh UA with multi-touch as iPadOS and shows the iOS card", () => {
    setUserAgent(MACINTOSH_USER_AGENT);
    setMaxTouchPoints(5);
    render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Install Household Hub")).toBeInTheDocument();
    // The iOS instruction card, not the Chromium install card
    expect(screen.getByText("Add to your home screen")).toBeInTheDocument();
  });

  it("does not treat a real Mac (no touch points) as iOS", () => {
    setUserAgent(MACINTOSH_USER_AGENT);
    setMaxTouchPoints(0);
    render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // No iOS timer fires; the Chromium card would need beforeinstallprompt
    expect(screen.queryByText("Install Household Hub")).not.toBeInTheDocument();
  });
});

describe("PWAInstallPrompt (Firefox-iOS copy, item 8.3b)", () => {
  it("shows open-in-Safari instructions on Firefox-iOS", () => {
    setUserAgent(FXIOS_USER_AGENT);
    render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Install Household Hub")).toBeInTheDocument();
    expect(screen.getByText(/Open this page in/)).toBeInTheDocument();
  });

  it("keeps the direct share-sheet copy on iOS Safari", () => {
    setUserAgent(IOS_USER_AGENT);
    render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Install Household Hub")).toBeInTheDocument();
    expect(screen.queryByText(/Open this page in/)).not.toBeInTheDocument();
  });

  it("keeps the direct share-sheet copy on Chrome-iOS (Add to Home Screen since 16.4)", () => {
    setUserAgent(CRIOS_USER_AGENT);
    render(<PWAInstallPrompt />);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByText("Install Household Hub")).toBeInTheDocument();
    expect(screen.queryByText(/Open this page in/)).not.toBeInTheDocument();
  });
});

describe("PWAInstallPrompt (timer cleanup, item 8.3c)", () => {
  it("clears the pending iOS show-prompt timer on unmount", () => {
    setUserAgent(IOS_USER_AGENT);
    const { unmount } = render(<PWAInstallPrompt />);

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the pending beforeinstallprompt timer on unmount", () => {
    setUserAgent(ANDROID_USER_AGENT);
    const { unmount } = render(<PWAInstallPrompt />);

    expect(vi.getTimerCount()).toBe(0);

    act(() => {
      window.dispatchEvent(new Event("beforeinstallprompt"));
    });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
