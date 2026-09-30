import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/authStore";
import { createOfflineAccount, updateOfflineAccount } from "@/lib/offline/accounts";
import { createOfflineCategory, updateOfflineCategory } from "@/lib/offline/categories";
import {
  updateOfflineTransaction,
  deleteOfflineTransaction,
  updateOfflineTransactionsStatus,
} from "@/lib/offline/transactions";
import { ensureLocalRow } from "@/lib/offline/ensureLocal";
import {
  useCreateAccount,
  useCreateCategory,
  useUpdateAccount,
  useUpdateCategory,
  useUpdateTransaction,
  useDeleteTransaction,
  useSetTransactionStatus,
  useToggleTransactionStatus,
} from "@/lib/supabaseQueries";

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/sync/processor", () => ({
  syncProcessor: { processQueue: vi.fn().mockResolvedValue({}) },
}));
vi.mock("@/lib/offline/accounts", () => ({
  createOfflineAccount: vi.fn(),
  updateOfflineAccount: vi.fn(),
}));
vi.mock("@/lib/offline/categories", () => ({
  createOfflineCategory: vi.fn(),
  updateOfflineCategory: vi.fn(),
}));
vi.mock("@/lib/offline/transactions", () => ({
  updateOfflineTransaction: vi.fn(),
  deleteOfflineTransaction: vi.fn(),
  updateOfflineTransactionsStatus: vi.fn(),
}));
vi.mock("@/lib/offline/ensureLocal", () => ({ ensureLocalRow: vi.fn() }));

function renderWithClient<T>(hook: () => T) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(hook, { wrapper });
}

const ok = { success: true, data: { id: "x" }, isTemporary: true } as never;

describe("account and category write hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: "user-1" } as User });
  });

  it("creates and updates accounts through the outbox, never Supabase", async () => {
    vi.mocked(createOfflineAccount).mockResolvedValue(ok);
    vi.mocked(updateOfflineAccount).mockResolvedValue(ok);
    const input = {
      name: "GCash",
      type: "e-wallet" as const,
      visibility: "household" as const,
      initial_balance_cents: 0,
    };

    await renderWithClient(() => useCreateAccount()).result.current.mutateAsync(input);
    await renderWithClient(() => useUpdateAccount()).result.current.mutateAsync({
      id: "acc-1",
      updates: { name: "G" },
    });

    expect(createOfflineAccount).toHaveBeenCalledWith(input, "user-1");
    expect(updateOfflineAccount).toHaveBeenCalledWith("acc-1", { name: "G" }, "user-1");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("creates and updates categories through the outbox, never Supabase", async () => {
    vi.mocked(createOfflineCategory).mockResolvedValue(ok);
    vi.mocked(updateOfflineCategory).mockResolvedValue(ok);

    await renderWithClient(() => useCreateCategory()).result.current.mutateAsync({ name: "Food" });
    await renderWithClient(() => useUpdateCategory()).result.current.mutateAsync({
      id: "cat-1",
      updates: { name: "Meals" },
    });

    expect(createOfflineCategory).toHaveBeenCalledWith({ name: "Food" }, "user-1");
    expect(updateOfflineCategory).toHaveBeenCalledWith("cat-1", { name: "Meals" }, "user-1");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects with the outbox error", async () => {
    vi.mocked(createOfflineAccount).mockResolvedValue({
      success: false,
      error: "disk full",
      isTemporary: false,
    });
    const { result } = renderWithClient(() => useCreateAccount());
    await expect(
      result.current.mutateAsync({
        name: "A",
        type: "bank",
        visibility: "household",
        initial_balance_cents: 0,
      })
    ).rejects.toThrow("disk full");
  });
});

describe("transaction write hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: "user-1" } as User });
    vi.mocked(updateOfflineTransaction).mockResolvedValue(ok);
    vi.mocked(deleteOfflineTransaction).mockResolvedValue({ success: true, isTemporary: true });
    vi.mocked(updateOfflineTransactionsStatus).mockResolvedValue(ok);
  });

  it("update, delete, and bulk status go through the outbox", async () => {
    await renderWithClient(() => useUpdateTransaction()).result.current.mutateAsync({
      id: "t1",
      updates: { description: "New" },
    });
    await renderWithClient(() => useDeleteTransaction()).result.current.mutateAsync("t2");
    const status = await renderWithClient(() =>
      useSetTransactionStatus()
    ).result.current.mutateAsync({ ids: ["t3", "t4"], status: "cleared" });

    expect(updateOfflineTransaction).toHaveBeenCalledWith("t1", { description: "New" }, "user-1");
    expect(deleteOfflineTransaction).toHaveBeenCalledWith("t2", "user-1");
    expect(updateOfflineTransactionsStatus).toHaveBeenCalledWith(["t3", "t4"], "cleared", "user-1");
    expect(status).toBe("cleared");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("toggle flips the local status", async () => {
    vi.mocked(ensureLocalRow).mockResolvedValue({ id: "t5", status: "pending" } as never);
    const newStatus = await renderWithClient(() =>
      useToggleTransactionStatus()
    ).result.current.mutateAsync("t5");

    expect(updateOfflineTransaction).toHaveBeenCalledWith("t5", { status: "cleared" }, "user-1");
    expect(newStatus).toBe("cleared");
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
