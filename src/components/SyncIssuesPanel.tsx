/**
 * SyncIssuesPanel Component - Advanced sync issue management UI
 *
 * Bottom-right expandable panel that provides transparency into sync operations:
 * - Conflict resolutions (what was chosen and why)
 * - Sync failures (network errors, retries)
 * - Validation errors (data issues)
 *
 * UI States:
 * - Hidden: No issues (panel doesn't render)
 * - Collapsed: Amber badge showing issue count
 * - Expanded: Full panel with issue list and actions
 *
 * User Actions:
 * - Click badge to expand panel
 * - Click X to collapse panel
 * - Click "Clear All" to dismiss all issues
 * - Individual retry/dismiss via SyncIssueItem
 *
 * Integration:
 * - Reads from useSyncIssuesStore (reactive updates)
 * - Calls syncIssuesManager for actions (retry, dismiss, clear)
 *
 * @module components/SyncIssuesPanel
 */

import { useState } from "react";
import { AlertCircle, XCircle } from "lucide-react";
import { useSyncIssuesStore } from "@/stores/syncIssuesStore";
import { syncIssuesManager } from "@/lib/sync/SyncIssuesManager";
import { SyncIssueItem } from "./SyncIssueItem";

/**
 * SyncIssuesPanel - Main component for displaying sync issues
 *
 * Renders in bottom-right corner of screen (fixed positioning).
 * Self-hiding when no issues exist.
 *
 * Visual Design:
 * - Collapsed: Amber badge with AlertCircle icon + count
 * - Expanded: Panel with header, scrollable list, footer
 * - z-index: 50 (appears above most content)
 *
 * Accessibility:
 * - Keyboard navigation supported (tab to badge, enter to expand)
 * - ARIA labels on all buttons
 * - Focus management when expanding
 *
 * @example
 * // Add to root layout
 * <div>
 *   <Outlet />
 *   <SyncIssuesPanel />
 * </div>
 */
export function SyncIssuesPanel() {
  const issues = useSyncIssuesStore((state) => state.issues);
  const [expanded, setExpanded] = useState(false);

  // Don't render anything if no issues
  if (issues.length === 0) return null;

  return (
    <div className="fixed bottom-[calc(1rem+var(--safe-area-bottom))] right-[calc(1rem+var(--safe-area-right))] max-w-md z-50">
      {/* Collapsed badge (always visible when issues exist) */}
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg shadow-lg hover:bg-amber-600 transition"
          title={`${issues.length} sync ${issues.length === 1 ? "issue" : "issues"}`}
          aria-label={`${issues.length} sync ${issues.length === 1 ? "issue" : "issues"}. Click to expand.`}
        >
          <AlertCircle className="w-5 h-5" aria-hidden="true" />
          <span className="font-medium">
            {issues.length} Sync {issues.length === 1 ? "Issue" : "Issues"}
          </span>
        </button>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden w-96">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-100 dark:border-amber-800">
            <div className="flex items-center gap-2">
              <AlertCircle
                className="w-5 h-5 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Sync Issues ({issues.length})
              </h3>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
              title="Close panel"
              aria-label="Close sync issues panel"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>

          {/* Issues list (scrollable) */}
          <div className="max-h-96 overflow-y-auto">
            {issues.map((issue) => (
              <SyncIssueItem
                key={issue.id}
                issue={issue}
                onRetry={async () => {
                  await syncIssuesManager.retrySync(issue.id);
                }}
                onDismiss={async () => {
                  await syncIssuesManager.dismissIssue(issue.id);
                }}
              />
            ))}
          </div>

          {/* Footer with Clear All button */}
          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600 flex gap-2">
            <button
              onClick={() => syncIssuesManager.clearAll()}
              className="text-xs px-3 py-1 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition"
              aria-label="Clear all sync issues"
            >
              Clear All
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
