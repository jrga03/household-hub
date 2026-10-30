import { describe, expect, it } from "vitest";
import type { TransactionRow } from "@/lib/transactions/projection";
import { cents } from "@/test/cents";
import { foldSpending } from "./spending";

const ME = "user-me";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";

let nextId = 0;
const row = (details: Partial<TransactionRow>): TransactionRow => ({
  id: `tx-${++nextId}`,
  householdId: "household",
  visibility: "household",
  ownerUserId: null,
  date: "2026-11-12",
  type: "expense",
  amountCents: cents(10000),
  accountId: "bank",
  categoryId: GROCERIES,
  payingAccountId: null,
  description: "",
  notes: "",
  status: "cleared",
  removed: false,
  recordedHlc: "",
  importKey: null,
  ...details,
});

describe("foldSpending", () => {
  it("nets a refund against the category's expenses in its month", () => {
    const { household } = foldSpending(
      [row({ amountCents: cents(10000) }), row({ type: "income", amountCents: cents(2500) })],
      ME,
      30
    );

    expect(household.get("2026-11")?.get(GROCERIES)?.spent).toBe(10000 - 2500);
  });

  it("counts a card purchase on its own date, not when the card is paid", () => {
    const { household } = foldSpending(
      [row({ accountId: "card", payingAccountId: "bank", date: "2026-10-31" })],
      ME,
      30
    );

    expect([...household.keys()]).toEqual(["2026-10"]);
    expect(household.get("2026-10")?.get(GROCERIES)?.spent).toBe(10000);
  });

  it("shows a Personal account only in Mine, and only the member's own", () => {
    const mine = row({ visibility: "personal", ownerUserId: ME, amountCents: cents(700) });
    const someoneElses = row({ visibility: "personal", ownerUserId: "user-other" });
    const shared = row({ amountCents: cents(300) });

    const grids = foldSpending([mine, someoneElses, shared], ME, 30);

    expect(grids.household.get("2026-11")?.get(GROCERIES)?.spent).toBe(300);
    expect(grids.mine.get("2026-11")?.get(GROCERIES)?.spent).toBe(700);
  });

  it("keeps Unassigned apart for each view", () => {
    const grids = foldSpending(
      [
        row({ categoryId: null, amountCents: cents(400) }),
        row({ categoryId: null, visibility: "personal", ownerUserId: ME, amountCents: cents(900) }),
      ],
      ME,
      30
    );

    expect(grids.household.get("2026-11")?.get(null)?.spent).toBe(400);
    expect(grids.mine.get("2026-11")?.get(null)?.spent).toBe(900);
  });

  it("leaves out a removed transaction", () => {
    const { household } = foldSpending([row({ removed: true })], ME, 30);

    expect(household.size).toBe(0);
  });

  it("sums what was spent on or before today's day of the month", () => {
    const { household } = foldSpending(
      [
        row({ date: "2026-11-05", amountCents: cents(100) }),
        row({ date: "2026-11-12", amountCents: cents(200) }),
        row({ date: "2026-11-13", amountCents: cents(400) }),
      ],
      ME,
      12
    );

    expect(household.get("2026-11")?.get(GROCERIES)).toEqual({ spent: 700, spentToDay: 300 });
  });

  it("counts all of a short month when today's day is past its end", () => {
    const { household } = foldSpending([row({ date: "2027-02-28" })], ME, 31);

    expect(household.get("2027-02")?.get(GROCERIES)?.spentToDay).toBe(10000);
  });
});
