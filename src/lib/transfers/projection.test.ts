import { beforeEach, describe, expect, it } from "vitest";
import { orders } from "@/test/permutations";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import { describeEvent } from "@/lib/events/projector";
import { receiveEvents } from "@/lib/events/log";
import { HOUSEHOLD, loggedEvent, type EventFields } from "@/test/events";
import { getTransfer, listTransfers } from "./projection";

const TRANSFER = "ffffffff-0000-4000-8000-000000000001";
const BANK = "aaaaaaaa-0000-4000-8000-000000000001";
const WALLET = "aaaaaaaa-0000-4000-8000-000000000002";
const SAVINGS = "aaaaaaaa-0000-4000-8000-000000000003";
const GROCERIES = "cccccccc-0000-4000-8000-000000000001";
const DINING = "cccccccc-0000-4000-8000-000000000002";

const event = (
  id: string,
  eventType: string,
  millis: number,
  payload: Record<string, unknown> = {},
  overrides: Partial<EventFields> = {}
) =>
  loggedEvent({
    id,
    entityType: "transfer",
    entityId: TRANSFER,
    eventType,
    millis,
    payload,
    ...overrides,
  });

const details = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-10-12",
  amountCents: 200000,
  fromAccountId: BANK,
  toAccountId: WALLET,
  fromEnvelope: { kind: "category", id: GROCERIES },
  toEnvelope: { kind: "unassigned" },
  description: "",
  notes: "",
  ...overrides,
});

const v2 = { eventVersion: 2 };
const created = event(
  "e-created",
  "transfer.created",
  1000,
  { ...details(), status: "cleared" },
  v2
);
const edited = event(
  "e-edited",
  "transfer.edited",
  2000,
  details({
    amountCents: 150000,
    toAccountId: SAVINGS,
    toEnvelope: { kind: "category", id: DINING },
    description: "Top up",
  }),
  v2
);
const pending = event("e-pending", "transfer.marked_pending", 2500);
const removed = event("e-removed", "transfer.removed", 3000);
const restored = event("e-restored", "transfer.restored", 4000);

beforeEach(async () => {
  await resetLocalDatabase();
});

describe("transfer projection", () => {
  it.each(orders([created, edited, pending, removed, restored]))(
    "gives the same transfer for the order %j",
    async (_ids, order) => {
      for (const arriving of order) await receiveEvents([arriving], 0);

      expect(await getTransfer(TRANSFER)).toEqual({
        id: TRANSFER,
        householdId: HOUSEHOLD,
        visibility: "household",
        ownerUserId: null,
        date: "2026-10-12",
        amountCents: 150000,
        fromAccountId: BANK,
        toAccountId: SAVINGS,
        fromEnvelope: { kind: "category", id: GROCERIES },
        toEnvelope: { kind: "category", id: DINING },
        description: "Top up",
        notes: "",
        status: "pending",
        removed: false,
        recordedHlc: created.hlc,
      });
    }
  );

  it("reads a version 1 transfer as arriving in the envelope it left", async () => {
    const { fromEnvelope, toEnvelope: _toEnvelope, ...v1Details } = details();
    const createdV1 = event("e-created-v1", "transfer.created", 1000, {
      ...v1Details,
      envelope: fromEnvelope,
      status: "cleared",
    });
    await receiveEvents([createdV1], 0);

    expect(await getTransfer(TRANSFER)).toMatchObject({
      fromEnvelope: { kind: "category", id: GROCERIES },
      toEnvelope: { kind: "category", id: GROCERIES },
    });
  });

  const v1Payload = (overrides: Record<string, unknown> = {}) => {
    const { fromEnvelope, toEnvelope: _toEnvelope, ...v1Details } = details(overrides);
    return { ...v1Details, envelope: fromEnvelope };
  };
  const createdV1 = event("e-created-v1", "transfer.created", 1000, {
    ...v1Payload(),
    status: "cleared",
  });
  const editedV1 = event(
    "e-edited-v1",
    "transfer.edited",
    2000,
    v1Payload({ amountCents: 150000, fromEnvelope: { kind: "category", id: DINING } })
  );

  it.each(orders([createdV1, edited, pending]))(
    "gives the same transfer from a version 1 create and a version 2 edit for the order %j",
    async (_ids, order) => {
      for (const arriving of order) await receiveEvents([arriving], 0);

      expect(await getTransfer(TRANSFER)).toMatchObject({
        amountCents: 150000,
        toAccountId: SAVINGS,
        fromEnvelope: { kind: "category", id: GROCERIES },
        toEnvelope: { kind: "category", id: DINING },
        status: "pending",
        recordedHlc: createdV1.hlc,
      });
    }
  );

  it.each(orders([created, editedV1, pending]))(
    "gives the same transfer from a version 2 create and a version 1 edit for the order %j",
    async (_ids, order) => {
      for (const arriving of order) await receiveEvents([arriving], 0);

      expect(await getTransfer(TRANSFER)).toMatchObject({
        amountCents: 150000,
        fromEnvelope: { kind: "category", id: DINING },
        toEnvelope: { kind: "category", id: DINING },
        status: "pending",
        recordedHlc: created.hlc,
      });
    }
  );

  it("keeps a status change made before a later edit on another device", async () => {
    const editedLater = event("e-edited-later", "transfer.edited", 5000, details(), v2);
    await receiveEvents([editedLater, pending, created], 0);

    expect(await getTransfer(TRANSFER)).toMatchObject({ amountCents: 200000, status: "pending" });
  });

  it("keeps a removal made after an edit on another device", async () => {
    const removedLater = event("e-removed-later", "transfer.removed", 5000);
    await receiveEvents([removedLater, edited, created, removed, restored], 0);

    expect(await getTransfer(TRANSFER)).toMatchObject({ amountCents: 150000, removed: true });
    expect(await listTransfers()).toEqual([]);
  });

  it("ignores a duplicate event", async () => {
    await receiveEvents([created, edited], 0);
    await receiveEvents([created, edited], 0);

    expect(await listTransfers()).toMatchObject([{ id: TRANSFER, amountCents: 150000 }]);
  });

  it("ignores a change carrying another visibility", async () => {
    const crossing = event("e-crossing", "transfer.edited", 2500, details({ amountCents: 1 }), {
      ...v2,
      visibility: "personal",
      ownerUserId: "user-b",
    });
    await receiveEvents([crossing, created], 0);

    expect(await getTransfer(TRANSFER)).toMatchObject({ amountCents: 200000 });
  });

  it.each([
    ["the same account on both sides", { toAccountId: BANK }],
    ["no destination account", { toAccountId: "" }],
    ["an unknown envelope kind", { fromEnvelope: { kind: "budget", id: GROCERIES } }],
    ["no arrival envelope", { toEnvelope: undefined }],
    ["a zero amount", { amountCents: 0 }],
    ["an impossible date", { date: "2026-02-30" }],
  ])("projects nothing from a create with %s", async (_case, broken) => {
    await receiveEvents(
      [event("e-broken", "transfer.created", 1000, { ...details(broken), status: "cleared" }, v2)],
      0
    );

    expect(await getTransfer(TRANSFER)).toBeUndefined();
  });

  it("projects nothing from a create without a status", async () => {
    await receiveEvents([event("e-no-status", "transfer.created", 1000, details(), v2)], 0);

    expect(await getTransfer(TRANSFER)).toBeUndefined();
  });

  it("lists the newest date first, then the most recently recorded", async () => {
    const second = "ffffffff-0000-4000-8000-000000000002";
    const third = "ffffffff-0000-4000-8000-000000000003";
    const createdAs = (entityId: string, millis: number, date = "2026-10-12") =>
      event(
        `e-${entityId}`,
        "transfer.created",
        millis,
        { ...details({ date }), status: "cleared" },
        { ...v2, entityId }
      );
    await receiveEvents([created, createdAs(second, 1500), createdAs(third, 900, "2026-10-13")], 0);

    expect((await listTransfers()).map((transfer) => transfer.id)).toEqual([
      third,
      second,
      TRANSFER,
    ]);
  });

  it("describes a change by its description, or its amount when it has none", async () => {
    await receiveEvents([created], 0);

    expect(await describeEvent(created)).toBe("Add transfer: ₱2,000.00");
    expect(await describeEvent(edited)).toBe("Edit transfer: Top up");
    expect(await describeEvent(removed)).toBe("Remove transfer: ₱2,000.00");
  });
});
