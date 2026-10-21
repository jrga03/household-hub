import { beforeEach, describe, expect, it } from "vitest";
import { parsePHP } from "@/lib/currency";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { createAccount, editAccount } from "@/lib/commands/accounts";
import { listUnpushed, markPushed } from "@/lib/events/log";
import { readEventLogExport } from "./event-log";
import { HOUSEHOLD } from "@/test/events";

const MEMBER = { householdId: HOUSEHOLD, userId: "user-a" };

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("event log export", () => {
  it("holds every local event as stored, oldest first", async () => {
    const { id } = await createAccount(MEMBER, {
      name: "Cash",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });
    const [created] = await listUnpushed(1);
    await markPushed([created!.id]);
    await editAccount(MEMBER, id, {
      name: "Wallet",
      type: "cash",
      startingBalanceCents: parsePHP("0"),
    });

    const exported = await readEventLogExport(new Date("2026-10-12T09:30:00Z"));

    expect(exported.exportedAt).toBe("2026-10-12T09:30:00.000Z");
    expect(
      exported.events.map((event) => ({
        entityId: event.entityId,
        eventType: event.eventType,
        name: event.payload.name,
        pushState: event.pushState,
      }))
    ).toEqual([
      { entityId: id, eventType: "account.created", name: "Cash", pushState: "pushed" },
      { entityId: id, eventType: "account.edited", name: "Wallet", pushState: "waiting" },
    ]);
  });
});
