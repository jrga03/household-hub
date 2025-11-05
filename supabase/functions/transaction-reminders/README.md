# Transaction Reminders Edge Function (`/supabase/functions/transaction-reminders/`)

## Purpose

Supabase Edge Function (Deno runtime) that sends **daily reminder notifications** to users about pending/uncleared transactions older than 3 days. Triggered by Cloudflare Worker cron job at **8 AM daily**.

## Directory Contents

**1 file:**

- **`index.ts`** (181 lines) - Main edge function handler

## Function Overview

### Trigger

**Cron schedule:** Daily at 8:00 AM (configured in Cloudflare Worker)

**Invocation:** HTTP POST request from Cloudflare Worker cron trigger

### Algorithm

**Excellent inline documentation:** Lines 10-28 provide comprehensive algorithm overview

**Workflow:**

1. **Query pending transactions:**
   - Find transactions with `cleared = false`
   - Filter for `date < (today - 3 days)`
   - Order by date (oldest first)
   - Limit to 100 transactions (prevent overwhelming queries)

2. **Group by user:**
   - Aggregate transactions by `owner_user_id`
   - Each user gets one summary notification
   - Not one notification per transaction (avoids spam)

3. **For each user with pending items:**
   - Fetch user's push subscriptions (all registered devices)
   - Format summary message with pending count
   - Send notification to each device via Cloudflare Worker

4. **Return results:**
   - Total users notified
   - Total pending transactions
   - Per-user notification success/failure counts

### Notification Format

**Title:** "Pending Transactions"

**Body (single transaction):**

```
You have 1 pending transaction from 2024-01-15
```

**Body (multiple transactions):**

```
You have 5 pending transactions (oldest: 2024-01-12)
```

**Data payload:**

```json
{
  "tag": "pending-transactions",
  "url": "/transactions?status=pending",
  "count": 5
}
```

**Click action:** Opens `/transactions` page filtered to pending status

### Threshold Logic

**Reminder trigger:** Transactions older than **3 days** with `cleared = false`

**Why 3 days?**

- Reasonable buffer for bank processing delays
- Not too frequent (avoids alert fatigue)
- Catches legitimately forgotten transactions

**What qualifies as "pending"?**

- Manual transactions not yet marked as cleared
- Bank imports waiting for reconciliation
- Recurring transactions awaiting confirmation

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

- **`transactions`** - Transaction records with cleared status
- **`accounts`** - Account names (for transaction display)
- **`push_subscriptions`** - User device push endpoints

## Implementation Details

### Lines 31-43 - Calculate Date Threshold

```typescript
const threeDaysAgo = new Date();
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
const thresholdDate = threeDaysAgo.toISOString().split("T")[0]; // YYYY-MM-DD
```

**Date arithmetic:**

- Get today's date
- Subtract 3 days
- Format as YYYY-MM-DD (DATE type in database)

**Example:** If today is 2024-01-20, threshold is 2024-01-17

### Lines 36-43 - Query Pending Transactions

```typescript
const { data: pendingTransactions } = await supabase
  .from("transactions")
  .select("id, description, amount_cents, date, owner_user_id, account:accounts(name)")
  .eq("cleared", false)
  .lt("date", thresholdDate) // Less than (older than)
  .order("date", { ascending: true }) // Oldest first
  .limit(100);
```

**Query breakdown:**

- **Filter 1:** `cleared = false` (unchecked/pending)
- **Filter 2:** `date < threshold` (older than 3 days)
- **Join:** Fetch account name for context
- **Sort:** Oldest transactions first (for "oldest: DATE" message)
- **Limit:** 100 max to prevent query timeout

**Why limit 100?**

- Prevents edge function timeout
- Users with >100 pending likely have bigger data hygiene issues
- Can be increased if needed

### Lines 62-72 - Group Transactions by User

```typescript
const userTransactions = pendingTransactions.reduce(
  (acc, txn) => {
    const userId = txn.owner_user_id;
    if (!acc[userId]) {
      acc[userId] = [];
    }
    acc[userId].push(txn);
    return acc;
  },
  {} as Record<string, any[]>
);
```

**Grouping logic:**

- Create object keyed by user ID
- Each user gets array of their pending transactions
- Allows single notification per user (not per transaction)

**Result example:**

```javascript
{
  "user-uuid-1": [txn1, txn2, txn3],
  "user-uuid-2": [txn4],
  "user-uuid-3": [txn5, txn6]
}
```

### Lines 84-98 - Fetch User Subscriptions

```typescript
const { data: subscriptions } = await supabase
  .from("push_subscriptions")
  .select("endpoint, p256dh, auth")
  .eq("user_id", userId);
```

**Same pattern as budget-alerts:**

- Gets all registered devices for user
- Skips users without push subscriptions
- Each subscription = one device/browser

### Lines 100-106 - Format Notification Message

```typescript
const count = transactions.length;
const message =
  count === 1
    ? `You have 1 pending transaction from ${transactions[0].date}`
    : `You have ${count} pending transactions (oldest: ${transactions[0].date})`;
```

**Message variations:**

- **Singular:** "1 pending transaction from {date}"
- **Plural:** "N pending transactions (oldest: {date})"

**Why show oldest date?**

- Emphasizes how long transactions have been pending
- Creates urgency to review

### Lines 110-147 - Send Notifications

**For each device:**

1. Construct payload with subscription details
2. POST to Cloudflare Worker (`PUSH_WORKER_URL`)
3. Include authorization header (service role key)
4. Track success/failure per device

**Error handling:**

- Network errors caught and logged
- Failed devices don't block other devices
- All errors collected in results array

### Lines 149-155 - Track Results Per User

```typescript
results.push({
  userId,
  pendingCount: count, // Number of pending transactions
  notifications: sentCount, // Successful device sends
  errors, // Array of error messages
});
```

**Enables:**

- Debugging notification failures
- Monitoring delivery success rates per user
- Identifying users with stale subscriptions

### Lines 157-167 - Success Response

```json
{
  "success": true,
  "usersNotified": 3,
  "totalPending": 8,
  "results": [
    {
      "userId": "uuid",
      "pendingCount": 5,
      "notifications": 2,
      "errors": []
    }
  ]
}
```

## Error Handling

### Transaction Query Errors

**Lines 45-51:**

```typescript
if (txnError) {
  return new Response(JSON.stringify({ error: txnError.message }), {
    status: 500,
  });
}
```

**Causes:**

- Database connection failure
- Table permissions issue
- Invalid column name

**Impact:** Function exits early, no notifications sent

### Subscription Query Errors

**Lines 90-93:**

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

**Lines 143-146:**

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

**Lines 168-179:**

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

### Deploy Function

```bash
# From project root
supabase functions deploy transaction-reminders
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
2. Select `transaction-reminders`
3. Settings → Secrets
4. Add each variable

### Invoke Manually (Testing)

```bash
curl -X POST \
  https://abc123.supabase.co/functions/v1/transaction-reminders \
  -H "Authorization: Bearer YOUR_ANON_KEY"
```

**Expected response:**

```json
{
  "success": true,
  "usersNotified": 2,
  "totalPending": 7,
  "results": [...]
}
```

## Cron Setup (Cloudflare Worker)

**Trigger configuration** (in Cloudflare Worker):

```javascript
export default {
  async scheduled(event, env, ctx) {
    // Daily at 8 AM (before budget alerts at 9 AM)
    await fetch("https://abc123.supabase.co/functions/v1/transaction-reminders", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
  },
};
```

**Cron syntax:** `0 8 * * *` (8 AM daily)

**Why 8 AM?**

- Runs before budget-alerts (9 AM)
- Users can act on reminders before budget notifications
- Morning timing encourages daily review habit

## Testing

### Unit Test (Mock Data)

**Create pending transactions:**

```sql
-- Create transaction 5 days ago (should trigger reminder)
INSERT INTO transactions (
  user_id,
  owner_user_id,
  account_id,
  category_id,
  amount_cents,
  type,
  description,
  date,
  cleared
) VALUES (
  'user-uuid',
  'user-uuid',
  'account-uuid',
  'category-uuid',
  100000,  -- ₱1,000.00
  'expense',
  'Pending purchase',
  CURRENT_DATE - INTERVAL '5 days',
  false
);
```

**Register push subscription:**

```sql
INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
VALUES ('user-uuid', 'https://fcm.googleapis.com/...', 'key1', 'key2');
```

**Trigger function:**

```bash
curl -X POST https://abc123.supabase.co/functions/v1/transaction-reminders \
  -H "Authorization: Bearer ANON_KEY"
```

**Verify:**

1. Check function response (should show 1 user notified)
2. Check device for push notification
3. Click notification → should open `/transactions?status=pending`

### Integration Test

**End-to-end workflow:**

1. Create transaction via UI with cleared = false
2. Set transaction date to 5 days ago (manual DB update for testing)
3. Wait for cron trigger (or manually invoke)
4. Verify notification received with correct count
5. Click notification → verify filters applied

## Performance Considerations

### Query Optimization

**Indexes required:**

```sql
CREATE INDEX idx_transactions_cleared_date
ON transactions(cleared, date)
WHERE cleared = false;
```

**Why:**

- Filtering by cleared status and date range
- Partial index (only unchecked transactions)
- Without index, full table scan on every run

### Limit to 100 Transactions

**Line 43:** `.limit(100)`

**Prevents:**

- Function timeout with huge datasets
- Overwhelming users with giant notification counts
- Memory issues processing thousands of transactions

**Edge case:** User with >100 pending transactions

- Only counts first 100 (oldest)
- Still notifies user of issue
- User can manually review all pending in app

### Grouping Efficiency

**Lines 62-72:** Reduce operation groups in O(n) time

**Efficient because:**

- Single pass through transactions
- In-memory grouping (no additional queries)
- Result size limited by number of users, not transactions

## Security Considerations

### Service Role Key Usage

**Same as budget-alerts:**

- Edge functions run server-side (trusted environment)
- Needs to query all users' transactions
- Bypasses RLS policies

**Security measures:**

- Function only accessible via authenticated cron trigger
- Service role key never exposed to client
- No user input (no injection risk)

### Owner vs User ID

**Line 64:**

```typescript
const userId = txn.owner_user_id;
```

**Why `owner_user_id` not `user_id`?**

- `user_id`: Current household user
- `owner_user_id`: Creator of transaction
- Notifications go to transaction owner (creator)

**Scenario:** Shared household account

- User A creates transaction
- User B shouldn't get reminder about A's pending transaction
- Reminder goes to A (`owner_user_id`)

### No Personal Data in Notification

**Lines 100-106:** Notification shows:

- Transaction count
- Oldest date
- **NOT** transaction descriptions or amounts

**Why:**

- Privacy: Notifications visible on lock screen
- Security: Reduces info exposure if device compromised
- Simplicity: Summary is sufficient for reminder

## Critical Implementation Notes

### 1. Date Arithmetic in Deno

**Lines 31-34:**

```typescript
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
const thresholdDate = threeDaysAgo.toISOString().split("T")[0];
```

**Why `.split("T")[0]`?**

- Converts ISO 8601 datetime to DATE format
- `2024-01-20T00:00:00.000Z` → `2024-01-20`
- Matches database DATE column format

### 2. Grouping Prevents Notification Spam

**Lines 62-72:** Group by user before sending

**Without grouping:**

- User with 10 pending transactions
- Receives 10 separate notifications
- Overwhelming and annoying

**With grouping:**

- User receives 1 notification
- "You have 10 pending transactions"
- Clean and actionable

### 3. Oldest Date Emphasis

**Line 105:**

```typescript
`You have ${count} pending transactions (oldest: ${transactions[0].date})`;
```

**Why oldest, not newest?**

- Oldest = longest pending
- Creates urgency ("been 7 days!")
- Motivates action

**Transactions sorted ascending (line 42):**

- First transaction = oldest
- Used in notification message

### 4. URL Filter Parameter

**Line 131:**

```json
{ "url": "/transactions?status=pending" }
```

**Notification click:**

- Opens /transactions page
- Auto-filters to status=pending
- User sees exactly what needs attention

**Requires:** Frontend to respect `status` query param

### 5. Cleared Field Boolean Logic

**Line 40:** `.eq("cleared", false)`

**Database schema:**

- `cleared` is BOOLEAN
- Default: false (newly created transactions)
- User marks true when transaction posts

**Workflow:**

1. Create transaction → cleared = false
2. Bank posts transaction → user marks cleared = true
3. If not marked within 3 days → reminder triggered

## Troubleshooting

### Issue: No notifications received for old pending transactions

**Check:**

1. Are transactions actually >3 days old? Verify `date` field
2. Is `cleared = false`? Check transactions table
3. Does user have push subscription? Query `push_subscriptions`
4. Are environment variables set? Check Supabase dashboard
5. Check function logs: Supabase → Edge Functions → Logs

### Issue: Receiving notifications for cleared transactions

**Check:**

1. Is `cleared` field being updated correctly in app?
2. Does transaction update mutation set `cleared = true`?
3. Check transaction in database directly

### Issue: Notification shows wrong count

**Check:**

1. Query limit set to 100 (line 43) - User may have >100 pending
2. Grouping logic correct? (lines 62-72)
3. Verify with direct SQL query

### Issue: Function times out

**Check:**

1. Number of pending transactions - May need to increase/decrease limit
2. Database query performance - Check indexes
3. Cloudflare Worker response time - May be slow

## Related Components

### Database Schema

- [/docs/initial plan/DATABASE.md](../../../../docs/initial%20plan/DATABASE.md) - Transactions table with cleared field
- [/supabase/migrations/](../../migrations/README.md) - Database migrations

### Cloudflare Workers

- [/workers/push-notifications/](../../../../workers/) - Push notification delivery worker
- [/docs/initial plan/PWA-MANIFEST.md](../../../../docs/initial%20plan/PWA-MANIFEST.md) - Web Push setup

### Edge Functions

- [../budget-alerts/README.md](../budget-alerts/README.md) - Similar edge function for budget alerts
- [../README.md](../README.md) - Edge Functions overview

### Frontend

- [/src/components/README.md](../../../../src/components/README.md) - Transaction components
- [/src/routes/transactions.tsx](../../../../src/routes/README.md) - Transactions page with status filtering

## Further Context

### Project Documentation

- [/CLAUDE.md](../../../../CLAUDE.md) - Project quick reference
- [/supabase/README.md](../../README.md) - Supabase backend overview

### Deployment

- [/docs/initial plan/DEPLOYMENT.md](../../../../docs/initial%20plan/DEPLOYMENT.md) - Deployment strategy

### Architecture Decisions

- Pending transaction workflow designed for user autonomy
- Reminders encourage good financial hygiene habits
- Non-intrusive: Summary only, not individual transaction details

## Further Reading

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions) - Official docs
- [Deno Deploy](https://deno.com/deploy) - Runtime environment
- [Web Push Protocol](https://web.dev/push-notifications/) - Push notification standard
- [Date Arithmetic in JavaScript](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date) - MDN guide
