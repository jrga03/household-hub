import { useEffect, useState } from "react";
import { db } from "@/lib/dexie/db";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";

/**
 * CompactionMonitor - Displays a warning banner when compaction is needed
 *
 * Shows a yellow banner at the top of the page when one or more entities
 * have reached the compaction threshold (≥100 events). Links to Settings
 * page where users can manually trigger compaction.
 *
 * This component uses Dexie live queries to reactively update when events
 * are added or removed from IndexedDB.
 */
export function CompactionMonitor() {
  // Live query for total event count (triggers re-render when events change)
  const eventCount = useLiveQuery(() => db.events.count());

  // State for tracking how many entities need compaction
  const [needsCompaction, setNeedsCompaction] = useState(0);
  const [_entityIds, setEntityIds] = useState<string[]>([]);

  /**
   * Check which entities need compaction (≥100 events)
   */
  const checkCompactionNeeds = async () => {
    try {
      // Count events per entity (memory-efficient streaming)
      const entityEventCounts = new Map<string, number>();

      await db.events.each((event) => {
        const count = entityEventCounts.get(event.entity_id) || 0;
        entityEventCounts.set(event.entity_id, count + 1);
      });

      // Find entities with ≥100 events
      const entitiesNeedingCompaction: string[] = [];
      for (const [entityId, count] of entityEventCounts.entries()) {
        if (count >= 100) {
          entitiesNeedingCompaction.push(entityId);
        }
      }

      setNeedsCompaction(entitiesNeedingCompaction.length);
      setEntityIds(entitiesNeedingCompaction);
    } catch (error) {
      console.error("[CompactionMonitor] Failed to check compaction needs:", error);
    }
  };

  // Check compaction needs whenever event count changes
  useEffect(() => {
    checkCompactionNeeds();
  }, [eventCount]);

  // Don't render anything if no compaction needed
  if (!eventCount || needsCompaction === 0) {
    return null;
  }

  return (
    <div className="bg-yellow-50 dark:bg-yellow-950 border-b border-yellow-200 dark:border-yellow-800">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
              Compaction Recommended
            </p>
            <p className="text-sm text-yellow-700 dark:text-yellow-300">
              {needsCompaction} {needsCompaction === 1 ? "entity needs" : "entities need"}{" "}
              compaction ({eventCount?.toLocaleString()} total events).{" "}
              <Link
                to="/settings"
                className="underline hover:no-underline font-medium"
                aria-label="Go to settings to compact event log"
              >
                Compact now
              </Link>{" "}
              to improve performance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
