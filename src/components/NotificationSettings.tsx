import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, BellOff, AlertCircle } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/**
 * Notification preferences stored in profiles.notification_preferences JSONB field.
 */
interface NotificationPreferences {
  budget_alerts: boolean;
  mentions: boolean;
  due_dates: boolean;
}

/**
 * NotificationSettings component for managing push notification preferences.
 *
 * Features:
 * - Permission request flow with browser compatibility detection
 * - Real-time preference toggles (budget alerts, mentions, due dates)
 * - Subscribe/unsubscribe functionality
 * - User-friendly error states (blocked, unsupported)
 * - Device-scoped subscriptions via usePushNotifications hook
 *
 * Browser Support:
 * - ✅ Chrome 42+ (Desktop/Android)
 * - ✅ Firefox 44+
 * - ✅ Edge 17+
 * - ⚠️ Safari 16.4+ (iOS/macOS - limited, requires PWA installation)
 * - ❌ Safari < 16.4 (no support)
 *
 * @example
 * ```tsx
 * <NotificationSettings />
 * ```
 */
export function NotificationSettings() {
  const { permission, isSubscribed, isLoading, canAsk, isDenied, subscribe, unsubscribe } =
    usePushNotifications();

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    budget_alerts: true,
    mentions: true,
    due_dates: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Load preferences from profiles table on mount
  useEffect(() => {
    async function loadPreferences() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", user.id)
        .single();

      if (error) {
        console.error("Error loading preferences:", error);
        return;
      }

      if (profile?.notification_preferences) {
        setPreferences(profile.notification_preferences as NotificationPreferences);
      }
    }

    loadPreferences();
  }, []);

  /**
   * Updates a single notification preference in the database.
   *
   * Performs optimistic UI update followed by database persistence.
   * Shows success/error toast for user feedback.
   *
   * @param key - Preference key to update
   * @param value - New boolean value
   */
  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    setIsSaving(true);
    try {
      const newPreferences = { ...preferences, [key]: value };
      setPreferences(newPreferences);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({ notification_preferences: newPreferences })
        .eq("id", user.id);

      if (error) throw error;

      toast.success("Preferences updated");
    } catch (error) {
      toast.error("Failed to update preferences");
      console.error(error);
      // Revert optimistic update on error
      setPreferences((prev) => ({ ...prev, [key]: !value }));
    } finally {
      setIsSaving(false);
    }
  }

  /**
   * Handles subscribe button click with user feedback.
   */
  async function handleSubscribe() {
    const success = await subscribe();
    if (success) {
      toast.success("Notifications enabled!");
    } else {
      toast.error("Failed to enable notifications. Please try again.");
    }
  }

  /**
   * Handles unsubscribe button click with user feedback.
   */
  async function handleUnsubscribe() {
    const success = await unsubscribe();
    if (success) {
      toast.success("Notifications disabled");
    } else {
      toast.error("Failed to disable notifications");
    }
  }

  // Browser compatibility check
  if (!("Notification" in window)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Notifications Not Supported
          </CardTitle>
          <CardDescription>
            Your browser doesn't support push notifications. Try using Chrome, Firefox, or Edge for
            the best experience.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Push Notifications
        </CardTitle>
        <CardDescription>
          Get notified about budget alerts, pending transactions, and important updates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Browser blocked state */}
        {isDenied && (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Notifications are blocked</p>
                <p className="mt-1 text-destructive/80">
                  Please enable them in your browser settings to receive alerts.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Enable notifications button (permission = default) */}
        {canAsk && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Enable notifications to receive budget alerts and reminders even when the app is
              closed.
            </p>
            <Button onClick={handleSubscribe} disabled={isLoading} size="lg" className="w-full">
              <Bell className="mr-2 h-4 w-4" />
              Enable Notifications
            </Button>
          </div>
        )}

        {/* Notification preferences (permission = granted && subscribed) */}
        {isSubscribed && (
          <div className="space-y-4">
            <div className="space-y-3">
              {/* Budget Alerts */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="budget-alerts" className="text-base cursor-pointer">
                    Budget Alerts
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Notify when spending reaches 80% of budget
                  </p>
                </div>
                <Switch
                  id="budget-alerts"
                  checked={preferences.budget_alerts}
                  onCheckedChange={(checked) => updatePreference("budget_alerts", checked)}
                  disabled={isSaving}
                />
              </div>

              {/* Pending Transaction Reminders */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="due-dates" className="text-base cursor-pointer">
                    Pending Transaction Reminders
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Remind about uncleared transactions older than 3 days
                  </p>
                </div>
                <Switch
                  id="due-dates"
                  checked={preferences.due_dates}
                  onCheckedChange={(checked) => updatePreference("due_dates", checked)}
                  disabled={isSaving}
                />
              </div>

              {/* @Mentions */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="mentions" className="text-base cursor-pointer">
                    @Mentions
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Get notified when tagged in transactions
                  </p>
                </div>
                <Switch
                  id="mentions"
                  checked={preferences.mentions}
                  onCheckedChange={(checked) => updatePreference("mentions", checked)}
                  disabled={isSaving}
                />
              </div>
            </div>

            {/* Disable notifications button */}
            <Button
              variant="outline"
              onClick={handleUnsubscribe}
              disabled={isLoading}
              className="w-full"
            >
              <BellOff className="mr-2 h-4 w-4" />
              Disable Notifications
            </Button>
          </div>
        )}

        {/* iOS Safari warning (granted but not subscribed - likely needs PWA install) */}
        {permission === "granted" && !isSubscribed && !canAsk && (
          <div className="rounded-lg bg-muted p-4 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Notifications enabled but not active</p>
                <p className="mt-1 text-muted-foreground">
                  On iOS Safari, you may need to add this app to your home screen first. Tap the
                  Share button and select "Add to Home Screen".
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
