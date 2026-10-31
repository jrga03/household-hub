import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { listAccounts, listRetiredAccounts } from "@/lib/accounts/projection";
import { cents } from "@/test/cents";
import {
  createAccount,
  deleteAccount,
  editAccount,
  restoreAccount,
  retireAccount,
  unretireAccount,
} from "./accounts";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("createAccount", () => {
  it("shows the account at once and queues its event for push", async () => {
    const account = await createAccount(MEMBER, {
      name: "  GCash ",
      type: "e_wallet",
      startingBalanceCents: cents(25_050),
    });

    expect(await listAccounts()).toMatchObject([
      {
        id: account.id,
        name: "GCash",
        type: "e_wallet",
        visibility: "household",
        householdId: MEMBER.householdId,
        startingBalanceCents: 25_050,
      },
    ]);
    expect(await listUnpushed(10)).toMatchObject([
      {
        entityType: "account",
        entityId: account.id,
        eventType: "account.created",
        eventVersion: 2,
        visibility: "household",
        householdId: MEMBER.householdId,
        actorUserId: MEMBER.userId,
        payload: {
          name: "GCash",
          type: "e_wallet",
          startingBalanceCents: 25_050,
          payingAccountId: null,
        },
      },
    ]);
  });

  it("is a Household account unless Personal is chosen", async () => {
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });

    expect(await listUnpushed(10)).toMatchObject([{ visibility: "household", ownerUserId: null }]);
  });

  it("keys a Personal account's event to the member who adds it", async () => {
    const account = await createAccount(MEMBER, {
      name: "My savings",
      type: "bank",
      startingBalanceCents: cents(0),
      visibility: "personal",
    });

    expect(await listAccounts()).toMatchObject([
      { id: account.id, visibility: "personal", ownerUserId: MEMBER.userId },
    ]);
    expect(await listUnpushed(10)).toMatchObject([
      { visibility: "personal", ownerUserId: MEMBER.userId, householdId: MEMBER.householdId },
    ]);
  });

  it("stamps each new event later than the one before", async () => {
    await createAccount(MEMBER, { name: "Cash", type: "cash", startingBalanceCents: cents(0) });
    await createAccount(MEMBER, { name: "Bank", type: "bank", startingBalanceCents: cents(0) });

    const [first, second] = await listUnpushed(10);
    expect(first && second && second.hlc > first.hlc).toBe(true);
  });

  it.each([
    [{ name: "   ", type: "cash", startingBalanceCents: cents(0) }, "An account needs a name."],
    [{ name: "x".repeat(61), type: "cash", startingBalanceCents: cents(0) }, "at most 60"],
    [{ name: "Visa", type: "debit", startingBalanceCents: cents(0) }, "Choose an account type."],
    [
      { name: "Visa", type: "credit_card", startingBalanceCents: cents(0) },
      "Choose the account this card is paid from.",
    ],
  ])("rejects %j and records nothing", async (input, problem) => {
    await expect(createAccount(MEMBER, input)).rejects.toThrow(problem);

    expect(await listAccounts()).toHaveLength(0);
    expect(await listUnpushed(10)).toHaveLength(0);
  });
});

describe("editAccount", () => {
  it("shows the edit at once and queues it with the account's visibility", async () => {
    const { id } = await createAccount(MEMBER, {
      name: "Cash",
      type: "cash",
      startingBalanceCents: cents(0),
    });

    await editAccount(MEMBER, id, {
      name: " Wallet ",
      type: "e_wallet",
      startingBalanceCents: cents(1_500),
    });

    expect(await listAccounts()).toMatchObject([
      { id, name: "Wallet", type: "e_wallet", startingBalanceCents: 1_500 },
    ]);
    expect((await listUnpushed(10))[1]).toMatchObject({
      entityId: id,
      eventType: "account.edited",
      eventVersion: 2,
      visibility: "household",
      ownerUserId: null,
      householdId: MEMBER.householdId,
      payload: {
        name: "Wallet",
        type: "e_wallet",
        startingBalanceCents: 1_500,
        payingAccountId: null,
      },
    });
  });

  it("keeps a Personal account Personal and keyed to its owner", async () => {
    const { id } = await createAccount(MEMBER, {
      name: "Mine",
      type: "bank",
      startingBalanceCents: cents(0),
      visibility: "personal",
    });

    await editAccount(MEMBER, id, {
      name: "Still mine",
      type: "bank",
      startingBalanceCents: cents(0),
    });

    expect(await listAccounts()).toMatchObject([
      { id, name: "Still mine", visibility: "personal", ownerUserId: MEMBER.userId },
    ]);
    expect((await listUnpushed(10))[1]).toMatchObject({
      visibility: "personal",
      ownerUserId: MEMBER.userId,
    });
  });

  it.each([
    [{ name: "", type: "cash", startingBalanceCents: cents(0) }, "An account needs a name."],
    [{ name: "Cash", type: "debit", startingBalanceCents: cents(0) }, "Choose an account type."],
  ])("rejects %j and records nothing", async (input, problem) => {
    const { id } = await createAccount(MEMBER, {
      name: "Cash",
      type: "cash",
      startingBalanceCents: cents(0),
    });

    await expect(editAccount(MEMBER, id, input)).rejects.toThrow(problem);

    expect(await listAccounts()).toMatchObject([{ name: "Cash", type: "cash" }]);
    expect(await listUnpushed(10)).toHaveLength(1);
  });

  it("rejects an account this device doesn't have", async () => {
    await expect(
      editAccount(MEMBER, "aaaaaaaa-0000-4000-8000-000000000404", {
        name: "Ghost",
        type: "cash",
        startingBalanceCents: cents(0),
      })
    ).rejects.toThrow("That account no longer exists.");

    expect(await listUnpushed(10)).toHaveLength(0);
  });
});

describe("retireAccount and unretireAccount", () => {
  it("moves the account to the retired list and back", async () => {
    const { id } = await createAccount(MEMBER, {
      name: "Old wallet",
      type: "cash",
      startingBalanceCents: cents(0),
    });

    await retireAccount(MEMBER, id);

    expect(await listAccounts()).toHaveLength(0);
    expect(await listRetiredAccounts()).toMatchObject([{ id, name: "Old wallet" }]);

    await unretireAccount(MEMBER, id);

    expect(await listAccounts()).toMatchObject([{ id }]);
    expect(await listRetiredAccounts()).toHaveLength(0);
    expect((await listUnpushed(10)).map((event) => event.eventType)).toEqual([
      "account.created",
      "account.retired",
      "account.unretired",
    ]);
  });
});

describe("credit cards", () => {
  const addBank = (visibility = "household") =>
    createAccount(MEMBER, {
      name: "BDO Savings",
      type: "bank",
      startingBalanceCents: cents(0),
      visibility,
    });

  const addCard = (payingAccountId: string, visibility = "household") =>
    createAccount(MEMBER, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: cents(0),
      payingAccountId,
      visibility,
    });

  it("adds a card that shows its Paying Account", async () => {
    const bank = await addBank();

    const card = await addCard(bank.id);

    expect(await listAccounts()).toMatchObject([
      { id: bank.id },
      { id: card.id, type: "credit_card", payingAccount: { id: bank.id, name: "BDO Savings" } },
    ]);
    expect((await listUnpushed(10))[1]).toMatchObject({
      eventType: "account.created",
      payload: { type: "credit_card", payingAccountId: bank.id },
    });
  });

  it.each([
    ["an account this device doesn't have", async () => "aaaaaaaa-0000-4000-8000-000000000404"],
    ["another card", async () => (await addCard((await addBank()).id)).id],
    ["a Personal account for a Household card", async () => (await addBank("personal")).id],
    [
      "a retired account",
      async () => {
        const { id } = await addBank();
        await retireAccount(MEMBER, id);
        return id;
      },
    ],
  ])("won't pay a card from %s", async (_case, payingAccount) => {
    const payingAccountId = await payingAccount();
    const before = (await listUnpushed(10)).length;

    await expect(addCard(payingAccountId)).rejects.toThrow(
      "Choose a Household account in use, other than a credit card, to pay this card from."
    );

    expect(await listUnpushed(10)).toHaveLength(before);
  });

  it("pays a Personal card from its owner's Personal account", async () => {
    const bank = await addBank("personal");

    const card = await addCard(bank.id, "personal");

    expect(await listAccounts()).toMatchObject([
      { id: bank.id },
      { id: card.id, payingAccount: { id: bank.id } },
    ]);
  });

  it("changes a card's Paying Account by editing it", async () => {
    const bank = await addBank();
    const cash = await createAccount(MEMBER, {
      name: "Cash",
      type: "cash",
      startingBalanceCents: cents(0),
    });
    const card = await addCard(bank.id);

    await editAccount(MEMBER, card.id, {
      name: "Visa",
      type: "credit_card",
      startingBalanceCents: cents(0),
      payingAccountId: cash.id,
    });

    expect((await listAccounts()).find((account) => account.id === card.id)).toMatchObject({
      payingAccount: { id: cash.id, name: "Cash" },
    });
    expect((await listUnpushed(10)).at(-1)).toMatchObject({
      eventType: "account.edited",
      payload: { payingAccountId: cash.id },
    });
  });

  it("keeps a card a card", async () => {
    const bank = await addBank();
    const card = await addCard(bank.id);

    await expect(
      editAccount(MEMBER, card.id, { name: "Visa", type: "bank", startingBalanceCents: cents(0) })
    ).rejects.toThrow("A credit card can't become another type of account.");
  });

  it("doesn't turn another account into a card", async () => {
    const bank = await addBank();
    const cash = await createAccount(MEMBER, {
      name: "Cash",
      type: "cash",
      startingBalanceCents: cents(0),
    });

    await expect(
      editAccount(MEMBER, bank.id, {
        name: "BDO Savings",
        type: "credit_card",
        startingBalanceCents: cents(0),
        payingAccountId: cash.id,
      })
    ).rejects.toThrow("An account can't become a credit card. Add the card as a new account.");
  });

  it("won't retire a card's Paying Account, and names the card", async () => {
    const bank = await addBank();
    await addCard(bank.id);

    await expect(retireAccount(MEMBER, bank.id)).rejects.toThrow(
      "Visa is paid from BDO Savings. Choose another paying account for it first."
    );

    expect(await listRetiredAccounts()).toHaveLength(0);
  });

  it("retires a Paying Account once its card is retired", async () => {
    const bank = await addBank();
    const card = await addCard(bank.id);
    await retireAccount(MEMBER, card.id);

    await retireAccount(MEMBER, bank.id);

    expect(await listRetiredAccounts()).toMatchObject([{ id: bank.id }, { id: card.id }]);
  });

  it("won't unretire a card whose Paying Account is retired", async () => {
    const bank = await addBank();
    const card = await addCard(bank.id);
    await retireAccount(MEMBER, card.id);
    await retireAccount(MEMBER, bank.id);

    await expect(unretireAccount(MEMBER, card.id)).rejects.toThrow(
      "Visa is paid from BDO Savings, which is retired. Unretire BDO Savings first."
    );

    await unretireAccount(MEMBER, bank.id);
    await unretireAccount(MEMBER, card.id);
    expect(await listAccounts()).toMatchObject([{ id: bank.id }, { id: card.id }]);
  });
});

describe("deleteAccount and restoreAccount", () => {
  it("deletes a retired account with no history, and restores it as retired", async () => {
    const spare = await createAccount(MEMBER, {
      name: "Spare wallet",
      type: "cash",
      startingBalanceCents: cents(0),
    });
    await expect(deleteAccount(MEMBER, spare.id)).rejects.toThrow(
      "Retire Spare wallet before deleting it."
    );
    await retireAccount(MEMBER, spare.id);

    await deleteAccount(MEMBER, spare.id);
    expect(await listRetiredAccounts()).toEqual([]);

    await restoreAccount(MEMBER, spare.id);
    expect(await listRetiredAccounts()).toMatchObject([{ id: spare.id, retired: true }]);
  });

  it("keeps an account with a starting balance or a card paid from it", async () => {
    const bank = await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: cents(0),
    });
    const card = await createAccount(MEMBER, {
      name: "BPI Gold",
      type: "credit_card",
      startingBalanceCents: cents(500),
      payingAccountId: bank.id,
    });
    await retireAccount(MEMBER, card.id);
    await retireAccount(MEMBER, bank.id);

    await expect(deleteAccount(MEMBER, bank.id)).rejects.toThrow(
      "BPI has 1 card paid from it, so it stays retired."
    );
    await expect(deleteAccount(MEMBER, card.id)).rejects.toThrow(
      "BPI Gold has a starting balance, so it stays retired."
    );
  });

  it("deletes a Paying Account once its card is deleted", async () => {
    const bank = await createAccount(MEMBER, {
      name: "BPI",
      type: "bank",
      startingBalanceCents: cents(0),
    });
    const card = await createAccount(MEMBER, {
      name: "BPI Gold",
      type: "credit_card",
      startingBalanceCents: cents(0),
      payingAccountId: bank.id,
    });
    await retireAccount(MEMBER, card.id);
    await retireAccount(MEMBER, bank.id);

    await deleteAccount(MEMBER, card.id);
    await deleteAccount(MEMBER, bank.id);
    expect(await listRetiredAccounts()).toEqual([]);
  });
});
