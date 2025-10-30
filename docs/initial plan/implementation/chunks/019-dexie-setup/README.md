# Chunk 019: Dexie Setup

## At a Glance

- **Time**: 1 hour
- **Milestone**: Offline (1 of 7)
- **Prerequisites**: Chunk 003 (routing), Project dependencies installed
- **Can Skip**: No - required for offline functionality

## What You're Building

IndexedDB foundation for offline-first architecture:

- Dexie database class with schema versioning
- Tables for offline storage (transactions, accounts, categories, events, syncQueue, meta)
- Device ID hybrid storage (IndexedDB → localStorage → FingerprintJS)
- Schema migration strategy
- Test IndexedDB operations

## Why This Matters

IndexedDB is the foundation of offline-first architecture. It provides:

- **Persistent storage**: Data survives page refreshes
- **Offline capability**: App works without internet
- **Fast reads**: No network latency
- **Event sourcing**: Complete audit trail locally

## Before You Start

Make sure you have:

- Dexie and Dexie React Hooks installed (`dexie`, `dexie-react-hooks`)
- FingerprintJS for device identification (`@fingerprintjs/fingerprintjs`)
- Device manager utility (`src/lib/dexie/deviceManager.ts` with `deviceManager.getDeviceId()`)
- Basic understanding of IndexedDB concepts

## What Happens Next

After this chunk:

- IndexedDB database ready for offline storage
- Device ID persistence working
- Schema versioning enabled for future migrations
- Ready for Chunk 020 (offline reads)

## Key Files Created

```
src/
├── lib/
│   ├── dexie/
│   │   ├── db.ts                 # Dexie database class
│   │   └── deviceManager.ts      # Device ID hybrid storage
│   └── types/
│       └── offline.ts            # Offline data types
```

## Features Included

### Database Tables

- **transactions**: Offline transaction storage
- **accounts**: Account data cache
- **categories**: Category hierarchy cache
- **events**: Event sourcing log
- **syncQueue**: Pending sync operations
- **meta**: Key-value storage (device ID, last sync time)
- **logs**: Debug and observability logs (correlation IDs, sync events)

### Device Identification

- **Priority 1**: IndexedDB stored device ID
- **Priority 2**: localStorage backup
- **Priority 3**: FingerprintJS fallback
- Always store in BOTH for redundancy

### Schema Versioning

- Version 1: Initial schema
- Upgrade functions for future migrations
- Safe rollback capability

## Related Documentation

- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 1978-2340 (Dexie versioning)
- **Original**: `docs/initial plan/SYNC-ENGINE.md` lines 1125-1305 (device ID)
- **Decisions**: #75 (hybrid device ID), #82 (devices table in MVP)
- **Architecture**: Three-layer storage (Zustand → IndexedDB → Supabase)

## Technical Stack

- **Dexie.js**: IndexedDB wrapper with schema versioning
- **FingerprintJS**: Device fingerprinting fallback
- **React Hooks**: dexie-react-hooks for reactive queries

## Design Patterns

### Three-Layer Storage

```
┌─────────────────────────────────────┐
│    Zustand (UI State - Reactive)    │ ← Immediate UI updates
├─────────────────────────────────────┤
│  IndexedDB (Persistent - Dexie)     │ ← Offline storage
├─────────────────────────────────────┤
│  Supabase (Cloud Source of Truth)   │ ← Server sync
└─────────────────────────────────────┘
```

### Hybrid Device ID

```typescript
async function getDeviceId(): Promise<string> {
  // 1. Try IndexedDB (fastest, most reliable)
  const stored = await db.meta.get("deviceId");
  if (stored?.value) return stored.value;

  // 2. Try localStorage (backup)
  const localId = localStorage.getItem("deviceId");
  if (localId) {
    await db.meta.put({ key: "deviceId", value: localId });
    return localId;
  }

  // 3. Generate from FingerprintJS (survives cache clears)
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  const deviceId = result.visitorId;

  // Store in BOTH
  await db.meta.put({ key: "deviceId", value: deviceId });
  localStorage.setItem("deviceId", deviceId);

  return deviceId;
}
```

## Critical Concepts

**IndexedDB Persistence**:

- Data persists across page reloads
- Browser may delete under storage pressure
- Monitor quota with navigator.storage.estimate()

**Schema Versioning**:

- NEVER remove fields (only add)
- Increment version for schema changes
- Provide upgrade functions for migrations

**Device ID Redundancy**:

- Store in IndexedDB AND localStorage
- FingerprintJS as final fallback
- Ensures continuity across cache clears

---

**Ready?** → Open `instructions.md` to begin
