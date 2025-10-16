# Checkpoint: Devices Table

Run these verifications to ensure everything works correctly.

---

## 1. Migration Applied Successfully ✓

```bash
npx supabase db diff
```

**Expected**: No diff (all migrations applied)

Check devices table exists:

```bash
npx supabase db dump --data-only --table devices
```

**Expected**: Table structure displayed, no errors

---

## 2. Devices Table Schema Correct ✓

**Verify in Supabase Dashboard**:

1. Go to Table Editor → devices
2. Check columns exist:
   - `id` (text, primary key)
   - `user_id` (uuid, foreign key to auth.users)
   - `household_id` (uuid, foreign key to households)
   - `name` (text)
   - `platform` (text with CHECK constraint)
   - `fingerprint` (text)
   - `is_active` (boolean, default true)
   - `last_seen` (timestamptz, default NOW())
   - `created_at` (timestamptz, default NOW())
   - `updated_at` (timestamptz, default NOW())

**Expected**: All columns present with correct types

---

## 3. Indexes Exist ✓

Run in Supabase SQL Editor:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'devices';
```

**Expected**:

```
idx_devices_user_id
idx_devices_household_id
idx_devices_active
idx_devices_last_seen
```

---

## 4. RLS Policies Active ✓

Run in Supabase SQL Editor:

```sql
SELECT polname, polcmd, polpermissive, polroles
FROM pg_policy
WHERE polrelid = 'devices'::regclass;
```

**Expected**: 4 policies (SELECT, INSERT, UPDATE, DELETE)

**Check RLS enabled**:

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'devices';
```

**Expected**: `relrowsecurity` = true

---

## 5. Device Registration Works ✓

**Test Case 1: Login and register**

1. Start app: `npm run dev`
2. Log in with test user
3. Open Supabase Dashboard → devices table
4. **Expected**: Device record appears with:
   - Your device ID
   - Your user ID
   - Device name (e.g., "Chrome on macOS")
   - Platform type ("web" or "pwa-\*")
   - `is_active` = true
   - Recent `last_seen` timestamp

---

## 6. Device Metadata Correct ✓

Open DevTools Console:

```javascript
const info = await deviceManager.getDeviceInfo();
console.log("Device Info:", info);

const { data } = await supabase.from("devices").select("*").eq("id", info.id).single();

console.log("Device in DB:", data);

// Check they match
console.log("Name matches:", info.name === data.name);
console.log("Platform matches:", info.platform === data.platform);
console.log("Fingerprint matches:", info.fingerprint === data.fingerprint);
```

**Expected**: All three matches return `true`

---

## 7. Duplicate Registration Idempotent ✓

**Test Case 2: Register twice**

```javascript
const userId = "..."; // Your user ID
const householdId = "..."; // Your household ID

// Register once
await registerDevice(userId, householdId);

// Register again
await registerDevice(userId, householdId);

// Check count
const { count } = await supabase
  .from("devices")
  .select("*", { count: "exact", head: true })
  .eq("id", await deviceManager.getDeviceId());

console.log("Device count:", count); // Should be 1
```

**Expected**: Only 1 device record (upsert worked)

---

## 8. last_seen Updates ✓

**Test Case 3: Focus window**

1. Note current `last_seen` timestamp in dashboard
2. Switch to another application
3. Wait 61 seconds (throttle period)
4. Focus back to app window
5. Wait 5 seconds
6. Refresh dashboard → devices table
7. **Expected**: `last_seen` timestamp updated to recent time

---

## 9. RLS Policies Enforced ✓

**Test Case 4: Cannot access other users' devices**

1. Create test user in Supabase Auth
2. Manually insert device for test user via SQL Editor:

```sql
INSERT INTO devices (id, user_id, household_id, name, platform, fingerprint)
VALUES (
  'test-device-123',
  '00000000-0000-0000-0000-000000000000', -- Test user ID
  '00000000-0000-0000-0000-000000000001', -- Test household
  'Test Device',
  'web',
  'test-fingerprint'
);
```

3. As your main user, query devices:

```javascript
const { data } = await supabase.from("devices").select("*");
console.log("Devices:", data);
```

4. **Expected**: Only YOUR devices returned, NOT test user's device

---

## 10. Device Deactivation Works ✓

**Test Case 5: Deactivate device**

```javascript
const deviceId = await deviceManager.getDeviceId();

// Deactivate
await deactivateDevice(deviceId);

// Check status
const { data } = await supabase.from("devices").select("is_active").eq("id", deviceId).single();

console.log("is_active:", data.is_active); // Should be false
```

**Expected**: `is_active` set to `false`

---

## 11. Device Status Check Works ✓

```javascript
const deviceId = await deviceManager.getDeviceId();

// Initially active
console.log("Active:", await isDeviceActive(deviceId)); // true

// Deactivate
await deactivateDevice(deviceId);

// Now inactive
console.log("Active:", await isDeviceActive(deviceId)); // false
```

**Expected**: Returns correct status

---

## 12. Multiple Tabs Share Device ✓

**Test Case 6: Multi-tab consistency**

1. Open app in Tab 1
2. Open app in Tab 2
3. Check devices table in dashboard
4. **Expected**: Only 1 device record (both tabs share same device ID)

---

## Success Criteria

- [ ] Migration applied successfully
- [ ] Devices table schema correct
- [ ] Indexes created properly
- [ ] RLS policies active and enforced
- [ ] Device registration creates record
- [ ] Device metadata accurate (name, platform, fingerprint)
- [ ] Duplicate registration is idempotent (upsert)
- [ ] last_seen updates on app focus
- [ ] Cannot access other users' devices
- [ ] Device deactivation works
- [ ] Device status check accurate
- [ ] Multiple tabs share same device

---

## Common Issues

### Issue: Migration fails with "households table doesn't exist"

**Solution**: Ensure households table created first (chunk 004):

```bash
npx supabase migration list
# Check for migration creating households table
```

### Issue: Device registration fails with "household_id violates foreign key"

**Solution**: Use actual household ID:

```typescript
// Fetch from profile
const { data } = await supabase.from("profiles").select("household_id").eq("id", userId).single();

await registerDevice(userId, data.household_id);
```

### Issue: RLS prevents device registration

**Solution**: Check auth context in registerDevice call:

```javascript
// Verify user authenticated
const {
  data: { user },
} = await supabase.auth.getUser();
console.log("User:", user); // Should exist
```

---

## Next Steps

Once all checkpoints pass:

1. Commit devices table code
2. Move to **Chunk 028: Events Schema** (transaction_events table)

---

**Estimated Time**: 10-15 minutes to verify all checkpoints
