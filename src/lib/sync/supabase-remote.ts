import { supabase } from "@/lib/supabase";
import { isVisibility, type LoggedEvent } from "@/lib/events/log";
import type { Json, Tables, TablesInsert } from "@/types/database.types";
import type { PulledEvent, RemoteEventLog } from "./engine";

/** The server refused the request (as opposed to the device being unable to reach it). */
export class EventLogRejected extends Error {
  constructor(
    message: string,
    readonly code: string
  ) {
    super(message);
    this.name = "EventLogRejected";
  }
}

function toError(error: { message: string; code: string }): Error {
  // supabase-js reports a failed fetch as an error with no Postgres code.
  return error.code ? new EventLogRejected(error.message, error.code) : new Error(error.message);
}

// actor_user_id is left to the server default, auth.uid().
const toRow = (event: LoggedEvent): TablesInsert<"events"> => ({
  id: event.id,
  household_id: event.householdId,
  visibility: event.visibility,
  owner_user_id: event.ownerUserId,
  entity_type: event.entityType,
  entity_id: event.entityId,
  event_type: event.eventType,
  event_version: event.eventVersion,
  hlc: event.hlc,
  device_id: event.deviceId,
  // Payloads are built from JSON-safe values by commands or read from JSON.
  payload: event.payload as { [key: string]: Json },
});

const isJsonObject = (value: Json): value is { [key: string]: Json | undefined } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fromRow(row: Tables<"events">): PulledEvent {
  // The table's check constraint allows only these.
  if (!isVisibility(row.visibility)) throw new Error(`Unknown visibility: ${row.visibility}`);
  return {
    id: row.id,
    sequence: row.sequence,
    householdId: row.household_id,
    visibility: row.visibility,
    ownerUserId: row.owner_user_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    eventType: row.event_type,
    eventVersion: row.event_version,
    hlc: row.hlc,
    deviceId: row.device_id,
    actorUserId: row.actor_user_id,
    payload: isJsonObject(row.payload) ? row.payload : {},
  };
}

export const supabaseEventLog: RemoteEventLog = {
  async push(events) {
    const { error } = await supabase
      .from("events")
      .upsert(events.map(toRow), { onConflict: "id", ignoreDuplicates: true });
    if (error) throw toError(error);
  },

  async pull(afterSequence, batchSize) {
    const { data, error } = await supabase.rpc("pull_events", {
      after_sequence: afterSequence,
      batch_size: batchSize,
    });
    if (error) throw toError(error);
    return data.map(fromRow);
  },
};
