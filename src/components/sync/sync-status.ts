export interface SyncStatus {
  online: boolean;
  /** Local changes not yet pushed. */
  waiting: number;
  /** Changes the server refused, held for the member. */
  stuckCount: number;
}

export type SyncTone = "synced" | "waiting" | "offline" | "attention";

/** A stuck change outranks being offline, which outranks waiting. */
function toneOf({ online, waiting, stuckCount }: SyncStatus): SyncTone {
  if (stuckCount > 0) return "attention";
  if (!online) return "offline";
  return waiting > 0 ? "waiting" : "synced";
}

export function summarizeSyncStatus(status: SyncStatus): { label: string; tone: SyncTone } {
  const parts = [
    status.online ? null : "Offline",
    status.waiting > 0 ? `${status.waiting} waiting` : null,
    status.stuckCount > 0 ? `${status.stuckCount} stuck` : null,
  ].filter((part) => part !== null);
  return { label: parts.length > 0 ? parts.join(" · ") : "Synced", tone: toneOf(status) };
}
