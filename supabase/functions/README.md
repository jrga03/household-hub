# Supabase Edge Functions (`/supabase/functions/`)

## Purpose

The functions directory contains **Supabase Edge Functions** - serverless TypeScript functions that run on Cloudflare's edge network. These handle scheduled tasks like push notifications and background processing.

## What are Edge Functions?

**Serverless Functions:**

- Run on demand (HTTP triggers) or scheduled (cron)
- Deploy globally on Cloudflare edge
- TypeScript/JavaScript (Deno runtime)
- No server management needed

**Use Cases:**

- Scheduled tasks (daily notifications)
- Webhooks and integrations
- Background processing
- API endpoints

## Available Functions

### budget-alerts

**Purpose:** Send daily push notifications when budget thresholds are exceeded

**Trigger:** Cron (daily at 8 AM user's local timezone)

**Logic:**

1. Query budgets vs actual spending for current month
2. Identify budgets over 80% threshold
3. Send push notifications to subscribed users
4. Log notification delivery status

**Files:**

- `index.ts` - Main function logic

**Environment Variables:**

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access key

### transaction-reminders

**Purpose:** Send reminders for recurring transactions or pending items

**Trigger:** Cron (daily)

**Logic:**

1. Check for transactions marked as recurring
2. Calculate next due date
3. Send reminder notifications
4. Update reminder timestamps

**Files:**

- `index.ts` - Main function logic

**Environment Variables:**

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Admin access key

## Edge Function Structure

### Directory Layout

```
functions/
  [function-name]/
    index.ts          # Entry point (required)
    .env.example      # Environment variable template (optional)
    README.md         # Function documentation (optional)
```

### Entry Point Pattern

```typescript
// index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    // Function logic here
    const result = await processTask();

    return new Response(JSON.stringify({ success: true, data: result }), {
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

## Deno Runtime

**What is Deno?**

- Modern TypeScript runtime by Node.js creator
- Built-in TypeScript support (no build step)
- Secure by default (explicit permissions)
- Standard library for common tasks

**Differences from Node.js:**

- Use URLs for imports: `import { serve } from "https://deno.land/..."`
- No `package.json` or `node_modules`
- Environment variables via `Deno.env.get()`
- Built-in testing: `deno test`

**Documentation:** https://deno.land

## Common Development Tasks

### Creating a New Function

**1. Create directory:**

```bash
mkdir supabase/functions/my-function
```

**2. Create entry point:**

```typescript
// supabase/functions/my-function/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  try {
    // Your logic here
    const { data, error } = await supabase.from("table").select("*");

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

**3. Test locally:**

```bash
supabase functions serve my-function
```

Access at: http://localhost:54321/functions/v1/my-function

**4. Deploy:**

```bash
supabase functions deploy my-function
```

### Setting Environment Variables

**Locally (`.env.local`):**

```bash
# supabase/.env.local (gitignored)
MY_SECRET=local-value
```

**Production:**

```bash
supabase secrets set MY_SECRET=production-value
```

**List secrets:**

```bash
supabase secrets list
```

**Access in function:**

```typescript
const secret = Deno.env.get("MY_SECRET");
```

### Testing Functions Locally

**1. Start function:**

```bash
supabase functions serve my-function
```

**2. Call via HTTP:**

```bash
curl -X POST http://localhost:54321/functions/v1/my-function \
  -H "Content-Type: application/json" \
  -d '{"key": "value"}'
```

**3. Check logs:**

- Console output shows logs in real-time
- Use `console.log()`, `console.error()` for debugging

### Deploying Functions

**Deploy single function:**

```bash
supabase functions deploy my-function
```

**Deploy all functions:**

```bash
supabase functions deploy
```

**Verify deployment:**

```bash
supabase functions list
```

**Invoke deployed function:**

```bash
curl https://[project-ref].supabase.co/functions/v1/my-function
```

### Viewing Logs

**Real-time logs:**

```bash
supabase functions logs my-function --follow
```

**Historical logs:**

```bash
supabase functions logs my-function --limit 100
```

**Filter by level:**

```bash
supabase functions logs my-function --level error
```

## Cron Triggers

### Setting Up Scheduled Functions

**In Supabase Dashboard:**

1. Functions → [function-name] → Settings
2. Add cron expression
3. Save

**Cron expression examples:**

```
0 8 * * *     # Daily at 8 AM UTC
0 */6 * * *   # Every 6 hours
0 0 * * 0     # Weekly on Sunday midnight
0 0 1 * *     # Monthly on 1st at midnight
```

**Cron syntax:**

```
┌───────────── minute (0-59)
│ ┌─────────── hour (0-23)
│ │ ┌───────── day of month (1-31)
│ │ │ ┌─────── month (1-12)
│ │ │ │ ┌───── day of week (0-6, 0=Sunday)
│ │ │ │ │
* * * * *
```

### Timezone Considerations

**Cron runs in UTC:**

- All cron schedules use UTC timezone
- Convert user timezone to UTC in function logic

**Example - 8 AM user's timezone:**

```typescript
// In function
const userTimezone = "Asia/Manila"; // +8 UTC
const now = new Date();
const userHour = new Intl.DateTimeFormat("en", {
  hour: "numeric",
  timeZone: userTimezone,
}).format(now);

if (parseInt(userHour) !== 8) {
  return; // Not 8 AM in user's timezone
}
```

## Authentication

### JWT Validation

Functions can validate Supabase JWTs:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  // Get JWT from Authorization header
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!jwt) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Create client with JWT
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${jwt}` },
    },
  });

  // Validate by checking user
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return new Response("Invalid token", { status: 401 });
  }

  // User authenticated, proceed...
});
```

### Service Role Access

For admin tasks (cron functions):

```typescript
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // Bypasses RLS
);
```

**⚠️ Never expose service role key to client!**

## Error Handling

### Standard Error Pattern

```typescript
serve(async (req) => {
  try {
    // Function logic
    const result = await processData();

    return new Response(JSON.stringify({ success: true, data: result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[FunctionName] Error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
```

### Logging Best Practices

```typescript
// Structured logging
console.log("[FunctionName] Starting...");
console.log("[FunctionName] Processing:", { userId, count: items.length });
console.error("[FunctionName] Error:", { error: error.message, context: data });
console.log("[FunctionName] Complete:", { processed: count, duration: ms });
```

## Performance Considerations

**Cold Starts:**

- First invocation after inactivity is slower (~1-2 seconds)
- Subsequent calls are fast (~50-200ms)
- Keep functions small to minimize cold start impact

**Timeouts:**

- Default: 30 seconds
- Max: 60 seconds (configurable)
- Design for quick execution

**Memory:**

- Default: 128MB
- Configurable up to 2GB
- Monitor usage in logs

## Costs

**Free Tier:**

- 2 million function invocations per month
- Sufficient for MVP usage

**Pricing Beyond Free Tier:**

- $2 per 1 million invocations
- Bandwidth: $0.15 per GB

**Optimization:**

- Cache results where possible
- Batch database operations
- Use cron sparingly (every 6-12 hours vs every minute)

## Related Documentation

### Parent README

- [../README.md](../README.md) - Supabase backend overview

### Frontend Integration

- [/workers/push-notifier/README.md](../../workers/push-notifier/README.md) - Cloudflare Worker for push delivery (Phase B)

### Comprehensive Guides

- [/docs/initial plan/DEPLOYMENT.md](../../docs/initial%20plan/DEPLOYMENT.md) - Deployment strategy

### Project Documentation

- [/CLAUDE.md](../../CLAUDE.md) - Project quick reference

## Further Reading

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) - Official docs
- [Deno Manual](https://deno.land/manual) - Deno runtime
- [Deno Deploy](https://deno.com/deploy/docs) - Edge runtime details
- [Cron Expression Guide](https://crontab.guru/) - Cron syntax helper
