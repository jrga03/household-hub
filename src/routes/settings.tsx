import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { eventCompactor, type CompactionStats } from "@/lib/event-compactor";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [compacting, setCompacting] = useState(false);
  const [lastStats, setLastStats] = useState<CompactionStats | null>(null);

  const handleCompaction = async () => {
    setCompacting(true);
    try {
      const stats = await eventCompactor.compactAll();
      setLastStats(stats);

      if (stats.entitiesCompacted > 0) {
        toast.success(
          `Compaction complete: ${stats.entitiesCompacted} entities compacted, ` +
            `${stats.eventsDeleted} events deleted in ${stats.duration}ms`
        );
      } else {
        toast.info("No compaction needed - all entities below threshold");
      }
    } catch (error) {
      console.error("[Settings] Compaction failed:", error);
      toast.error("Compaction failed - see console for details");
    } finally {
      setCompacting(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-2">Manage your application settings and storage</p>
      </div>

      {/* Storage Management Section */}
      <Card>
        <CardHeader>
          <CardTitle>Storage Management</CardTitle>
          <CardDescription>
            Compact event logs to reduce storage usage and improve performance. Compaction is
            automatic but can be triggered manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleCompaction} disabled={compacting} variant="outline" size="lg">
              {compacting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {compacting ? "Compacting..." : "Compact Event Log"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Reduces storage by removing old events while preserving data integrity
            </p>
          </div>

          {lastStats && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h3 className="font-semibold mb-3">Last Compaction Results</h3>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Entities Compacted</dt>
                  <dd className="font-medium">{lastStats.entitiesCompacted}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Events Deleted</dt>
                  <dd className="font-medium">{lastStats.eventsDeleted}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Snapshots Created</dt>
                  <dd className="font-medium">{lastStats.snapshotsCreated}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Storage Saved</dt>
                  <dd className="font-medium">~{(lastStats.storageSaved / 1024).toFixed(1)} KB</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-medium">{lastStats.duration}ms</dd>
                </div>
              </dl>
            </div>
          )}

          <div className="pt-4 border-t">
            <h4 className="font-medium mb-2">About Compaction</h4>
            <ul className="text-sm text-muted-foreground space-y-2">
              <li>
                • <strong>Automatic:</strong> Runs daily at 3 AM and on app startup
              </li>
              <li>
                • <strong>Triggers:</strong> Compacts when entities have 100+ events or after 30
                days
              </li>
              <li>
                • <strong>Safety:</strong> Keeps last 10 events per entity for conflict resolution
              </li>
              <li>
                • <strong>Data Integrity:</strong> Creates snapshots before deleting old events
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
