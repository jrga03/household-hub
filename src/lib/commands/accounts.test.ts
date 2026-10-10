import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { listAccounts, listRetiredAccounts } from "@/lib/accounts/projection";
import { cents } from "@/test/cents";
import { createAccount, editAccount, retireAccount, unretireAccount } from "./accounts";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

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
    [
      { name: "Visa", type: "credit_card", startingBalanceCents: cents(0) },
      "Choose an account type.",
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
      eventVersion: 1,
      visibility: "household",
      ownerUserId: null,
      householdId: MEMBER.householdId,
      payload: { name: "Wallet", type: "e_wallet", startingBalanceCents: 1_500 },
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
    [
      { name: "Visa", type: "credit_card", startingBalanceCents: cents(0) },
      "Choose an account type.",
    ],
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
