import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCreateTransfer } from "./useTransfers";
import { createOfflineTransfer } from "@/lib/offline/transfers";
import { supabase } from "@/lib/supabase";
import { syncProcessor } from "@/lib/sync/processor";
import { cents } from "@/test/cents";
import { keysAfterWrite } from "@/lib/query-keys";

vi.mock("@/lib/offline/transfers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/transfers")>()),
  createOfflineTransfer: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/sync/processor", () => ({
  syncProcessor: { processQueue: vi.fn() },
}));

const transfer = {
  from_account_id: "acc-from",
  to_account_id: "acc-to",
  from_account_name: "Checking",
  to_account_name: "Savings",
  amount_cents: cents(250000),
  date: "2026-09-30",
  description: "Rent float",
};

function renderCreateTransfer() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { ...renderHook(() => useCreateTransfer(), { wrapper }), queryClient };
}

/** Override the jsdom Navigator.prototype.onLine getter for one test. */
function setNavigatorOnLine(onLine: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value: onLine,
    configurable: true,
  });
}

describe("useCreateTransfer", () => {
  beforeEach(() => {
    vi.mocked(createOfflineTransfer).mockReset();
    vi.mocked(supabase.from).mockReset();
    vi.mocked(syncProcessor.processQueue).mockReset().mockResolvedValue({
      synced: 0,
      failed: 0,
      terminalFailures: 0,
    });
    setNavigatorOnLine(true);
  });

  afterEach(() => {
    Reflect.deleteProperty(window.navigator, "onLine");
  });

  it("creates the transfer through the outbox, never the Supabase client", async () => {
    vi.mocked(createOfflineTransfer).mockResolvedValue({
      success: true,
      data: [],
      isTemporary: true,
    });
    const { result } = renderCreateTransfer();

    await result.current.mutateAsync({ ...transfer, user_id: "user-1" });

    expect(createOfflineTransfer).toHaveBeenCalledWith(transfer, "user-1");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects when the outbox write fails", async () => {
    vi.mocked(createOfflineTransfer).mockResolvedValue({
      success: false,
      error: "Cannot transfer to the same account",
      isTemporary: false,
    });
    const { result } = renderCreateTransfer();

    await expect(result.current.mutateAsync({ ...transfer, user_id: "user-1" })).rejects.toThrow(
      "Cannot transfer to the same account"
    );
  });

  it("invalidates what a transaction write affects on success", async () => {
    vi.mocked(createOfflineTransfer).mockResolvedValue({
      success: true,
      data: [],
      isTemporary: true,
    });
    const { result, queryClient } = renderCreateTransfer();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await result.current.mutateAsync({ ...transfer, user_id: "user-1" });

    for (const queryKey of keysAfterWrite("transaction")) {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey });
    }
  });

  it("drains the outbox and re-invalidates transfers when online", async () => {
    vi.mocked(createOfflineTransfer).mockResolvedValue({
      success: true,
      data: [],
      isTemporary: true,
    });
    const { result } = renderCreateTransfer();

    await result.current.mutateAsync({ ...transfer, user_id: "user-1" });

    await waitFor(() => {
      expect(syncProcessor.processQueue).toHaveBeenCalledWith("user-1");
    });
  });

  it("does not drain the outbox when offline", async () => {
    setNavigatorOnLine(false);
    vi.mocked(createOfflineTransfer).mockResolvedValue({
      success: true,
      data: [],
      isTemporary: true,
    });
    const { result } = renderCreateTransfer();

    await result.current.mutateAsync({ ...transfer, user_id: "user-1" });

    expect(syncProcessor.processQueue).not.toHaveBeenCalled();
  });

  it("swallows a failed outbox drain instead of rejecting", async () => {
    vi.mocked(createOfflineTransfer).mockResolvedValue({
      success: true,
      data: [],
      isTemporary: true,
    });
    vi.mocked(syncProcessor.processQueue).mockRejectedValue(new Error("network down"));
    const { result } = renderCreateTransfer();

    await expect(
      result.current.mutateAsync({ ...transfer, user_id: "user-1" })
    ).resolves.not.toThrow();

    await waitFor(() => {
      expect(syncProcessor.processQueue).toHaveBeenCalledWith("user-1");
    });
  });
});
