import { describe, expect, it } from "vitest";
import { cents } from "@/test/cents";
import { HOUSEHOLD } from "@/test/events";
import type { AccountRow } from "./projection";
import { payingAccountChoices } from "./paying-account";

function account(id: string, overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id,
    householdId: HOUSEHOLD,
    visibility: "household",
    ownerUserId: null,
    name: id,
    type: "bank",
    startingBalanceCents: cents(0),
    payingAccountId: null,
    retired: false,
    ...overrides,
  };
}

const HOUSEHOLD_CARD = { visibility: "household", ownerUserId: null } as const;
const PERSONAL_CARD = { visibility: "personal", ownerUserId: "user-a" } as const;

describe("payingAccountChoices", () => {
  it("offers every non-card account type", () => {
    const accounts = [
      account("Bank", { type: "bank" }),
      account("Cash", { type: "cash" }),
      account("GCash", { type: "e_wallet" }),
      account("Stocks", { type: "investment" }),
    ];

    expect(payingAccountChoices(accounts, HOUSEHOLD_CARD).map((a) => a.id)).toEqual([
      "Bank",
      "Cash",
      "GCash",
      "Stocks",
    ]);
  });

  it("leaves out credit cards", () => {
    const accounts = [
      account("Bank"),
      account("Visa", { type: "credit_card", payingAccountId: "Bank" }),
    ];

    expect(payingAccountChoices(accounts, HOUSEHOLD_CARD).map((a) => a.id)).toEqual(["Bank"]);
  });

  it("leaves out retired accounts", () => {
    const accounts = [account("Bank"), account("Old bank", { retired: true })];

    expect(payingAccountChoices(accounts, HOUSEHOLD_CARD).map((a) => a.id)).toEqual(["Bank"]);
  });

  it("offers a Household card only Household accounts", () => {
    const accounts = [
      account("Joint"),
      account("Mine", { visibility: "personal", ownerUserId: "user-a" }),
    ];

    expect(payingAccountChoices(accounts, HOUSEHOLD_CARD).map((a) => a.id)).toEqual(["Joint"]);
  });

  it("offers a Personal card only its owner's Personal accounts", () => {
    const accounts = [
      account("Joint"),
      account("Mine", { visibility: "personal", ownerUserId: "user-a" }),
      account("Theirs", { visibility: "personal", ownerUserId: "user-b" }),
    ];

    expect(payingAccountChoices(accounts, PERSONAL_CARD).map((a) => a.id)).toEqual(["Mine"]);
  });
});
