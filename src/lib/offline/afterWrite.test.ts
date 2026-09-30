import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { syncProcessor } from "@/lib/sync/processor";
import { afterOutboxWrite } from "./afterWrite";

vi.mock("@/lib/sync/processor", () => ({ syncProcessor: { processQueue: vi.fn() } }));

describe("afterOutboxWrite", () => {
  let queryClient: QueryClient;
  let invalidate: MockInstance<QueryClient["invalidateQueries"]>;

  beforeEach(() => {
    queryClient = new QueryClient();
    invalidate = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue();
    vi.mocked(syncProcessor.processQueue).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("invalidates now, drains when online, then invalidates again", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.mocked(syncProcessor.processQueue).mockResolvedValue({
      synced: 1,
      failed: 0,
      terminalFailures: 0,
    });

    afterOutboxWrite(queryClient, "user-1", [["accounts"], ["transactions"]]);

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["accounts"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["transactions"] });
    expect(syncProcessor.processQueue).toHaveBeenCalledWith("user-1");
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
  });

  it("skips the drain offline or without a user", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    afterOutboxWrite(queryClient, "user-1", [["accounts"]]);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    afterOutboxWrite(queryClient, undefined, [["accounts"]]);

    expect(syncProcessor.processQueue).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it("swallows a failed drain", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.mocked(syncProcessor.processQueue).mockRejectedValue(new Error("network"));

    expect(() => afterOutboxWrite(queryClient, "user-1", [["accounts"]])).not.toThrow();
    await vi.waitFor(() => expect(syncProcessor.processQueue).toHaveBeenCalled());
  });
});
