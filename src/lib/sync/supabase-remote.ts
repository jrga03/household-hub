import { supabase } from "@/lib/supabase";
import type { LoggedEvent } from "@/lib/events/log";
import { isVisibility } from "@/lib/events/ownership";
import type { Json, Tables, TablesInsert } from "@/types/database.types";
import { EventLogRejected, type PulledEvent, type RemoteEventLog } from "./engine";

// Codes that will refuse the same events however often they are sent: data
// exceptions, integrity violations, RLS, and exceptions our own functions
// raise. Other class 42 errors (an undefined table or column) come from a
// deploy out of step with the app, and clear once it is fixed.
const PERMANENT_PREFIXES = ["22", "23", "42501", "P0"];

/**
 * Whether the server will refuse this request every time. Everything else is
 * worth retrying: no code (supabase-js couldn't reach the server), PostgREST's
 * own errors (an expired token, the database unreachable), dropped
 * connections, conflicts, timeouts and overload.
 */
export const isPermanentRejection = (code: string): boolean =>
  PERMANENT_PREFIXES.some((prefix) => code.startsWith(prefix));

function toError(error: { message: string; code: string }): Error {
  return isPermanentRejection(error.code)
    ? new EventLogRejected(error.message, error.code)
    : new Error(error.message);
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
    // Without a session the request goes out as anon and RLS refuses it, which would read as permanent.
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Not signed in; the push waits for a session.");
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

  async currentHouseholdId() {
    // RLS shows a member their own household and nobody else any. The sync
    // triggers back off on their own; the client's GET retries would hold
    // every offline sync (and sign-out's last sync) for seconds.
    const { data, error } = await supabase
      .from("households")
      .select("id")
      .retry(false)
      .maybeSingle();
    if (error) throw toError(error);
    return data?.id ?? null;
  },
};
