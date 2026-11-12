import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { getAccount } from "@/lib/accounts/projection";
import { readCategoryList } from "@/lib/categories/projection";
import { createAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction, type NewTransactionInput } from "@/lib/commands/transactions";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listTransactions } from "@/lib/transactions/projection";
import { SelectionActions } from "./SelectionActions";
import { HOUSEHOLD } from "@/test/events";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

let bankId: string;

beforeEach(async () => {
  vi.clearAllMocks();
  await resetLocalDatabase();
  bankId = (
    await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: parsePHP("1000"),
    })
  ).id;
});

const record = (description: string, extra: Partial<NewTransactionInput> = {}) =>
  addTransaction(MEMBER, {
    date: "2026-10-12",
    type: "expense",
    amountCents: parsePHP("250"),
    accountId: bankId,
    categoryId: null,
    description,
    ...extra,
  });

async function renderSelection() {
  render(
    <SelectionActions
      actor={MEMBER}
      selected={await listTransactions()}
      accountsById={new Map()}
      categories={undefined}
      onDone={() => {}}
    />
  );
}

const statuses = async () => (await listTransactions()).map((row) => row.status);

describe("Mark paid back", () => {
  it("marks the selected out-of-pocket expenses paid back, and Undo makes them owed again", async () => {
    await record("Market", { paidByUserId: MEMBER.userId });
    await record("Bakery", { paidByUserId: MEMBER.userId });
    await renderSelection();

    fireEvent.click(screen.getByRole("button", { name: "Mark paid back" }));

    await waitFor(async () => expect(await statuses()).toEqual(["cleared", "cleared"]));
    const [message, options] = vi.mocked(toast.success).mock.calls[0] ?? [];
    expect(message).toBe("Marked 2 expenses paid back");
    expect(options?.duration).toBe(10_000);
    const action = options?.action as { label: string; onClick: () => void } | undefined;
    expect(action?.label).toBe("Undo");

    action?.onClick();

    await waitFor(async () => expect(await statuses()).toEqual(["pending", "pending"]));
  });

  it("isn't offered unless every selected row is an open out-of-pocket expense", async () => {
    await record("Market", { paidByUserId: MEMBER.userId });
    await record("Rent", { status: "pending" });
    await renderSelection();

    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark paid back" })).toBeNull();
  });
});

describe("Change category", () => {
  it("finds a category by search and moves every selected transaction into it", async () => {
    const group = await createGroup(MEMBER, { name: "Food" });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: group.id });
    await createCategory(MEMBER, { name: "Dining out", groupId: group.id });
    await record("Market");
    await record("Bakery");
    const bank = await getAccount(bankId);
    render(
      <SelectionActions
        actor={MEMBER}
        selected={await listTransactions()}
        accountsById={new Map(bank ? [[bankId, bank]] : [])}
        categories={await readCategoryList()}
        onDone={() => {}}
      />
    );
    const picker = screen.getByRole("combobox", { name: "Change category" });
    expect(picker).toHaveTextContent("Category");

    fireEvent.click(picker);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Unassigned",
      "Dining out",
      "Groceries",
    ]);
    fireEvent.change(screen.getByRole("combobox", { name: "Search" }), {
      target: { value: "groc" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Groceries Food" }));

    await waitFor(async () =>
      expect((await listTransactions()).map((row) => row.categoryId)).toEqual([
        groceries.id,
        groceries.id,
      ])
    );
    expect(toast.success).toHaveBeenCalledWith("Changed the category of 2 transactions");
    expect(picker).toHaveTextContent("Category");
  });
});
