import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { UNASSIGNED_ENVELOPE } from "@/lib/allocations/events";
import { createAccount } from "@/lib/commands/accounts";
import { addAllocation } from "@/lib/commands/allocations";
import { createCategory, createGroup } from "@/lib/commands/categories";
import { setBudget } from "@/lib/commands/budgets";
import { addPayday } from "@/lib/commands/paydays";
import { addTransaction } from "@/lib/commands/transactions";
import { CategoryLedger } from "./CategoryLedger";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

let groceriesId: string;
let bpiId: string;

beforeEach(async () => {
  await resetLocalDatabase();
  const bpi = await createAccount(MEMBER, {
    name: "BPI",
    type: "bank",
    startingBalanceCents: parsePHP("50000"),
  });
  const food = await createGroup(MEMBER, { name: "Food" });
  bpiId = bpi.id;
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

  it("shows each budget version's portions by payday name", async () => {
    const fifteenth = await addPayday(MEMBER, "15th salary");
    const thirtieth = await addPayday(MEMBER, "30th salary");
    const budget = { categoryId: groceriesId, accountId: bpiId, amountCents: parsePHP("8000") };
    await setBudget(MEMBER, { ...budget, fromMonth: "2026-09" }, "2026-11");
    await setBudget(
      MEMBER,
      {
        ...budget,
        fromMonth: "2026-10",
        portions: [
          { paydayId: fifteenth.id, amountCents: parsePHP("3000") },
          { paydayId: thirtieth.id, amountCents: parsePHP("5000") },
        ],
      },
      "2026-11"
    );
    render(
      <CategoryLedger
        categoryId={groceriesId}
        categoryName="Groceries"
        month="2026-10"
        isCurrentMonth={false}
        names={{ accounts: new Map([[bpiId, "BPI"]]), categories: new Map() }}
        onOpen={() => {}}
      />
    );

    const [october, september] = within(
      await screen.findByRole("list", { name: "Budget history" })
    ).getAllByRole("listitem");
    expect(october).toHaveTextContent(/15th salary ₱3,000\.00.* · 30th salary ₱5,000\.00/);
    expect(september).toHaveTextContent("From September 2026BPI");
    expect(september).not.toHaveTextContent("salary");
  });
});
