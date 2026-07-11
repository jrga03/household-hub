/**
 * Tests for the component-layer sign-out flow (review R39): the unsynced-data
 * confirm was lifted out of authStore into signOutWithConfirm, which asks via
 * the app-level AlertDialog and passes the decision to signOut({ exportFirst }).
 *
 * Three outcomes (data-safety): "Export & sign out" → export + sign out;
 * "Sign out without export" → sign out; Escape/dismiss → ABORT, stay signed
 * in — dismissal must never mean "sign out without export".
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const signOutMock = vi.fn();

vi.mock("@/lib/confirm", () => ({
  confirm: vi.fn(),
  confirmWithOutcome: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({ signOut: signOutMock }),
  },
  checkUnsyncedData: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

import { signOutWithConfirm } from "../sign-out";
import { confirmWithOutcome } from "@/lib/confirm";
import { checkUnsyncedData } from "@/stores/authStore";
import { toast } from "sonner";

const confirmMock = vi.mocked(confirmWithOutcome);

beforeEach(() => {
  vi.mocked(checkUnsyncedData).mockResolvedValue(false);
  confirmMock.mockResolvedValue("dismiss");
  signOutMock.mockClear();
  signOutMock.mockResolvedValue(undefined);
});

describe("signOutWithConfirm", () => {
  it("signs out without prompting when there is nothing unsynced", async () => {
    await signOutWithConfirm();

    expect(confirmMock).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledWith({ exportFirst: false });
  });

  it("asks to export and passes exportFirst=true when the user picks Export & sign out", async () => {
    vi.mocked(checkUnsyncedData).mockResolvedValue(true);
    confirmMock.mockResolvedValue("confirm");

    await signOutWithConfirm();

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "You have unsynced changes",
        confirmLabel: "Export & sign out",
        cancelLabel: "Sign out without export",
      })
    );
    expect(signOutMock).toHaveBeenCalledWith({ exportFirst: true });
  });

  it("signs out without export when the user explicitly picks Sign out without export", async () => {
    vi.mocked(checkUnsyncedData).mockResolvedValue(true);
    confirmMock.mockResolvedValue("cancel");

    await signOutWithConfirm();

    expect(signOutMock).toHaveBeenCalledWith({ exportFirst: false });
  });

  it("aborts the sign-out entirely when the dialog is dismissed (Escape)", async () => {
    vi.mocked(checkUnsyncedData).mockResolvedValue(true);
    confirmMock.mockResolvedValue("dismiss");

    await signOutWithConfirm();

    expect(signOutMock).not.toHaveBeenCalled();
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });

  it("surfaces a sign-out failure (e.g. aborted export) as a toast", async () => {
    signOutMock.mockRejectedValue(new Error("Export failed. Please try manual export."));

    await signOutWithConfirm();

    expect(toast.error).toHaveBeenCalledWith("Export failed. Please try manual export.");
  });
});
