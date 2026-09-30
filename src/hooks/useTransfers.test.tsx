import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCreateTransfer } from "./useTransfers";
import { createOfflineTransfer } from "@/lib/offline/transfers";
import { supabase } from "@/lib/supabase";

vi.mock("@/lib/offline/transfers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/transfers")>()),
  createOfflineTransfer: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));

const transfer = {
  from_account_id: "acc-from",
  to_account_id: "acc-to",
  from_account_name: "Checking",
  to_account_name: "Savings",
  amount_cents: 250000,
  date: "2026-09-30",
  description: "Rent float",
};

function renderCreateTransfer() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useCreateTransfer(), { wrapper });
}

describe("useCreateTransfer", () => {
  beforeEach(() => {
    vi.mocked(createOfflineTransfer).mockReset();
    vi.mocked(supabase.from).mockReset();
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
});
