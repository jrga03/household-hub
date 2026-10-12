import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP, type Cents } from "@/lib/currency";
import { cents } from "@/test/cents";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { UNASSIGNED_ENVELOPE, type Envelope } from "@/lib/allocations/events";
import { getAllocation, listAllocations } from "@/lib/allocations/projection";
import { readAccountMoney } from "@/lib/transactions/money";
import { createAccount, retireAccount } from "./accounts";
import { createCategory, createGroup, retireCategory } from "./categories";
import {
  addAllocation,
  editAllocation,
  removeAllocation,
  restoreAllocation,
  type AllocationInput,
} from "./allocations";

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };

const peso = (amount: string): Cents => parsePHP(amount);

let bankId: string;
let groceriesId: string;
let foreverHouseId: string;

const category = (id: string): Envelope => ({ kind: "category", id });

const move = (overrides: Partial<AllocationInput> = {}): AllocationInput => ({
  date: "2026-10-12",
  accountId: bankId,
  from: UNASSIGNED_ENVELOPE,
  to: category(groceriesId),
  amountCents: peso("8000"),
  ...overrides,
});

async function envelopesOf(accountId: string) {
  return (await readAccountMoney()).get(accountId)?.envelopes;
}

async function personalCategory(actor: typeof MEMBER) {
  const group = await createGroup(actor, { name: "Mine", visibility: "personal" });
  return (await createCategory(actor, { name: "Travel", groupId: group.id })).id;
}

async function cardPaidFrom(payingAccountId: string, visibility = "household") {
  return (
    await createAccount(MEMBER, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: peso("0"),
      payingAccountId,
      visibility,
    })
  ).id;
}

beforeEach(async () => {
  await resetLocalDatabase();
  bankId = (
    await createAccount(MEMBER, {
      name: "BDO Savings",
      type: "bank",
      startingBalanceCents: peso("20000"),
    })
  ).id;
  const food = await createGroup(MEMBER, { name: "Food" });
  groceriesId = (await createCategory(MEMBER, { name: "Groceries", groupId: food.id })).id;
  const savings = await createGroup(MEMBER, { name: "Savings" });
  foreverHouseId = (await createCategory(MEMBER, { name: "Forever House", groupId: savings.id }))
    .id;
});

describe("addAllocation", () => {
  it("moves money out of Unassigned, and past it with only a negative Unassigned to show", async () => {
    await addAllocation(MEMBER, move());

    expect(await envelopesOf(bankId)).toMatchObject({
      unassigned: peso("12000"),
      categories: new Map([[groceriesId, peso("8000")]]),
    });

    await addAllocation(MEMBER, move({ to: category(foreverHouseId), amountCents: peso("15000") }));

    expect(await envelopesOf(bankId)).toMatchObject({
      unassigned: cents(-300000),
      categories: new Map([
        [groceriesId, peso("8000")],
        [foreverHouseId, peso("15000")],
      ]),
    });
  });

  it("is seen by the same people as its account", async () => {
    const { id } = await addAllocation(MEMBER, move());

    const [event] = (await listUnpushed(100)).filter((logged) => logged.entityId === id);
    expect(event).toMatchObject({
      eventType: "allocation.created",
      visibility: "household",
      ownerUserId: null,
    });
  });

  it("refuses a retired account", async () => {
    await retireAccount(MEMBER, bankId);

    await expect(addAllocation(MEMBER, move())).rejects.toThrow("BDO Savings is retired");
  });

  it("refuses a credit card, which holds no envelopes", async () => {
    const cardId = await cardPaidFrom(bankId);

    await expect(addAllocation(MEMBER, move({ accountId: cardId }))).rejects.toThrow(
      "A credit card holds no category money"
    );
  });

  it("refuses a retired category as the destination, but moves money out of one", async () => {
    await addAllocation(MEMBER, move());
    await retireCategory(MEMBER, groceriesId);

    await expect(addAllocation(MEMBER, move())).rejects.toThrow("Groceries is retired");

    await addAllocation(MEMBER, move({ from: category(groceriesId), to: UNASSIGNED_ENVELOPE }));
    expect((await envelopesOf(bankId))?.categories.get(groceriesId)).toBe(0);
  });

  it("refuses a category of another visibility", async () => {
    const travelId = await personalCategory(MEMBER);

    await expect(addAllocation(MEMBER, move({ to: category(travelId) }))).rejects.toThrow(
      "Choose a Household category for BDO Savings."
    );
    await expect(
      addAllocation(MEMBER, move({ from: category(travelId), to: UNASSIGNED_ENVELOPE }))
    ).rejects.toThrow("Choose a Household category for BDO Savings.");
  });

  it("refuses another member's Personal category on a Personal account", async () => {
    const walletId = (
      await createAccount(MEMBER, {
        name: "Wallet",
        type: "cash",
        startingBalanceCents: peso("100"),
        visibility: "personal",
      })
    ).id;
    const theirsId = await personalCategory(OTHER_MEMBER);

    await expect(
      addAllocation(MEMBER, move({ accountId: walletId, to: category(theirsId) }))
    ).rejects.toThrow("Choose a Personal category for Wallet.");
  });

  it("refuses a category that isn't on this device", async () => {
    await expect(
      addAllocation(MEMBER, move({ to: category(crypto.randomUUID()) }))
    ).rejects.toThrow("That category no longer exists.");
  });

  describe("Card Payments", () => {
    it("moves money into a card's Card Payment", async () => {
      const cardId = await cardPaidFrom(bankId);

      await addAllocation(MEMBER, move({ to: { kind: "card_payment", id: cardId } }));

      expect(await envelopesOf(bankId)).toMatchObject({
        unassigned: peso("12000"),
        cardPayments: new Map([[cardId, peso("8000")]]),
      });
    });

    it("refuses an account that isn't a card", async () => {
      await expect(
        addAllocation(MEMBER, move({ to: { kind: "card_payment", id: bankId } }))
      ).rejects.toThrow("That card no longer exists.");
    });

    it("refuses a card of another visibility", async () => {
      const personalBankId = (
        await createAccount(MEMBER, {
          name: "GCash",
          type: "e_wallet",
          startingBalanceCents: peso("0"),
          visibility: "personal",
        })
      ).id;
      const cardId = await cardPaidFrom(personalBankId, "personal");

      await expect(
        addAllocation(MEMBER, move({ to: { kind: "card_payment", id: cardId } }))
      ).rejects.toThrow("Choose a Household card for BDO Savings.");
    });

    it("refuses a card paid from another account, but moves its money out", async () => {
      const cashId = (
        await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: peso("0") })
      ).id;
      const cardId = await cardPaidFrom(cashId);
      const cardPayment: Envelope = { kind: "card_payment", id: cardId };

      await expect(addAllocation(MEMBER, move({ to: cardPayment }))).rejects.toThrow(
        "Visa is paid from Cash. Choose a card paid from BDO Savings."
      );

      // A reservation left behind when the card's Paying Account changed.
      await addAllocation(MEMBER, move({ from: cardPayment, to: UNASSIGNED_ENVELOPE }));
      expect((await envelopesOf(bankId))?.cardPayments.get(cardId)).toBe(cents(-800000));
    });

    it("refuses a retired card as the destination", async () => {
      const cardId = await cardPaidFrom(bankId);
      await retireAccount(MEMBER, cardId);

      await expect(
        addAllocation(MEMBER, move({ to: { kind: "card_payment", id: cardId } }))
      ).rejects.toThrow("Visa is retired");
    });
  });
});

describe("editAllocation", () => {
  it("changes any detail", async () => {
    const { id } = await addAllocation(MEMBER, move());

    await editAllocation(
      MEMBER,
      id,
      move({ to: category(foreverHouseId), amountCents: peso("5000") })
    );

    expect(await envelopesOf(bankId)).toMatchObject({
      unassigned: peso("15000"),
      categories: new Map([[foreverHouseId, peso("5000")]]),
    });
  });

  it("appends nothing when nothing changed", async () => {
    const { id } = await addAllocation(MEMBER, move());

    await editAllocation(MEMBER, id, move());

    const events = (await listUnpushed(100)).filter((logged) => logged.entityId === id);
    expect(events.map((logged) => logged.eventType)).toEqual(["allocation.created"]);
  });

  it("keeps an allocation on a retired account or into a retired category editable", async () => {
    const { id } = await addAllocation(MEMBER, move());
    await retireCategory(MEMBER, groceriesId);
    await retireAccount(MEMBER, bankId);

    await editAllocation(MEMBER, id, move({ amountCents: peso("1000") }));

    expect(await getAllocation(id)).toMatchObject({ amountCents: peso("1000") });
  });

  it("refuses more money into a retired category", async () => {
    const { id } = await addAllocation(MEMBER, move());
    await retireCategory(MEMBER, groceriesId);

    await expect(editAllocation(MEMBER, id, move({ amountCents: peso("9000") }))).rejects.toThrow(
      "Groceries is retired"
    );
  });

  it("refuses an edit to a removed allocation", async () => {
    const { id } = await addAllocation(MEMBER, move());
    await removeAllocation(MEMBER, id);

    await expect(editAllocation(MEMBER, id, move({ amountCents: peso("1000") }))).rejects.toThrow(
      "That allocation was removed."
    );
  });

  it("refuses a move onto a retired account or into a retired category", async () => {
    const { id } = await addAllocation(MEMBER, move());
    const walletId = (
      await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: peso("0") })
    ).id;
    await retireAccount(MEMBER, walletId);
    await retireCategory(MEMBER, foreverHouseId);

    await expect(editAllocation(MEMBER, id, move({ accountId: walletId }))).rejects.toThrow(
      "Cash is retired"
    );
    await expect(
      editAllocation(MEMBER, id, move({ to: category(foreverHouseId) }))
    ).rejects.toThrow("Forever House is retired");
  });

  it("refuses an account of another visibility", async () => {
    const { id } = await addAllocation(MEMBER, move());
    const walletId = (
      await createAccount(MEMBER, {
        name: "Wallet",
        type: "cash",
        startingBalanceCents: peso("0"),
        visibility: "personal",
      })
    ).id;

    await expect(
      editAllocation(
        MEMBER,
        id,
        move({ accountId: walletId, to: UNASSIGNED_ENVELOPE, from: category(groceriesId) })
      )
    ).rejects.toThrow("Choose a Household account.");
  });
});

describe("removeAllocation", () => {
  it("removes the allocation, and a restore brings it back", async () => {
    const { id } = await addAllocation(MEMBER, move());

    await removeAllocation(MEMBER, id);
    expect(await listAllocations()).toEqual([]);
    expect((await envelopesOf(bankId))?.unassigned).toBe(peso("20000"));

    await restoreAllocation(MEMBER, id);
    expect(await listAllocations()).toMatchObject([{ id }]);
    expect((await envelopesOf(bankId))?.unassigned).toBe(peso("12000"));
  });
});
