import { describe, it, expect, vi, beforeEach } from "vitest";

const signOutMock = vi.fn();

vi.mock("@/stores/authStore", () => ({
  useAuthStore: {
    getState: () => ({ signOut: signOutMock }),
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/lib/sync", () => ({ syncBeforeSignOut: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/events/log", () => ({ listEventsNotPushed: vi.fn() }));
vi.mock("@/lib/confirm", () => ({ confirmWithOutcome: vi.fn() }));
vi.mock("@/lib/utils/download", () => ({ downloadJson: vi.fn() }));
vi.mock("@/lib/import/drafts", () => ({ countDrafts: vi.fn() }));

import { signOutWithToast } from "../sign-out";
import { toast } from "sonner";
import { syncBeforeSignOut } from "@/lib/sync";
import { listEventsNotPushed, type StoredEvent } from "@/lib/events/log";
import { confirmWithOutcome } from "@/lib/confirm";
import { downloadJson } from "@/lib/utils/download";
import { countDrafts } from "@/lib/import/drafts";

const UNPUSHED = [
  { id: "event-1", pushState: "waiting" },
  { id: "event-2", pushState: "stuck" },
];

beforeEach(() => {
  vi.clearAllMocks();
  signOutMock.mockResolvedValue(undefined);
  vi.mocked(listEventsNotPushed).mockResolvedValue([]);
  vi.mocked(countDrafts).mockResolvedValue(0);
});

const withUnpushed = () =>
  vi.mocked(listEventsNotPushed).mockResolvedValue(UNPUSHED as StoredEvent[]);

describe("signOutWithToast", () => {
  it("signs out without asking once everything has synced", async () => {
    await signOutWithToast();

    expect(syncBeforeSignOut).toHaveBeenCalledOnce();
    expect(confirmWithOutcome).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("warns about unpushed changes, offering export, sign out anyway, and cancel", async () => {
    withUnpushed();
    vi.mocked(confirmWithOutcome).mockResolvedValue("cancel");

    await signOutWithToast();

    expect(confirmWithOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("2 changes"),
        confirmLabel: "Export and sign out",
        alternativeLabel: "Sign out anyway",
        cancelLabel: "Cancel",
      })
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("stays signed in when the warning is dismissed", async () => {
    withUnpushed();
    vi.mocked(confirmWithOutcome).mockResolvedValue("dismiss");

    await signOutWithToast();

    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("downloads the unpushed changes as JSON, then signs out", async () => {
    withUnpushed();
    vi.mocked(confirmWithOutcome).mockResolvedValue("confirm");

    await signOutWithToast();

    expect(downloadJson).toHaveBeenCalledWith(
      expect.stringMatching(/^household-hub-unsynced-.*\.json$/),
      expect.objectContaining({ events: UNPUSHED })
    );
    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it("signs out without exporting when asked to sign out anyway", async () => {
    withUnpushed();
    vi.mocked(confirmWithOutcome).mockResolvedValue("alternative");

    await signOutWithToast();

    expect(downloadJson).not.toHaveBeenCalled();
    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it("warns about unsaved drafts, which can't be exported", async () => {
    vi.mocked(countDrafts).mockResolvedValue(3);
    vi.mocked(confirmWithOutcome).mockResolvedValue("cancel");

    await signOutWithToast();

    expect(confirmWithOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining("3 unsaved drafts"),
        confirmLabel: "Sign out anyway",
        cancelLabel: "Cancel",
      })
    );
    expect(confirmWithOutcome).toHaveBeenCalledWith(
      expect.not.objectContaining({ alternativeLabel: expect.anything() })
    );
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("counts unsaved drafts beside unsynced changes", async () => {
    withUnpushed();
    vi.mocked(countDrafts).mockResolvedValue(1);
    vi.mocked(confirmWithOutcome).mockResolvedValue("alternative");

    await signOutWithToast();

    expect(confirmWithOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringMatching(/2 changes.*1 unsaved draft\b/s),
        confirmLabel: "Export and sign out",
      })
    );
    expect(signOutMock).toHaveBeenCalledOnce();
  });

  it("shows the error as a toast when sign-out fails", async () => {
    signOutMock.mockRejectedValue(new Error("network down"));

    await signOutWithToast();

    expect(toast.error).toHaveBeenCalledWith("network down");
  });
});
