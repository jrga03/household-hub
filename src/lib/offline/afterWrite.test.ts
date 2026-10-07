import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { syncProcessor } from "@/lib/sync/processor";
import { keysAfterWrite } from "@/lib/query-keys";
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

  it("invalidates the entity's keys now, drains when online, then again", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.mocked(syncProcessor.processQueue).mockResolvedValue({
      synced: 1,
      failed: 0,
      terminalFailures: 0,
    });

    const keys = keysAfterWrite("account");

    afterOutboxWrite(queryClient, "user-1", "account");

    for (const queryKey of keys) expect(invalidate).toHaveBeenCalledWith({ queryKey });
    expect(syncProcessor.processQueue).toHaveBeenCalledWith("user-1");
    await vi.waitFor(() => expect(invalidate).toHaveBeenCalledTimes(keys.length * 2));
  });

  it("skips the drain offline or without a user", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    afterOutboxWrite(queryClient, "user-1", "budget");
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    afterOutboxWrite(queryClient, undefined, "budget");

    expect(syncProcessor.processQueue).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledTimes(keysAfterWrite("budget").length * 2);
  });

  it("swallows a failed drain", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    vi.mocked(syncProcessor.processQueue).mockRejectedValue(new Error("network"));

    expect(() => afterOutboxWrite(queryClient, "user-1", "account")).not.toThrow();
    await vi.waitFor(() => expect(syncProcessor.processQueue).toHaveBeenCalled());
  });
});
