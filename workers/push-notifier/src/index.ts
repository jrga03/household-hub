/**
 * Household Hub Push Notification Worker
 *
 * Handles Web Push notifications with JWT authentication and scheduled triggers.
 * This worker is responsible for:
 * 1. Sending push notifications via Web Push API (fetch handler)
 * 2. Triggering scheduled notification jobs via cron (scheduled handler)
 *
 * Security:
 * - All requests require valid Supabase JWT authentication
 * - VAPID keys stored as secrets (never exposed to client)
 * - Service role key used only for server-side cron jobs
 */

import webpush from "web-push";
import { verifySupabaseJWT, extractToken, type JWTPayload } from "./auth-utils";

/**
 * Environment bindings for Cloudflare Workers
 */
export interface Env {
  // Supabase configuration
  SUPABASE_URL: string;
  SUPABASE_JWT_SECRET: string;
  SUPABASE_SERVICE_ROLE_KEY: string;

  // VAPID keys for Web Push
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;

  // Environment
  ENVIRONMENT: string;
}

/**
 * Push notification request body structure
 */
interface PushNotificationRequest {
  subscription: PushSubscription;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  urgency?: "very-low" | "low" | "normal" | "high";
}

/**
 * PushSubscription type from Web Push API
 */
interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

/**
 * CORS headers for cross-origin requests
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Configure with specific domain in production
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400", // 24 hours
};

/**
 * Handles OPTIONS preflight requests for CORS
 */
function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * Creates error response with CORS headers
 */
function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Creates success response with CORS headers
 */
function successResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Sends a push notification to a single subscription
 *
 * @param subscription - Web Push subscription object
 * @param payload - Notification payload (title, body, data)
 * @param env - Environment bindings
 * @returns Success or error result
 */
async function sendPushNotification(
  subscription: PushSubscription,
  payload: { title: string; body: string; data?: unknown },
  urgency: "very-low" | "low" | "normal" | "high",
  env: Env
): Promise<{ success: boolean; error?: string }> {
  try {
    // Configure web-push with VAPID details
    webpush.setVapidDetails(
      "mailto:hello@household-hub.app",
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    // Send notification
    await webpush.sendNotification(subscription, JSON.stringify(payload), {
      urgency,
      TTL: 86400, // 24 hours
    });

    return { success: true };
  } catch (error: unknown) {
    console.error("Push notification failed:", error);

    // Handle specific error cases
    if (error.statusCode === 410) {
      // Subscription expired or invalid
      return { success: false, error: "Subscription expired" };
    }

    if (error.statusCode === 404) {
      // Subscription not found
      return { success: false, error: "Subscription not found" };
    }

    return {
      success: false,
      error: error.message || "Unknown error sending notification",
    };
  }
}

/**
 * Fetch handler - Handles incoming HTTP requests for push notifications
 *
 * POST /notify - Send a push notification
 * Requires: Authorization header with valid JWT
 * Body: { subscription, title, body, data?, urgency? }
 */
async function handleFetch(request: Request, env: Env): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  // Only allow POST requests
  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // Extract and verify JWT token
  let user: JWTPayload;
  try {
    const authHeader = request.headers.get("Authorization");
    const token = extractToken(authHeader);
    user = await verifySupabaseJWT(token, env.SUPABASE_JWT_SECRET);
  } catch (error: unknown) {
    console.error("JWT verification failed:", error.message);
    return errorResponse(`Unauthorized: ${error.message}`, 401);
  }

  // Parse request body
  let body: PushNotificationRequest;
  try {
    body = (await request.json()) as PushNotificationRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  // Validate required fields
  if (!body.subscription || !body.title || !body.body) {
    return errorResponse("Missing required fields: subscription, title, body", 400);
  }

  // Validate subscription structure
  if (
    !body.subscription.endpoint ||
    !body.subscription.keys?.p256dh ||
    !body.subscription.keys?.auth
  ) {
    return errorResponse("Invalid subscription format", 400);
  }

  // Prepare notification payload
  const payload = {
    title: body.title,
    body: body.body,
    data: {
      ...body.data,
      userId: user.sub, // Include user ID from JWT
      timestamp: Date.now(),
    },
  };

  // Send notification
  const result = await sendPushNotification(
    body.subscription,
    payload,
    body.urgency || "normal",
    env
  );

  if (!result.success) {
    return errorResponse(`Failed to send notification: ${result.error}`, 500);
  }

  return successResponse({
    success: true,
    message: "Notification sent successfully",
  });
}

/**
 * Scheduled handler - Handles cron-triggered notification jobs
 *
 * Cron schedules:
 * - "0 8 * * *" (8 AM UTC): Transaction reminders
 * - "0 9 * * *" (9 AM UTC): Budget alerts
 */
async function handleScheduled(
  event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext
): Promise<void> {
  console.log("Cron triggered:", event.cron, "at", new Date(event.scheduledTime).toISOString());

  // Parse hour from cron expression to determine which job to run
  const cronParts = event.cron.split(" ");
  const hour = parseInt(cronParts[1], 10);

  try {
    if (hour === 8) {
      // 8 AM UTC: Transaction reminders
      await callSupabaseFunction("transaction-reminders", {}, env);
      console.log("Transaction reminders function called successfully");
    } else if (hour === 9) {
      // 9 AM UTC: Budget alerts
      await callSupabaseFunction("budget-alerts", {}, env);
      console.log("Budget alerts function called successfully");
    } else {
      console.warn("Unknown cron schedule hour:", hour);
    }
  } catch (error: unknown) {
    console.error("Scheduled job failed:", error.message);
    // Don't throw - allow worker to continue
  }
}

/**
 * Calls a Supabase Edge Function with service role authentication
 *
 * @param functionName - Name of the Supabase Edge Function
 * @param payload - Request body to send
 * @param env - Environment bindings
 */
async function callSupabaseFunction(
  functionName: string,
  payload: unknown,
  env: Env
): Promise<unknown> {
  const url = `${env.SUPABASE_URL}/functions/v1/${functionName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase function ${functionName} failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

/**
 * Worker entry point
 */
export default {
  /**
   * Fetch handler for HTTP requests
   */
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handleFetch(request, env);
  },

  /**
   * Scheduled handler for cron triggers
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    return handleScheduled(event, env, ctx);
  },
};

/**
 * Type definition for scheduled event
 */
interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}
