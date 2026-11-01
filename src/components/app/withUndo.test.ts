import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { changeWithUndo } from "./withUndo";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("changeWithUndo", () => {
  it("keeps the Undo toast up for 10 seconds", async () => {
    const undo = vi.fn(() => Promise.resolve());
    await changeWithUndo({
      change: () => Promise.resolve(),
      undo,
      done: "Removed Lunch",
      failed: "Couldn't remove Lunch.",
      undoFailed: "Couldn't restore Lunch.",
    });

    const [message, options] = vi.mocked(toast.success).mock.calls[0] ?? [];
    expect(message).toBe("Removed Lunch");
    expect(options?.duration).toBe(10_000);
    const action = options?.action as { label: string; onClick: () => void } | undefined;
    expect(action?.label).toBe("Undo");
    action?.onClick();
    expect(undo).toHaveBeenCalledOnce();
  });
});
