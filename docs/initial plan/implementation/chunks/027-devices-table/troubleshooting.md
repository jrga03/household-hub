# Troubleshooting: Devices Table

Common issues and solutions when working with the devices table.

---

## Migration Issues

### Problem: Migration fails with "relation households does not exist"

**Symptoms**:

```
ERROR:  relation "households" does not exist
```

**Cause**: Missing households table (foreign key dependency)

**Solution**: Create households table first:

```sql
-- In earlier migration
CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Or temporarily remove household foreign key:

```sql
-- Remove this line temporarily:
household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

-- Replace with:
household_id UUID NOT NULL,
```

---

### Problem: Migration fails with "function update_updated_at_column does not exist"

**Symptoms**:

```
ERROR:  function update_updated_at_column() does not exist
```

**Cause**: Missing trigger function (should be in initial migration)

**Solution**: Add trigger function to migration:

```sql
-- Add before CREATE TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### Problem: CHECK constraint fails on platform column

**Symptoms**:

```
ERROR:  new row for relation "devices" violates check constraint "devices_platform_check"
```

**Cause**: Invalid platform value

**Solution**: Ensure platform is one of allowed values:

```typescript
const VALID_PLATFORMS = ["web", "pwa-ios", "pwa-android", "pwa-desktop"];

if (!VALID_PLATFORMS.includes(platform)) {
  console.error("Invalid platform:", platform);
  platform = "web"; // Default to web
}
```

---

## Device Registration Issues

### Problem: Device registration fails with "user_id violates foreign key constraint"

**Symptoms**:

```
ERROR:  insert or update on table "devices" violates foreign key constraint
Key (user_id)=(xxxx) is not present in table "auth.users"
```

**Cause**: User not authenticated or invalid user ID

**Solution**: Verify authentication before registration:

```typescript
async function registerDevice(userId: string, householdId: string) {
  // Verify user exists
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    throw new Error("User not authenticated");
  }

  // Continue with registration...
}
```

---

### Problem: Device registration silently fails (no error, no record)

**Symptoms**:

- `registerDevice()` completes without error
- No device record in database
- No error in console

**Cause**: RLS policy blocking INSERT

**Solution**: Check RLS INSERT policy allows user to insert their own devices:

```sql
-- In Supabase SQL Editor, verify policy exists:
SELECT * FROM pg_policies WHERE tablename = 'devices' AND cmd = 'INSERT';

-- If missing, add policy:
CREATE POLICY "Users can register their own devices"
  ON devices FOR INSERT
  WITH CHECK (user_id = auth.uid());
```

---

### Problem: "Cannot read properties of null (reading 'id')" when registering device

**Symptoms**:

```javascript
TypeError: Cannot read properties of null (reading 'id')
```

**Cause**: Trying to register device before user loads

**Solution**: Add null check in useEffect:

```typescript
useEffect(() => {
  if (!user) return; // Add this check

  registerDevice(user.id, householdId);
}, [user]);
```

---

## RLS Policy Issues

### Problem: Can see other users' devices

**Symptoms**:

- Query returns devices not belonging to current user
- RLS not filtering correctly

**Cause**: RLS policy not enforced or incorrectly written

**Solution 1**: Verify RLS enabled:

```sql
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
```

**Solution 2**: Check SELECT policy uses auth.uid():

```sql
CREATE POLICY "Users can view their own devices"
  ON devices FOR SELECT
  USING (user_id = auth.uid());

-- NOT this (wrong):
-- USING (true);  -- ❌ Allows access to all devices
```

**Solution 3**: Test policy in SQL Editor:

```sql
-- Set session user
SET request.jwt.claim.sub = '<user-id>';

-- Query should only return that user's devices
SELECT * FROM devices;
```

---

### Problem: Cannot update last_seen timestamp

**Symptoms**:

```
ERROR: new row violates row-level security policy for table "devices"
```

**Cause**: UPDATE policy missing or too restrictive

**Solution**: Ensure UPDATE policy allows user to update their own devices:

```sql
CREATE POLICY "Users can update their own devices"
  ON devices FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

The `WITH CHECK` clause ensures users can't change user_id to someone else's.

---

## Device ID Issues

### Problem: Different device ID in database vs DeviceManager

**Symptoms**:

- DeviceManager returns "abc123"
- Database shows "xyz789" for same device

**Cause**: Race condition or multiple device registrations

**Solution**: Ensure device registration waits for DeviceManager:

```typescript
async function registerDevice(userId: string, householdId: string) {
  // Always await getDeviceId() first
  const deviceId = await deviceManager.getDeviceId();

  // Then register (don't parallelize)
  await supabase.from("devices").upsert({
    id: deviceId, // Use awaited ID
    // ...
  });
}
```

---

### Problem: Multiple device records for same device

**Symptoms**:

- Devices table shows 2+ rows with different IDs for same browser

**Cause**: DeviceManager generating new IDs (storage clearing)

**Solution 1**: Check device ID persistence (chunk 026):

```javascript
const id1 = await deviceManager.getDeviceId();
await deviceManager.clearDeviceId();
const id2 = await deviceManager.getDeviceId();

console.log("IDs match:", id1 === id2); // Should be true (fingerprint)
```

**Solution 2**: Clean up duplicate devices:

```sql
-- Find duplicates (same user, similar names)
SELECT user_id, name, COUNT(*)
FROM devices
GROUP BY user_id, name
HAVING COUNT(*) > 1;

-- Deactivate older duplicates
UPDATE devices
SET is_active = false
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, name ORDER BY created_at DESC) as rn
    FROM devices
  ) t WHERE rn > 1
);
```

---

## Upsert Issues

### Problem: Upsert creates duplicate instead of updating

**Symptoms**:

- Expected 1 device record
- Actually have 2+ records with same device ID

**Cause**: `onConflict` parameter missing or incorrect

**Solution**: Ensure upsert specifies conflict column:

```typescript
await supabase.from("devices").upsert(
  {
    id: deviceId,
    // ... other fields
  },
  {
    onConflict: "id", // ← Must specify conflict column (primary key)
  }
);
```

---

### Problem: Upsert doesn't update last_seen

**Symptoms**:

- Device registration completes
- last_seen timestamp doesn't update

**Cause**: Upsert only updates explicitly provided fields

**Solution**: Always include last_seen in upsert:

```typescript
await supabase.from("devices").upsert({
  id: deviceId,
  user_id: userId,
  // ... other fields
  last_seen: new Date().toISOString(), // ← Explicit update
});
```

---

## Performance Issues

### Problem: last_seen updates cause excessive database load

**Symptoms**:

- Database CPU usage high
- Many UPDATE queries in logs
- Performance degradation

**Cause**: Too frequent last_seen updates (every focus event)

**Solution**: Use throttling (already implemented):

```typescript
// Current implementation throttles to 1/minute
export function updateDeviceLastSeenThrottled(): void {
  if (lastSeenTimeout) return; // Skip if recent update

  lastSeenTimeout = setTimeout(async () => {
    await updateDeviceLastSeen();
    lastSeenTimeout = null;
  }, 60000); // 1 minute
}
```

Adjust throttle period if needed:

```typescript
// More aggressive: 5 minutes
setTimeout(updateDeviceLastSeen, 300000);

// Less aggressive: 30 seconds
setTimeout(updateDeviceLastSeen, 30000);
```

---

## TypeScript Issues

### Problem: "Property 'fingerprint' does not exist on type 'Database'"

**Symptoms**:

```typescript
// Type error on fingerprint field
```

**Cause**: Supabase types not regenerated after migration

**Solution**: Regenerate types:

```bash
npx supabase gen types typescript --local > src/types/supabase.ts
```

Then restart TypeScript server in VS Code (Cmd+Shift+P → "Restart TS Server").

---

### Problem: Cannot import registerDevice

**Symptoms**:

```
Cannot find module '@/lib/device-registration'
```

**Cause**: File not created or path alias not configured

**Solution 1**: Verify file exists:

```bash
ls src/lib/device-registration.ts
```

**Solution 2**: Check path alias in tsconfig.json:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## Household ID Issues

### Problem: "household_id is required but undefined"

**Symptoms**:

```
ERROR: null value in column "household_id" violates not-null constraint
```

**Cause**: Household ID not provided or not fetched

**Solution**: Fetch household from user profile:

```typescript
async function getHouseholdId(userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("household_id")
    .eq("id", userId)
    .single();

  if (error || !data?.household_id) {
    throw new Error("User has no household assigned");
  }

  return data.household_id;
}

// Usage
const householdId = await getHouseholdId(user.id);
await registerDevice(user.id, householdId);
```

---

## Prevention Tips

1. **Always await device ID**: Don't parallelize device ID generation with registration
2. **Use throttling**: Prevent excessive last_seen updates
3. **Check auth first**: Verify user authenticated before device operations
4. **Specify onConflict**: Always provide conflict column in upserts
5. **Regenerate types**: Run `npx supabase gen types` after schema changes
6. **Test RLS policies**: Verify policies in SQL Editor before deploying
7. **Monitor device count**: Alert if user has >10 devices (possible bug)

---

## Getting Help

If you're stuck:

1. Check this troubleshooting guide first
2. Verify migration applied: `npx supabase db diff`
3. Check RLS policies: Query `pg_policies` table
4. Test in SQL Editor: Bypass client code to isolate issue
5. Review SYNC-ENGINE.md lines 1209-1245 for device registration design
6. Check Decision #82 for devices table rationale

---

## Quick Fixes

```bash
# Reset database and reapply migrations
npx supabase db reset

# Regenerate TypeScript types
npx supabase gen types typescript --local > src/types/supabase.ts

# Check RLS policies
npx supabase db diff --schema auth

# View devices in database
psql $DATABASE_URL -c "SELECT * FROM devices ORDER BY created_at DESC;"
```

```javascript
// Clear and re-register device
await deviceManager.clearDeviceId();
const userId = (await supabase.auth.getUser()).data.user.id;
const householdId = "..."; // Your household ID
await registerDevice(userId, householdId);
```

---

**Remember**: The devices table is critical infrastructure for multi-device sync. Test thoroughly before proceeding to event generation.
