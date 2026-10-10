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

import { signOutWithToast } from "../sign-out";
import { toast } from "sonner";

beforeEach(() => {
  signOutMock.mockReset();
  vi.mocked(toast.error).mockClear();
});

describe("signOutWithToast", () => {
  it("signs out", async () => {
    signOutMock.mockResolvedValue(undefined);

    await signOutWithToast();

    expect(signOutMock).toHaveBeenCalledOnce();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows the error as a toast when sign-out fails", async () => {
    signOutMock.mockRejectedValue(new Error("network down"));

    await signOutWithToast();

    expect(toast.error).toHaveBeenCalledWith("network down");
  });
});
