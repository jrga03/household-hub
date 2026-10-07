import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
  partialMatchKey,
  type QueryKey,
} from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
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
  createOfflineBudget,
  updateOfflineBudget,
  deleteOfflineBudget,
  copyOfflineBudgets,
} from "@/lib/offline/budgets";
import { syncProcessor } from "@/lib/sync/processor";
import {
  useCreateAccount,
  useCreateCategory,
  useUpdateAccount,
  useUpdateCategory,
  useDeleteTransaction,
  useSetTransactionStatus,
  useToggleTransactionStatus,
  useCreateBudget,
  useUpdateBudget,
  useDeleteBudget,
  useCopyBudgets,
} from "@/lib/supabaseQueries";
import { cents } from "@/test/cents";

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
vi.mock("@/lib/offline/budgets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/budgets")>()),
  createOfflineBudget: vi.fn(),
  updateOfflineBudget: vi.fn(),
  deleteOfflineBudget: vi.fn(),
  copyOfflineBudgets: vi.fn(),
}));

function renderWithClient<T>(
  hook: () => T,
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
) {
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
      initial_balance_cents: cents(0),
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
        initial_balance_cents: cents(0),
      })
    ).rejects.toThrow("disk full");
  });
});

describe("duplicate-name check against the query cache", () => {
  const accountInput = {
    name: "bdo",
    type: "bank" as const,
    visibility: "household" as const,
    initial_balance_cents: cents(0),
  };

  function clientWith(queryKey: QueryKey, rows: unknown[]) {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    queryClient.setQueryData(queryKey, rows);
    return queryClient;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: "user-1" } as User });
    vi.mocked(createOfflineAccount).mockResolvedValue(ok);
    vi.mocked(updateOfflineAccount).mockResolvedValue(ok);
    vi.mocked(createOfflineCategory).mockResolvedValue(ok);
    vi.mocked(updateOfflineCategory).mockResolvedValue(ok);
  });

  it("rejects creating an account whose name is already in the cached list", async () => {
    const queryClient = clientWith(queryKeys.accounts.list(), [
      { id: "acc-1", name: "BDO", is_active: true },
    ]);
    const { result } = renderWithClient(() => useCreateAccount(), queryClient);

    await expect(result.current.mutateAsync(accountInput)).rejects.toThrow(
      'An account named "bdo" already exists'
    );
    expect(createOfflineAccount).not.toHaveBeenCalled();
  });

  it("rejects renaming an account onto another cached account's name", async () => {
    const queryClient = clientWith(queryKeys.accounts.list(), [
      { id: "acc-1", name: "BDO", is_active: true },
      { id: "acc-2", name: "BPI", is_active: true },
    ]);
    const { result } = renderWithClient(() => useUpdateAccount(), queryClient);

    await expect(
      result.current.mutateAsync({ id: "acc-2", updates: { name: "bdo" } })
    ).rejects.toThrow('An account named "bdo" already exists');
    expect(updateOfflineAccount).not.toHaveBeenCalled();
  });

  it("lets an account keep its own cached name", async () => {
    const queryClient = clientWith(queryKeys.accounts.list(), [
      { id: "acc-1", name: "BDO", is_active: true },
    ]);
    const { result } = renderWithClient(() => useUpdateAccount(), queryClient);

    await result.current.mutateAsync({ id: "acc-1", updates: { name: "BDO" } });

    expect(updateOfflineAccount).toHaveBeenCalled();
  });

  it("rejects creating a category that duplicates a cached sibling", async () => {
    const queryClient = clientWith(queryKeys.categories.list(), [
      { id: "cat-1", name: "Food", parent_id: null, is_active: true },
    ]);
    const { result } = renderWithClient(() => useCreateCategory(), queryClient);

    await expect(result.current.mutateAsync({ name: "food", parent_id: null })).rejects.toThrow(
      'A category named "food" already exists'
    );
    expect(createOfflineCategory).not.toHaveBeenCalled();
  });

  it("rejects renaming a category onto a cached sibling's name", async () => {
    const queryClient = clientWith(queryKeys.categories.list(), [
      { id: "cat-1", name: "Food", parent_id: null, is_active: true },
      { id: "cat-2", name: "Transport", parent_id: null, is_active: true },
    ]);
    const { result } = renderWithClient(() => useUpdateCategory(), queryClient);

    await expect(
      result.current.mutateAsync({ id: "cat-2", updates: { name: "Food" } })
    ).rejects.toThrow('A category named "Food" already exists');
    expect(updateOfflineCategory).not.toHaveBeenCalled();
  });

  it("allows a cached name under a different parent", async () => {
    const queryClient = clientWith(queryKeys.categories.list(), [
      { id: "cat-1", name: "Other", parent_id: "p-1", is_active: true },
    ]);
    const { result } = renderWithClient(() => useCreateCategory(), queryClient);

    await result.current.mutateAsync({ name: "Other", parent_id: "p-2" });

    expect(createOfflineCategory).toHaveBeenCalled();
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

  it("delete and bulk status go through the outbox", async () => {
    await renderWithClient(() => useDeleteTransaction()).result.current.mutateAsync("t2");
    const status = await renderWithClient(() =>
      useSetTransactionStatus()
    ).result.current.mutateAsync({ ids: ["t3", "t4"], status: "cleared" });

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

    expect(updateOfflineTransactionsStatus).toHaveBeenCalledWith(["t5"], "cleared", "user-1");
    expect(updateOfflineTransaction).not.toHaveBeenCalled();
    expect(newStatus).toBe("cleared");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  const refreshesDetail = (keys: (QueryKey | undefined)[], id: string) =>
    keys.some(
      (key) => key !== undefined && partialMatchKey(queryKeys.transactions.detail(id), key)
    );

  describe("refreshes the detail query after the drain", () => {
    async function invalidatedKeysAfterDrain(run: (queryClient: QueryClient) => Promise<unknown>) {
      let finishDrain: () => void = () => {};
      vi.mocked(syncProcessor.processQueue).mockReturnValue(
        new Promise((resolve) => {
          finishDrain = () => resolve({ synced: 1, failed: 0, terminalFailures: 0 });
        })
      );
      const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");

      await run(queryClient);
      invalidate.mockClear();
      finishDrain();
      await waitFor(() => expect(invalidate).toHaveBeenCalled());
      return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    }

    it("toggle", async () => {
      vi.mocked(ensureLocalRow).mockResolvedValue({ id: "t5", status: "pending" } as never);
      const keys = await invalidatedKeysAfterDrain((queryClient) =>
        renderWithClient(
          () => useToggleTransactionStatus(),
          queryClient
        ).result.current.mutateAsync("t5")
      );
      expect(refreshesDetail(keys, "t5")).toBe(true);
    });

    it("bulk status", async () => {
      const keys = await invalidatedKeysAfterDrain((queryClient) =>
        renderWithClient(() => useSetTransactionStatus(), queryClient).result.current.mutateAsync({
          ids: ["t1"],
          status: "cleared",
        })
      );
      expect(refreshesDetail(keys, "t1")).toBe(true);
    });

    it("delete", async () => {
      const keys = await invalidatedKeysAfterDrain((queryClient) =>
        renderWithClient(() => useDeleteTransaction(), queryClient).result.current.mutateAsync("t2")
      );
      expect(refreshesDetail(keys, "t2")).toBe(true);
    });
  });
});

describe("budget write hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: { id: "user-1" } as User });
    vi.mocked(createOfflineBudget).mockResolvedValue(ok);
    vi.mocked(updateOfflineBudget).mockResolvedValue(ok);
    vi.mocked(deleteOfflineBudget).mockResolvedValue({ success: true, isTemporary: true });
    vi.mocked(copyOfflineBudgets).mockResolvedValue({
      success: true,
      data: [{}, {}] as never,
      isTemporary: true,
    });
  });

  it("create, update, delete, and copy go through the outbox, never Supabase", async () => {
    const month = new Date(2026, 9, 1);
    await renderWithClient(() => useCreateBudget()).result.current.mutateAsync({
      categoryId: "c1",
      month,
      amountCents: cents(5000),
    });
    await renderWithClient(() => useUpdateBudget()).result.current.mutateAsync({
      id: "b1",
      amountCents: cents(6000),
    });
    await renderWithClient(() => useDeleteBudget()).result.current.mutateAsync("b2");
    const count = await renderWithClient(() => useCopyBudgets()).result.current.mutateAsync({
      fromMonth: new Date(2026, 8, 1),
      toMonth: month,
    });

    expect(createOfflineBudget).toHaveBeenCalledWith(
      { categoryId: "c1", month, amountCents: 5000 },
      "user-1"
    );
    expect(updateOfflineBudget).toHaveBeenCalledWith("b1", 6000, "user-1");
    expect(deleteOfflineBudget).toHaveBeenCalledWith("b2", "user-1");
    expect(copyOfflineBudgets).toHaveBeenCalledWith(new Date(2026, 8, 1), month, "user-1");
    expect(count).toBe(2);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("surfaces the copy error message", async () => {
    vi.mocked(copyOfflineBudgets).mockResolvedValue({
      success: false,
      error: "No budgets found for previous month",
      isTemporary: false,
    });
    const { result } = renderWithClient(() => useCopyBudgets());
    await expect(
      result.current.mutateAsync({ fromMonth: new Date(2026, 8, 1), toMonth: new Date(2026, 9, 1) })
    ).rejects.toThrow("No budgets found for previous month");
  });
});
