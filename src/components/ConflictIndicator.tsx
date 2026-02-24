/**
 * ConflictIndicator Component
 *
 * Displays a badge with the count of pending conflicts in the top-right corner
 * of the application. Shows a popover with explanation when clicked.
 *
 * Conflict Lifecycle:
 * 1. Two devices edit same entity concurrently → conflict detected
 * 2. Conflict persisted to IndexedDB and added to Zustand store
 * 3. This component shows badge with pending count
 * 4. Sync processor auto-resolves using field-level merge rules
 * 5. Badge disappears when no pending conflicts remain
 *
 * Auto-Resolution Strategies (Phase B):
 * - last-write-wins: Default for most fields (amount_cents, description, etc.)
 * - cleared-wins: Transaction status where 'cleared' beats 'pending'
 * - concatenate: Merge both versions with separator (notes field)
 * - delete-wins: DELETE operations beat UPDATE operations
 * - false-wins: Deactivation wins for is_active fields
 *
 * UI Position:
 * - Fixed position in top-right corner
 * - Only visible when conflicts exist
 * - Non-intrusive badge with warning icon
 *
 * @see docs/initial plan/SYNC-ENGINE.md (lines 365-511 for resolution rules)
 * @see docs/initial plan/DECISIONS.md (Decision #78 for field-level merge)
 * @module components/ConflictIndicator
 */

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useConflictStore } from "@/stores/conflictStore";

/**
 * ConflictIndicator - Badge showing pending conflict count
 *
 * @example
 * // In root layout or App.tsx
 * <div className="relative">
 *   <ConflictIndicator />
 *   {children}
 * </div>
 */
export function ConflictIndicator() {
  const pendingCount = useConflictStore((state) => state.getPendingCount());

  // Don't render if no pending conflicts
  if (pendingCount === 0) {
    return null;
  }

  return (
    <div className="fixed top-[calc(1rem+var(--safe-area-top))] right-[calc(1rem+var(--safe-area-right))] z-50">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <Badge variant="secondary">{pendingCount}</Badge>
            <span className="text-sm">{pendingCount === 1 ? "Conflict" : "Conflicts"}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-2">
            <h4 className="font-semibold">Concurrent Edits Detected</h4>
            <p className="text-sm text-muted-foreground">
              {pendingCount === 1
                ? "1 conflict was detected"
                : `${pendingCount} conflicts were detected`}{" "}
              when syncing changes from another device.
            </p>
            <p className="text-sm text-muted-foreground">
              Conflicts are automatically resolved using smart merge rules:
            </p>
            <ul className="text-xs text-muted-foreground space-y-1 pl-4">
              <li>• Most recent changes win for amounts and descriptions</li>
              <li>• &ldquo;Cleared&rdquo; status always beats &ldquo;pending&rdquo;</li>
              <li>• Notes are merged from both versions</li>
              <li>• Deletions always win over updates</li>
            </ul>
            <p className="text-sm text-muted-foreground pt-2">
              Your data is safe. All changes are preserved in the audit log.
            </p>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
