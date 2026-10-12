import { listAllEvents, type StoredEvent } from "@/lib/events/log";

export interface EventLogExport {
  exportedAt: string;
  events: StoredEvent[];
}

/** Every event this device holds, which is what the member can see. */
export async function readEventLogExport(now: Date): Promise<EventLogExport> {
  return { exportedAt: now.toISOString(), events: await listAllEvents() };
}
