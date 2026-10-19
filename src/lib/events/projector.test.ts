import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Table } from "dexie";
import { db } from "@/lib/dexie/db";
import { resetLocalDatabase } from "@/lib/dexie/reset";
import {
  appendEvent,
  countWaiting,
  discardStuck,
  listStuck,
  markStuck,
  receiveEvents,
  switchHousehold,
  type LoggedEvent,
} from "./log";
import { type Visibility } from "./ownership";
import { registerProjection } from "./projector";

// A second entity, registered only here, to show the log needs no edits to project one.
interface WidgetRow {
  id: string;
  householdId: string;
  visibility: Visibility;
  label: string;
}

const HOUSEHOLD = "11111111-1111-4111-8111-111111111111";
const WIDGET_ID = "bbbbbbbb-0000-4000-8000-000000000001";

let widgets: Table<WidgetRow, string>;

beforeAll(async () => {
  db.close();
  db.version(db.verno + 1).stores({ widgets: "id" });
  await db.open();
  widgets = db.table("widgets");
  registerProjection<WidgetRow>({
    entityType: "widget",
    table: widgets,
    versions: {
      "widget.created": {
        current: 2,
        upcasts: { 1: (payload) => ({ label: payload.name }) },
      },
      "widget.renamed": { current: 1, upcasts: {} },
    },
    isCreation: (event) => event.eventType === "widget.created",
    fold(widget, event) {
      const label = typeof event.payload.label === "string" ? event.payload.label : null;
      if (label === null) return widget;
      if (!widget) {
        if (event.eventType !== "widget.created") return null;
        return {
          id: event.entityId,
          householdId: event.householdId,
          visibility: event.visibility,
          label,
        };
      }
      return { ...widget, label };
    },
    describe: (_event, widget) => `Widget change, now ${widget?.label ?? "gone"}`,
  });
});

beforeEach(async () => {
  await resetLocalDatabase();
});

function widgetEvent(
  id: string,
  eventType: string,
  eventVersion: number,
  hlc: string,
  payload: Record<string, unknown>,
  visibility: Visibility = "household"
): LoggedEvent {
  return {
    id,
    householdId: HOUSEHOLD,
    visibility,
    ownerUserId: visibility === "personal" ? "user-b" : null,
    entityType: "widget",
    entityId: WIDGET_ID,
    eventType,
    eventVersion,
    hlc,
    deviceId: "device-b",
    actorUserId: "user-b",
    payload,
  };
}

const created = widgetEvent("e-created", "widget.created", 1, "000000000001000-000000-device-b", {
  name: "Sprocket",
});
const renamed = widgetEvent("e-renamed", "widget.renamed", 1, "000000000002000-000000-device-b", {
  label: "Gear",
});

const labels = async () => (await widgets.toArray()).map((widget) => widget.label);

describe("a registered entity", () => {
  it("projects the same row for every arrival order, duplicates included, upcasting old versions", async () => {
    const orders = [
      [created, renamed],
      [renamed, created],
      [renamed, created, renamed],
      [created, renamed, created],
    ];
    for (const order of orders) {
      await resetLocalDatabase();
      await receiveEvents(order, order.length);
      expect(await labels()).toEqual(["Gear"]);
    }

    await resetLocalDatabase();
    await receiveEvents([created], 1);
    expect(await labels()).toEqual(["Sprocket"]);
  });

  it("leaves out events of a version this app doesn't know", async () => {
    await receiveEvents([{ ...created, eventVersion: 3 }], 1);

    expect(await labels()).toEqual([]);
  });

  it("describes and discards a stuck change, dropping the entity with its create", async () => {
    const draft = {
      householdId: HOUSEHOLD,
      visibility: "household" as const,
      ownerUserId: null,
      entityType: "widget",
      entityId: WIDGET_ID,
      actorUserId: "user-a",
    };
    const create = await appendEvent({
      ...draft,
      eventType: "widget.created",
      eventVersion: 2,
      payload: { label: "Sprocket" },
    });
    await appendEvent({
      ...draft,
      eventType: "widget.renamed",
      eventVersion: 1,
      payload: { label: "Gear" },
    });
    await markStuck(create.id, "refused");

    expect(await listStuck()).toEqual([
      { id: create.id, description: "Widget change, now Gear", reason: "refused" },
    ]);

    await discardStuck(create.id);

    expect(await listStuck()).toEqual([]);
    expect(await countWaiting()).toBe(0);
    expect(await labels()).toEqual([]);
  });

  it("wipes Household rows of another household on a switch, keeping Personal ones", async () => {
    await switchHousehold(HOUSEHOLD);
    const personalId = "bbbbbbbb-0000-4000-8000-000000000002";
    await receiveEvents(
      [
        created,
        {
          ...widgetEvent(
            "e-personal",
            "widget.created",
            2,
            "000000000003000-000000-device-b",
            { label: "Mine" },
            "personal"
          ),
          entityId: personalId,
        },
      ],
      2
    );

    await switchHousehold(null);

    expect(await labels()).toEqual(["Mine"]);
  });
});
