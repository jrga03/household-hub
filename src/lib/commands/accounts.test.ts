import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { listUnpushed } from "@/lib/events/log";
import { listAccounts } from "@/lib/accounts/projection";
import { cents } from "@/test/cents";
import { createAccount } from "./accounts";

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
        eventVersion: 1,
        visibility: "household",
        householdId: MEMBER.householdId,
        actorUserId: MEMBER.userId,
        payload: { name: "GCash", type: "e_wallet", startingBalanceCents: 25_050 },
      },
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
