# Instructions: Devices Table

Follow these steps in order. Estimated time: 30 minutes.

---

## Step 1: Create Supabase Migration (10 min)

Create a new migration:

```bash
npx supabase migration new add_devices_table
```

This creates a file like `supabase/migrations/YYYYMMDDHHMMSS_add_devices_table.sql`.

Open the migration file and add:

```sql
-- Devices table for multi-device sync
-- Decision #82: Promoted to MVP to avoid migration pain later

CREATE TABLE devices (
  -- Device ID from browser fingerprint/localStorage
  id TEXT PRIMARY KEY,

  -- Ownership
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,

  -- Device metadata
  name TEXT NOT NULL,                    -- e.g., "Chrome on macOS"
  platform TEXT NOT NULL CHECK (
    platform IN ('web', 'pwa-ios', 'pwa-android', 'pwa-desktop')
  ),
  fingerprint TEXT NOT NULL,             -- Browser fingerprint for continuity

  -- Status
  is_active BOOLEAN DEFAULT true NOT NULL,
  last_seen TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for common queries
CREATE INDEX idx_devices_user_id ON devices(user_id);
CREATE INDEX idx_devices_household_id ON devices(household_id);
CREATE INDEX idx_devices_active ON devices(is_active) WHERE is_active = true;
CREATE INDEX idx_devices_last_seen ON devices(last_seen);

-- Updated at trigger
CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON devices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Policies: Users can manage their own devices
CREATE POLICY "Users can view their own devices"
  ON devices FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can register their own devices"
  ON devices FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own devices"
  ON devices FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own devices"
  ON devices FOR DELETE
  USING (user_id = auth.uid());

-- Comments for documentation
COMMENT ON TABLE devices IS 'Registry of devices for multi-device sync. Each device (browser/PWA instance) gets a unique entry for event attribution and conflict resolution.';
COMMENT ON COLUMN devices.id IS 'Device ID from DeviceManager (fingerprint or UUID). Primary key for device identification.';
COMMENT ON COLUMN devices.name IS 'Human-readable device name (e.g., "Chrome on macOS"). Detected automatically from user agent.';
COMMENT ON COLUMN devices.platform IS 'Device platform type. Used to determine sync capabilities (e.g., iOS lacks Background Sync API).';
COMMENT ON COLUMN devices.fingerprint IS 'Browser fingerprint for device continuity after cache clear. May match device ID if fingerprint-based.';
COMMENT ON COLUMN devices.last_seen IS 'Last activity timestamp. Updated on app focus and sync operations. Used to identify inactive devices.';
```

**Verify**: Migration file created and contains SQL.

---

## Step 2: Apply Migration to Local Database (2 min)

Apply the migration:

```bash
npx supabase db reset
```

Or if you want to preserve existing data:

```bash
npx supabase migration up
```

**Verify** migration applied:

```bash
npx supabase db diff
```

Should show no diff (migration already applied).

---

## Step 3: Create Device Registration Utility (10 min)

Create `src/lib/device-registration.ts`:

```typescript
import { supabase } from "./supabase";
import { deviceManager } from "./device-manager";

/**
 * Register device in Supabase devices table
 *
 * This function is idempotent - safe to call multiple times.
 * If device already exists, it updates the last_seen timestamp.
 *
 * @param userId Current user ID
 * @param householdId Current household ID
 * @returns Device ID
 */
export async function registerDevice(userId: string, householdId: string): Promise<string> {
  const deviceId = await deviceManager.getDeviceId();
  const deviceInfo = await deviceManager.getDeviceInfo();

  try {
    // Upsert device record (insert or update)
    const { error } = await supabase.from("devices").upsert(
      {
        id: deviceId,
        user_id: userId,
        household_id: householdId,
        name: deviceInfo.name,
        platform: deviceInfo.platform,
        fingerprint: deviceInfo.fingerprint,
        is_active: true,
        last_seen: new Date().toISOString(),
      },
      {
        onConflict: "id", // Update if device ID already exists
      }
    );

    if (error) {
      console.error("Failed to register device:", error);
      throw error;
    }

    console.log("Device registered:", deviceId, deviceInfo.name);
    return deviceId;
  } catch (error) {
    console.error("Device registration error:", error);
    throw error;
  }
}

/**
 * Update device last_seen timestamp
 *
 * Call this when app regains focus to track device activity.
 * Throttled to prevent excessive updates.
 */
export async function updateDeviceLastSeen(): Promise<void> {
  const deviceId = await deviceManager.getDeviceId();

  try {
    const { error } = await supabase
      .from("devices")
      .update({ last_seen: new Date().toISOString() })
      .eq("id", deviceId);

    if (error) {
      console.warn("Failed to update last_seen:", error);
      // Don't throw - this is non-critical
    }
  } catch (error) {
    console.warn("Error updating last_seen:", error);
    // Don't throw - this is non-critical
  }
}

// Throttle last_seen updates to max once per minute
let lastSeenTimeout: NodeJS.Timeout | null = null;

/**
 * Throttled version of updateDeviceLastSeen
 *
 * Prevents excessive database updates when user rapidly focuses/unfocuses app.
 */
export function updateDeviceLastSeenThrottled(): void {
  if (lastSeenTimeout) return; // Already scheduled

  lastSeenTimeout = setTimeout(async () => {
    await updateDeviceLastSeen();
    lastSeenTimeout = null;
  }, 60000); // 1 minute
}

/**
 * Deactivate device (soft delete)
 *
 * Preserves device record for audit trail but marks as inactive.
 * Inactive devices should not create new events.
 *
 * @param deviceId Device ID to deactivate
 */
export async function deactivateDevice(deviceId: string): Promise<void> {
  const { error } = await supabase
    .from("devices")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deviceId);

  if (error) {
    console.error("Failed to deactivate device:", error);
    throw error;
  }

  console.log("Device deactivated:", deviceId);
}

/**
 * Check if device is registered and active
 *
 * @param deviceId Device ID to check
 * @returns true if device exists and is active
 */
export async function isDeviceActive(deviceId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("devices")
      .select("is_active")
      .eq("id", deviceId)
      .single();

    if (error) {
      console.warn("Failed to check device status:", error);
      return false;
    }

    return data?.is_active ?? false;
  } catch (error) {
    console.warn("Error checking device status:", error);
    return false;
  }
}
```

**Verify**: No TypeScript errors.

---

## Step 4: Add Device Registration to App Mount (5 min)

Update your main app component (e.g., `src/App.tsx` or `src/routes/__root.tsx`):

```typescript
import { useEffect } from "react";
import { registerDevice, updateDeviceLastSeenThrottled } from "@/lib/device-registration";
import { useAuthStore } from "@/stores/authStore";

function App() {
  const user = useAuthStore((state) => state.user);

  // Register device on app mount
  useEffect(() => {
    if (!user) return;

    async function register() {
      try {
        // Get household ID (you may need to fetch this from user profile)
        const householdId = "00000000-0000-0000-0000-000000000001"; // Replace with actual

        await registerDevice(user.id, householdId);
      } catch (error) {
        console.error("Device registration failed:", error);
        // Don't block app if registration fails
      }
    }

    register();
  }, [user]);

  // Update last_seen on app focus
  useEffect(() => {
    function handleFocus() {
      if (user) {
        updateDeviceLastSeenThrottled();
      }
    }

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [user]);

  return <div>{/* Your app content */}</div>;
}
```

**Verify**: No TypeScript errors, app compiles.

---

## Step 5: Test Device Registration (3 min)

Start the app:

```bash
npm run dev
```

**Open Supabase Dashboard**:

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to "Table Editor" → "devices"

**Verify**:

- [ ] Device record appears after login
- [ ] Device ID matches what DeviceManager returns
- [ ] Device name shows browser + OS
- [ ] Platform shows "web" or "pwa-\*"
- [ ] `is_active` is `true`
- [ ] `last_seen` is recent timestamp

**Test in Console**:

```javascript
// Check current device
const deviceId = await deviceManager.getDeviceId();
console.log("Device ID:", deviceId);

// Query Supabase for this device
const { data, error } = await supabase.from("devices").select("*").eq("id", deviceId).single();

console.log("Device in database:", data);
console.log("Error:", error);
```

**Expected**: Device record found with matching ID and metadata.

---

## Step 6: Test RLS Policies (Optional, 2 min)

**Test 1: Can view own devices**

```javascript
const { data, error } = await supabase.from("devices").select("*");

console.log("My devices:", data);
// Should return only your devices
```

**Test 2: Cannot view other users' devices**

In Supabase dashboard:

1. Create a test user
2. Add a device for test user manually (INSERT via SQL Editor bypassing RLS)
3. Try to query devices as your main user

```javascript
const { data } = await supabase.from("devices").select("*");
// Should NOT include test user's device
```

**Test 3: Cannot insert device for another user**

```javascript
const { error } = await supabase.from("devices").insert({
  id: "fake-device-id",
  user_id: "00000000-0000-0000-0000-000000000000", // Different user
  household_id: "...",
  name: "Fake Device",
  platform: "web",
  fingerprint: "fake",
});

console.log("Error:", error);
// Should fail with RLS error
```

---

## Done!

When device registration works and RLS policies protect data, you're ready for the checkpoint.

**Next**: Run through `checkpoint.md` to verify everything works.

---

## Notes

**Household ID**:

In production, fetch household ID from user profile:

```typescript
const { data: profile } = await supabase
  .from("profiles")
  .select("household_id")
  .eq("id", user.id)
  .single();

await registerDevice(user.id, profile.household_id);
```

**Device Deactivation**:

Users should deactivate devices via settings UI (future chunk):

```typescript
// In settings page
<Button onClick={() => deactivateDevice(deviceId)}>
  Remove This Device
</Button>
```

**last_seen Throttling**:

Throttled to 1 minute to prevent excessive updates. Adjust if needed:

```typescript
setTimeout(updateDeviceLastSeen, 30000); // 30 seconds
```

**Inactive Device Cleanup**:

Future enhancement: Supabase function to deactivate devices inactive >90 days:

```sql
UPDATE devices
SET is_active = false
WHERE last_seen < NOW() - INTERVAL '90 days'
  AND is_active = true;
```
