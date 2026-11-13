import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { cardPaymentEnvelope } from "@/lib/allocations/events";
import { createAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransfer } from "@/lib/commands/transfers";
import { getAllocation } from "@/lib/allocations/projection";
import { parsePHP } from "@/lib/currency";
import { getTransfer } from "@/lib/transfers/projection";
import { HOUSEHOLD } from "@/test/events";
import { MoveMoneyDialog } from "./MoveMoneyDialog";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

beforeEach(async () => {
  await resetLocalDatabase();
});

const bankNamed = (name: string) =>
  createAccount(MEMBER, { name, type: "bank", startingBalanceCents: parsePHP("0") });

const typeSwitch = () =>
  screen.findByRole("radiogroup", { name: "Between accounts or categories" });

describe("MoveMoneyDialog", () => {
  it("opens a new move between accounts by default, with Cleared / Pending", async () => {
    await bankNamed("BPI");
    await bankNamed("GCash");

    render(<MoveMoneyDialog actor={MEMBER} onClose={vi.fn()} />);

    await typeSwitch();
    expect(screen.getByRole("radio", { name: "Between accounts" })).toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Status" })).toBeInTheDocument();
  });

  it("opens on Between categories when preset, with no Cleared / Pending", async () => {
    await bankNamed("BPI");

    render(<MoveMoneyDialog actor={MEMBER} initialType="categories" onClose={vi.fn()} />);

    await typeSwitch();
    expect(screen.getByRole("radio", { name: "Between categories" })).toBeChecked();
    expect(screen.getByLabelText("Account")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Status" })).not.toBeInTheDocument();
  });

  it("switches type, keeping the amount typed", async () => {
    await bankNamed("BPI");
    await bankNamed("GCash");
    render(<MoveMoneyDialog actor={MEMBER} onClose={vi.fn()} />);

    await typeSwitch();
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("radio", { name: "Between categories" }));

    expect(await screen.findByLabelText("Account")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Amount/)).toHaveValue("500.00");

    fireEvent.click(screen.getByRole("radio", { name: "Between accounts" }));
    expect(await screen.findByRole("radiogroup", { name: "Status" })).toBeInTheDocument();
  });

  it("offers no credit card as an account in a new move", async () => {
    const bpi = await bankNamed("BPI");
    await bankNamed("GCash");
    await createAccount(MEMBER, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: parsePHP("0"),
      payingAccountId: bpi.id,
    });
    render(<MoveMoneyDialog actor={MEMBER} onClose={vi.fn()} />);

    fireEvent.click(await screen.findByLabelText("To"));
    expect(screen.getByRole("option", { name: /GCash/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Visa/ })).not.toBeInTheDocument();
  });

  it("opens a saved transfer as Edit transfer, with no type switch", async () => {
    const gcash = await bankNamed("GCash");
    const bpi = await bankNamed("BPI");
    const visa = await createAccount(MEMBER, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: parsePHP("0"),
      payingAccountId: bpi.id,
    });
    const { id } = await addTransfer(MEMBER, {
      date: "2026-10-12",
      amountCents: parsePHP("2000"),
      fromAccountId: gcash.id,
      toAccountId: bpi.id,
      fromEnvelope: cardPaymentEnvelope(visa.id),
      toEnvelope: cardPaymentEnvelope(visa.id),
    });
    const transfer = await getTransfer(id);
    if (!transfer) throw new Error("No transfer");

    render(<MoveMoneyDialog actor={MEMBER} transfer={transfer} onClose={vi.fn()} />);

    expect(await screen.findByRole("dialog", { name: "Edit transfer" })).toBeInTheDocument();
    expect(await screen.findByLabelText(/^From category/)).toHaveTextContent("Visa");
    // Money leaving a Card Payment arrives in it; no other arrival is offered.
    expect(screen.queryByLabelText("To category (optional)")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: "Between accounts or categories" })
    ).not.toBeInTheDocument();
  });

  it("opens a saved allocation as Edit allocation, with no type switch", async () => {
    const bpi = await bankNamed("BPI");
    const food = await createGroup(MEMBER, { name: "Food" });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
    const { id } = await addAllocation(MEMBER, {
      date: "2026-10-12",
      accountId: bpi.id,
      from: { kind: "unassigned" },
      to: { kind: "category", id: groceries.id },
      amountCents: parsePHP("800"),
    });
    const allocation = await getAllocation(id);
    if (!allocation) throw new Error("No allocation");

    render(<MoveMoneyDialog actor={MEMBER} allocation={allocation} onClose={vi.fn()} />);

    expect(await screen.findByRole("dialog", { name: "Edit allocation" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Amount/)).toHaveValue("800.00");
    expect(screen.queryByRole("radiogroup", { name: "Status" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radiogroup", { name: "Between accounts or categories" })
    ).not.toBeInTheDocument();
  });
});
