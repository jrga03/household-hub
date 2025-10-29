import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device";

// VAPID public key from Cloudflare Worker setup
// TODO: Replace with your actual public key from Step 1
const VAPID_PUBLIC_KEY =
  "BLc5asl8GQ8vq4B3sdmA0mZ1Oaw7mB199CDw5nIvP24cU5vJxgFV8OxKCbPNQqyqC36HrpV_KeNTp0N5mvVcCqM";

// Cloudflare Worker URL
// TODO: Replace with your deployed worker URL
// const PUSH_WORKER_URL = "https://household-hub-push.your-subdomain.workers.dev";

/**
 * Converts a base64url-encoded string to a Uint8Array for VAPID key.
 *
 * The Push API requires the VAPID public key as a Uint8Array, but keys
 * are typically distributed as base64url strings. This function handles
 * the conversion, including proper padding.
 *
 * @param base64String - Base64url-encoded VAPID key
 * @returns Uint8Array suitable for pushManager.subscribe()
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/**
 * React hook for managing push notification subscriptions.
 *
 * Provides permission management, subscription lifecycle, and device-scoped
 * push notification support. Each device gets its own push subscription linked
 * via device_id from the device identification system.
 *
 * @returns Object with permission state and subscription methods
 *
 * @example
 * ```tsx
 * const { isSubscribed, subscribe, unsubscribe, canAsk } = usePushNotifications();
 *
 * if (canAsk) {
 *   return <Button onClick={subscribe}>Enable Notifications</Button>;
 * }
 * ```
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check permission status on mount
  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    checkSubscription();
  }, []);

  /**
   * Checks if the user is currently subscribed to push notifications.
   *
   * Queries the service worker's PushManager to see if an active subscription
   * exists for this device.
   */
  const checkSubscription = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  };

  /**
   * Subscribes the user to push notifications.
   *
   * Workflow:
   * 1. Request notification permission from the browser
   * 2. Subscribe to push via the service worker using VAPID key
   * 3. Get device ID from device identification system
   * 4. Store subscription in database with device_id for multi-device support
   *
   * @returns true if subscription successful, false otherwise
   */
  const subscribe = async (): Promise<boolean> => {
    setIsLoading(true);

    try {
      // Step 1: Request permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== "granted") {
        throw new Error("Permission not granted");
      }

      // Step 2: Subscribe to push
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      // Step 3: Get authenticated user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Step 4: Get device ID from device identification system
      const deviceId = await getDeviceId();

      // Step 5: Extract subscription details for storage
      const subscriptionJSON = subscription.toJSON();
      const keys = subscriptionJSON.keys;

      if (!keys?.p256dh || !keys?.auth) {
        throw new Error("Invalid subscription keys");
      }

      // Step 6: Save to database with device_id for multi-device support
      const { error } = await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          device_id: deviceId,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: "user_id,device_id" }
      );

      if (error) throw error;

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error("Subscribe error:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Unsubscribes the user from push notifications.
   *
   * Workflow:
   * 1. Unsubscribe from push via the service worker
   * 2. Remove subscription from database by endpoint
   *
   * @returns true if unsubscribe successful, false otherwise
   */
  const unsubscribe = async (): Promise<boolean> => {
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push service
        await subscription.unsubscribe();

        // Remove from database
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
        }
      }

      setIsSubscribed(false);
      return true;
    } catch (error) {
      console.error("Unsubscribe error:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    // Permission state
    permission,
    isSubscribed,
    isLoading,

    // Permission flags for UI rendering
    canAsk: permission === "default",
    isGranted: permission === "granted",
    isDenied: permission === "denied",

    // Subscription methods
    subscribe,
    unsubscribe,
  };
}
