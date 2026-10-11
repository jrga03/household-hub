import { useState } from "react";
import { toast } from "sonner";
import { CloudCheck, CloudOff, CloudUpload, TriangleAlert, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { confirm } from "@/lib/confirm";
import type { StuckEvent } from "@/lib/events/log";
import { discardStuckEvent, retryStuckEvent } from "@/lib/sync";
import { cn, countChanges, errorMessage } from "@/lib/utils";
import { summarizeSyncStatus, type SyncTone } from "./sync-status";

const TONE_ICONS: Record<SyncTone, LucideIcon> = {
  synced: CloudCheck,
  waiting: CloudUpload,
  offline: CloudOff,
  attention: TriangleAlert,
};

const TONE_COLORS: Record<SyncTone, string> = {
  synced: "text-muted-foreground",
  waiting: "text-muted-foreground",
  offline: "text-amber-700 dark:text-amber-400",
  attention: "text-destructive",
};

/**
 * Whether this device is online and how many changes are waiting to go out.
 * Opens a panel where changes the server refused can be retried or discarded.
 * `compact` shows the icon only (collapsed sidebar).
 */
export function SyncStatusIndicator({ compact = false }: { compact?: boolean }) {
  const { online, waiting, stuck } = useSyncStatus();
  const { label, tone } = summarizeSyncStatus({ online, waiting, stuckCount: stuck.length });
  const Icon = TONE_ICONS[tone];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={cn("gap-1.5", TONE_COLORS[tone])}
          aria-label={`Sync status: ${label}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {!compact && <span className="text-xs">{label}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{online ? "Online" : "Offline"}</p>
          <p className="text-sm text-muted-foreground">{waitingText(online, waiting)}</p>
        </div>
        {stuck.length > 0 && <StuckList stuck={stuck} />}
      </PopoverContent>
    </Popover>
  );
}

function waitingText(online: boolean, waiting: number): string {
  if (waiting === 0) return "Every change on this device has synced.";
  const changes = `${countChanges(waiting)} ${waiting === 1 ? "is" : "are"}`;
  return online
    ? `${changes} waiting to sync.`
    : `${changes} saved on this device and will sync when you reconnect.`;
}

function StuckList({ stuck }: { stuck: StuckEvent[] }) {
  return (
    <section aria-labelledby="stuck-changes-heading" className="space-y-2 border-t pt-3">
      <h2 id="stuck-changes-heading" className="text-sm font-medium text-destructive">
        Refused by the server
      </h2>
      <p className="text-xs text-muted-foreground">
        Retry once the problem is fixed, or discard the change to remove it from this device.
      </p>
      <ul aria-label="Stuck changes" className="space-y-2">
        {stuck.map((event) => (
          <StuckItem key={event.id} event={event} />
        ))}
      </ul>
    </section>
  );
}

function StuckItem({ event }: { event: StuckEvent }) {
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      toast.error(errorMessage(caught, failure));
    } finally {
      setBusy(false);
    }
  };

  const discard = async () => {
    const confirmed = await confirm({
      title: "Discard this change?",
      description: `"${event.description}" never reached the server. Discarding removes it from this device for good.`,
      confirmLabel: "Discard",
      destructive: true,
    });
    if (!confirmed) return;
    await run(() => discardStuckEvent(event.id), "Couldn't discard the change.");
  };

  return (
    <li className="rounded-md border p-2 text-sm">
      <p className="font-medium">{event.description}</p>
      {event.reason && <p className="text-xs text-muted-foreground">{event.reason}</p>}
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run(() => retryStuckEvent(event.id), "Couldn't retry the change.")}
        >
          Retry
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void discard()}>
          Discard
        </Button>
      </div>
    </li>
  );
}
