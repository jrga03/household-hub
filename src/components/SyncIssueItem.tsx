/**
 * SyncIssueItem Component - Individual sync issue display
 *
 * Displays a single sync issue with:
 * - Color-coded icon (green checkmark, red X, amber alert)
 * - Issue type label and message
 * - Relative timestamp ("2m ago", "1h ago")
 * - Expandable details for conflicts (local/remote/resolved values)
 * - Retry button (if canRetry is true)
 * - Dismiss button
 *
 * Used by SyncIssuesPanel to render the list of issues.
 *
 * @module components/SyncIssueItem
 */

import { useState } from "react";
import { CheckCircle, XCircle, AlertCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import type { SyncIssue } from "@/stores/syncIssuesStore";

/**
 * Props for SyncIssueItem component
 */
interface SyncIssueItemProps {
  /** The sync issue to display */
  issue: SyncIssue;

  /** Callback when user clicks retry button */
  onRetry: () => Promise<void>;

  /** Callback when user clicks dismiss button */
  onDismiss: () => Promise<void>;
}

/**
 * SyncIssueItem - Renders individual sync issue with actions
 *
 * Visual Design:
 * - Left: Color-coded icon based on issue type
 * - Center: Type label, message, timestamp, expandable details
 * - Right: Action buttons (retry, dismiss)
 *
 * @example
 * <SyncIssueItem
 *   issue={issue}
 *   onRetry={async () => await syncIssuesManager.retrySync(issue.id)}
 *   onDismiss={async () => await syncIssuesManager.dismissIssue(issue.id)}
 * />
 */
export function SyncIssueItem({ issue, onRetry, onDismiss }: SyncIssueItemProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  /**
   * Handle retry button click
   * Shows loading state during retry and toast notification after
   */
  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry();
      toast.success("Sync retried successfully");
    } catch (error) {
      toast.error("Retry failed");
    } finally {
      setIsRetrying(false);
    }
  };

  /**
   * Get icon component based on issue type
   * - conflict-resolved: Green checkmark (LWW resolved)
   * - sync-failed: Red X (network/server error)
   * - validation-error: Amber alert (validation issue)
   */
  const getIcon = () => {
    switch (issue.issueType) {
      case "conflict-resolved":
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "sync-failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      case "validation-error":
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
    }
  };

  /**
   * Get human-readable label for issue type
   */
  const getTypeLabel = () => {
    switch (issue.issueType) {
      case "conflict-resolved":
        return "Conflict Resolved";
      case "sync-failed":
        return "Sync Failed";
      case "validation-error":
        return "Validation Error";
    }
  };

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex items-start gap-3">
        {/* Icon (left) */}
        {getIcon()}

        {/* Content (center) */}
        <div className="flex-1 min-w-0">
          {/* Type label */}
          <p className="text-sm font-medium text-gray-900 dark:text-white">{getTypeLabel()}</p>

          {/* Message */}
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{issue.message}</p>

          {/* Timestamp */}
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {formatRelativeTime(issue.timestamp)}
          </p>

          {/* Expandable conflict details (only for conflicts) */}
          {issue.localValue !== undefined && issue.remoteValue !== undefined && (
            <details className="mt-2">
              <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer hover:underline">
                View details
              </summary>
              <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-900 rounded text-xs space-y-1 font-mono overflow-x-auto">
                <div>
                  <strong className="text-gray-700 dark:text-gray-300">Local:</strong>
                  <pre className="text-gray-900 dark:text-gray-100 mt-1 whitespace-pre-wrap break-words">
                    {formatJSONSafely(issue.localValue)}
                  </pre>
                </div>
                <div>
                  <strong className="text-gray-700 dark:text-gray-300">Remote:</strong>
                  <pre className="text-gray-900 dark:text-gray-100 mt-1 whitespace-pre-wrap break-words">
                    {formatJSONSafely(issue.remoteValue)}
                  </pre>
                </div>
                <div>
                  <strong className="text-gray-700 dark:text-gray-300">Resolved:</strong>
                  <pre className="text-green-600 dark:text-green-400 font-semibold mt-1 whitespace-pre-wrap break-words">
                    {formatJSONSafely(issue.resolvedValue)}
                  </pre>
                </div>
              </div>
            </details>
          )}
        </div>

        {/* Actions (right) */}
        <div className="flex gap-2">
          {/* Retry button (only if retryable) */}
          {issue.canRetry && (
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="p-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 disabled:opacity-50 transition"
              title="Retry sync"
              aria-label="Retry sync"
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`} />
            </button>
          )}

          {/* Dismiss button (always shown) */}
          <button
            onClick={onDismiss}
            className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition"
            title="Dismiss"
            aria-label="Dismiss issue"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Format ISO timestamp string as relative time
 *
 * Formats:
 * - < 1 minute: "Just now"
 * - < 1 hour: "Nm ago" (e.g., "5m ago")
 * - < 24 hours: "Nh ago" (e.g., "3h ago")
 * - >= 24 hours: "Nd ago" (e.g., "2d ago")
 *
 * @param isoString - ISO 8601 timestamp string
 * @returns Relative time string
 *
 * @example
 * formatRelativeTime("2025-10-28T10:30:00Z"); // "5m ago" (if current time is 10:35)
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);

  // Validate date
  if (isNaN(date.getTime())) {
    return "Invalid date";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Handle future dates (clock skew)
  if (diffMs < 0) {
    return "Just now";
  }

  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;

  // Show absolute date for old issues
  return date.toLocaleDateString();
}

/**
 * Safely format JSON for display (prevents XSS)
 *
 * Escapes HTML entities to prevent script injection if sync data is compromised.
 *
 * @param value - Value to format as JSON
 * @returns Safely escaped JSON string
 */
function formatJSONSafely(value: unknown): string {
  try {
    const jsonStr = JSON.stringify(value, null, 2);
    // Escape HTML entities to prevent XSS
    return jsonStr
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  } catch {
    return "[Invalid JSON]";
  }
}
