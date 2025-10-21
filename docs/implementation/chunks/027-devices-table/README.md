# Chunk 027: Devices Table

## At a Glance

- **Time**: 30 minutes
- **Milestone**: Multi-Device Sync (2 of 10)
- **Prerequisites**: Chunk 026 (device hybrid ID with DeviceManager)
- **Can Skip**: No - required for device registration and sync attribution

## What You're Building

Supabase devices table for device registry:

- SQL migration creating devices table
- Device fields: id, user_id, household_id, name, platform, fingerprint, is_active, last_seen
- Row-Level Security policies for device access
- Automatic device registration on app first load
- Update last_seen timestamp on app focus
- Device list UI (optional, for debugging)

## Why This Matters

The devices table was **promoted to MVP** (Decision #82) to avoid painful migrations later. It enables:

- **Device tracking**: Know which devices belong to which users
- **Audit trails**: Attribute events to specific devices
- **Device management**: Users can see and revoke device access
- **Sync attribution**: Track which device created each event
- **Security**: Detect unauthorized device access

Without this table, multi-device sync would be impossible to debug or secure.

## Before You Start

Make sure you have:

- Chunk 026 completed (DeviceManager class exists)
- Supabase CLI installed: `npm install supabase --save-dev`
- Database connection working
- User authentication functional

## What Happens Next

After this chunk:

- Devices table exists in Supabase
- RLS policies protect device data
- Devices auto-register on first app load
- last_seen updates on app focus
- Ready for event attribution (chunk 030)
- Foundation for device management UI (future)

## Key Files Created

```
supabase/
└── migrations/
    └── YYYYMMDDHHMMSS_add_devices_table.sql   # Devices table migration

src/
└── lib/
    └── device-registration.ts                 # Device registration logic
```

## Features Included

### Devices Table Schema

```sql
CREATE TABLE devices (
  id TEXT PRIMARY KEY,                   -- Device ID from DeviceManager
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                    -- "Chrome on macOS"
  platform TEXT NOT NULL,                -- "web" | "pwa-ios" | "pwa-android" | "pwa-desktop"
  fingerprint TEXT NOT NULL,             -- Browser fingerprint for continuity
  is_active BOOLEAN DEFAULT true,        -- User can deactivate devices
  last_seen TIMESTAMPTZ DEFAULT NOW(),   -- Track device activity
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Row-Level Security Policies

- **SELECT**: Users can see their own devices
- **INSERT**: Users can register their own devices
- **UPDATE**: Users can update their own devices (deactivate, update last_seen)
- **DELETE**: Users can delete their own devices

### Device Registration Flow

1. App loads → Check if device registered
2. If not registered → Create device record
3. If registered → Update last_seen timestamp
4. On app focus → Update last_seen (shows activity)

## Related Documentation

- **Original**: `docs/initial plan/DATABASE.md` lines 80-99 (devices table schema)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 1209-1245 (device registration)
- **Decisions**:
  - #82: Devices table promoted to MVP (avoid migration pain)
  - #52: Device fingerprinting for continuity
- **Architecture**: Multi-device sync with device attribution

**Note on Schema Enhancements**: This implementation improves upon the initial DATABASE.md schema with:

- NOT NULL constraints on critical fields (name, platform, fingerprint)
- CHECK constraint for platform validation
- user_id references auth.users(id) instead of profiles(id) for direct auth integration
- household_id references households(id) explicitly instead of using DEFAULT

## Technical Stack

- **Supabase**: PostgreSQL database with RLS
- **SQL**: DDL for table creation
- **TypeScript**: Device registration utilities
- **React**: App lifecycle hooks for registration

## Design Patterns

### Automatic Registration Pattern

```typescript
// Register device on app mount
useEffect(() => {
  async function registerDevice() {
    const deviceId = await deviceManager.getDeviceId();
    await registerDeviceInDatabase(deviceId);
  }

  registerDevice();
}, []);
```

### Activity Tracking Pattern

```typescript
// Update last_seen on app focus
useEffect(() => {
  function handleFocus() {
    updateDeviceLastSeen();
  }

  window.addEventListener("focus", handleFocus);
  return () => window.removeEventListener("focus", handleFocus);
}, []);
```

### Idempotent Registration

```typescript
// Safe to call multiple times
async function registerDevice(deviceId: string) {
  // Upsert: insert if not exists, update if exists
  await supabase.from("devices").upsert(
    {
      id: deviceId,
      user_id: userId,
      // ... other fields
    },
    { onConflict: "id" }
  );
}
```

## Database Considerations

### Primary Key Choice

Using device ID (from DeviceManager) as primary key:

- **Pros**: Natural key, no UUID generation needed
- **Pros**: Direct linkage to device fingerprint
- **Cons**: Device ID could be long (fingerprint/UUID)

This is acceptable because:

- Device IDs are reasonably sized (<50 chars)
- No performance impact for small device tables
- Simplifies foreign key references

### Index Strategy

```sql
-- Primary key index (automatic)
CREATE INDEX idx_devices_pkey ON devices(id);

-- User's devices lookup
CREATE INDEX idx_devices_user_id ON devices(user_id);

-- Household devices lookup
CREATE INDEX idx_devices_household_id ON devices(household_id);

-- Active devices filter
CREATE INDEX idx_devices_active ON devices(is_active) WHERE is_active = true;
```

## Security Considerations

### RLS Policy Design

**SELECT Policy**:

```sql
-- Users can see their own devices
user_id = auth.uid()
```

**INSERT Policy**:

```sql
-- Users can register devices for themselves
user_id = auth.uid()
```

**UPDATE Policy**:

```sql
-- Users can update their own devices (last_seen, is_active)
user_id = auth.uid()
```

**DELETE Policy**:

```sql
-- Users can delete their own devices
user_id = auth.uid()
```

### Device Deactivation

Instead of deleting devices (loses audit trail), users should deactivate:

```sql
UPDATE devices
SET is_active = false, updated_at = NOW()
WHERE id = $1 AND user_id = auth.uid();
```

This preserves event attribution history.

## Performance Characteristics

- **Insert**: ~10ms (one-time per device)
- **Update last_seen**: ~5ms (throttled to max 1/minute)
- **Query user devices**: ~2ms (indexed on user_id)
- **Storage**: ~200 bytes per device record

For typical household:

- 2-5 devices per user
- 2-4 users per household
- Total: 4-20 devices
- Storage: <4KB

Negligible performance impact.

## Testing Strategy

### Unit Tests

- Device registration creates record
- Duplicate registration updates last_seen (not error)
- Device deactivation sets is_active = false
- RLS policies enforce user isolation

### Integration Tests

- Register device on app load
- Update last_seen on app focus
- Multiple tabs share device record
- Device deactivation prevents future events

### Manual Tests

- View devices in Supabase dashboard
- Verify RLS policies in Supabase (try accessing other users' devices)
- Test device deactivation UI (if implemented)

---

**Ready?** → Open `instructions.md` to begin
