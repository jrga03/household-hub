/**
 * Tests for SyncIssuesPanel's mobile fixes (mobile UX review R28):
 * - width clamp: expanded panel is
 *   w-[min(24rem,calc(100vw-2rem-var(--safe-area-right)))], never a fixed
 *   w-96 that clips its left edge at 375px — the safe-area term keeps the
 *   right-anchored panel from clipping again on a notched phone in landscape
 * - collapsed badge slot is lifted above the FAB zone on phones
 *   (bottom 5.5rem + safe area below md, back to 1rem at md+)
 * - header/row/footer controls are shadcn Buttons (data-slot="button") so
 *   they inherit the coarse-pointer 44px floor, with aria-labels
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SyncIssuesPanel } from "./SyncIssuesPanel";
import { useSyncIssuesStore, type SyncIssue } from "@/stores/syncIssuesStore";

const { retrySyncMock, dismissIssueMock, clearAllMock } = vi.hoisted(() => ({
  retrySyncMock: vi.fn(() => Promise.resolve()),
  dismissIssueMock: vi.fn(() => Promise.resolve()),
  clearAllMock: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/sync/SyncIssuesManager", () => ({
  syncIssuesManager: {
    retrySync: retrySyncMock,
    dismissIssue: dismissIssueMock,
    clearAll: clearAllMock,
  },
}));

function buildIssue(overrides: Partial<SyncIssue> = {}): SyncIssue {
  return {
    id: "issue-1",
    entityType: "transaction",
    entityId: "txn-1",
    issueType: "sync-failed",
    message: "Network error while syncing",
    timestamp: new Date().toISOString(),
    canRetry: true,
    ...overrides,
  };
}

describe("SyncIssuesPanel (width clamp, badge position, touch targets)", () => {
  beforeEach(() => {
    useSyncIssuesStore.setState({ issues: [] });
  });

  it("renders nothing when there are no issues", () => {
    const { container } = render(<SyncIssuesPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lifts the slot above the FAB zone on phones, back down at md+", () => {
    useSyncIssuesStore.setState({ issues: [buildIssue()] });
    const { container } = render(<SyncIssuesPanel />);

    const slot = container.firstChild as HTMLElement;
    expect(slot.className).toContain("bottom-[calc(5.5rem+var(--safe-area-bottom))]");
    expect(slot.className).toContain("md:bottom-[calc(1rem+var(--safe-area-bottom))]");
    expect(slot.className).toContain("right-[calc(1rem+var(--safe-area-right))]");
  });

  it("collapsed badge is a shadcn Button with a descriptive aria-label", () => {
    useSyncIssuesStore.setState({ issues: [buildIssue(), buildIssue({ id: "issue-2" })] });
    render(<SyncIssuesPanel />);

    const badge = screen.getByLabelText("2 sync issues. Click to expand.");
    expect(badge).toHaveAttribute("data-slot", "button");
  });

  it("expanded panel uses the viewport- and safe-area-aware width clamp, not w-96", () => {
    useSyncIssuesStore.setState({ issues: [buildIssue()] });
    const { container } = render(<SyncIssuesPanel />);

    fireEvent.click(screen.getByLabelText("1 sync issue. Click to expand."));

    const panel = container.querySelector('[class*="w-[min(24rem"]');
    expect(panel).not.toBeNull();
    expect(panel?.className).toContain("w-[min(24rem,calc(100vw-2rem-var(--safe-area-right)))]");
    expect(container.querySelector('[class*="w-96"]')).toBeNull();
  });

  it("header close, Clear All, and row controls are shadcn Buttons with aria-labels", async () => {
    useSyncIssuesStore.setState({ issues: [buildIssue()] });
    render(<SyncIssuesPanel />);

    fireEvent.click(screen.getByLabelText("1 sync issue. Click to expand."));

    const closeButton = screen.getByLabelText("Close sync issues panel");
    const clearAllButton = screen.getByLabelText("Clear all sync issues");
    const retryButton = screen.getByLabelText("Retry sync");
    const dismissButton = screen.getByLabelText("Dismiss issue");

    for (const button of [closeButton, clearAllButton, retryButton, dismissButton]) {
      expect(button).toHaveAttribute("data-slot", "button");
    }

    fireEvent.click(clearAllButton);
    expect(clearAllMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(retryButton);
    });
    expect(retrySyncMock).toHaveBeenCalledWith("issue-1");

    await act(async () => {
      fireEvent.click(dismissButton);
    });
    expect(dismissIssueMock).toHaveBeenCalledWith("issue-1");
  });

  it("close button collapses the panel back to the badge", () => {
    useSyncIssuesStore.setState({ issues: [buildIssue()] });
    render(<SyncIssuesPanel />);

    fireEvent.click(screen.getByLabelText("1 sync issue. Click to expand."));
    fireEvent.click(screen.getByLabelText("Close sync issues panel"));

    expect(screen.getByLabelText("1 sync issue. Click to expand.")).toBeInTheDocument();
  });
});
