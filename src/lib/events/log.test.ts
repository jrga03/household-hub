import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listAccounts } from "@/lib/accounts/projection";
import { createAccount, editAccount, retireAccount } from "@/lib/commands/accounts";
import { cents } from "@/test/cents";
import {
  countWaiting,
  discardStuck,
  listStuck,
  listUnpushed,
  markPushed,
  markStuck,
  readPullCursor,
  receiveEvents,
  requeueStuck,
  switchHousehold,
} from "./log";

const MEMBER = { householdId: "11111111-1111-4111-8111-111111111111", userId: "user-a" };

const addCash = (name = "Cash") =>
  createAccount(MEMBER, { name, type: "cash", startingBalanceCents: cents(0) });

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("waiting count", () => {
  it("counts local changes until they are pushed", async () => {
    expect(await countWaiting()).toBe(0);

    await addCash("Cash");
    await addCash("Wallet");
    expect(await countWaiting()).toBe(2);

    const [first] = await listUnpushed(1);
    await markPushed([first!.id]);
    expect(await countWaiting()).toBe(1);
  });
});

describe("stuck events", () => {
  const REFUSED = "new row violates row-level security policy";

  it("leave the queue and are listed with what they are", async () => {
    const { id } = await addCash("BPI Savings");
    const [created] = await listUnpushed(1);

    await markStuck(created!.id, REFUSED);

    expect(await countWaiting()).toBe(0);
    expect(await listUnpushed(10)).toEqual([]);
    expect(await listStuck()).toEqual([
      { id: created!.id, description: "Add account: BPI Savings", reason: REFUSED },
    ]);
    expect((await listAccounts()).map((account) => account.id)).toEqual([id]);
  });

  it("describe edits and retirements by the account's name", async () => {
    const { id } = await addCash("BPI Savings");
    await editAccount(MEMBER, id, {
      name: "BPI Payroll",
      type: "cash",
      startingBalanceCents: cents(0),
    });
    await retireAccount(MEMBER, id);
    for (const event of await listUnpushed(10)) await markStuck(event.id, REFUSED);

    expect((await listStuck()).map((stuck) => stuck.description)).toEqual([
      "Add account: BPI Savings",
      "Edit account: BPI Payroll",
      "Retire account: BPI Payroll",
    ]);
  });

  it("go back in the queue when retried", async () => {
    await addCash("BPI Savings");
    const [created] = await listUnpushed(1);
    await markStuck(created!.id, REFUSED);

    await requeueStuck(created!.id);

    expect(await listStuck()).toEqual([]);
    expect(await countWaiting()).toBe(1);
  });
});

describe("discarding a stuck event", () => {
  const stickAll = async () => {
    for (const event of await listUnpushed(10)) await markStuck(event.id, "refused");
  };

  it("removes an account whose create it was", async () => {
    await addCash("BPI Savings");
    await stickAll();
    const [stuck] = await listStuck();

    await discardStuck(stuck!.id);

    expect(await listAccounts()).toEqual([]);
    expect(await listStuck()).toEqual([]);
    expect(await countWaiting()).toBe(0);
  });

  it("rebuilds the account without it, keeping the changes before it", async () => {
    const { id } = await addCash("BPI Savings");
    const [created] = await listUnpushed(1);
    await markPushed([created!.id]);
    await editAccount(MEMBER, id, {
      name: "BPI Payroll",
      type: "cash",
      startingBalanceCents: cents(0),
    });
    await stickAll();
    const [edit] = await listStuck();

    await discardStuck(edit!.id);

    expect((await listAccounts()).map((account) => account.name)).toEqual(["BPI Savings"]);
  });

  it("drops the unpushed changes of an account whose create it was", async () => {
    const { id } = await addCash("BPI Savings");
    await stickAll();
    await editAccount(MEMBER, id, {
      name: "BPI Payroll",
      type: "cash",
      startingBalanceCents: cents(0),
    });
    const [created] = await listStuck();

    await discardStuck(created!.id);

    expect(await countWaiting()).toBe(0);
    expect(await listStuck()).toEqual([]);
    expect(await listAccounts()).toEqual([]);
  });

  it("never removes an event that is not stuck", async () => {
    await addCash("BPI Savings");
    const [waiting] = await listUnpushed(1);

    await discardStuck(waiting!.id);

    expect(await countWaiting()).toBe(1);
    expect(await listAccounts()).toHaveLength(1);
  });
});

describe("switching household", () => {
  const pushAll = async () => markPushed((await listUnpushed(100)).map((event) => event.id));
  const accountNames = async () => (await listAccounts()).map((account) => account.name);

  it("on losing membership, wipes Household accounts, keeps Personal ones and pulls from the start", async () => {
    await switchHousehold(MEMBER.householdId);
    await addCash("Household cash");
    await createAccount(MEMBER, {
      name: "My wallet",
      type: "cash",
      startingBalanceCents: cents(0),
      visibility: "personal",
    });
    await pushAll();
    await receiveEvents([], 42);

    expect(await switchHousehold(null)).toBe(true);

    expect(await accountNames()).toEqual(["My wallet"]);
    expect(await readPullCursor()).toBe(0);
  });

  it("holds unpushed Household changes as stuck, off every screen", async () => {
    await switchHousehold(MEMBER.householdId);
    await addCash("Offline cash");

    await switchHousehold(null);

    expect(await accountNames()).toEqual([]);
    expect(await countWaiting()).toBe(0);
    expect(await listStuck()).toEqual([
      {
        id: expect.any(String),
        description: "Add account: Offline cash",
        reason: "You're no longer a member of the household this change was made in.",
      },
    ]);
  });

  it("never projects a Household change from a household the device left", async () => {
    await switchHousehold(MEMBER.householdId);
    const { id } = await addCash("Offline cash");
    await editAccount(MEMBER, id, {
      name: "Renamed offline",
      type: "cash",
      startingBalanceCents: cents(0),
    });
    await switchHousehold(null);
    const edit = (await listStuck()).find((stuck) => stuck.description.includes("Renamed"));

    await discardStuck(edit!.id);

    expect(await accountNames()).toEqual([]);
  });

  it("keeps Household changes made in the household it switches to", async () => {
    await switchHousehold(null);
    await addCash("Made after joining");

    await switchHousehold(MEMBER.householdId);

    expect(await accountNames()).toEqual(["Made after joining"]);
    expect(await countWaiting()).toBe(1);
  });

  it("wipes Household accounts on a device that never recorded its household", async () => {
    await addCash("From before households were recorded");

    await switchHousehold(null);

    expect(await accountNames()).toEqual([]);
  });
});
