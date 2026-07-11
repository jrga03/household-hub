/**
 * Tests for UpdatePrompt's persistent-toast behavior (mobile UX review R7):
 * - no fixed-position card; the update is surfaced through one persistent
 *   sonner toast (duration: Infinity) with a Reload action
 * - the toast fires once per waiting service worker, not per render
 * - the pending flag is mirrored into pwaPromptStore so PWAInstallPrompt can
 *   suppress its install card while an update is waiting
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { UpdatePrompt } from "./UpdatePrompt";
import { usePwaPromptStore } from "@/stores/pwaPromptStore";

const { toastMock, toastDismissMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
  toastDismissMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(toastMock, { dismiss: toastDismissMock }),
}));

interface ServiceWorkerHook {
  needRefresh: boolean;
  update: () => Promise<void>;
  dismiss: () => void;
  isOffline: boolean;
}

const updateMock = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const dismissMock = vi.fn();
const mockUseServiceWorker = vi.fn(
  (): ServiceWorkerHook => ({
    needRefresh: false,
    update: updateMock,
    dismiss: dismissMock,
    isOffline: false,
  })
);

vi.mock("@/hooks/useServiceWorker", () => ({
  useServiceWorker: () => mockUseServiceWorker(),
}));

/** Shape of the options UpdatePrompt passes to sonner's toast() */
interface UpdateToastOptions {
  id: string;
  duration: number;
  closeButton: boolean;
  description: string;
  action: { label: string; onClick: () => void };
  onDismiss: () => void;
}

function setNeedRefresh(needRefresh: boolean) {
  mockUseServiceWorker.mockImplementation(() => ({
    needRefresh,
    update: updateMock,
    dismiss: dismissMock,
    isOffline: false,
  }));
}

function lastToastOptions(): UpdateToastOptions {
  const call = toastMock.mock.calls.at(-1) as [string, UpdateToastOptions];
  return call[1];
}

describe("UpdatePrompt (persistent update toast)", () => {
  beforeEach(() => {
    usePwaPromptStore.setState({ updatePending: false });
    setNeedRefresh(false);
  });

  it("renders nothing and fires no toast when no update is waiting", () => {
    const { container } = render(<UpdatePrompt />);

    expect(container).toBeEmptyDOMElement();
    expect(toastMock).not.toHaveBeenCalled();
    expect(usePwaPromptStore.getState().updatePending).toBe(false);
  });

  it("fires ONE persistent toast with a Reload action when an update is waiting", () => {
    setNeedRefresh(true);
    render(<UpdatePrompt />);

    expect(toastMock).toHaveBeenCalledTimes(1);
    const [message, options] = toastMock.mock.calls[0] as [string, UpdateToastOptions];
    expect(message).toBe("Update available");
    expect(options.duration).toBe(Infinity);
    expect(options.closeButton).toBe(true);
    expect(options.action.label).toBe("Reload");
  });

  it("does not re-fire the toast on re-renders while the same worker is waiting", () => {
    setNeedRefresh(true);
    const { rerender } = render(<UpdatePrompt />);

    rerender(<UpdatePrompt />);
    rerender(<UpdatePrompt />);

    expect(toastMock).toHaveBeenCalledTimes(1);
  });

  it("wires the Reload action to the service worker update", () => {
    setNeedRefresh(true);
    render(<UpdatePrompt />);

    lastToastOptions().action.onClick();

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("clears the waiting flag when the toast is dismissed", () => {
    setNeedRefresh(true);
    render(<UpdatePrompt />);

    lastToastOptions().onDismiss();

    expect(dismissMock).toHaveBeenCalledTimes(1);
  });

  it("mirrors the pending state into pwaPromptStore and retracts the toast when cleared", () => {
    setNeedRefresh(true);
    const { rerender } = render(<UpdatePrompt />);
    expect(usePwaPromptStore.getState().updatePending).toBe(true);

    setNeedRefresh(false);
    rerender(<UpdatePrompt />);

    expect(usePwaPromptStore.getState().updatePending).toBe(false);
    expect(toastDismissMock).toHaveBeenCalledWith("sw-update-available");
  });
});
