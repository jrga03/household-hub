# Budget Alerts Edge Function (`/supabase/functions/budget-alerts/`)

## Purpose

Supabase Edge Function (Deno runtime) that sends **daily push notifications** to users when their spending approaches or exceeds budget limits. Triggered by Cloudflare Worker cron job at **9 AM daily**.

## Directory Contents

**1 file:**

- **`index.ts`** (155 lines, 4.6K) - Main edge function handler

## Function Overview

### Trigger

**Cron schedule:** Daily at 9:00 AM (configured in Cloudflare Worker)

**Invocation:** HTTP POST request from Cloudflare Worker cron trigger

### Algorithm

**Excellent inline documentation:** Lines 10-25 provide comprehensive algorithm overview

**Workflow:**

1. **Query budgets at risk:**
   - Calls `check_budget_thresholds()` RPC function
   - Returns budgets where spending >= 80% of target
   - Automatically excludes transfers (prevents double-counting)

2. **For each at-risk budget:**
   - Fetch user's push subscriptions (all registered devices)
   - Format notification message with budget details
   - Send push notification to each device via Cloudflare Worker

3. **Return results:**
   - Summary of budgets processed
   - Notification success/failure counts
   - Per-user error details

### Notification Format

**Title:** "Budget Alert"

**Body:** `{category_name}: {percentage}% of ₱{amount} budget used`

**Example:** "Groceries: 85% of ₱5,000.00 budget used"

**Data payload:**

```json
{
  "budgetId": "uuid",
  "categoryId": "uuid",
  "percentage": 85,
  "tag": "budget-alert",
  "url": "/budgets"
}
```

**Click action:** Opens `/budgets` page in app

### Thresholds

**Alert trigger:** Spending >= 80% of budget amount

**Why 80%?**

- Early warning before overspending
- Time to adjust behavior
- Not too frequent (avoids alert fatigue)

**Color mapping:**

- 0-79%: Green (safe)
- 80-99%: Yellow (warning) ← **Alert sent**
- 100%+: Red (over budget) ← **Alert sent**

## Dependencies

### Environment Variables

**Required:**

1. **`SUPABASE_URL`** - Supabase project URL
   - Example: `https://abc123.supabase.co`
   - Used to: Initialize Supabase client

2. **`SUPABASE_SERVICE_ROLE_KEY`** - Service role secret key
   - Used to: Query database with elevated permissions
   - Bypasses RLS policies (function runs as admin)

3. **`PUSH_WORKER_URL`** - Cloudflare Worker push notification endpoint
   - Example: `https://push.workers.household-hub.com`
   - Used to: Send Web Push notifications to devices

**Set in:** Supabase dashboard → Edge Functions → Secrets

### External Services

**Cloudflare Worker** - Push notification delivery

- Handles VAPID signing
- Sends to browser push services (FCM, APNs, etc.)
- Returns success/failure status

**Database Tables:**

- **`budgets`** - Monthly budget targets (queried via RPC)
- **`transactions`** - Actual spending (aggregated via RPC)
- **`push_subscriptions`** - User device push endpoints

### Database Functions

**`check_budget_thresholds()`** - RPC function

- Returns budgets >= 80% threshold
- Includes: budget ID, user ID, category name, percentage, amount
- **Critical:** Excludes transfers (`WHERE transfer_group_id IS NULL`)

**Query pattern:**

```sql
SELECT
  b.id,
  b.user_id,
  b.category_id,
  c.name AS category_name,
  b.amount_cents,
  (SUM(t.amount_cents) / b.amount_cents * 100) AS percentage
FROM budgets b
LEFT JOIN transactions t ON t.category_id = b.category_id
WHERE t.transfer_group_id IS NULL  -- Exclude transfers
GROUP BY b.id
HAVING (SUM(t.amount_cents) / b.amount_cents * 100) >= 80
```

## Implementation Details

### Lines 28-43 - Fetch At-Risk Budgets

```typescript
const { data: budgets, error } = await supabase.rpc("check_budget_thresholds");
```

- Calls RPC function (server-side calculation)
- Returns empty array if no budgets at risk
- Early return if no alerts needed

### Lines 56-72 - Fetch User Subscriptions

```typescript
const { data: subscriptions } = await supabase
  .from("push_subscriptions")
  .select("endpoint, p256dh, auth")
  .eq("user_id", budget.user_id);
```

- Gets all registered devices for user
- Skips users without push subscriptions
- Each subscription represents one device/browser

### Lines 73-77 - Currency Formatting

```typescript
const budgetAmountPHP = (budget.amount_cents / 100).toLocaleString("en-PH", {
  style: "currency",
  currency: "PHP",
});
```

- Converts cents to pesos (divide by 100)
- Uses `toLocaleString` for PHP formatting
- Output: "₱5,000.00"

**Why not formatPHP utility?**

- Edge functions run in Deno (not Node/browser)
- No shared utilities imported
- `toLocaleString` is Deno-native

### Lines 82-121 - Send Notifications

**For each device:**

1. Construct payload with subscription details
2. POST to Cloudflare Worker (`PUSH_WORKER_URL`)
3. Include authorization header (service role key)
4. Track success/failure per device

**Error handling:**

- Network errors caught and logged
- Failed devices don't block other devices
- All errors collected in results array

### Lines 123-130 - Track Results

```typescript
results.push({
  userId: budget.user_id,
  category: budget.category_name,
  percentage: budget.percentage,
  notifications: sentCount, // Successful sends
  errors, // Array of error messages
});
```

**Result tracking enables:**

- Debugging notification failures
- Monitoring delivery success rates
- Identifying users with invalid subscriptions

### Lines 132-141 - Success Response

```json
{
  "success": true,
  "budgetsProcessed": 5,
  "results": [
    {
      "userId": "uuid",
      "category": "Groceries",
      "percentage": 85,
      "notifications": 2,
      "errors": []
    }
  ]
}
```

## Error Handling

### Budget Query Errors

**Line 31-37:**

```typescript
if (budgetsError) {
  return new Response(JSON.stringify({ error: budgetsError.message }), {
    status: 500,
  });
}
```

**Causes:**

- Database connection failure
- RPC function doesn't exist
- Permission issues

**Impact:** Function exits early, no notifications sent

### Subscription Query Errors

**Line 63-66:**

```typescript
if (subError) {
  console.error(`Error fetching subscriptions for user ${userId}:`, subError);
  continue; // Skip this user, continue with others
}
```

**Causes:**

- User deleted
- Table permissions issue

**Impact:** Single user skipped, others still process

### Notification Send Errors

**Lines 117-120:**

```typescript
catch (error) {
  errors.push(`Failed to send to device: ${error.message}`);
  console.error("Notification send error:", error);
}
```

**Causes:**

- Network timeout to Cloudflare Worker
- Invalid subscription endpoint
- Push service rejection (expired token)

**Impact:** Error logged, other devices still receive notification

### Global Error Handler

**Lines 142-153:**

```typescript
catch (error) {
  return new Response(JSON.stringify({
    error: error.message || "Unknown error"
  }), {
    status: 500
  });
}
```

**Catches:** Unexpected errors not handled above

**Impact:** Returns 500 status, cron job logs failure

## Deployment

### Install Supabase CLI

```bash
npm install -g supabase
supabase login
```

### Deploy Function

```bash
# From project root
supabase functions deploy budget-alerts
```

**Or deploy all functions:**

```bash
supabase functions deploy
```

### Set Environment Variables

```bash
supabase secrets set SUPABASE_URL=https://abc123.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
supabase secrets set PUSH_WORKER_URL=https://push.workers.household-hub.com
```

**Or via Supabase Dashboard:**

1. Navigate to Edge Functions
2. Select `budget-alerts`
3. Settings → Secrets
4. Add each variable

### Invoke Manually (Testing)

```bash
curl -X POST \
  https://abc123.supabase.co/functions/v1/budget-alerts \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Expected response:**

```json
{
  "success": true,
  "budgetsProcessed": 3,
  "results": [...]
}
```

## Cron Setup (Cloudflare Worker)

**Trigger configuration** (in Cloudflare Worker):

```javascript
export default {
  async scheduled(event, env, ctx) {
    // Daily at 9 AM
    await fetch("https://abc123.supabase.co/functions/v1/budget-alerts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
  },
};
```

**Cron syntax:** `0 9 * * *` (9 AM daily)

**Why Cloudflare Worker cron?**

- Supabase Edge Functions don't have native cron
- Cloudflare cron is reliable and free
- Worker can trigger multiple Supabase functions

## Testing

### Unit Test (Mock Data)

**Create test budgets:**

```sql
-- Set budget to ₱5,000
INSERT INTO budgets (user_id, category_id, amount_cents, month_key)
VALUES ('user-uuid', 'category-uuid', 500000, '2024-01');

-- Add transactions totaling ₱4,500 (90%)
INSERT INTO transactions (user_id, category_id, amount_cents, type, date)
VALUES
  ('user-uuid', 'category-uuid', 200000, 'expense', '2024-01-05'),
  ('user-uuid', 'category-uuid', 250000, 'expense', '2024-01-15');
```

**Register push subscription:**

```sql
INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
VALUES ('user-uuid', 'https://fcm.googleapis.com/...', 'key1', 'key2');
```

**Trigger function:**

```bash
curl -X POST https://abc123.supabase.co/functions/v1/budget-alerts \
  -H "Authorization: Bearer ANON_KEY"
```

**Verify:**

1. Check function response (should show 1 budget processed)
2. Check device for push notification
3. Click notification → should open `/budgets` page

### Integration Test

**End-to-end workflow:**

1. Create budget via UI
2. Add transactions until 80% threshold
3. Wait for cron trigger (or manually invoke)
4. Verify notification received
5. Click notification → verify navigation

## Performance Considerations

### Query Optimization

**RPC function should use indexes:**

```sql
CREATE INDEX idx_transactions_category_date
ON transactions(category_id, date)
WHERE transfer_group_id IS NULL;
```

**Why:**

- Filtering by category and date is common
- Excluding transfers requires index condition
- Without index, full table scan on every run

### Batch Size Limits

**Lines 39-43:** Early return if no budgets at risk

**Prevents:**

- Wasted compute when no alerts needed
- Unnecessary push subscription queries

**Typical case:** Most days, few or no budgets exceed 80%

### Concurrent Notification Sending

**Lines 82-121:** Sequential loop through devices

**Future optimization:**

```typescript
await Promise.all(
  subscriptions.map(async (sub) => {
    await sendNotification(sub);
  })
);
```

**Trade-off:**

- Parallel sends faster
- But harder to track per-device errors
- Current sequential approach is fine for MVP (typical user has 1-3 devices)

## Security Considerations

### Service Role Key Usage

**Lines 3-6:**

```typescript
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);
```

**Why service role key?**

- Edge functions run server-side (trusted environment)
- Needs to query all users' budgets
- Bypasses RLS policies

**Security measures:**

- Function only accessible via authenticated cron trigger
- Service role key never exposed to client
- Function doesn't accept user input (no injection risk)

### Authorization to Cloudflare Worker

**Line 89:**

```typescript
Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
```

**Why send service role key?**

- Cloudflare Worker validates caller authenticity
- Prevents unauthorized notification sends
- Worker uses key to verify request from Supabase function

### No User Input Validation

**Function has no user input** - triggered by cron only

**No risk of:**

- SQL injection (uses parameterized RPC)
- XSS (notification content server-generated)
- CSRF (no user session)

## Critical Implementation Notes

### 1. Transfer Exclusion (CRITICAL)

**Line 23:**

> "Budget calculation excludes transfers to avoid double-counting (handled by check_budget_thresholds RPC function)."

**RPC function MUST exclude transfers:**

```sql
WHERE transfer_group_id IS NULL
```

**Why:** Transfer from checking to savings would:

1. Count as "expense" from checking account
2. Inflate spending totals
3. Trigger false budget alerts

**Enforced in:** RPC function, not edge function (separation of concerns)

### 2. Deno Runtime Differences

**Edge functions run in Deno, not Node.js:**

- Use `Deno.env.get()` not `process.env`
- Use `Deno.serve()` not `express`
- Import from `https://esm.sh/` not `npm`
- No access to Node built-ins or shared `src/lib/` utilities

### 3. Notification Delivery is Best-Effort

**Lines 111-120:** Failed sends logged but don't throw

**Why:**

- Push notifications are non-critical
- Single device failure shouldn't block others
- User can still check budgets manually in app

### 4. Currency Formatting in Deno

**Lines 73-77:** Uses `toLocaleString` not `formatPHP()`

**Reason:**

- `formatPHP` is client-side utility in `src/lib/currency.ts`
- Edge functions can't import from client code
- `toLocaleString` is Deno-native and equivalent

### 5. Timezone Considerations

**Cron trigger at 9 AM** - Which timezone?

**Current implementation:** UTC 9 AM (may not align with user timezone)

**Future enhancement:**

- Store user timezone in profiles table
- Calculate appropriate UTC offset per user
- Trigger based on user's local 9 AM

## Troubleshooting

### Issue: No notifications received

**Check:**

1. Is budget actually >= 80%? Query `check_budget_thresholds()` directly
2. Does user have push subscription? Query `push_subscriptions` table
3. Are environment variables set? Check Supabase dashboard
4. Is Cloudflare Worker URL correct? Test with curl
5. Check function logs: Supabase dashboard → Edge Functions → Logs

### Issue: Function returns 500 error

**Check:**

1. Does `check_budget_thresholds()` RPC function exist?
2. Are database permissions correct?
3. Is service role key valid?
4. Check error logs for specific error message

### Issue: Notifications sent to wrong devices

**Check:**

1. Push subscriptions table has correct user_id?
2. Are old/expired subscriptions cleaned up?
3. Verify endpoint URLs are current

## Related Components

### Database Functions

- [/supabase/migrations/](../../migrations/README.md) - `check_budget_thresholds()` RPC function
- [/docs/initial plan/DATABASE.md](../../../../docs/initial%20plan/DATABASE.md) - Transfer exclusion pattern

### Cloudflare Workers

- [/workers/push-notifications/](../../../../workers/) - Push notification delivery worker
- [/docs/initial plan/PWA-MANIFEST.md](../../../../docs/initial%20plan/PWA-MANIFEST.md) - Web Push setup

### Edge Functions

- [../transaction-reminders/README.md](../transaction-reminders/README.md) - Similar edge function for pending transaction reminders
- [../README.md](../README.md) - Edge Functions overview

### Frontend

- [/src/components/budgets/README.md](../../../../src/components/budgets/README.md) - Budget UI components
- [/src/hooks/useBudgets.tsx](../../../../src/hooks/README.md) - Budget data fetching

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../../CLAUDE.md) - Project quick reference
- [/supabase/README.md](../../README.md) - Supabase backend overview

### Deployment

- [/docs/initial plan/DEPLOYMENT.md](../../../../docs/initial%20plan/DEPLOYMENT.md) - Deployment strategy

### Architecture Decisions

- [/docs/initial plan/DECISIONS.md](../../../../docs/initial%20plan/DECISIONS.md) - #80: Budgets as reference targets

## Further Reading

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) - Official docs
- [Deno Deploy](https://deno.com/deploy) - Runtime environment
- [Web Push Protocol](https://web.dev/push-notifications/) - Push notification standard
- [VAPID](https://datatracker.ietf.org/doc/html/rfc8292) - Voluntary Application Server Identification
