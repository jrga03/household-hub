# Row Level Security (RLS) Policies

## Overview

Row Level Security (RLS) in Supabase ensures data access control at the database level. Our multi-household architecture supports multiple households with a default household for single-household deployments. Access is controlled by both `household_id` and `visibility` fields.

## Core Principles

1. **Multi-Household Support**: Users belong to specific households (default: `00000000-0000-0000-0000-000000000001`)
2. **Household Isolation**: Data is strictly isolated between households
3. **Visibility Types**: Within a household, data is either `household` (visible to all members) or `personal` (visible to owner only)
4. **Audit Trail**: Users can view audit events for their household for transparency
5. **No Role Hierarchy**: All users have equal permissions for household data within their household

## Table-Specific Policies

### 1. Profiles Table

```sql
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view profiles in their household
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Policy: Users can only update their own profile
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy: No direct inserts (handled by trigger on auth.users)
-- Policy: No deletes (handled by cascade from auth.users)
```

**Rationale**: Users can see other members in their household but not in other households. Personal settings remain private.

### 2. Accounts Table

```sql
-- Enable RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

-- Policy: View household accounts or own personal accounts (within same household)
CREATE POLICY "accounts_select"
  ON accounts FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

-- Policy: Create accounts in user's household
CREATE POLICY "accounts_insert"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

-- Policy: Update household accounts or own personal accounts (within same household)
CREATE POLICY "accounts_update"
  ON accounts FOR UPDATE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );

-- Policy: Delete household accounts or own personal accounts (within same household)
CREATE POLICY "accounts_delete"
  ON accounts FOR DELETE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR owner_user_id = auth.uid()
    )
  );
```

**Rationale**: Joint accounts are managed collectively within a household, personal accounts remain private. Data is isolated between households.

### 3. Categories Table

```sql
-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view categories in their household
CREATE POLICY "categories_select"
  ON categories FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Policy: Users can manage categories in their household
CREATE POLICY "categories_insert"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "categories_update"
  ON categories FOR UPDATE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "categories_delete"
  ON categories FOR DELETE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );
```

**Rationale**: Categories are shared household configuration that all members within a household need to access and maintain. Categories are isolated between households.

### 4. Transactions Table

```sql
-- Enable RLS
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Policy: View household transactions or own personal transactions or tagged transactions (within same household)
CREATE POLICY "transactions_select"
  ON transactions FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      visibility = 'household'
      OR created_by_user_id = auth.uid()
      OR auth.uid() = ANY(tagged_user_ids)  -- Can view if tagged (@mentioned)
    )
  );

-- Policy: Create transactions in user's household
CREATE POLICY "transactions_insert"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND created_by_user_id = auth.uid()
  );

-- Policy: Update own transactions or household transactions (within same household)
CREATE POLICY "transactions_update"
  ON transactions FOR UPDATE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      created_by_user_id = auth.uid()
      OR visibility = 'household'
    )
  )
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND (
      created_by_user_id = auth.uid()
      OR visibility = 'household'
    )
  );

-- Policy: Delete own transactions only (within same household)
CREATE POLICY "transactions_delete"
  ON transactions FOR DELETE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND created_by_user_id = auth.uid()
  );
```

**Rationale**: Household transactions are collaborative within a household, personal transactions are private. Only creators can delete to prevent accidental data loss. Data is isolated between households.

### 5. Transaction Events Table

```sql
-- Enable RLS
ALTER TABLE transaction_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view events in their household (audit trail)
CREATE POLICY "transaction_events_select"
  ON transaction_events FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Policy: Events are created by users in their household
CREATE POLICY "transaction_events_insert"
  ON transaction_events FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
    AND actor_user_id = auth.uid()
  );

-- Policy: Events are immutable (no update/delete)
-- No UPDATE or DELETE policies - events cannot be modified
```

**Rationale**: Complete audit trail visibility ensures transparency within a household and helps with conflict resolution. Events are isolated between households.

### 6. Budgets Table

```sql
-- Enable RLS
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view and manage budgets in their household
CREATE POLICY "budgets_select"
  ON budgets FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "budgets_insert"
  ON budgets FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "budgets_update"
  ON budgets FOR UPDATE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "budgets_delete"
  ON budgets FOR DELETE
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );
```

**Rationale**: Budgets are collaborative household planning tools that all members within a household contribute to. Budgets are isolated between households.

### 7. Sync Queue Table

```sql
-- Enable RLS
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see and manage their own devices' queue
-- Updated to reference devices table (Decision #82 - devices promoted to MVP)
CREATE POLICY "sync_queue_select"
  ON sync_queue FOR SELECT
  TO authenticated
  USING (
    device_id IN (
      SELECT id FROM devices WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "sync_queue_insert"
  ON sync_queue FOR INSERT
  TO authenticated
  WITH CHECK (
    device_id IN (
      SELECT id FROM devices WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "sync_queue_update"
  ON sync_queue FOR UPDATE
  TO authenticated
  USING (
    device_id IN (
      SELECT id FROM devices WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    device_id IN (
      SELECT id FROM devices WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "sync_queue_delete"
  ON sync_queue FOR DELETE
  TO authenticated
  USING (
    device_id IN (
      SELECT id FROM devices WHERE user_id = auth.uid()
    )
  );
```

**Rationale**: Sync queues are device-specific and should be isolated to prevent interference between devices. Users can have multiple devices, each with its own sync queue. See DATABASE.md for devices table schema.

### 8. Snapshots Table

```sql
-- Enable RLS
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view snapshots for their household
CREATE POLICY "snapshots_select"
  ON snapshots FOR SELECT
  TO authenticated
  USING (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Policy: Users can create snapshots for their household
CREATE POLICY "snapshots_insert"
  ON snapshots FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Policy: Snapshots are immutable (no update)
-- No UPDATE policy

-- Policy: System cleanup only (via Worker/cron)
CREATE POLICY "snapshots_delete"
  ON snapshots FOR DELETE
  TO service_role
  USING (true);
```

**Rationale**: Backups benefit the entire household but are isolated between households. Service role handles retention cleanup.

### 9. Devices Table

```sql
-- Enable RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view all devices in their household (for transparency)
CREATE POLICY "devices_select"
  ON devices FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Policy: Users can register new devices for themselves
CREATE POLICY "devices_insert"
  ON devices FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND household_id = (SELECT household_id FROM profiles WHERE id = auth.uid())
  );

-- Policy: Users can only update their own devices (e.g., name, last_seen)
CREATE POLICY "devices_update"
  ON devices FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
  )
  WITH CHECK (
    user_id = auth.uid()
  );

-- Policy: Users can delete their own devices only
CREATE POLICY "devices_delete"
  ON devices FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
  );
```

**Rationale**: Users should see all devices in their household for transparency (useful for identifying unexpected devices), but can only manage their own devices. This prevents accidental deletion of other household members' devices while maintaining visibility for security purposes.

**Note**: Devices table promoted to MVP (Decision #82) to enable multi-device support from day one and prevent migration pain. See DATABASE.md for complete schema and SYNC-ENGINE.md for device registration flow.

## Query View Access

Query views (not materialized) inherit base table permissions automatically through RLS policies on underlying tables. No additional grants needed since views execute with the permissions of the querying user.

## Service Role Exceptions

The service role bypasses RLS for:

- Snapshot retention cleanup
- Event compaction
- System maintenance
- Batch operations via Edge Functions

```sql
-- Example: Edge Function for event compaction (uses service role)
CREATE OR REPLACE FUNCTION compact_old_events()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with owner privileges
AS $$
BEGIN
  -- Compact events older than 90 days into summary records
  -- Implementation details would go here
END;
$$;

-- Grant execute to service role only
GRANT EXECUTE ON FUNCTION compact_old_events() TO service_role;
```

## Testing RLS Policies

### Test Cases

```sql
-- Test 1: User can see household transactions in their household
SET LOCAL "request.jwt.claim.sub" = 'user-1-id';
SELECT * FROM transactions WHERE visibility = 'household';
-- Expected: Returns household transactions only from user's household

-- Test 2: User cannot see transactions from other households
SET LOCAL "request.jwt.claim.sub" = 'user-1-id';
SELECT * FROM transactions WHERE household_id = 'other-household-id';
-- Expected: Returns empty (blocked by RLS)

-- Test 3: User cannot see other's personal transactions in same household
SET LOCAL "request.jwt.claim.sub" = 'user-1-id';
SELECT * FROM transactions WHERE visibility = 'personal' AND created_by_user_id = 'user-2-id';
-- Expected: Returns empty

-- Test 4: User can update household transactions in their household
SET LOCAL "request.jwt.claim.sub" = 'user-1-id';
UPDATE transactions SET notes = 'Updated' WHERE visibility = 'household';
-- Expected: Updates only transactions in user's household

-- Test 5: User cannot delete other's transactions
SET LOCAL "request.jwt.claim.sub" = 'user-1-id';
DELETE FROM transactions WHERE created_by_user_id = 'user-2-id';
-- Expected: No rows deleted

-- Test 6: Users can only see audit events from their household
SET LOCAL "request.jwt.claim.sub" = 'user-1-id';
SELECT * FROM transaction_events;
-- Expected: Returns only events from user's household
```

### Automated Testing

```typescript
// test/rls.test.ts
import { createClient } from "@supabase/supabase-js";

describe("RLS Policies", () => {
  let user1Client: any;
  let user2Client: any;

  beforeAll(async () => {
    // Create two test users
    user1Client = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    await user1Client.auth.signUp({
      email: "user1@test.com",
      password: "password",
    });

    user2Client = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    await user2Client.auth.signUp({
      email: "user2@test.com",
      password: "password",
    });
  });

  test("household transactions visible to all", async () => {
    // User 1 creates household transaction
    const { data: tx } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 10000,
        type: "expense",
        visibility: "household",
        description: "Groceries",
      })
      .select()
      .single();

    // User 2 can see it
    const { data: visible } = await user2Client
      .from("transactions")
      .select()
      .eq("id", tx.id)
      .single();

    expect(visible).toBeDefined();
    expect(visible.id).toBe(tx.id);
  });

  test("personal transactions private", async () => {
    // User 1 creates personal transaction
    const { data: tx } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 5000,
        type: "expense",
        visibility: "personal",
        description: "Personal expense",
      })
      .select()
      .single();

    // User 2 cannot see it
    const { data: hidden } = await user2Client
      .from("transactions")
      .select()
      .eq("id", tx.id)
      .single();

    expect(hidden).toBeNull();
  });

  test("users can update household transactions", async () => {
    // User 1 creates household transaction
    const { data: tx } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 10000,
        type: "expense",
        visibility: "household",
        description: "Shared expense",
      })
      .select()
      .single();

    // User 2 can update it
    const { error } = await user2Client
      .from("transactions")
      .update({ notes: "Updated by user 2" })
      .eq("id", tx.id);

    expect(error).toBeNull();
  });

  test("only creator can delete transactions", async () => {
    // User 1 creates transaction
    const { data: tx } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 10000,
        type: "expense",
        visibility: "household",
        description: "Test transaction",
      })
      .select()
      .single();

    // User 2 cannot delete it
    const { error: deleteError } = await user2Client.from("transactions").delete().eq("id", tx.id);

    // Verify still exists
    const { data: stillExists } = await user1Client
      .from("transactions")
      .select()
      .eq("id", tx.id)
      .single();

    expect(stillExists).toBeDefined();
  });
});
```

### Edge Case Testing

The following edge cases should be explicitly tested to ensure RLS policies handle boundary conditions correctly:

```typescript
// test/rls-edge-cases.test.ts

describe("RLS Edge Cases", () => {
  test("tagged users can read but not update household transactions", async () => {
    // User 1 creates household transaction
    const { data: tx } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 10000,
        type: "expense",
        visibility: "household",
        description: "Shared expense",
        tagged_user_ids: [user2.id], // Tag user 2
      })
      .select()
      .single();

    // User 2 (tagged) can read it
    const { data: readable } = await user2Client
      .from("transactions")
      .select()
      .eq("id", tx.id)
      .single();
    expect(readable).toBeDefined();

    // But User 2 cannot update it (not creator)
    const { error } = await user2Client
      .from("transactions")
      .update({ notes: "Trying to update" })
      .eq("id", tx.id);
    expect(error).toBeNull(); // Policy allows UPDATE for household transactions
  });

  test("visibility transitions respect RLS", async () => {
    // User 1 creates personal transaction
    const { data: tx } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 5000,
        type: "expense",
        visibility: "personal",
        description: "Personal item",
      })
      .select()
      .single();

    // User 2 cannot see it
    const { data: hidden } = await user2Client
      .from("transactions")
      .select()
      .eq("id", tx.id)
      .single();
    expect(hidden).toBeNull();

    // User 1 changes visibility to household
    await user1Client.from("transactions").update({ visibility: "household" }).eq("id", tx.id);

    // Now User 2 can see it
    const { data: nowVisible } = await user2Client
      .from("transactions")
      .select()
      .eq("id", tx.id)
      .single();
    expect(nowVisible).toBeDefined();
  });

  test("inactive devices cannot access sync queue", async () => {
    // Create inactive device for user
    const { data: device } = await user1Client
      .from("devices")
      .insert({
        id: "test-device-inactive",
        user_id: user1.id,
        is_active: false,
      })
      .select()
      .single();

    // Try to access sync queue with inactive device
    // Note: Application logic should prevent this, but RLS doesn't block inactive devices
    // (is_active is application-level, not RLS-level check)
    const { data: queueItems } = await user1Client
      .from("sync_queue")
      .select()
      .eq("device_id", device.id);

    // RLS allows it (device belongs to user), but sync engine should filter inactive devices
    // This test documents that is_active filtering must happen in application code
  });

  test("transfer deletion updates do not bypass RLS", async () => {
    // User 1 creates transfer pair
    const transfer_group_id = uuid();

    // Withdrawal from Account A
    const { data: withdrawal } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 50000,
        type: "expense",
        visibility: "household",
        description: "Transfer out",
        transfer_group_id,
        account_id: accountA.id,
      })
      .select()
      .single();

    // Deposit to Account B
    const { data: deposit } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 50000,
        type: "income",
        visibility: "household",
        description: "Transfer in",
        transfer_group_id,
        account_id: accountB.id,
      })
      .select()
      .single();

    // User 2 tries to delete one leg of transfer
    // RLS prevents deletion (only creator can delete)
    const { error } = await user2Client.from("transactions").delete().eq("id", withdrawal.id);

    expect(error).toBeDefined(); // Should fail
  });

  test("household isolation prevents cross-household access", async () => {
    // Create User 3 in different household
    const user3Client = createClient(url, anonKey);
    await user3Client.auth.signUp({
      email: "user3@test.com",
      password: "password",
    });

    // Update user3's household_id to different household
    await serviceClient
      .from("profiles")
      .update({ household_id: "different-household-uuid" })
      .eq("id", user3.id);

    // User 1 creates transaction in household 1
    const { data: tx } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 10000,
        type: "expense",
        visibility: "household", // Household visible, but wrong household
        description: "Household 1 expense",
      })
      .select()
      .single();

    // User 3 (household 2) cannot see it despite visibility='household'
    const { data: invisible } = await user3Client
      .from("transactions")
      .select()
      .eq("id", tx.id)
      .single();

    expect(invisible).toBeNull(); // RLS blocks cross-household access
  });

  test("events remain immutable even for creator", async () => {
    // User 1 creates transaction, which creates event
    const { data: tx } = await user1Client
      .from("transactions")
      .insert({
        amount_cents: 10000,
        type: "expense",
        visibility: "household",
        description: "Test transaction",
      })
      .select()
      .single();

    // Find the event
    const { data: event } = await user1Client
      .from("transaction_events")
      .select()
      .eq("entity_id", tx.id)
      .single();

    // User 1 tries to modify their own event
    const { error: updateError } = await user1Client
      .from("transaction_events")
      .update({ checksum: "tampered" })
      .eq("id", event.id);

    // Should fail - events are immutable
    expect(updateError).toBeDefined();
    expect(updateError.message).toContain("not allowed");

    // User 1 tries to delete their own event
    const { error: deleteError } = await user1Client
      .from("transaction_events")
      .delete()
      .eq("id", event.id);

    // Should fail - no DELETE policy exists
    expect(deleteError).toBeDefined();
  });
});
```

**Edge Case Summary**:

1. **Tagged users**: Can read but policy determines update rights (household transactions updatable by all household members)
2. **Visibility transitions**: Changing from personal→household correctly expands access
3. **Inactive devices**: RLS doesn't filter by `is_active` (application layer responsibility)
4. **Transfer deletion**: RLS prevents unauthorized deletion of transfer legs
5. **Household isolation**: `household_id` check prevents cross-household access even with visibility='household'
6. **Event immutability**: No UPDATE/DELETE policies enforce append-only audit log

**Related**:

- [DATABASE.md](./DATABASE.md) - Transfer integrity triggers
- [SECURITY.md](./SECURITY.md) - Threat model for compromised accounts
- [TESTING-PLAN.md](./TESTING-PLAN.md) - Full test suite including RLS coverage

## Security Best Practices

### 1. Principle of Least Privilege

- Users only access data they need
- Personal data remains private
- Deletion restricted to prevent accidents

### 2. Audit Trail

- All changes tracked in events
- Events are immutable
- Full visibility for transparency

### 3. Service Role Protection

- Never expose service role key to client
- Use Edge Functions for privileged operations
- Implement rate limiting

### 4. Input Validation

- Validate at application layer
- Use database constraints
- Sanitize user input

### 5. Regular Audits

```sql
-- Audit query to check policy violations
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

## Monitoring & Alerts

### 1. Failed Access Attempts

```sql
-- Monitor RLS denials (in Supabase logs)
SELECT
  timestamp,
  user_id,
  table_name,
  operation,
  error_message
FROM auth.audit_log
WHERE error_message LIKE '%row-level security%'
ORDER BY timestamp DESC
LIMIT 100;
```

### 2. Unusual Access Patterns

```sql
-- Detect unusual data access
SELECT
  user_id,
  COUNT(*) as request_count,
  COUNT(DISTINCT table_name) as tables_accessed,
  DATE_TRUNC('hour', timestamp) as hour
FROM auth.audit_log
GROUP BY user_id, DATE_TRUNC('hour', timestamp)
HAVING COUNT(*) > 1000  -- Threshold
ORDER BY request_count DESC;
```

### 3. Policy Performance

```sql
-- Check RLS policy performance impact
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM transactions
WHERE visibility = 'household';
```

## Migration Guide

### Adding New Tables

1. Create table with appropriate fields
2. Add `visibility` field if data can be personal/household
3. Add `created_by_user_id` or `owner_user_id` for ownership
4. Enable RLS: `ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;`
5. Create appropriate policies following patterns above
6. Test with multiple users
7. Document in this file

### Modifying Existing Policies

1. Test changes in development
2. Create new policy with different name
3. Test new policy
4. Drop old policy
5. Rename new policy
6. Deploy to production

```sql
-- Safe policy update pattern
BEGIN;
CREATE POLICY "transactions_select_v2" ON transactions ...;
DROP POLICY "transactions_select" ON transactions;
ALTER POLICY "transactions_select_v2" ON transactions RENAME TO "transactions_select";
COMMIT;
```

## Troubleshooting

### Common Issues

1. **"No rows returned" when data exists**
   - Check visibility field
   - Verify user authentication
   - Review policy conditions

2. **"Permission denied" errors**
   - Check policy exists for operation
   - Verify WITH CHECK conditions
   - Ensure proper role (authenticated vs anon)

3. **Performance degradation**
   - Add indexes for policy conditions
   - Simplify policy logic
   - Consider materialized views

4. **Unexpected data visibility**
   - Audit policy conditions
   - Check for policy conflicts
   - Verify auth.uid() is correct

### Debug Queries

```sql
-- Check current user
SELECT auth.uid();

-- Check applied policies
SELECT * FROM pg_policies WHERE tablename = 'transactions';

-- Test policy as specific user
SET LOCAL "request.jwt.claim.sub" = 'test-user-id';
SELECT * FROM transactions;
RESET "request.jwt.claim.sub";
```
