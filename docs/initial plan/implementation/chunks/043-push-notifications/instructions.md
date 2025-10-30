# Instructions: Push Notifications

Follow these steps in order. Estimated time: 2 hours.

---

## Step 1: Generate VAPID Keys (5 min)

```bash
npx web-push generate-vapid-keys
```

**Output**:

```
Public Key: BM8...xyz
Private Key: abc...123
```

**Save these!** You'll need them for:

- Cloudflare Worker secrets
- Client-side subscription

---

## Step 2: Create Cloudflare Worker (30 min)

Create `workers/push-notifier/package.json`:

```json
{
  "name": "push-notifier",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "web-push": "^3.6.6"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20231218.0",
    "wrangler": "^3.22.1"
  }
}
```

Create `workers/push-notifier/wrangler.toml`:

```toml
name = "household-hub-push"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.production]
vars = {
  ENVIRONMENT = "production",
  SUPABASE_URL = "https://your-project.supabase.co",
  SUPABASE_JWT_SECRET = "your-jwt-secret"  # Get from Supabase project settings
}

# Cron trigger for budget alerts (9 AM daily)
[triggers]
crons = ["0 9 * * *"]
```

Create `workers/push-notifier/src/auth-utils.ts` (JWT validation from DEPLOYMENT.md):

```typescript
// JWT verification utility (per DEPLOYMENT.md lines 836-892)
export async function verifySupabaseJWT(token: string, jwtSecret: string): Promise<any> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const [headerB64, payloadB64, signatureB64] = token.split(".");
    const data = `${headerB64}.${payloadB64}`;
    const signature = base64UrlDecode(signatureB64);

    const isValid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(data));

    if (!isValid) {
      throw new Error("Invalid signature");
    }

    const payload = JSON.parse(atob(payloadB64));

    // Check expiry
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error("Token expired");
    }

    return payload;
  } catch (error) {
    throw new Error(`JWT verification failed: ${error.message}`);
  }
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
```

Create `workers/push-notifier/src/index.ts`:

```typescript
import webpush from "web-push";
import { verifySupabaseJWT } from "./auth-utils";

export default {
  async fetch(request, env): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // JWT Authentication (Decision #65, DEPLOYMENT.md:718-735)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const token = authHeader.substring(7);
      const payload = await verifySupabaseJWT(token, env.SUPABASE_JWT_SECRET);
      const userId = payload.sub;

      const { subscription, title, body, data } = await request.json();

      // Configure web-push
      webpush.setVapidDetails(
        "mailto:hello@household-hub.app",
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY
      );

      // Send notification
      await webpush.sendNotification(subscription, JSON.stringify({ title, body, data, userId }));

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message || "Failed to send notification",
        }),
        {
          status: error.message.includes("JWT") ? 401 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
  },

  // Cron trigger for budget alerts (DEPLOYMENT.md:195-272)
  async scheduled(event, env, ctx) {
    try {
      // Call Supabase Edge Function for budget checking
      const response = await fetch(`${env.SUPABASE_URL}/functions/v1/budget-alerts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        console.error("Budget alerts cron failed:", await response.text());
      }
    } catch (error) {
      console.error("Budget alerts cron error:", error);
    }
  },
};
```

Install and deploy:

```bash
cd workers/push-notifier
npm install

# Set secrets (sensitive values)
wrangler secret put VAPID_PUBLIC_KEY
# Paste public key from Step 1

wrangler secret put VAPID_PRIVATE_KEY
# Paste private key from Step 1

wrangler secret put SUPABASE_JWT_SECRET
# Get from: Supabase Dashboard → Project Settings → API → JWT Secret

wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Get from: Supabase Dashboard → Project Settings → API → service_role key
# ⚠️ NEVER expose this in client code!

# Deploy
wrangler deploy
```

**Note URL**: `https://household-hub-push.your-subdomain.workers.dev`

**Security Note**: The worker now validates JWT tokens to ensure only authenticated users can trigger notifications. This prevents unauthorized notification spam (Decision #65).

---

## Step 3: Create Push Subscription Hook (20 min)

Create `src/hooks/usePushNotifications.ts`:

```typescript
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const VAPID_PUBLIC_KEY = "YOUR_PUBLIC_KEY_HERE"; // From Step 1
const PUSH_WORKER_URL = "YOUR_WORKER_URL_HERE"; // From Step 2

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }

    checkSubscription();
  }, []);

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

  const subscribe = async () => {
    setIsLoading(true);

    try {
      // Request permission
      const permission = await Notification.requestPermission();
      setPermission(permission);

      if (permission !== "granted") {
        throw new Error("Permission not granted");
      }

      // Subscribe to push
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Save to database with device_id
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get device ID from DeviceManager (chunk 026)
      const deviceId = await window.deviceManager.getDeviceId();

      // Extract subscription details
      const subscriptionJSON = subscription.toJSON();
      const keys = subscriptionJSON.keys;

      await supabase.from("push_subscriptions").upsert(
        {
          user_id: user.id,
          device_id: deviceId,
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        { onConflict: "user_id,device_id" }
      );

      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error("Subscribe error:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
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
    permission,
    isSubscribed,
    isLoading,
    canAsk: permission === "default",
    isGranted: permission === "granted",
    isDenied: permission === "denied",
    subscribe,
    unsubscribe,
  };
}
```

---

## Step 4: Create Notification Settings UI (20 min)

Create `src/components/NotificationSettings.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, BellOff } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface NotificationPreferences {
  budget_alerts: boolean;
  mentions: boolean;
  due_dates: boolean;
}

export function NotificationSettings() {
  const {
    permission,
    isSubscribed,
    isLoading,
    canAsk,
    isDenied,
    subscribe,
    unsubscribe,
  } = usePushNotifications();

  const [preferences, setPreferences] = useState<NotificationPreferences>({
    budget_alerts: true,
    mentions: true,
    due_dates: true,
  });
  const [isSaving, setIsSaving] = useState(false);

  // Load preferences from profiles table
  useEffect(() => {
    async function loadPreferences() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('notification_preferences')
        .eq('id', user.id)
        .single();

      if (profile?.notification_preferences) {
        setPreferences(profile.notification_preferences);
      }
    }

    loadPreferences();
  }, []);

  // Update preferences in database
  async function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    setIsSaving(true);
    try {
      const newPreferences = { ...preferences, [key]: value };
      setPreferences(newPreferences);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await supabase
        .from('profiles')
        .update({ notification_preferences: newPreferences })
        .eq('id', user.id);

      toast.success('Preferences updated');
    } catch (error) {
      toast.error('Failed to update preferences');
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  }

  if (!('Notification' in window)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Notifications Not Supported</CardTitle>
          <CardDescription>
            Your browser doesn't support push notifications.
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
          Get notified about budget alerts and important updates
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isDenied && (
          <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            Notifications are blocked. Please enable them in your browser settings.
          </div>
        )}

        {canAsk && (
          <Button onClick={subscribe} disabled={isLoading}>
            <Bell className="mr-2 h-4 w-4" />
            Enable Notifications
          </Button>
        )}

        {isSubscribed && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="budget-alerts">Budget Alerts</Label>
              <Switch
                id="budget-alerts"
                checked={preferences.budget_alerts}
                onCheckedChange={(checked) => updatePreference('budget_alerts', checked)}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="pending-reminders">Pending Transaction Reminders</Label>
              <Switch
                id="pending-reminders"
                checked={preferences.due_dates}
                onCheckedChange={(checked) => updatePreference('due_dates', checked)}
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="mentions">@Mentions</Label>
              <Switch
                id="mentions"
                checked={preferences.mentions}
                onCheckedChange={(checked) => updatePreference('mentions', checked)}
                disabled={isSaving}
              />
            </div>

            <Button
              variant="outline"
              onClick={unsubscribe}
              disabled={isLoading}
              className="w-full"
            >
              <BellOff className="mr-2 h-4 w-4" />
              Disable Notifications
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Step 5: Add Database Migration (10 min)

Create Supabase migration (`supabase/migrations/YYYYMMDDHHMMSS_add_push_subscriptions.sql`):

```sql
-- Push subscriptions table (per DATABASE.md lines 14-28)
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,  -- Public key for encryption
  auth TEXT NOT NULL,     -- Authentication secret
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each device can have one subscription per user
  UNIQUE(user_id, device_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_push_subscriptions_device ON push_subscriptions(device_id);

-- RLS policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
  ON push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
  ON push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
  ON push_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
  ON push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);
```

**Apply migration**:

```bash
supabase db push
```

**Why device_id?** Each device needs its own subscription because:

- Different push endpoints per browser/device
- User can revoke specific devices
- Notifications can be targeted to specific devices
- Aligns with multi-device sync architecture

---

## Step 5.5: Create Budget Threshold RPC Function (10 min)

Create the PostgreSQL function used by budget alerts:

```sql
-- Function to check which budgets are approaching/exceeding limits
CREATE OR REPLACE FUNCTION check_budget_thresholds()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  category_id UUID,
  category_name TEXT,
  amount_cents BIGINT,
  spent_cents BIGINT,
  percentage INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH budget_spending AS (
    SELECT
      b.id,
      b.user_id,
      b.category_id,
      c.name as category_name,
      b.amount_cents,
      COALESCE(SUM(
        CASE
          WHEN t.type = 'expense' THEN t.amount_cents
          ELSE 0
        END
      ), 0) as spent_cents
    FROM budgets b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN transactions t ON
      t.category_id = b.category_id
      AND DATE_TRUNC('month', t.date AT TIME ZONE 'Asia/Manila') =
          DATE_TRUNC('month', b.month_key AT TIME ZONE 'Asia/Manila')
      AND t.transfer_group_id IS NULL  -- CRITICAL: Exclude transfers
    WHERE b.month_key >= DATE_TRUNC('month', CURRENT_DATE AT TIME ZONE 'Asia/Manila')
    GROUP BY b.id, b.user_id, b.category_id, c.name, b.amount_cents
  )
  SELECT
    bs.id,
    bs.user_id,
    bs.category_id,
    bs.category_name,
    bs.amount_cents,
    bs.spent_cents,
    (bs.spent_cents * 100 / NULLIF(bs.amount_cents, 0))::INTEGER as percentage
  FROM budget_spending bs
  WHERE
    bs.amount_cents > 0
    AND (bs.spent_cents * 100 / bs.amount_cents) >= 80  -- 80% threshold
  ORDER BY percentage DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Test the function**:

```sql
SELECT * FROM check_budget_thresholds();
```

---

## Step 6: Create Budget Alert Function (20 min)

Create `supabase/functions/budget-alerts/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PUSH_WORKER_URL = Deno.env.get("PUSH_WORKER_URL")!;

Deno.serve(async (req) => {
  try {
    // Get all budgets approaching limit (>80%)
    const { data: budgets } = await supabase.rpc("check_budget_thresholds");

    for (const budget of budgets || []) {
      // Get user's push subscriptions
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("subscription")
        .eq("user_id", budget.user_id);

      // Send notifications
      for (const sub of subscriptions || []) {
        await fetch(PUSH_WORKER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subscription: sub.subscription,
            title: "Budget Alert",
            body: `${budget.category_name}: ${budget.percentage}% of budget used`,
            data: { budgetId: budget.id },
          }),
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

Deploy:

```bash
supabase functions deploy budget-alerts
```

**Note**: This function is called by the Cloudflare Worker cron trigger (configured in Step 2 wrangler.toml).

---

## Step 6.5: Create Transaction Reminders Function (15 min)

Create `supabase/functions/transaction-reminders/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const PUSH_WORKER_URL = Deno.env.get("PUSH_WORKER_URL")!;

Deno.serve(async (req) => {
  try {
    // Get pending/uncleared transactions older than 3 days
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const { data: pendingTransactions } = await supabase
      .from("transactions")
      .select("id, description, amount_cents, date, owner_user_id")
      .eq("cleared", false)
      .lt("date", threeDaysAgo.toISOString().split("T")[0])
      .limit(50);

    if (!pendingTransactions || pendingTransactions.length === 0) {
      return new Response(JSON.stringify({ message: "No pending transactions" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Group by user
    const userTransactions = pendingTransactions.reduce(
      (acc, txn) => {
        if (!acc[txn.owner_user_id]) {
          acc[txn.owner_user_id] = [];
        }
        acc[txn.owner_user_id].push(txn);
        return acc;
      },
      {} as Record<string, any[]>
    );

    // Send reminders per user
    for (const [userId, transactions] of Object.entries(userTransactions)) {
      // Get user's push subscriptions
      const { data: subscriptions } = await supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", userId);

      if (!subscriptions || subscriptions.length === 0) continue;

      const count = transactions.length;
      const message =
        count === 1 ? `You have 1 pending transaction` : `You have ${count} pending transactions`;

      // Send to all user's devices
      for (const sub of subscriptions) {
        await fetch(PUSH_WORKER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            subscription: {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            title: "Pending Transactions",
            body: message,
            data: { tag: "pending-transactions", url: "/transactions?status=pending" },
          }),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, notified: Object.keys(userTransactions).length }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

Deploy:

```bash
supabase functions deploy transaction-reminders
```

Update Cloudflare Worker to add transaction reminders cron (edit `workers/push-notifier/wrangler.toml`):

```toml
# Add second cron for transaction reminders (8 AM daily)
[triggers]
crons = ["0 9 * * *", "0 8 * * *"]
```

Update worker's `scheduled` handler to call both functions:

```typescript
async scheduled(event, env, ctx) {
  const hour = new Date().getHours();

  try {
    // 8 AM: Transaction reminders
    if (hour === 8) {
      await fetch(
        `${env.SUPABASE_URL}/functions/v1/transaction-reminders`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // 9 AM: Budget alerts
    if (hour === 9) {
      await fetch(
        `${env.SUPABASE_URL}/functions/v1/budget-alerts`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
    }
  } catch (error) {
    console.error("Cron error:", error);
  }
}
```

---

## Step 7: Add Service Worker Push Handlers (15 min)

Add push event handlers to your service worker. If using Vite PWA plugin, add to `src/sw.ts`:

```typescript
// Service worker push event handler
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;

  const data = event.data.json();
  const { title, body, icon, badge, data: notificationData } = data;

  const options: NotificationOptions = {
    body,
    icon: icon || "/icons/icon-192x192.png",
    badge: badge || "/icons/badge-72x72.png",
    data: notificationData,
    vibrate: [200, 100, 200],
    tag: notificationData?.tag || "default",
    requireInteraction: notificationData?.requireInteraction || false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click handler
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const data = event.notification.data;

  // Route to appropriate page based on notification type
  let targetUrl = "/";
  if (data?.budgetId) {
    targetUrl = `/budgets`;
  } else if (data?.transactionId) {
    targetUrl = `/transactions/${data.transactionId}`;
  } else if (data?.url) {
    targetUrl = data.url;
  }

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if open
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && "focus" in client) {
          return client.focus();
        }
      }
      // Open new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
```

**If using Vite PWA plugin**, update `vite.config.ts` to include the custom SW:

```typescript
import { VitePWA } from "vite-plugin-pwa";

export default {
  plugins: [
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // ... other config
    }),
  ],
};
```

---

## Step 8: Test Notifications (15 min)

Test in browser console:

```typescript
// Test notification
new Notification("Test", {
  body: "Push notifications are working!",
  icon: "/icons/icon-192x192.png",
});
```

Test from Worker (requires authentication):

```bash
# Get your access token from browser DevTools → Application → Local Storage → supabase.auth.token

curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "subscription": {
      "endpoint": "...",
      "keys": {"p256dh": "...", "auth": "..."}
    },
    "title": "Test",
    "body": "Hello from Worker",
    "data": {"tag": "test"}
  }'
```

**Expected**: Notification appears in system tray and clicking it opens the app.

---

## Done!

When notifications work and settings UI is functional, proceed to checkpoint.

**Next**: `checkpoint.md`
