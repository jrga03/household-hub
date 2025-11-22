/**
 * Notification Settings Component
 *
 * UI for managing push notification preferences.
 * Features:
 * - Enable/disable push notifications
 * - Test notification button
 * - Permission status display
 * - Platform compatibility check
 *
 * @example
 * // In Settings page
 * <NotificationSettings />
 */

import { Bell, BellOff, TestTube2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function NotificationSettings() {
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
    sendTestNotification,
  } = usePushNotifications();

  // Not supported banner
  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Push Notifications</CardTitle>
              <CardDescription>
                Stay updated with budget alerts and transaction reminders
              </CardDescription>
            </div>
            <Badge variant="secondary">Not Supported</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Push notifications are not supported in this browser. Try using Chrome, Edge, or Firefox
            on desktop, or Chrome/Safari on mobile.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Permission status badge
  const getPermissionBadge = () => {
    switch (permission) {
      case "granted":
        return <Badge className="bg-green-600">Enabled</Badge>;
      case "denied":
        return <Badge variant="destructive">Blocked</Badge>;
      default:
        return <Badge variant="secondary">Not Set</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Push Notifications</CardTitle>
            <CardDescription>
              Get notified about budget alerts, bill reminders, and overspending warnings
            </CardDescription>
          </div>
          {getPermissionBadge()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Permission denied message */}
        {permission === "denied" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20">
            <p className="text-sm text-red-900 dark:text-red-300">
              Notifications are blocked. To enable them, click the lock icon in your browser's
              address bar and change the notification permission to "Allow".
            </p>
          </div>
        )}

        {/* Features list */}
        {!isSubscribed && permission !== "denied" && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Get notified when:</p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>You're approaching your monthly budget limit (80%, 100%)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>A recurring bill is due in 3 days</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>Unusual spending patterns are detected</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5">•</span>
                <span>Your sync queue has pending changes</span>
              </li>
            </ul>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          {!isSubscribed ? (
            <Button
              onClick={subscribe}
              disabled={isLoading || permission === "denied"}
              className="gap-2"
            >
              <Bell className="h-4 w-4" />
              Enable Notifications
            </Button>
          ) : (
            <>
              <Button
                onClick={unsubscribe}
                variant="outline"
                disabled={isLoading}
                className="gap-2"
              >
                <BellOff className="h-4 w-4" />
                Disable
              </Button>
              <Button
                onClick={sendTestNotification}
                variant="secondary"
                disabled={isLoading}
                className="gap-2"
              >
                <TestTube2 className="h-4 w-4" />
                Send Test
              </Button>
            </>
          )}
        </div>

        {/* Subscribed status */}
        {isSubscribed && (
          <div className="rounded-lg border bg-green-50 p-4 dark:bg-green-950/20">
            <p className="text-sm text-green-900 dark:text-green-300">
              ✓ Notifications are enabled. You'll receive alerts based on your preferences.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
