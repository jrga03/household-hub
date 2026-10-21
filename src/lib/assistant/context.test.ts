import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import { createAccount, retireAccount } from "@/lib/commands/accounts";
import { createCategory, createGroup, retireCategory } from "@/lib/commands/categories";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { buildSessionContext } from "./context";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };
const OTHER_MEMBER = { householdId: HOUSEHOLD, userId: "user-b" };

// Thursday, late evening local time: still the 15th wherever the test runs.
const NOW = new Date(2026, 9, 15, 23, 30);

const session = { userId: MEMBER.userId, now: NOW };

const newAccount = (actor: typeof MEMBER, name: string, visibility = "household") =>
  createAccount(actor, { name, type: "bank", startingBalanceCents: parsePHP("0"), visibility });

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("buildSessionContext", () => {
  it("states the member's local date and weekday", async () => {
    expect(await buildSessionContext(session)).toContain("Today is 2026-10-15 (Thursday).");
  });

  it("lists the accounts in use the member can see, by id", async () => {
    const gcash = await newAccount(MEMBER, "GCash");
    const wallet = await newAccount(MEMBER, "Wallet", "personal");
    const old = await newAccount(MEMBER, "Old bank");
    await retireAccount(MEMBER, old.id);
    await newAccount(OTHER_MEMBER, "Their savings", "personal");

    const context = await buildSessionContext(session);

    expect(context).toContain(`- ${gcash.id}: GCash`);
    expect(context).toContain(`- ${wallet.id}: Wallet (Personal)`);
    expect(context).not.toContain("Old bank");
    expect(context).not.toContain("Their savings");
  });

  it("lists the categories in use the member can see, by id", async () => {
    const food = await createGroup(MEMBER, { name: "Food" });
    const groceries = await createCategory(MEMBER, { name: "Groceries", groupId: food.id });
    const mine = await createGroup(MEMBER, { name: "Mine", visibility: "personal" });
    const travel = await createCategory(MEMBER, { name: "Travel", groupId: mine.id });
    const dining = await createCategory(MEMBER, { name: "Dining", groupId: food.id });
    await retireCategory(MEMBER, dining.id);
    const theirs = await createGroup(OTHER_MEMBER, { name: "Theirs", visibility: "personal" });
    await createCategory(OTHER_MEMBER, { name: "Hobbies", groupId: theirs.id });

    const context = await buildSessionContext(session);

    expect(context).toContain(`- ${groceries.id}: Groceries\n`);
    expect(context).toContain(`- ${travel.id}: Travel (Personal)`);
    expect(context).not.toContain("Dining");
    expect(context).not.toContain("Hobbies");
  });

  it("gives the one-line entry rules", async () => {
    const context = await buildSessionContext(session);

    expect(context).toContain("No date means today");
    expect(context).toContain("No type means expense.");
    expect(context).toContain("No category: ask the member");
    expect(context).toContain("A Personal category goes only with a Personal account");
  });

  it("uses the only account when the line names none", async () => {
    await newAccount(MEMBER, "GCash");

    expect(await buildSessionContext(session)).toContain("No account: use GCash.");
  });

  it("asks for the account when there are several and the line names none", async () => {
    await newAccount(MEMBER, "GCash");
    await newAccount(MEMBER, "Wallet");

    expect(await buildSessionContext(session)).toContain("No account: ask the member which one.");
  });

  it("tells the model how to write its answers", async () => {
    const context = await buildSessionContext(session);

    expect(context).toContain("Reply in a few sentences.");
    expect(context).toContain("Never show ids to the member");
    expect(context).toContain("Prefer a list to a table");
    expect(context).toContain("what you can do");
  });
});
