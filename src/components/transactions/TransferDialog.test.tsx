import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { cardPaymentEnvelope } from "@/lib/allocations/events";
import { createAccount } from "@/lib/commands/accounts";
import { addTransfer } from "@/lib/commands/transfers";
import { parsePHP } from "@/lib/currency";
import { getTransfer } from "@/lib/transfers/projection";
import { HOUSEHOLD } from "@/test/events";
import { TransferEditor } from "./TransferDialog";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

beforeEach(async () => {
  await resetLocalDatabase();
});

const bankNamed = (name: string) =>
  createAccount(MEMBER, { name, type: "bank", startingBalanceCents: parsePHP("0") });

describe("TransferEditor", () => {
  it("offers no other arrival for money leaving a Card Payment", async () => {
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

    render(<TransferEditor actor={MEMBER} transfer={transfer} onClose={vi.fn()} />);

    expect(await screen.findByLabelText(/^From category/)).toHaveTextContent("Visa");
    expect(screen.queryByLabelText("To category (optional)")).not.toBeInTheDocument();
  });
});
