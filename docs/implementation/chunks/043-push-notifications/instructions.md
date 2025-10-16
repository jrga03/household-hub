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
vars = { ENVIRONMENT = "production" }
```

Create `workers/push-notifier/src/index.ts`:

```typescript
import webpush from "web-push";

export default {
  async fetch(request, env): Promise<Response> {
    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const { subscription, title, body, data } = await request.json();

      // Configure web-push
      webpush.setVapidDetails(
        "mailto:hello@household-hub.app",
        env.VAPID_PUBLIC_KEY,
        env.VAPID_PRIVATE_KEY
      );

      // Send notification
      await webpush.sendNotification(subscription, JSON.stringify({ title, body, data }));

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};
```

Install and deploy:

```bash
cd workers/push-notifier
npm install

# Set secrets
wrangler secret put VAPID_PUBLIC_KEY
# Paste public key

wrangler secret put VAPID_PRIVATE_KEY
# Paste private key

# Deploy
wrangler deploy
```

**Note URL**: `https://household-hub-push.your-subdomain.workers.dev`

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

      // Save to database
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      await supabase.from("push_subscriptions").insert({
        user_id: user.id,
        subscription: subscription.toJSON(),
        endpoint: subscription.endpoint,
      });

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

## Step 4: Create Notification Settings UI (15 min)

Create `src/components/NotificationSettings.tsx`:

```typescript
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, BellOff } from 'lucide-react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

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
              <Switch id="budget-alerts" defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="pending-reminders">Pending Transaction Reminders</Label>
              <Switch id="pending-reminders" defaultChecked />
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

Create Supabase migration:

```sql
-- Push subscriptions table
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

-- RLS policies
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own subscriptions"
  ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id);
```

---

## Step 6: Create Budget Alert Cron (25 min)

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

Set up cron in Supabase Dashboard:

- Schedule: `0 9 * * *` (9 AM daily)
- Function: `budget-alerts`

---

## Step 7: Test Notifications (15 min)

Test in browser:

```typescript
// Test notification
new Notification("Test", {
  body: "Push notifications are working!",
  icon: "/icons/icon-192x192.png",
});
```

Test from Worker:

```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {...},
    "title": "Test",
    "body": "Hello from Worker"
  }'
```

---

## Done!

When notifications work and settings UI is functional, proceed to checkpoint.

**Next**: `checkpoint.md`
