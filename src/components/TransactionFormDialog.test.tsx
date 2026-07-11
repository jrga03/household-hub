/**
 * Tests for the reworked TransactionFormDialog (mobile UX review R5, R27):
 * - shell selection: bottom Sheet on mobile, centered Dialog on desktop
 * - field order: Amount is the first field (and first focusable)
 * - "More options" disclosure hides low-frequency sections by default,
 *   reveals on toggle, and auto-expands when an edited transaction has
 *   non-default values in the collapsed sections
 * - offline saves toast "saved on this device" instead of the online copy
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { toast } from "sonner";
import { TransactionFormDialog } from "./TransactionFormDialog";
import { createOfflineTransaction, updateOfflineTransaction } from "@/lib/offline/transactions";
import type { TransactionWithRelations } from "@/types/transactions";

// Radix Select measures its trigger via ResizeObserver, which jsdom lacks
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof globalThis.ResizeObserver;

const mockUseTransaction = vi.fn();
const mockIsMobile = vi.fn(() => false);

vi.mock("@/hooks/useMediaQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useMediaQuery")>();
  return { ...actual, useIsMobile: () => mockIsMobile() };
});

vi.mock("@/lib/supabaseQueries", () => ({
  useAccounts: () => ({ data: [] }),
  useCategoriesGrouped: () => ({ data: [], isLoading: false }),
  useUpdateTransaction: () => ({ mutateAsync: vi.fn() }),
  useTransaction: (id: string) => mockUseTransaction(id),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/debts", () => ({
  calculateDebtBalance: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/debts/crud", () => ({
  listDebts: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/offline/transactions", () => ({
  createOfflineTransaction: vi.fn(),
  updateOfflineTransaction: vi.fn(),
}));

vi.mock("@/lib/sync/processor", () => ({
  syncProcessor: { processQueue: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

/** Override the jsdom Navigator.prototype.onLine getter for one test. */
function setNavigatorOnLine(onLine: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    value: onLine,
    configurable: true,
  });
}

/**
 * The dialog now calls TanStack Router's useBlocker (dirty-form guard, R37),
 * so it must render inside a RouterProvider. Browser history (not memory) is
 * required: createMemoryHistory provides no blocker registry, so history.block
 * — and therefore useBlocker — is a silent no-op on it.
 */
let activeHistory: ReturnType<typeof createBrowserHistory> | undefined;

async function renderDialog(props: Partial<Parameters<typeof TransactionFormDialog>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <TransactionFormDialog open onClose={() => {}} {...props} />
        <Outlet />
      </>
    ),
  });
  const homeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <div data-testid="home" />,
  });
  const awayRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/away",
    component: () => <div data-testid="away" />,
  });
  activeHistory = createBrowserHistory();
  const router = createRouter({
    routeTree: rootRoute.addChildren([homeRoute, awayRoute]),
    history: activeHistory,
  });
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  // Wait for the router to mount the tree (initial load is async)
  await screen.findByText(props.editingId ? "Edit Transaction" : "New Transaction");
  return { ...utils, router };
}

function buildTransaction(overrides: Partial<TransactionWithRelations>): TransactionWithRelations {
  return {
    id: "txn-1",
    household_id: "hh-1",
    date: "2026-07-01",
    description: "Groceries",
    amount_cents: 150050,
    type: "expense",
    currency_code: "PHP",
    account_id: null,
    category_id: null,
    transfer_group_id: null,
    debt_id: null,
    internal_debt_id: null,
    status: "pending",
    visibility: "household",
    created_by_user_id: "user-1",
    tagged_user_ids: [],
    notes: null,
    import_key: null,
    device_id: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    account: null,
    category: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockUseTransaction.mockReturnValue({ data: undefined });
  mockIsMobile.mockReturnValue(false);
  // Browser history persists across tests in one jsdom instance: reset the
  // current entry's URL/state so each router starts from a clean "/"
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  // Remove any per-test own-property override so the prototype getter
  // (always true in jsdom) is visible again
  Reflect.deleteProperty(window.navigator, "onLine");
  // Unpatch window.history (createBrowserHistory monkey-patches pushState)
  activeHistory?.destroy();
  activeHistory = undefined;
});

/** Fill the two required fields so submit passes validation. */
function fillRequiredFields() {
  const amount = screen.getByLabelText("Amount in Philippine Pesos");
  fireEvent.focus(amount);
  fireEvent.change(amount, { target: { value: "100" } });
  fireEvent.blur(amount);
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Groceries at SM" },
  });
}

describe("TransactionFormDialog", () => {
  it("renders a centered Dialog on desktop", async () => {
    await renderDialog();

    expect(document.querySelector('[data-slot="dialog-content"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeInTheDocument();
    expect(screen.getByText("New Transaction")).toBeInTheDocument();
  });

  it("renders a bottom Sheet on mobile with the same fields", async () => {
    mockIsMobile.mockReturnValue(true);
    await renderDialog();

    expect(document.querySelector('[data-slot="sheet-content"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeInTheDocument();
    expect(screen.getByLabelText("Amount in Philippine Pesos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeInTheDocument();
  });

  it("puts the Amount input before the Type radios in DOM order", async () => {
    await renderDialog();

    const amount = screen.getByLabelText("Amount in Philippine Pesos");
    const expenseRadio = screen.getByRole("radio", { name: "Expense" });
    // DOCUMENT_POSITION_FOLLOWING: expenseRadio comes after amount
    expect(amount.compareDocumentPosition(expenseRadio) & amount.DOCUMENT_POSITION_FOLLOWING).toBe(
      amount.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("hides low-frequency sections behind More options and reveals them on toggle", async () => {
    await renderDialog();

    expect(screen.queryByText("Link to Debt (Optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
    expect(screen.queryByText("Visibility")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes (optional)")).not.toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: /more options/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Link to Debt (Optional)")).toBeInTheDocument();
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("Visibility")).toBeInTheDocument();
    expect(screen.getByText("Notes (optional)")).toBeInTheDocument();
  });

  it("auto-expands More options when editing a transaction with non-default values", async () => {
    mockUseTransaction.mockReturnValue({
      data: buildTransaction({ status: "cleared", notes: "paid in cash" }),
    });
    await renderDialog({ editingId: "txn-1" });

    expect(screen.getByRole("button", { name: /more options/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByDisplayValue("paid in cash")).toBeInTheDocument();
  });

  it("keeps More options collapsed when editing a transaction with default values", async () => {
    mockUseTransaction.mockReturnValue({ data: buildTransaction({}) });
    await renderDialog({ editingId: "txn-1" });

    expect(screen.getByRole("button", { name: /more options/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("expands More options and shows the error when a collapsed field fails validation", async () => {
    await renderDialog();

    // Make the always-visible fields valid so the collapsed notes field is
    // the only validation failure
    const amount = screen.getByLabelText("Amount in Philippine Pesos");
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: "100" } });
    fireEvent.blur(amount);
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Groceries at SM" },
    });

    // Type an over-limit note (schema caps at 500), then collapse again;
    // RHF keeps values for unmounted fields (shouldUnregister=false)
    const toggle = screen.getByRole("button", { name: /more options/i });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Notes (optional)"), {
      target: { value: "x".repeat(501) },
    });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    // onInvalid re-expands the disclosure and the error paragraph renders
    // instead of the submit being a silent no-op
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-expanded", "true");
    });
    expect(screen.getByText("Notes too long")).toBeInTheDocument();
    expect(createOfflineTransaction).not.toHaveBeenCalled();
  });

  it("blocks submit with the max-amount error when the typed amount exceeds the maximum", async () => {
    await renderDialog();

    // ₱99,999,999 exceeds MAX_AMOUNT_CENTS (₱9,999,999.99). The over-max
    // cents must be committed to form state so zod's .max() blocks submit —
    // previously the last parseable prefix (₱9,999,999) stayed committed and
    // submit silently saved a wrong amount.
    const amount = screen.getByLabelText("Amount in Philippine Pesos");
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: "99999999" } });
    fireEvent.change(screen.getByLabelText("Description"), {
      target: { value: "Groceries at SM" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(screen.getByText("Amount too large")).toBeInTheDocument();
    });
    expect(createOfflineTransaction).not.toHaveBeenCalled();
  });

  it("toasts the normal copy when creating while online", async () => {
    vi.mocked(createOfflineTransaction).mockResolvedValue({ success: true, isTemporary: false });
    await renderDialog();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(createOfflineTransaction).toHaveBeenCalled();
    });
    expect(toast.success).toHaveBeenCalledWith("Transaction created");
  });

  it("toasts the offline copy when creating while offline", async () => {
    setNavigatorOnLine(false);
    vi.mocked(createOfflineTransaction).mockResolvedValue({ success: true, isTemporary: false });
    await renderDialog();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(createOfflineTransaction).toHaveBeenCalled();
    });
    expect(toast.success).toHaveBeenCalledWith("Saved on this device, will sync when online");
  });

  it("toasts the offline copy when updating while offline", async () => {
    setNavigatorOnLine(false);
    mockUseTransaction.mockReturnValue({ data: buildTransaction({}) });
    vi.mocked(updateOfflineTransaction).mockResolvedValue({ success: true, isTemporary: true });
    await renderDialog({ editingId: "txn-1" });

    fireEvent.click(screen.getByRole("button", { name: /update/i }));

    await waitFor(() => {
      expect(updateOfflineTransaction).toHaveBeenCalled();
    });
    expect(toast.success).toHaveBeenCalledWith("Saved on this device, will sync when online");
  });

  it("preserves the debt link when submitting an edit of a debt-linked transaction", async () => {
    mockUseTransaction.mockReturnValue({
      data: buildTransaction({ debt_id: "debt-1" }),
    });
    vi.mocked(updateOfflineTransaction).mockResolvedValue({ success: true, isTemporary: true });
    await renderDialog({ editingId: "txn-1" });

    fireEvent.click(screen.getByRole("button", { name: /update/i }));

    // The edit reset loads debt_id into the form, so an untouched submit
    // sends the existing link instead of silently clearing it
    await waitFor(() => {
      expect(updateOfflineTransaction).toHaveBeenCalledWith(
        "txn-1",
        expect.objectContaining({ debt_id: "debt-1" }),
        "user-1"
      );
    });
  });

  describe("dirty-form navigation guard (useBlocker, R37)", () => {
    it("blocks in-app navigation when the form is dirty and the discard confirm is declined", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      const { router } = await renderDialog();

      fillRequiredFields();

      // Push through router.history (same blocker path as router.navigate,
      // without the app-Register route typing)
      act(() => {
        router.history.push("/away");
      });

      await waitFor(() => {
        expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
      });
      expect(router.history.location.pathname).toBe("/");
    });

    it("navigates when the discard confirm is accepted", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { router } = await renderDialog();

      fillRequiredFields();

      act(() => {
        router.history.push("/away");
      });

      await waitFor(() => {
        expect(router.history.location.pathname).toBe("/away");
      });
      expect(confirmSpy).toHaveBeenCalledWith("Discard unsaved changes?");
    });

    it("does not prompt when the form is clean", async () => {
      const confirmSpy = vi.spyOn(window, "confirm");
      const { router } = await renderDialog();

      act(() => {
        router.history.push("/away");
      });

      await waitFor(() => {
        expect(router.history.location.pathname).toBe("/away");
      });
      expect(confirmSpy).not.toHaveBeenCalled();
    });
  });
});
