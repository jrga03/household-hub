import { describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import type { AccountRow } from "@/lib/accounts/projection";
import { accountComboboxGroups } from "./AccountSelect";

const account = (
  row: Pick<AccountRow, "id" | "name" | "type"> & Partial<AccountRow>
): AccountRow => ({
  householdId: "household",
  visibility: "household",
  ownerUserId: null,
  retired: false,
  startingBalanceCents: parsePHP("0"),
  payingAccountId: null,
  ...row,
});

describe("accountComboboxGroups", () => {
  it("groups accounts by type in the type order, skipping empty types", () => {
    const groups = accountComboboxGroups([
      account({ id: "card", name: "BPI Visa", type: "credit_card" }),
      account({ id: "gcash", name: "GCash", type: "e_wallet" }),
      account({ id: "bpi", name: "BPI", type: "bank" }),
      account({ id: "maya", name: "Maya", type: "e_wallet" }),
    ]);

    expect(groups).toEqual([
      { label: "Bank account", options: [{ value: "bpi", label: "BPI" }] },
      {
        label: "E-wallet",
        options: [
          { value: "gcash", label: "GCash" },
          { value: "maya", label: "Maya" },
        ],
      },
      { label: "Credit card", options: [{ value: "card", label: "BPI Visa" }] },
    ]);
  });

  it("labels a Personal account and a retired one", () => {
    const groups = accountComboboxGroups([
      account({
        id: "wallet",
        name: "Wallet",
        type: "cash",
        visibility: "personal",
        ownerUserId: "a",
      }),
      account({ id: "old", name: "Old jar", type: "cash", retired: true }),
      account({ id: "both", name: "Coins", type: "cash", visibility: "personal", retired: true }),
    ]);

    expect(groups[0]?.options.map((option) => option.label)).toEqual([
      "Wallet (Personal)",
      "Old jar (retired)",
      "Coins (Personal) (retired)",
    ]);
  });
});
