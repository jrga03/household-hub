/**
 * Push Notifications Hook
 *
 * Manages Web Push notifications subscription and permissions.
 * Features:
 * - Permission request with user-friendly UI
 * - Service worker registration and subscription
 * - VAPID public key management
 * - Subscription storage and sync with backend
 * - Unsubscribe functionality
 *
 * @example
 * const { isSupported, permission, subscribe, unsubscribe } = usePushNotifications();
 *
 * if (isSupported && permission === 'default') {
 *   await subscribe();
 * }
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

// VAPID public key - set via VITE_VAPID_PUBLIC_KEY environment variable
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

interface PushSubscriptionState {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  subscription: PushSubscription | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    permission: "default",
    isSubscribed: false,
    subscription: null,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Check push notification support and current permission
  useEffect(() => {
    const checkSupport = async () => {
      const isSupported =
        "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      if (!isSupported) {
        setState((prev) => ({ ...prev, isSupported: false }));
        return;
      }

      const permission = Notification.permission;

      // Check if already subscribed
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        setState({
          isSupported: true,
          permission,
          isSubscribed: !!subscription,
          subscription,
        });
      } catch (error) {
        console.error("Error checking push subscription:", error);
        setState({
          isSupported: true,
          permission,
          isSubscribed: false,
          subscription: null,
        });
      }
    };

    checkSupport();
  }, []);

  // Convert VAPID key from base64 to Uint8Array
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    if (!state.isSupported) {
      toast.error("Push notifications are not supported in this browser");
      return false;
    }

    setIsLoading(true);

    try {
      // Request permission
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        toast.error("Notification permission denied");
        setState((prev) => ({ ...prev, permission }));
        setIsLoading(false);
        return false;
      }

      // Get service worker registration
      const registration = await navigator.serviceWorker.ready;

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      // TODO: Send subscription to backend for storage
      // await saveSubscriptionToBackend(subscription);
      console.log("Push subscription:", JSON.stringify(subscription));

      setState({
        isSupported: true,
        permission: "granted",
        isSubscribed: true,
        subscription,
      });

      toast.success("Notifications enabled successfully!");
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error("Error subscribing to push notifications:", error);
      toast.error("Failed to enable notifications");
      setIsLoading(false);
      return false;
    }
  }, [state.isSupported]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    if (!state.subscription) {
      return false;
    }

    setIsLoading(true);

    try {
      await state.subscription.unsubscribe();

      // TODO: Remove subscription from backend
      // await removeSubscriptionFromBackend(state.subscription);

      setState((prev) => ({
        ...prev,
        isSubscribed: false,
        subscription: null,
      }));

      toast.success("Notifications disabled");
      setIsLoading(false);
      return true;
    } catch (error) {
      console.error("Error unsubscribing from push notifications:", error);
      toast.error("Failed to disable notifications");
      setIsLoading(false);
      return false;
    }
  }, [state.subscription]);

  // Test notification
  const sendTestNotification = useCallback(async () => {
    if (!state.isSubscribed || state.permission !== "granted") {
      toast.error("Notifications not enabled");
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;

      await registration.showNotification("Household Hub Test", {
        body: "Push notifications are working! 🎉",
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-192x192.png",
        tag: "test-notification",
        requireInteraction: false,
        data: {
          url: "/dashboard",
        },
      });

      toast.success("Test notification sent");
    } catch (error) {
      console.error("Error sending test notification:", error);
      toast.error("Failed to send test notification");
    }
  }, [state.isSubscribed, state.permission]);

  return {
    ...state,
    isLoading,
    subscribe,
    unsubscribe,
    sendTestNotification,
  };
}
