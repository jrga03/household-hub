import { beforeEach, describe, expect, it } from "vitest";
import { MAX_AMOUNT_CENTS, parsePHP, type Cents } from "@/lib/currency";
import { cents } from "@/test/cents";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import { readAccountMoney } from "@/lib/transactions/money";
import { getTransfer, listTransfers } from "@/lib/transfers/projection";
import { createAccount, retireAccount } from "./accounts";
import { createCategory, createGroup, retireCategory } from "./categories";
import {
  addTransfer,
  editTransfer,
  removeTransfer,
  removeTransfers,
  restoreTransfer,
  restoreTransfers,
  setTransferStatus,
  setTransfersStatus,
  type TransferInput,
} from "./transfers";
import { retireOnAnotherDevice } from "@/test/anotherDevice";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };

const peso = (amount: string): Cents => parsePHP(amount);

let bankId: string;
let walletId: string;
let groceriesId: string;

const category = (id: string): Envelope => ({ kind: "category", id });

const transfer = (overrides: Partial<TransferInput> = {}): TransferInput => ({
  date: "2026-10-12",
  amountCents: peso("2000"),
  fromAccountId: bankId,
  toAccountId: walletId,
  envelope: category(groceriesId),
  description: "",
  notes: "",
  ...overrides,
});

async function account(name: string, overrides: Record<string, unknown> = {}) {
  return (
    await createAccount(MEMBER, {
      name,
      type: "bank",
      startingBalanceCents: peso("0"),
      ...overrides,
    })
  ).id;
}

async function cardPaidFrom(payingAccountId: string, actor = MEMBER, visibility = "household") {
  return (
    await createAccount(actor, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: peso("0"),
      payingAccountId,
      visibility,
    })
  ).id;
}

async function personalCategory() {
  const group = await createGroup(MEMBER, { name: "Mine", visibility: "personal" });
  return (await createCategory(MEMBER, { name: "Travel", groupId: group.id })).id;
}

async function eventsOf(entityId: string) {
  return (await listUnpushed(1000)).filter((event) => event.entityId === entityId);
}

beforeEach(async () => {
  await resetLocalDatabase();
  bankId = await account("BPI", { startingBalanceCents: peso("10000") });
  walletId = await account("GCash");
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
});

describe("addTransfer", () => {
  it("records a cleared transfer seen by the same people as its accounts", async () => {
    const { id } = await addTransfer(MEMBER, transfer());

    expect(await listTransfers()).toMatchObject([
      {
        id,
        amountCents: 200000,
        fromAccountId: bankId,
        toAccountId: walletId,
        envelope: category(groceriesId),
        status: "cleared",
        visibility: "household",
        ownerUserId: null,
      },
    ]);
    expect(await eventsOf(id)).toMatchObject([
      { eventType: "transfer.created", visibility: "household", ownerUserId: null },
    ]);
  });

  it("moves the balance and the envelope from one account to the other", async () => {
    await addTransfer(MEMBER, transfer());

    const money = await readAccountMoney();
    expect(money.get(bankId)).toMatchObject({ balance: 800000 });
    expect(money.get(bankId)?.envelopes?.categories.get(groceriesId)).toBe(-200000);
    expect(money.get(walletId)).toMatchObject({ balance: 200000 });
    expect(money.get(walletId)?.envelopes?.categories.get(groceriesId)).toBe(200000);
  });

  it("records a pending transfer when the member says so", async () => {
    await addTransfer(MEMBER, { ...transfer(), status: "pending" });

    expect(await listTransfers()).toMatchObject([{ status: "pending" }]);
  });

  it("moves Unassigned money", async () => {
    await addTransfer(MEMBER, transfer({ envelope: UNASSIGNED_ENVELOPE }));

    expect((await readAccountMoney()).get(walletId)?.envelopes?.unassigned).toBe(200000);
  });

  it("moves between two Personal accounts of the same member", async () => {
    const mine = await account("My wallet", { visibility: "personal" });
    const savings = await account("My savings", { visibility: "personal" });
    const travelId = await personalCategory();

    const { id } = await addTransfer(
      MEMBER,
      transfer({ fromAccountId: mine, toAccountId: savings, envelope: category(travelId) })
    );

    expect(await getTransfer(id)).toMatchObject({ visibility: "personal", ownerUserId: "user-a" });
  });

  it("refuses the same account on both sides", async () => {
    await expect(addTransfer(MEMBER, transfer({ toAccountId: bankId }))).rejects.toThrow(
      "Choose two different accounts."
    );
  });

  it("refuses an amount over the limit", async () => {
    await expect(
      addTransfer(MEMBER, transfer({ amountCents: cents(MAX_AMOUNT_CENTS + 1) }))
    ).rejects.toThrow("The amount must be more than zero");
  });

  it("refuses accounts of another visibility", async () => {
    const mine = await account("My wallet", { visibility: "personal" });

    await expect(addTransfer(MEMBER, transfer({ toAccountId: mine }))).rejects.toThrow(
      "Choose an account seen by the same people as BPI."
    );
  });

  it("refuses Personal accounts of another owner", async () => {
    const mine = await account("My wallet", { visibility: "personal" });
    const theirs = (
      await createAccount(OTHER_MEMBER, {
        name: "Their wallet",
        type: "cash",
        startingBalanceCents: peso("0"),
        visibility: "personal",
      })
    ).id;

    await expect(
      addTransfer(
        MEMBER,
        transfer({ fromAccountId: mine, toAccountId: theirs, envelope: UNASSIGNED_ENVELOPE })
      )
    ).rejects.toThrow("Choose an account seen by the same people as My wallet.");
  });

  it.each([
    ["the account the money leaves", () => bankId, "BPI is retired."],
    ["the account the money goes to", () => walletId, "GCash is retired."],
  ])("refuses a retired account as %s", async (_side, retiredId, message) => {
    await retireAccount(MEMBER, retiredId());

    await expect(addTransfer(MEMBER, transfer())).rejects.toThrow(message);
  });

  it("refuses an account not on this device", async () => {
    await expect(
      addTransfer(MEMBER, transfer({ toAccountId: "aaaaaaaa-0000-4000-8000-00000000000f" }))
    ).rejects.toThrow("That account no longer exists.");
  });

  it("refuses a transfer out of a credit card", async () => {
    const cardId = await cardPaidFrom(bankId);

    await expect(
      addTransfer(MEMBER, transfer({ fromAccountId: cardId, envelope: UNASSIGNED_ENVELOPE }))
    ).rejects.toThrow("Money can't be transferred out of a credit card.");
  });

  it("refuses a retired category", async () => {
    await retireCategory(MEMBER, groceriesId);

    await expect(addTransfer(MEMBER, transfer())).rejects.toThrow("Groceries is retired.");
  });

  it("refuses a category of another visibility", async () => {
    const travelId = await personalCategory();

    await expect(addTransfer(MEMBER, transfer({ envelope: category(travelId) }))).rejects.toThrow(
      "Choose a Household category for BPI."
    );
  });

  describe("into a credit card", () => {
    it("pays the card from its Card Payment", async () => {
      const cardId = await cardPaidFrom(bankId);

      await addTransfer(
        MEMBER,
        transfer({ toAccountId: cardId, envelope: { kind: "card_payment", id: cardId } })
      );

      const money = await readAccountMoney();
      expect(money.get(cardId)).toMatchObject({ balance: -200000, envelopes: null });
      expect(money.get(bankId)).toMatchObject({ balance: 800000 });
      expect(money.get(bankId)?.envelopes?.cardPayments.get(cardId)).toBe(-200000);
    });

    it("refuses any envelope but the card's own Card Payment", async () => {
      const cardId = await cardPaidFrom(bankId);
      const otherCardId = await cardPaidFrom(bankId);

      await expect(addTransfer(MEMBER, transfer({ toAccountId: cardId }))).rejects.toThrow(
        "Pay Visa from its Card Payment."
      );
      await expect(
        addTransfer(
          MEMBER,
          transfer({ toAccountId: cardId, envelope: { kind: "card_payment", id: otherCardId } })
        )
      ).rejects.toThrow("Pay Visa from its Card Payment.");
    });
  });

  describe("a Card Payment between two accounts", () => {
    it("moves a reservation into the card's Paying Account", async () => {
      const cardId = await cardPaidFrom(walletId);

      await addTransfer(MEMBER, transfer({ envelope: { kind: "card_payment", id: cardId } }));

      const money = await readAccountMoney();
      expect(money.get(walletId)?.envelopes?.cardPayments.get(cardId)).toBe(200000);
    });

    it("refuses one into an account the card isn't paid from", async () => {
      const cardId = await cardPaidFrom(bankId);

      await expect(
        addTransfer(MEMBER, transfer({ envelope: { kind: "card_payment", id: cardId } }))
      ).rejects.toThrow("Visa is paid from BPI. Choose a card paid from GCash.");
    });

    it("refuses a card that isn't on this device", async () => {
      await expect(
        addTransfer(
          MEMBER,
          transfer({
            envelope: { kind: "card_payment", id: "aaaaaaaa-0000-4000-8000-00000000000f" },
          })
        )
      ).rejects.toThrow("That card no longer exists.");
    });
  });
});

describe("editTransfer", () => {
  it("changes the details as a whole", async () => {
    const savingsId = await account("Savings");
    const { id } = await addTransfer(MEMBER, transfer());

    await editTransfer(
      MEMBER,
      id,
      transfer({ amountCents: peso("1500"), toAccountId: savingsId, description: "Top up" })
    );

    expect(await getTransfer(id)).toMatchObject({
      amountCents: 150000,
      toAccountId: savingsId,
      description: "Top up",
    });
    expect((await eventsOf(id)).map((event) => event.eventType)).toEqual([
      "transfer.created",
      "transfer.edited",
    ]);
  });

  it("appends nothing when nothing changed", async () => {
    const { id } = await addTransfer(MEMBER, transfer());

    await editTransfer(MEMBER, id, transfer());

    expect(await eventsOf(id)).toHaveLength(1);
  });

  it("keeps a transfer on a retired account editable", async () => {
    const { id } = await addTransfer(MEMBER, transfer());
    await retireAccount(MEMBER, walletId);

    await editTransfer(MEMBER, id, transfer({ description: "Allowance" }));

    expect(await getTransfer(id)).toMatchObject({ description: "Allowance" });
  });

  it("refuses moving it onto a retired account", async () => {
    const savingsId = await account("Savings");
    const { id } = await addTransfer(MEMBER, transfer());
    await retireAccount(MEMBER, savingsId);

    await expect(editTransfer(MEMBER, id, transfer({ toAccountId: savingsId }))).rejects.toThrow(
      "Savings is retired."
    );
  });

  it("refuses moving it to an account of another visibility", async () => {
    const mine = await account("My wallet", { visibility: "personal" });
    const { id } = await addTransfer(MEMBER, transfer());

    await expect(editTransfer(MEMBER, id, transfer({ toAccountId: mine }))).rejects.toThrow(
      "Choose a Household account."
    );
  });

  it("refuses moving it out of a credit card", async () => {
    const cardId = await cardPaidFrom(bankId);
    const { id } = await addTransfer(MEMBER, transfer());

    await expect(
      editTransfer(MEMBER, id, transfer({ fromAccountId: cardId, envelope: UNASSIGNED_ENVELOPE }))
    ).rejects.toThrow("Money can't be transferred out of a credit card.");
  });

  it("refuses an envelope that doesn't fit", async () => {
    const travelId = await personalCategory();
    const { id } = await addTransfer(MEMBER, transfer());

    await expect(
      editTransfer(MEMBER, id, transfer({ envelope: category(travelId) }))
    ).rejects.toThrow("Choose a Household category for BPI.");
  });

  it("keeps a retired category the transfer already has", async () => {
    const { id } = await addTransfer(MEMBER, transfer());
    await retireOnAnotherDevice(MEMBER, groceriesId);

    await editTransfer(MEMBER, id, transfer({ amountCents: peso("100") }));

    expect(await getTransfer(id)).toMatchObject({ amountCents: 10000 });
  });

  it("refuses a transfer that doesn't exist", async () => {
    await expect(editTransfer(MEMBER, "missing", transfer())).rejects.toThrow(
      "That transfer no longer exists."
    );
  });
});

describe("status, removal and restore", () => {
  it("marks both legs pending, then cleared", async () => {
    const { id } = await addTransfer(MEMBER, transfer());

    await setTransferStatus(MEMBER, id, "pending");
    expect((await readAccountMoney()).get(walletId)).toMatchObject({ pending: 200000 });
    expect((await readAccountMoney()).get(bankId)).toMatchObject({ pending: -200000 });

    await setTransferStatus(MEMBER, id, "cleared");
    expect(await getTransfer(id)).toMatchObject({ status: "cleared" });
  });

  it("removes and restores the transfer and its money", async () => {
    const { id } = await addTransfer(MEMBER, transfer());

    await removeTransfer(MEMBER, id);
    expect(await listTransfers()).toEqual([]);
    expect((await readAccountMoney()).get(walletId)).toMatchObject({ balance: 0 });

    await restoreTransfer(MEMBER, id);
    expect(await listTransfers()).toMatchObject([{ id }]);
    expect((await readAccountMoney()).get(walletId)).toMatchObject({ balance: 200000 });
  });
});

describe("bulk changes", () => {
  it("sets the status of each, skipping those already as asked", async () => {
    const first = await addTransfer(MEMBER, transfer());
    const second = await addTransfer(MEMBER, { ...transfer(), status: "pending" });

    const result = await setTransfersStatus(MEMBER, [first.id, second.id], "pending");

    expect(result).toEqual({ changed: [first.id], failed: [] });
    expect(await eventsOf(second.id)).toHaveLength(1);
  });

  it("removes and restores each, reporting one that's gone", async () => {
    const first = await addTransfer(MEMBER, transfer());
    const second = await addTransfer(MEMBER, transfer());

    const removed = await removeTransfers(MEMBER, [first.id, second.id, "missing"]);
    expect(removed).toEqual({
      changed: [first.id, second.id],
      failed: [{ id: "missing", reason: "That transfer no longer exists." }],
    });
    expect(await listTransfers()).toEqual([]);

    const restored = await restoreTransfers(MEMBER, removed.changed);
    expect(restored.changed).toEqual([first.id, second.id]);
    expect(await listTransfers()).toHaveLength(2);
  });
});
