import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import { createAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { addTransaction } from "@/lib/commands/transactions";
import { CategoryLedger } from "./CategoryLedger";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

let groceriesId: string;

beforeEach(async () => {
  await resetLocalDatabase();
  const bpi = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("50000"),
  });
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
  await addAllocation(MEMBER, {
    date: "2026-10-01",
    accountId: bpi.id,
    from: UNASSIGNED_ENVELOPE,
    to: { kind: "category", id: groceriesId },
    amountCents: parsePHP("100"),
  });
  await addTransaction(MEMBER, {
    date: "2026-10-02",
    type: "expense",
    amountCents: parsePHP("250"),
    accountId: bpi.id,
    categoryId: groceriesId,
    description: "Market",
  });
});

const shownAmount = (row: HTMLElement, text: string) =>
  within(row).getByText(text, { selector: '[aria-hidden="true"]' }).parentElement;

describe("CategoryLedger", () => {
  it("mutes a running balance, but shows a negative one in the shortfall color", async () => {
    render(
      <CategoryLedger
        categoryId={groceriesId}
        categoryName="Groceries"
        month="2026-10"
        isCurrentMonth={false}
        names={{ accounts: new Map(), categories: new Map() }}
        onOpen={() => {}}
      />
    );

    const market = await screen.findByRole("button", { name: /Market/ });
    const shortBalance = shownAmount(market, "−₱150.00");
    expect(shortBalance).toHaveClass("text-shortfall");
    expect(shortBalance).not.toHaveClass("text-muted-foreground");

    const allocation = screen.getByRole("button", { name: /Oct 1/ });
    expect(shownAmount(allocation, "₱100.00")).toHaveClass("text-muted-foreground");
  });
});
