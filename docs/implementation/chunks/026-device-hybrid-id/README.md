# Chunk 026: Device Hybrid ID

## At a Glance

- **Time**: 1 hour
- **Milestone**: Multi-Device Sync (1 of 10)
- **Prerequisites**: Chunk 025 (sync UI indicators)
- **Can Skip**: No - required for event sourcing and multi-device sync

## Context from Earlier Chunks

- **Chunk 002**: Implemented basic auth without device tracking
- **Chunk 019**: Set up IndexedDB with meta table for device ID storage
- **This chunk**: Adds device identification with hybrid fallback strategy
- Enables stable device IDs for event sourcing and conflict resolution

## What You're Building

A robust device identification system with multiple fallback layers:

- DeviceManager class with 4-layer fallback strategy
- IndexedDB primary storage (survives browser sessions)
- localStorage backup (redundancy layer)
- FingerprintJS fallback (survives cache clearing)
- UUID generator (final fallback)
- Device name and platform detection utilities
- Persistent device ID across browser restarts

## Why This Matters

Device identification is **critical for event sourcing and conflict resolution**. Each device needs a stable, unique identifier to:

- Generate idempotency keys for events
- Track vector clocks per device
- Attribute changes to specific devices
- Enable audit trails and debugging
- Prevent duplicate event processing

The hybrid approach ensures device ID persistence even when users clear browser data, while maintaining reasonable privacy for a household finance app.

## Before You Start

Make sure you have:

- Chunk 025 completed (Dexie with meta table exists)
- FingerprintJS installed: `npm install @fingerprintjs/fingerprintjs`
- IndexedDB meta table ready
- localStorage available

## What Happens Next

After this chunk:

- Device ID persists across browser sessions
- Device ID survives cache clearing (via fingerprint)
- Redundant storage prevents data loss
- Device metadata (name, platform) detected automatically
- Ready to implement devices table registration (chunk 027)
- Foundation for idempotency keys (chunk 029)

## Key Files Created

```
src/
├── lib/
│   ├── device-manager.ts          # DeviceManager class with hybrid fallback
│   └── device-manager.test.ts     # Unit tests for device identification
└── types/
    └── device.ts                  # Device type definitions
```

## Features Included

### Device ID Fallback Strategy

1. **Primary**: Check IndexedDB meta table
2. **Backup**: Check localStorage
3. **Fingerprint**: Generate from FingerprintJS
4. **Fallback**: Generate UUID if all else fails

### Device Detection

- Browser name (Chrome, Safari, Firefox, Edge)
- Operating system (macOS, Windows, Linux, iOS, Android)
- Platform type (web, pwa-ios, pwa-android, pwa-desktop)
- Device name combining browser + OS (e.g., "Chrome on macOS")

### Redundant Storage

- Store device ID in **both** IndexedDB and localStorage
- Sync between storage layers automatically
- Recover from partial data loss

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 1125-1305 (hybrid device ID)
- **Original**: `docs/initial plan/CLAUDE.md` lines 107-115 (device fingerprinting)
- **Decisions**:
  - #52: Device fingerprinting with hybrid fallback
  - #75: Hybrid strategy (IndexedDB → localStorage → FingerprintJS)
  - #82: Devices table promoted to MVP
- **Architecture**: Three-layer state with device attribution

## Technical Stack

- **FingerprintJS**: Browser fingerprinting library
- **IndexedDB**: Primary persistent storage
- **localStorage**: Backup storage layer
- **TypeScript**: Type-safe device handling
- **Vitest**: Unit testing framework

## Design Patterns

### Singleton Pattern

```typescript
// Single DeviceManager instance across app
export const deviceManager = new DeviceManager();

// Usage throughout app
const deviceId = await deviceManager.getDeviceId();
```

### Lazy Initialization

```typescript
private deviceId: string | null = null;  // Cached value
private fpPromise: Promise<any> | null = null;  // Lazy FingerprintJS load

// Only load FingerprintJS when needed
if (!this.fpPromise) {
  this.fpPromise = FingerprintJS.load();
}
```

### Graceful Degradation

```typescript
// Try 1: IndexedDB
try {
  const stored = await db.meta.get("deviceId");
  if (stored?.value) return stored.value;
} catch (error) {
  console.warn("IndexedDB failed, trying localStorage");
}

// Try 2: localStorage
const localStorageId = localStorage.getItem("deviceId");
if (localStorageId) return localStorageId;

// Try 3: Fingerprint
// Try 4: UUID
```

## Privacy Considerations

**Note**: This implementation uses browser fingerprinting, which is generally privacy-invasive. However, for a **private household finance app** where:

1. Users want their devices to be recognized
2. Multi-device sync requires device identification
3. Users explicitly control who has access
4. No third-party tracking involved

This trade-off is acceptable. The fingerprint is used **only** for device continuity, not for tracking or advertising.

## Browser Compatibility

| Browser | IndexedDB | localStorage | FingerprintJS | UUID |
| ------- | --------- | ------------ | ------------- | ---- |
| Chrome  | ✅        | ✅           | ✅            | ✅   |
| Firefox | ✅        | ✅           | ✅            | ✅   |
| Safari  | ✅        | ✅           | ✅            | ✅   |
| Edge    | ✅        | ✅           | ✅            | ✅   |
| Mobile  | ✅        | ✅           | ⚠️ (slower)   | ✅   |

**Note**: FingerprintJS may be slower on mobile devices due to hardware differences.

## Performance Considerations

- **Device ID cached in memory** after first lookup (instant subsequent calls)
- **FingerprintJS loaded lazily** (only when IndexedDB + localStorage fail)
- **Fingerprint generation**: ~100-300ms first time, then cached
- **IndexedDB lookup**: <10ms (fast)
- **localStorage lookup**: <1ms (very fast)

## Testing Strategy

### Unit Tests

- Device ID persistence across instances
- Fallback behavior (simulate IndexedDB failure)
- Redundant storage sync (IndexedDB ↔ localStorage)
- Device name/platform detection
- UUID generation uniqueness

### Integration Tests

- Device ID survives browser restart (manual)
- Device ID survives cache clear (manual)
- Multiple tabs share same device ID
- Device registration in devices table (chunk 027)

---

**Ready?** → Open `instructions.md` to begin
